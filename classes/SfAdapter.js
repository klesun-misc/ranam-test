
/**
 * takes .sf2 file contents, parses it with sf2-parser
 * by colinbdclark and transforms result to convenient format
 * @param {Uint8Array} $sf2Buf
 */
define([], () => (sf2Buf, audioCtx, isSf3) => {

    let range = (l, r) => new Array(r - l).fill(0).map((_, i) => l + i);

    // Sf2-Parser lefts null characters when name length is less than 20
    let cleanText = function(rawText)
    {
        rawText = rawText + '\u0000';
        let endIdx = rawText.indexOf('\u0000');
        return rawText.substr(0, endIdx);
    };

    let view = new Uint8Array(sf2Buf);
    let root = new sf2.Parser(view, {
        parserOptions: {isSf3: isSf3},
    });
    root.parse();
    for (let sampleHeader of root.sampleHeader) {
        sampleHeader.sampleName = cleanText(sampleHeader.sampleName);
    }

    let sampleToAudio = {};

    /** @debug */
    console.log('sf2 flat: ', root);

    /**
     * @param {ArrayBuffer} sf2Sample
     * @param {ISampleInfo} sampleInfo
     * @return {ArrayBuffer}
     * @see http://soundfile.sapp.org/doc/WaveFormat/
     */
    let sf2ToWav = function(sf2Sample, sampleInfo)
    {
        let size = sf2Sample.byteLength + 44; // 44 - RIFF header data
        let sourceView = new DataView(sf2Sample);
        let wavBuf = new ArrayBuffer(size);
        let view = new DataView(wavBuf);

        let subChunkSize = 16;
        let chanCnt = 1;
        let sampleRate = sampleInfo.sampleRate;
        let bitsPerSample = 16;
        let blockAlign = chanCnt * bitsPerSample / 8;
        let byteRate = blockAlign * sampleRate;

        view.setInt32(0 , 0x52494646, false); // RIFF
        view.setInt32(4 , size - 16, true); // following data length
        view.setInt32(8 , 0x57415645, false); // WAVE
        view.setInt32(12, 0x666D7420, false); // fmt
        view.setInt32(16, subChunkSize, true);
        view.setInt16(20, 1, true); // PCM = 1 means data is not compressed
        view.setInt16(22, chanCnt, true);
        view.setInt32(24, sampleRate, true);
        view.setInt32(28, byteRate, true);
        view.setInt16(32, blockAlign, true);
        view.setInt16(34, bitsPerSample, true);
        view.setInt32(36, 0x64617461, false); // data
        view.setInt32(40, sf2Sample.length * 2, true);

        for (let i = 0; i < sf2Sample.byteLength; ++i) {
            view.setInt8(44 + i, sourceView.getInt8(i));
        }

        return wavBuf;
    };

    // overwrites global keys with local if any
    let updateGenerator = function(global, local)
    {
        return Object.assign({}, global, local);
    };

    // adds the tuning semi-tones and cents; multiplies whatever needs to be multiplied
    let combineGenerators = function(global, local)
    {
        let result = Object.assign({}, local);
        let dkr = {lo: 0, hi: 127};

        result.keyRange = {
            lo: Math.max(
                (global.keyRange || dkr).lo,
                (local.keyRange || dkr).lo
            ),
            hi: Math.min(
                (global.keyRange || dkr).hi,
                (local.keyRange || dkr).hi
            ),
        };

        result.velRange = {
            lo: Math.max(
                (global.velRange || dkr).lo,
                (local.velRange || dkr).lo
            ),
            hi: Math.min(
                (global.velRange || dkr).hi,
                (local.velRange || dkr).hi
            ),
        };

        result.fineTune = (+local.fineTune || 0) + (+global.fineTune || 0);
        result.coarseTune = (+local.coarseTune || 0) + (+global.coarseTune || 0);
        result.initialAttenuation = (+local.initialAttenuation || 0) + (+global.initialAttenuation || 0);

        return result;
    };

    /** get rid of instruments and presets - keep just single generator - the sample generator */
    let flattenSamples = function(soundFont)
    {
        let flatFont = {};

        for (let bankN in soundFont) {
            flatFont[bankN] = {};
            let presets = soundFont[bankN];
            for (let presetN in presets) {
                flatFont[bankN][presetN] = [];
                let preset = presets[presetN];
                for (let presetInstrument of preset.instruments) {
                    let sampleByNum = {};
                    for (let instrumentSample of presetInstrument.info.samples) {
                        let num = instrumentSample.sampleNumber;
                        sampleByNum[num] = sampleByNum[num] || {
                            sampleNumber: instrumentSample.sampleNumber,
                            info: instrumentSample.info,
                            generators: [],
                        };
                        for (let iGen of presetInstrument.generators) {
                            for (let sGen of instrumentSample.generators) {
                                sampleByNum[num].generators.push(combineGenerators(
                                    updateGenerator(preset.generatorApplyToAll || {}, iGen),
                                    updateGenerator(presetInstrument.info.generatorApplyToAll, sGen)
                                ));
                            }
                        }
                    }

                    for (let num in sampleByNum) {
                        flatFont[bankN][presetN].push({
                            sampleNumber: sampleByNum[num].sampleNumber,
                            sampleInfo: sampleByNum[num].info,
                            generators: sampleByNum[num].generators,
                        });
                    }
                }
            }
        }

        return flatFont;
    };

    let itemsToGenerator = (items) => {
        let result = {};
        for (let item of items) {
            result[item.type] = item.value.amount !== undefined
                ? item.value.amount
                : item.value;
        }
        return result;
    };

    let isNull = val => [undefined, null].includes(val);

    /**
     * takes a bunch of generators and extends
     * lowest and highest key ranges to 0 and 127
     * @mutates
     */
    let fillBorders = function(generators)
    {
        if (generators.filter(g => isNull(g.keyRange)).length > 0) {
            // there are generators that are not limited by key range
            return;
        }

        let lo = 127;
        let loGens = [];
        let hi = 0;
        let hiGens = [];

        for (let gen of generators) {
            if (lo > gen.keyRange.lo) {
                lo = gen.keyRange.lo;
                loGens = [gen];
            } else if (gen.keyRange.lo === lo) {
                loGens.more = gen;
            }

            if (hi < gen.keyRange.hi) {
                hi = gen.keyRange.hi;
                hiGens = [gen];
            } else if (gen.keyRange.hi === hi) {
                hiGens.more = gen;
            }
        }

        loGens.forEach(g => g.keyRange.lo = 0);
        hiGens.forEach(g => g.keyRange.hi = 127);
    };

    let getInstrumentInfo = function(instr_idx, extendKeyRanges)
    {
        let instrumentName = root.instrument[instr_idx].instrumentName;
        let zone_start_idx = root.instrument[instr_idx].instrumentBagIndex;

        let zone_end_idx = instr_idx + 1 < root.instrument.length
            ? root.instrument[instr_idx + 1].instrumentBagIndex
            : root.instrumentZone.length;

        let propertyBundles = range(zone_start_idx, zone_end_idx)
            .map(zone_idx => {
                let gen_start_idx = root.instrumentZone[zone_idx].instrumentGeneratorIndex;
                let gen_end_idx = zone_idx + 1 < root['instrumentZone'].length
                    ? root.instrumentZone[zone_idx + 1].instrumentGeneratorIndex
                    : root.instrumentZoneGenerator.length;

                let items = range(gen_start_idx, gen_end_idx)
                    .map(idx => root.instrumentZoneGenerator[idx]);

                return itemsToGenerator(items);
            });

        let generatorApplyToAll = isNull(propertyBundles[0].sampleID)
            ? propertyBundles.shift()
            : null;

        let links = [];
        for (let props of propertyBundles) {
            links[props.sampleID] = links[props.sampleID] || {
                sampleNumber: props.sampleID,
                info: root.sampleHeader[+props.sampleID],
                generators: [],
            };
            links[props.sampleID].generators.push(props);
        }
        links = links.filter(a => true); // reset array indexes
        extendKeyRanges && fillBorders(links.map(l => l.generators).reduce((a,b) => a.concat(b), []));

        return {
            instrumentName: instrumentName,
            samples: links,
            generatorApplyToAll: generatorApplyToAll,
        };
    };

    let makeSampleTree = function()
    {
        let bankToPresetToData = {};

        for (let pres_idx = 0; pres_idx < root.presetHeader.length; ++pres_idx) {
            let pres = root.presetHeader[pres_idx];
            if ((bankToPresetToData[pres.bank] || {})[pres.preset] !== undefined) {
                // EOS artifact in sf2-parser has bank 0 and preset 0 and overwrote piano
                continue;
            }

            let pzone_start_idx = pres.presetBagIndex;
            let pzone_end_idx = pres_idx + 1 < root.presetHeader.length
                ? root.presetHeader[pres_idx + 1].presetBagIndex
                : root.presetZone.length; // -1 ?
            // let extendKeyRanges = pres.bank === 0; // no for drums, since they are not pitchable
            let extendKeyRanges = pres.bank < 128; // 128 - drums
            let propertyBundles = range(pzone_start_idx, pzone_end_idx)
                .map(pzone_idx => {
                    let gen_start_idx = root.presetZone[pzone_idx].presetGeneratorIndex;
                    let gen_end_idx = pzone_idx + 1 < root.presetZone.length
                        ? root.presetZone[pzone_idx + 1].presetGeneratorIndex
                        : root.presetZoneGenerator.length;

                    let items = range(gen_start_idx, gen_end_idx)
                        .map(idx => root.presetZoneGenerator[idx]);

                    return itemsToGenerator(items);
                });
            let generatorApplyToAll = isNull(propertyBundles[0].instrument)
                ? propertyBundles.shift()
                : null;

            let links = [];
            for (let props of propertyBundles) {
                links[props.instrument] = links[props.instrument] || {
                    info: getInstrumentInfo(+props.instrument, extendKeyRanges),
                    generators: [],
                };
                links[props.instrument].generators.push(props);
            }
            links = links.filter(a => true); // reset array indexes
            extendKeyRanges && fillBorders(links.map(l => l.generators).reduce((a,b) => a.concat(b), []));

            bankToPresetToData[pres.bank] = bankToPresetToData[pres.bank] || {};
            bankToPresetToData[pres.bank][pres.preset] = {
                presetName: pres.presetName,
                instruments: links,
                generatorApplyToAll: generatorApplyToAll,
            };
        }

        return flattenSamples(bankToPresetToData);
    };

    let bankToPresetToSamples = makeSampleTree();

    /** @debug */
    console.log('sf2 tree: ', bankToPresetToSamples);

    let filterSamples = function(params)
    {
        let {bank, preset, semitone, velocity} = params;
        let presets = bankToPresetToSamples[bank];
        let samples = presets ? presets[preset] : undefined;
        if (!samples) {
            let fallbackBank = bank < 128 ? 0 : 128; // 128 - drums
            presets = bankToPresetToSamples[fallbackBank];
            samples = presets ? presets[preset] : undefined;
        }
        if (!samples) return [];

        let filtered = samples
            .map(s => s.generators
                .filter(g =>
                    g.keyRange.lo <= semitone &&
                    g.keyRange.hi >= semitone &&
                    g.velRange.lo <= velocity &&
                    g.velRange.hi >= velocity)
                .map(g => 1 && {
                    sam: s.sampleInfo,
                    gen: g,
                    sampleNumber: s.sampleNumber,
                }))
            .reduce((a,b) => a.concat(b), []);
        return filtered;
    };

    let determineCorrectionCents = (delta, generator) => {
        let fineTune = !isNull(generator.fineTune) ? generator.fineTune : 0;
        let coarseTune = !isNull(generator.coarseTune) ? generator.coarseTune * 100 : 0;
        return delta * 100 + fineTune + coarseTune;
    };

    /** sample num -> array of funcs to call when it is fetched */
    let awaiting = {};
    let onIdles = [];

    let saveWavToDisc = function(buff, fileName = 'sample')
    {
        let blob = new Blob([buff], {type: "wav/binary"});
        saveAs(blob, fileName + '.wav', true);
    };

    let saveOggToDisc = function(buff, fileName = 'sample')
    {
        let blob = new Blob([buff], {type: "ogg/binary"});
        saveAs(blob, fileName + '.ogg', true);
    };

    let getSampleAudio = function(sampleNumber, then) {
        if (sampleToAudio[sampleNumber]) {
            then(sampleToAudio[sampleNumber]);
        } else {
            if (awaiting[sampleNumber]) {
                awaiting[sampleNumber].push(then);
            } else {
                awaiting[sampleNumber] = [then];
                let sampleInfo = root.sampleHeader[sampleNumber];
                let sampleBuf = root.sample[sampleNumber];

                let fullBuf;
                if (isSf3) {
                    fullBuf = sampleBuf;
                } else {
                    fullBuf = sf2ToWav(sampleBuf, sampleInfo);
                }
                audioCtx.decodeAudioData(fullBuf, (decoded) => {
                    awaiting[sampleNumber].forEach(a => a(decoded));
                    delete awaiting[sampleNumber];
                    sampleToAudio[sampleNumber] = decoded;
                    if (Object.keys(awaiting).length === 0) {
                        onIdles.forEach(handler => handler());
                        onIdles = [];
                    }
                }, console.error);
            }
        }
    };

    let onIdle = function(callback) {
        if (Object.keys(awaiting).length === 0) {
            callback();
        } else {
            onIdles.push(callback);
        }
    };

    /** @param db - soundfont decibel value */
    let dBtoKoef = (db) => Math.pow(10, db/50); // yes, it is 50, not 10 and not 20 - see /tests/attenToPercents.txt

    let getSampleData = function(params, then)
    {
        let sampleHeaders = filterSamples(params);
        if (sampleHeaders.length === 0) then([]);
        let sources = [];
        let reportAnother = () => {
            if (sources.length === sampleHeaders.length) {
                then(sources);
            }
        };
        for (let {sam, gen, sampleNumber} of sampleHeaders) {
            let sampleSemitone = !isNull(gen.overridingRootKey)
                ? gen.overridingRootKey : sam.originalPitch;
            let correctionCents = determineCorrectionCents(
                params.semitone - sampleSemitone, gen
            );
            let freqFactor = Math.pow(2, correctionCents / 1200);
            let genVolumeKoef = isNull(gen.initialAttenuation) ? 1 :
                dBtoKoef(-gen.initialAttenuation / 10);
            getSampleAudio(sampleNumber, decoded => {
                sources.push({
                    buffer: decoded,
                    frequencyFactor: freqFactor,
                    isLooped: gen.sampleModes === 1,
                    loopStart: (sam.startLoop + (gen.startloopAddrsOffset || 0)) / sam.sampleRate,
                    loopEnd: (sam.endLoop + (gen.endloopAddrsOffset || 0)) / sam.sampleRate,
                    stereoPan: sam.sampleType,
                    volumeKoef: genVolumeKoef * params.velocity / 127,
                    fadeMillis: 100, // TODO: ...
                });
                reportAnother();
            });
        }
    };

    return {
        getSampleData: getSampleData,
        onIdle: onIdle,
    };
});