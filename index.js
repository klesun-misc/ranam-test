
var org = org || {};
org.klesun = org.klesun || {};
org.klesun.RanamTest = function(form){
    "use strict";
    let $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

    // http://stackoverflow.com/a/21797381/2750743
    let _base64ToArrayBuffer = function(base64)
    {
        var binary_string =  atob(base64);

        return new Uint8Array(binary_string.length)
            .fill(0)
            .map((_, i) => binary_string.charCodeAt(i))
            .buffer;
    };

    let loadSelectedFile = function(fileInfo, whenLoaded)
    {
        if (!fileInfo) {
            // if user cancelled "Choose File" pop-up
            return null;
        }

        let reader = new FileReader();
        reader.readAsDataURL(fileInfo);
        reader.onload = (e) => {
            whenLoaded(e.target.result.split(',')[1]);
        }
    };

    let saveMidiToDisc = function(buff)
    {
        let blob = new Blob([buff], {type: "midi/binary"});
        saveAs(blob, 'ranam_song.mid', true);
    };

    let saveWavToDisc = function(buff)
    {
        let blob = new Blob([buff], {type: "midi/binary"});
        saveAs(blob, 'sample.wav', true);
    };

    let readerToJsmidgenEvent = function(readerEvent, formParams, trackNum)
    {
        let isOudTrack = trackNum == formParams.oudTrackNum;
        let isTablaTrack = trackNum == formParams.tablaTrackNum;

        if (readerEvent.type === 'MIDI') {
            if (isOudTrack && [14,11,12].includes(readerEvent.midiEventType)) {
                // 11 - control (bank) change, 12 - program change
                // 14 - Pitch Bend - we don't want pitch bends from
                // original song to mess up our pitch bends
                return null;
            } else {
                let channel = readerEvent.midiChannel;
                if (isOudTrack) {
                    channel = 0;
                } else if (channel == 0) {
                    // original song got some notes in 0-th channel we reserve for Oud
                    channel = 8; // 8 is big enough number, the channel is likely free
                }
                if (isTablaTrack) {
                    channel = 10;
                } else if (channel == 10) {
                    // original song got some notes in 10-th channel we reserve for Tabla
                    channel = 7; // close enough to 10
                }
                // NOTE ON/OFF
                return new Midi.Event({
                    type: readerEvent.midiEventType * 16,
                    channel: channel,
                    param1: readerEvent.parameter1,
                    param2: readerEvent.parameter2,
                    time: readerEvent.delta,
                });
            }
        } else if (readerEvent.type === 'meta') {
            if (formParams.removeMeta) {
                // we wanna hear how will one song sound without tempo
                return null;
            } else if (readerEvent.metaType == 47) {
                // End Of Track message, will be added automatically by
                // jsmidgen, so no need to dupe it, it causes problems
                return null;
            } else {
                return new Midi.MetaEvent({
                    time: readerEvent.delta,
                    type: readerEvent.metaType,
                    data: readerEvent.metaData,
                });
            }
        } else {
            return null;
        }
    };

    /** @param {float} absolute koef [-1 ... +1].
     * multiply by current bend range to get the shift in semitones
     * examples if bend radius is set to 2
     * makePitchBend(1.75, 0) will highen pitch 2 * 1.75 = 3.5 semitones for zeroth channel
     * makePitchBend(-1.01, 4) will lower pitch 2 * 1.01 = 2.02 semitones for fourth channel */
    let makePitchBend = function(koef, channel)
    {
        let intvalue = Math.round(16383 / 2 * (koef + 1));
        let [b1,b2] = [intvalue % 128, (intvalue >> 7) % 128];

        return new Midi.Event({
            type: Midi.Event.PITCH_BEND,
            channel: channel,
            param1: b1,
            param2: b2,
            time: 0,
        });
    };

    let makeOadEvents = function(channel) {
        return [
            new Midi.Event({
                type: Midi.Event.CONTROLLER,
                channel: channel,
                param1: 0, // bank select
                param2: 121,
                time: 0,
            }),
            new Midi.Event({
                type: Midi.Event.CONTROLLER,
                channel: channel,
                param1: 32, // bank select 2
                param2: 0,
                time: 0,
            }),
            new Midi.Event({
                type: Midi.Event.PROGRAM_CHANGE,
                channel: channel,
                param1: 123, // bird tweet
                time: 0,
            }),
        ];
    };

    let scaleMapping = {
        Bayati: {
            Do: [{noteName: 'Re' , pitchBend: -0.25, pitched: 'Re ½b'}],
            Re: [{noteName: 'Mi' , pitchBend: -0.25, pitched: 'Mi ½b'}],
            Mi: [{noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}],
            Fa: [{noteName: 'So' , pitchBend: -0.25, pitched: 'So ½b'}],
            So: [{noteName: 'La' , pitchBend: -0.25, pitched: 'La ½b'}],
            La: [{noteName: 'Si' , pitchBend: -0.25, pitched: 'Si ½b'}],
            Si: [{noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}],
        },
        Saba: {
            Do: [{noteName: 'Re' , pitchBend: -0.25, pitched: 'Re ½b'}],
            Re: [{noteName: 'Mi' , pitchBend: -0.25, pitched: 'Mi ½b'}],
            Mi: [{noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}],
            Fa: [{noteName: 'So' , pitchBend: -0.25, pitched: 'So ½b'}],
            So: [{noteName: 'La' , pitchBend: -0.25, pitched: 'La ½b'}],
            La: [{noteName: 'Si' , pitchBend: -0.25, pitched: 'Si ½b'}],
            Si: [{noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}],
        },
        Sikah: {
            Do: [{noteName: 'Do', pitchBend: -0.25, pitched: 'Do ½b'}],
            Re: [{noteName: 'Re', pitchBend: -0.25, pitched: 'Re ½b'}],
            Mi: [{noteName: 'Mi', pitchBend: -0.25, pitched: 'Mi ½b'}],
            Fa: [{noteName: 'Fa', pitchBend: -0.25, pitched: 'Fa ½b'}],
            So: [{noteName: 'So', pitchBend: -0.25, pitched: 'So ½b'}],
            La: [{noteName: 'La', pitchBend: -0.25, pitched: 'La ½b'}],
            Si: [{noteName: 'Si', pitchBend: -0.25, pitched: 'Si ½b'}],
        },
        Rast: {
            Do: [{noteName: 'Mi' , pitchBend: -0.25, pitched: 'Mi ½b'}, {noteName: 'Si' , pitchBend: -0.25, pitched: 'Si ½b'}],
            Re: [{noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}, {noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}],
            Mi: [{noteName: 'So#', pitchBend: -0.25, pitched: 'So ½#'}, {noteName: 'Re#', pitchBend: -0.25, pitched: 'Re ½#'}],
            Fa: [{noteName: 'La' , pitchBend: -0.25, pitched: 'La ½b'}, {noteName: 'Mi' , pitchBend: -0.25, pitched: 'Mi ½b'}],
            So: [{noteName: 'Si' , pitchBend: -0.25, pitched: 'Si ½b'}, {noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}],
            La: [{noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}, {noteName: 'So#', pitchBend: -0.25, pitched: 'So ½#'}],
            Si: [{noteName: 'Re#', pitchBend: -0.25, pitched: 'Re ½#'}, {noteName: 'La' , pitchBend: -0.25, pitched: 'La ½#'}],
        },
        // no pitch bend in the following
        Hijaz: {
        },
        Nahawand: {
        },
        Kurd: {
        },
        Ajam: {
        },
    };

    let noteNameToPitchBendToPitched = {};
    for (let [s,keyNotes] of Object.entries(scaleMapping)) {
        for (let [k,pitchInfos] of Object.entries(keyNotes)) {
            for (let pitchInfo of pitchInfos) {
                noteNameToPitchBendToPitched[pitchInfo.noteName] = noteNameToPitchBendToPitched[pitchInfo.noteName] || {};
                noteNameToPitchBendToPitched[pitchInfo.noteName][pitchInfo.pitchBend] = pitchInfo.pitched;
            }
        }
    }

    let matchesNoteName = function(semitone, name)
    {
        let clean = name.slice(0, 2);
        let sign = name.slice(2);
        let ivory = {'Do': 0,'Re': 2,'Mi':4,'Fa': 5,'So': 7,'La':9,'Si': 11}[clean];
        let offset = {
            '#': +1,
            'b': -1,
            '': 0,
        }[sign];
        return (semitone % 12) == (ivory + offset);
    };

    let getOudPitchBend = function(semitone, scales)
    {
        for (let scaleData of scales) {
            for (let pitchInfo of scaleData.pitchBends) {
                if (matchesNoteName(semitone, pitchInfo.noteName)) {
                    return +pitchInfo.pitchBend;
                }
            }
        }
        return null;
    };

    let isNoteOn = (readerEvent) =>
        readerEvent.type === 'MIDI' &&
        readerEvent.midiEventType == 9 &&
        readerEvent.parameter2 > 0;

    let isNoteOff = (readerEvent) =>
        readerEvent.type === 'MIDI' && (
            readerEvent.midiEventType == 8 ||
            readerEvent.midiEventType == 9 && readerEvent.parameter2 == 0
        );

    let isPitchBend = (readerEvent) =>
        readerEvent.type === 'MIDI' &&
        readerEvent.midiEventType == 14;

    let convertToArabicMidi = function(smfReader, formParams)
    {
        /** @debug */
        console.log(formParams);

        let jsmidgenTracks = [];
        for (let i = 0; i < smfReader.tracks.length; ++i) {
            let pitchBendNotes = new Set();

            let readerTrack = smfReader.tracks[i];
            let jsmidgenTrack = new Midi.Track();

            let isOudTrack = i == formParams.oudTrackNum;
            if (isOudTrack) {
                // add control change event and program change 123, bird tweet
                makeOadEvents(0)
                    .forEach(e => jsmidgenTrack.addEvent(e));
            }

            let timeTicks = 0;
            let scaleRegions = formParams.scaleRegions;

            for (let readerEvent of readerTrack.events) {
                timeTicks += readerEvent.delta;
                let scales = scaleRegions.filter(s => s.from <= timeTicks && s.to > timeTicks);
                let jsmidgenEvent = readerToJsmidgenEvent(readerEvent, formParams, i);
                if (isOudTrack && isNoteOn(readerEvent)) {
                    // Oud NOTE ON is about to fire - should set pitch bend
                    let semitones = readerEvent.parameter1;
                    let koef = getOudPitchBend(semitones, scales);
                    if (koef) {
                        jsmidgenTrack.addEvent(makePitchBend(koef, readerEvent.midiChannel));
                        pitchBendNotes.add(semitones);
                    }
                }
                if (jsmidgenEvent) {
                    jsmidgenTrack.addEvent(jsmidgenEvent);
                }
                if (isOudTrack && isNoteOff(readerEvent)) {
                    // Oud NOTE OFF just fired, should reset pitch bend
                    let semitones = readerEvent.parameter1;
                    if (pitchBendNotes.has(semitones)) {
                        jsmidgenTrack.addEvent(makePitchBend(0, readerEvent.midiChannel));
                        pitchBendNotes.delete(semitones);
                    }
                }
            }
            jsmidgenTracks.push(jsmidgenTrack);
        }
        let jsmidgenSmf = new Midi.File({
            ticks: smfReader.ticksPerBeat,
            tracks: jsmidgenTracks,
        });

        let binaryString = jsmidgenSmf.toBytes();

        let buf = new ArrayBuffer(binaryString.length);
        let bufView = new Uint8Array(buf);
        binaryString.split('').forEach((c,i) =>
            bufView[i] = c.charCodeAt(0));

        return buf;
    };

    let collectParams = (gui) => 1 && {
        scaleRegions: $$(':scope > *', gui.regionListCont)
            .map(div => 1 && {
                scale: $$('select.scale', div)[0].value,
                startingNote: $$('select.key-note', div)[0].value,
                from: $$('input.from', div)[0].value,
                to: $$('input.to', div)[0].value,
                pitchBends: $$('.pitch-bend-list > *', div)
                    .map(span => 1 && {
                        noteName: $$('select.pitched-note', span)[0].value,
                        pitchBend: $$('input.pitch-bend', span)[0].value,
                    }),
            }),
        oudTrackNum: gui.oudTrackNumInput.value,
        tablaTrackNum: gui.tablaTrackNumInput.value,
        removeMeta: gui.removeMetaFlag.checked,
    };

    let gui = {
        smfInput: $$('input[type="file"].midi-file', form)[0],
        sf2Input: $$('input[type="file"].soundfont-file', form)[0],
        ticksPerBeatHolder: $$('.ticks-per-beat', form)[0],
        regionListCont: $$('.region-list', form)[0],
        regionRef: $$('.region-list > *', form)[0].cloneNode(true),
        pitchBendRef: $$('.pitch-bend-list > *', form)[0].cloneNode(true),
        currentTracks: $$('tbody.current-tracks', form)[0],
        addAnotherRegionBtn: $$('button.add-another-region', form)[0],
        oudTrackNumInput: $$('input.oud-track-num', form)[0],
        tablaTrackNumInput: $$('input.tabla-track-num', form)[0],
        convertBtn: $$('button.convert-to-arabic', form)[0],
        removeMetaFlag: $$('input.remove-meta', form)[0],
    };

    let getTotalTicks = function(smfReader)
    {
        let ticksPerTrack = smfReader.tracks.map(t => t.events.reduce((sum, e) => sum + e.delta, 0));
        return Math.max(...ticksPerTrack);
    };

    /** take events that happen at current tick */
    let takeTickEvents = function(events, startOffset)
    {
        let taken = [];
        for (let i = startOffset; i < events.length; ++i) {
            let event = events[i];
            if (i === startOffset || event.delta == 0) {
                taken.push(event);
            } else {
                break;
            }
        }
        return taken;
    };

    /**
     * make sure NOTE OFF is always before NOTE ON so we
     * could put PITCH BEND before NOTE ON but after NOTE OFF
     */
    let sortTickEvents = function(events)
    {
        // only first has not 0 delta, it should be reassigned
        // to the event that will become first after sort
        let delta = events[0].delta;
        events = events.sort((a,b) => {
            if (isNoteOn(a) && isNoteOff(b)) {
                return 1;
            } else if (isNoteOff(a) && isNoteOn(b)) {
                return -1;
            } else {
                return 0;
            }
        });
        events.forEach(e => e.delta = 0);
        events[0].delta = delta;
        return events;
    };

    let normalizeSmf = function(smfReader, params)
    {
        let errors = [];
        let warnings = [];
        smfReader = JSON.parse(JSON.stringify(smfReader));

        let oudTrackNum = params.oudTrackNum;
        if (oudTrackNum > smfReader.tracks.length) {
            return 'Specified Oud track number ' + oudTrackNum + ' is outside of ' + smfReader.tracks.length + ' tracks range in the MIDI file';
        }
        let oudTrack = smfReader.tracks[oudTrackNum];

        let openNotes = new Set();
        let sortedEvents = [];
        for (let i = 0; i < oudTrack.events.length; ++i) {
            let tickEvents = takeTickEvents(oudTrack.events, i);
            i += tickEvents.length - 1;
            tickEvents = sortTickEvents(tickEvents);
            sortedEvents.push(...tickEvents);
            for (let j = 0; j < tickEvents.length; ++j) {
                let event = oudTrack.events[i];
                if (isNoteOn(event)) {
                    let semitones = event.parameter1;
                    openNotes.add(semitones);
                    if (semitones < 43 || semitones > 64) {
                        errors.push('Notes in the Oud track (' + semitones + ') are outside of range (43-64) at index ' + (i + j));
                    }
                    if (openNotes.size > 1) {
                        errors.push('You have overlapping notes ' + [...openNotes].join(',') + ' at index ' + (i + j) + '. Please fix them and try again');
                    }
                } else if (isNoteOff(event)) {
                    let semitones = event.parameter1;
                    openNotes.delete(semitones);
                } else if (isPitchBend(event)) {
                    warnings.push('Your MIDI has pitchbend already at index ' + (i + j) + '. Please remove them if you don’t want them');
                }
            }
        }
        oudTrack.events = sortedEvents;
        return {
            errors: errors,
            warnings: warnings,
            smf: smfReader,
        };
    };

    let updateScaleTimeRanges = function(div, ticketPerBeat, totalTicks)
    {
        $$('input.from', div).forEach(inp => {
            inp.setAttribute('step', ticketPerBeat);
            inp.setAttribute('max', totalTicks);
            inp.value = 0;
        });
        $$('input.to', div).forEach(inp => {
            inp.setAttribute('step', ticketPerBeat);
            inp.setAttribute('max', totalTicks);
            inp.value = totalTicks;
        });
    };

    let getFractionChar = function(num)
    {
        if (num == '1') {
            return '';
        } else if (num == '0.75') {
            return '¾';
        } else if (num == '0.5') {
            return '½';
        } else if (num == '0.25') {
            return '¼';
        } else if (Math.abs(num - 0.3333333333) < 0.0000001) {
            return '⅓';
        } else if (Math.abs(num - 0.6666666666) < 0.0000001) {
            return '⅔';
        } else {
            return num + '';
        }
    };

    let getPitchResultNote = function(noteName, pitchBend)
    {
        let clean = noteName.slice(0, 2);
        let sign = noteName.slice(2);
        if (pitchBend == 0) {
            return noteName;
        } else if (sign == '#' && pitchBend < 0) {
            return clean + ' ' + getFractionChar(-pitchBend * 2) + sign;
        } else if (sign == '' && pitchBend < 0) {
            return clean + ' ' + getFractionChar(-pitchBend * 2) + 'b';
        } else {
            return '';
        }
    };

    let addPitchBendNote = function(pitchBendList)
    {
        let scaleBlock = pitchBendList.parentNode.parentNode;
        let infoBlock = $$('.no-pitch-bend-msg', scaleBlock)[0];
        infoBlock.style.display = 'none';

        let pitchBendSpan = gui.pitchBendRef.cloneNode(true);
        let onchange = () => {
            let noteName = $$('select.pitched-note', pitchBendSpan)[0].value;
            let pitchBend = $$('input.pitch-bend', pitchBendSpan)[0].value;
            $$('.pitch-result', pitchBendSpan)[0].value = getPitchResultNote(noteName, pitchBend);
        };
        $$('select.pitched-note', pitchBendSpan)[0].onchange = onchange;
        $$('input.pitch-bend', pitchBendSpan)[0].oninput = onchange;
        $$('button.remove-pitched-note', pitchBendSpan)[0]
            .onclick = () => {
                pitchBendSpan.remove();
                if ($$('.pitch-bend-list > *', scaleBlock).length === 0) {
                    infoBlock.style.display = 'inline';
                }
            };
        pitchBendList.appendChild(pitchBendSpan);
        return pitchBendSpan;
    };

    let updateScaleInfo = function(div)
    {
        let pitchBendList = $$('.pitch-bend-list', div)[0];
        pitchBendList.innerHTML = '';
        let scale = $$('select.scale', div)[0].value;
        let keyNote = $$('select.key-note', div)[0].value;
        let keyNotes = scaleMapping[scale];
        pitchBendList.innerHTML = '';
        if (keyNotes) {
            for (let pitchInfo of keyNotes[keyNote] || []) {
                let pitchBend = addPitchBendNote(pitchBendList);
                $$('select.pitched-note', pitchBend)[0].value = pitchInfo.noteName;
                $$('input.pitch-bend', pitchBend)[0].value = pitchInfo.pitchBend;
                $$('.pitch-result', pitchBend)[0].value = pitchInfo.pitched;
            }
        }
        if (!pitchBendList.innerHTML) {
            $$('.no-pitch-bend-msg', div).forEach(span => span.style.display = 'inline');
        } else {
            $$('.no-pitch-bend-msg', div).forEach(span => span.style.display = 'none');
        }
    };

    let initScale = function(div)
    {
        let onchange = () => updateScaleInfo(div);
        $$('select.scale', div)[0].onchange = onchange;
        $$('select.key-note', div)[0].onchange = onchange;
        $$('button.remove-region', div)[0].onclick = () => {
            let regions = div.parentNode.children;
            if (regions.length > 1) {
                console.log(regions);
                div.remove();
            } else {
                alert('There should be at least 1 region');
            }
        };
        $$('button.add-pitch-bend', div)[0].onclick = () => {
            addPitchBendNote($$('.pitch-bend-list', div)[0]);
        };
        onchange();
    };

    let shouldDiffer = function(input, getExcluded)
    {
        input.onchange = function(e){
            let min = input.min;
            let max = input.max;
            input.value = Math.min(input.value, max);
            input.value = Math.max(input.value, min);
            let oldValue = input.oldValue !== undefined ? input.oldValue : input.defaultValue;
            let excluded = getExcluded();
            if (input.value == excluded) {
                let delta = +input.value - oldValue;
                let nextValue = +input.value + delta;
                if (nextValue >= min && nextValue <= max) {
                    input.value = nextValue;
                } else {
                    input.value = oldValue;
                }
            }
            input.oldValue = input.value;
        };
    };

    // Sf2-Parser lefts null characters when name length is less than 20
    let cleanText = function(rawText)
    {
        rawText = rawText + '\u0000';
        let endIdx = rawText.indexOf('\u0000');
        return rawText.substr(0, endIdx);
    };

    /**
     * @param {Int16Array} sf2Sample
     * @param {ISampleInfo} sampleInfo
     * @return {ArrayBuffer}
     */
    let sf2ToWav = function(sf2Sample, sampleInfo)
    {
        let sampleValues = [...sf2Sample];
        let size = sampleValues.length * 2 + 44; // 44 - RIFF header data
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
        view.setInt32(40, sampleValues.length, true);
        for (let i = 0; i < sampleValues.length; ++i) {
            view.setInt16(44 + i * 2, sampleValues[i], true);
        }

        return wavBuf;
    };

    let main = function (){
        let currentSmf = null;
        gui.smfInput.onclick = (e) => { gui.smfInput.value = null; };
        gui.smfInput.onchange =
            (inputEvent) => loadSelectedFile(gui.smfInput.files[0],
            (smfBase64) => {
                let smfBuf = _base64ToArrayBuffer(smfBase64);
                let smf = Ns.Libs.SMFreader(smfBuf);
                gui.currentTracks.innerHTML = '';
                for (let i = 0; i < smf.tracks.length; ++i) {
                    let track = smf.tracks[i];
                    gui.currentTracks.innerHTML += '<tr>' +
                        '<td>' + i + '</td>' +
                        '<td>' + (track.trackName || '') + '</td>' +
                        '<td>' + track.events.length + '</td>' +
                    '</tr>';
                    console.log('Parsed SMF track ', track);
                }
                let totalTicks = getTotalTicks(smf);
                gui.ticksPerBeatHolder.innerHTML = smf.ticksPerBeat;
                gui.oudTrackNumInput.setAttribute('max', smf.tracks.length);
                gui.tablaTrackNumInput.setAttribute('max', smf.tracks.length);
                $$(':scope > div', gui.regionListCont)
                    .forEach(div => updateScaleTimeRanges(
                        div, smf.ticksPerBeat, totalTicks
                    ));
                updateScaleTimeRanges(gui.regionRef, smf.ticksPerBeat, totalTicks);

                currentSmf = smf;
                gui.convertBtn.removeAttribute('disabled');
            });
        gui.sf2Input.onclick = (e) => { gui.smfInput.value = null; };
        gui.sf2Input.onchange =
            (inputEvent) => loadSelectedFile(gui.sf2Input.files[0],
            (sf2Base64) => {
                let sf2Buf = _base64ToArrayBuffer(sf2Base64);
                let view = new Uint8Array(sf2Buf);
                let parser = new sf2.Parser(view);
                parser.parse();
                for (let sampleHeader of parser.sampleHeader) {
                    sampleHeader.sampleName = cleanText(sampleHeader.sampleName);
                }
                let sampleBuf = parser.sample[0];
                let sampleInfo = parser.sampleHeader[0];
                let audioCtx = new AudioContext();
                let wavBuf = sf2ToWav(sampleBuf, sampleInfo);

                console.log('Loaded .sf2 file ', parser);
                saveWavToDisc(wavBuf);
                audioCtx.decodeAudioData(wavBuf, (decoded) => {
                    console.log('Decoded audio data', decoded);
                    let audioSource = audioCtx.createBufferSource();
                    audioSource.buffer = decoded;
                    audioSource.connect(audioCtx.destination);
                    audioSource.start();
                }, console.error);

            });
        gui.convertBtn.onclick = () => {
            let params = collectParams(gui);
            let smfCopy = JSON.parse(JSON.stringify(currentSmf));
            let normalized = normalizeSmf(smfCopy, params);
            if (normalized.errors.length > 0) {
                alert('Invalid MIDI file: ' + normalized.errors.slice(0, 5).join('\n'));
            } else {
                if (normalized.warnings.length > 0) {
                    alert('Warning: ' + normalized.warnings.slice(0, 5).join('\n'));
                }
                let buff = convertToArabicMidi(smfCopy, params);
                /** @debug */
                console.log('Converted SMF', Ns.Libs.SMFreader(buff).tracks);
                saveMidiToDisc(buff);
            }
        };
        initScale($$(':scope > *', gui.regionListCont)[0]);
        gui.addAnotherRegionBtn.onclick = () => {
            let cloned = gui.regionRef.cloneNode(true);
            initScale(cloned);
            gui.regionListCont.appendChild(cloned);
        };
        shouldDiffer(gui.oudTrackNumInput, () => gui.tablaTrackNumInput.value);
        shouldDiffer(gui.tablaTrackNumInput, () => gui.oudTrackNumInput.value);
    };

    main();
};