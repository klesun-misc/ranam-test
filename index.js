
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
            return new Midi.MetaEvent({
                time: readerEvent.delta,
                type: readerEvent.metaType,
                data: readerEvent.metaData,
            });
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

    let getOudPitchBend = function(semitone, scale)
    {
        if (['Bayati', 'Saba', 'Sikah', 'Rast'].includes(scale)) {
            let isDoReMiFaSoLaTi = true;
            if (isDoReMiFaSoLaTi) {
                // half a step below a note
                // expecting that midi range is set to +-2 semitones
                return -0.25;
            } else {
                return 0;
            }
        } else if (['Hijaz', 'Nahawand', 'Kurd', 'Ajam'].includes(scale)) {
            // no pitch bend
            return 0;
        } else {
            // unknown;
            return 0;
        }
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

            for (let readerEvent of readerTrack.events) {
                let jsmidgenEvent = readerToJsmidgenEvent(readerEvent);
                let currentScale = 'Bayati'; /** @debug */
                if (readerEvent.type === 'meta' && readerEvent.metaType == 47) {
                    // End Of Track message, will be added automatically by
                    // jsmidgen, so no need to dupe it, it causes problems
                } else if (jsmidgenEvent) {
                    if (isOudTrack && readerEvent.type === 'MIDI' &&
                        [8,9].includes(readerEvent.midiEventType) // NOTE ON/OFF
                    ) {
                        let semitone = readerEvent.parameter1;
                        let velocity = readerEvent.parameter2;
                        let isNoteOn = readerEvent.midiEventType == 8 && velocity > 0;
                        if (isNoteOn) {
                            let koef = getOudPitchBend(semitone, currentScale);
                            jsmidgenTrack.addEvent(makePitchBend(koef, readerEvent.midiChannel));
                        } else {
                            // NOTE OFF - reset pitch bend
                            jsmidgenTrack.addEvent(makePitchBend(0, readerEvent.midiChannel));
                        }
                    }
                    jsmidgenTrack.addEvent(jsmidgenEvent);
                } else {
                    console.debug('Failed to transform SMFReader event to jsmidgen format', readerEvent);
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
        regions: $$(':scope > *', gui.regionListCont)
            .map(div => 1 && {
                scale: $$('select.scale', div)[0].value,
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
                $$(':scope > div input.to', gui.regionListCont)
                    .forEach(inp => {
                        inp.setAttribute('step', smf.ticksPerBeat);
                        inp.value = totalTicks;
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