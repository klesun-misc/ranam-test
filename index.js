
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

    let readerToJsmidgenEvent = function(readerEvent)
    {
        if (readerEvent.type === 'MIDI') {
            return new Midi.Event({
                type: readerEvent.midiEventType * 16,
                channel: readerEvent.midiChannel,
                param1: readerEvent.parameter1,
                param2: readerEvent.parameter2,
                time: readerEvent.delta,
            })
        } else if (readerEvent.type === 'meta') {
            if (readerEvent.metaType == 47) {
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
        let [b1,b2] = [intvalue % 128, intvalue >> 7];

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
            Do: {noteName: 'Re' , pitchBend: -0.25}, // Re ½b
            Re: {noteName: 'Mi' , pitchBend: -0.25}, // Mi ½b
            Mi: {noteName: 'Fa#', pitchBend: -0.25}, // Fa ½#
            Fa: {noteName: 'So' , pitchBend: -0.25}, // So ½b
            So: {noteName: 'La' , pitchBend: -0.25}, // La ½b
            La: {noteName: 'Si' , pitchBend: -0.25}, // Si ½b
            Si: {noteName: 'Do#', pitchBend: -0.25}, // Do ½#
        },
        Saba: {
            Do: {noteName: 'Re' , pitchBend: -0.25}, // Re ½b
            Re: {noteName: 'Mi' , pitchBend: -0.25}, // Mi ½b
            Mi: {noteName: 'Fa#', pitchBend: -0.25}, // Fa ½#
            Fa: {noteName: 'So' , pitchBend: -0.25}, // So ½b
            So: {noteName: 'La' , pitchBend: -0.25}, // La ½b
            La: {noteName: 'Si' , pitchBend: -0.25}, // Si ½b
            Si: {noteName: 'Do#', pitchBend: -0.25}, // Do ½#
        },
        Sikah: {
            Do: {noteName: 'Do', pitchBend: -0.25}, // Do ½b
            Re: {noteName: 'Re', pitchBend: -0.25}, // Re ½b
            Mi: {noteName: 'Mi', pitchBend: -0.25}, // Mi ½b
            Fa: {noteName: 'Fa', pitchBend: -0.25}, // Fa ½b
            So: {noteName: 'So', pitchBend: -0.25}, // So ½b
            La: {noteName: 'La', pitchBend: -0.25}, // La ½b
            Si: {noteName: 'Si', pitchBend: -0.25}, // Si ½b
        },
        Rast: {
            Do: {noteName: 'Mi' , pitchBend: -0.25}, // Mi ½b
            Re: {noteName: 'Fa#', pitchBend: -0.25}, // Fa ½#
            Mi: {noteName: 'So#', pitchBend: -0.25}, // So ½#
            Fa: {noteName: 'La' , pitchBend: -0.25}, // La ½b
            So: {noteName: 'Si' , pitchBend: -0.25}, // Si ½b
            La: {noteName: 'Do#', pitchBend: -0.25}, // Do ½#
            Si: {noteName: 'Re#', pitchBend: -0.25}, // Re ½#
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
        return semitone % 12 == ivory + offset;
    };

    let getOudPitchBend = function(semitone, scales)
    {
        for (let scaleData of scales) {
            let scale = scales ? scaleData.scale : null;
            let startingNote = scales ? scaleData.startingNote : null;
            let keyNotes = scaleMapping[scale];
            if (!keyNotes) {
                // unknown Scale name
                continue;
            }
            let pitchInfo = keyNotes[startingNote];
            if (!pitchInfo) {
                // if note outside the scale was played
                continue;
            }
            if (matchesNoteName(semitone, pitchInfo.noteName)) {
                return pitchInfo.pitchBend;
            } else {
                // not the bended note
                continue;
            }
        }
        return 0;
    };

    let smfReaderToBuff = function(smfReader, formParams)
    {
        /** @debug */
        console.log(formParams);

        let jsmidgenTracks = [];
        for (let i = 0; i < smfReader.tracks.length; ++i) {
            let readerTrack = smfReader.tracks[i];
            let jsmidgenTrack = new Midi.Track();

            let isOudTrack = i == formParams.oudTrackNum;
            if (isOudTrack) {
                // add control change event and program change 123, bird tweet
                makeOadEvents(formParams.oudChanNum)
                    .forEach(e => jsmidgenTrack.addEvent(e));
            } else if (i == formParams.tablaTrackNum) {
                // add control change event for drums... what was it again?
            }

            let timeTicks = 0;
            let scaleRegions = formParams.scaleRegions;

            for (let readerEvent of readerTrack.events) {
                timeTicks += readerEvent.delta;
                let scales = scaleRegions.filter(s => s.from <= timeTicks && s.to > timeTicks);
                let jsmidgenEvent = readerToJsmidgenEvent(readerEvent);
                let isNoteEvent = readerEvent.type === 'MIDI' &&
                    [8,9].includes(readerEvent.midiEventType);
                let isNoteOn = readerEvent.midiEventType == 9 && readerEvent.parameter2 > 0;
                if (isOudTrack && isNoteOn) {
                    // Oud NOTE ON is about to fire - should set pitch bend
                    let koef = getOudPitchBend(readerEvent.parameter1, scales);
                    jsmidgenTrack.addEvent(makePitchBend(koef, readerEvent.midiChannel));
                }
                if (jsmidgenEvent) {
                    jsmidgenTrack.addEvent(jsmidgenEvent);
                }
                if (isOudTrack && isNoteEvent && !isNoteOn) {
                    // Oud NOTE OFF just fired, should reset pitch bend
                    jsmidgenTrack.addEvent(makePitchBend(0, readerEvent.midiChannel));
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
                startingNote: $$('select.starting-note', div)[0].value,
                from: $$('input.from', div)[0].value,
                to: $$('input.to', div)[0].value,
            }),
        oudTrackNum: gui.oudTrackNumInput.value,
        oudChanNum: gui.oudChanNumInput.value,
        tablaTrackNum: gui.tablaTrackNumInput.value,
    };

    let gui = {
        smfInput: $$('input[type="file"].midi-file', form)[0],
        ticksPerBeatHolder: $$('.ticks-per-beat', form)[0],
        regionListCont: $$('.region-list', form)[0],
        currentTracks: $$('tbody.current-tracks', form)[0],
        addAnotherRegionBtn: $$('button.add-another-region', form)[0],
        oudTrackNumInput: $$('input.oud-track-num', form)[0],
        oudChanNumInput: $$('input.oud-chan-num', form)[0],
        tablaTrackNumInput: $$('input.tabla-track-num', form)[0],
        convertBtn: $$('button.convert-to-arabic', form)[0],
    };

    let getTotalTicks = function(smfReader)
    {
        let ticksPerTrack = smfReader.tracks.map(t => t.events.reduce((sum, e) => sum + e.delta, 0));
        return Math.max(...ticksPerTrack);
    };

    let validateSmf = function(smfReader, params) {
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
                    .forEach(div => {
                        $$('input.from', div).forEach(inp => {
                            inp.setAttribute('step', smf.ticksPerBeat);
                            inp.setAttribute('max', totalTicks);
                            inp.value = 0;
                        });
                        $$('input.to', div).forEach(inp => {
                            inp.setAttribute('step', smf.ticksPerBeat);
                            inp.setAttribute('max', totalTicks);
                            inp.value = totalTicks;
                        });
                    });

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
                saveMidiToDisc(buff);
            }
        };
        gui.addAnotherRegionBtn.onclick = () => {
            let last = $$(':scope > *', gui.regionListCont).slice(-1)[0];
            gui.regionListCont.appendChild(last.cloneNode(true));
        };
    };

    main();
};