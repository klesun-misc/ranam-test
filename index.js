
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

        let maxSize = 2 * 1024 * 1024; // 2 mebibytes

        if (fileInfo.size < maxSize ||
            confirm('File is very large, ' + (fileInfo.size / 1024 / 1024).toFixed(2) + ' MiB . Are you sure?')
        ) {
            let reader = new FileReader();
            reader.readAsDataURL(fileInfo);
            reader.onload = (e) => {
                whenLoaded(e.target.result.split(',')[1]);
            }
        } else {
            alert('too big file, more than 2 MiB!');
        }
    };

    let saveMidiToDisc = function(buff)
    {
        let blob = new Blob([buff], {type: "midi/binary"});
        saveAs(blob, 'ranam_song.mid', true);
    };

    let readerToJsmidgenEvent = function(readerEvent, formParams, trackNum)
    {
        let isOudTrack = trackNum == formParams.oudTrackNum;
        let isTablaTrack = trackNum == formParams.tablaTrackNum;

        if (readerEvent.type === 'MIDI') {
            if (isOudTrack && readerEvent.midiEventType == 14) {
                // Pitch Bend - we don't want pitch bends from
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
                })
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

    let smfReaderToBuff = function(smfReader, formParams)
    {
        /** @debug */
        console.log(formParams);

        let jsmidgenTracks = [];
        for (let i = 0; i < smfReader.tracks.length; ++i) {
            let pitchBendNotes = new Set();

            let readerTrack = smfReader.tracks[i];
            let jsmidgenTrack = new Midi.Track();

            let isOudTrack = i == formParams.oudTrackNum;
            let isTablaTrack = i == formParams.tablaTrackNum;
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
                let isNoteEvent = readerEvent.type === 'MIDI' &&
                    [8,9].includes(readerEvent.midiEventType);
                let isNoteOn = readerEvent.midiEventType == 9 && readerEvent.parameter2 > 0;
                if (isOudTrack && isNoteOn) {
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
                if (isOudTrack && isNoteEvent && !isNoteOn) {
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

    let validateSmf = function(smfReader, params)
    {
        let oudTrackNum = params.oudTrackNum;
        if (oudTrackNum > smfReader.tracks.length) {
            return 'Specified Oud track number ' + oudTrackNum + ' is outside of ' + smfReader.tracks.length + ' tracks range in the MIDI file';
        }
        let oudTrack = smfReader.tracks[oudTrackNum];

        for (let i = 0; i < oudTrack.events.length; ++i) {
            let event = oudTrack.events[i];
            if (event.type === 'MIDI' && event.midiEventType == 9) { // NOTE ON
                let semitones = event.parameter1;
                if (semitones < 43 || semitones > 64) {
                    return 'Notes in the Oud track (' + semitones + ') are outside of range (43-64) at index ' + i;
                }
            }
        }

        return null; // no errors
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
            return clean + ' ' + getFractionChar(-pitchBend) + sign;
        } else if (sign == '' && pitchBend < 0) {
            return clean + ' ' + getFractionChar(-pitchBend) + 'b';
        } else {
            return '';
        }
    };

    let addPitchBendNote = function(pitchBendList)
    {
        let pitchBendSpan = gui.pitchBendRef.cloneNode(true);
        let onchange = () => {
            let noteName = $$('select.pitched-note', pitchBendSpan)[0].value;
            let pitchBend = $$('input.pitch-bend', pitchBendSpan)[0].value;
            $$('.pitch-result', pitchBendSpan)[0].value = getPitchResultNote(noteName, pitchBend);
        };
        $$('select.pitched-note', pitchBendSpan)[0].onchange = onchange;
        $$('input.pitch-bend', pitchBendSpan)[0].onchange = onchange;
        $$('button.remove-pitched-note', pitchBendSpan)[0]
            .onclick = () => pitchBendSpan.remove();
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
            $$('.info-holder', div).forEach(span => span.innerHTML = 'no pitch bend');
        }
    };

    let initScale = function(div)
    {
        let onchange = () => updateScaleInfo(div);
        $$('select.scale', div)[0].onchange = onchange;
        $$('select.key-note', div)[0].onchange = onchange;
        $$('button.remove-region', div)[0].onclick = () => div.remove();
        $$('button.add-pitch-bend', div)[0].onclick = () => {
            addPitchBendNote($$('.pitch-bend-list', div)[0]);
        };
        onchange();
    };

    let main = function (){
        let currentSmf = null;
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
                $$(':scope > div', gui.regionListCont)
                    .forEach(div => updateScaleTimeRanges(
                        div, smf.ticksPerBeat, totalTicks
                    ));
                updateScaleTimeRanges(gui.regionRef, smf.ticksPerBeat, totalTicks);

                currentSmf = smf;
                gui.convertBtn.removeAttribute('disabled');
            });
        gui.convertBtn.onclick = () => {
            let params = collectParams(gui);
            let error = validateSmf(currentSmf, params);
            if (error) {
                alert('Invalid MIDI file: ' + error);
            } else {
                let buff = smfReaderToBuff(currentSmf, params);
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
    };

    main();
};