
var org = org || {};
org.klesun = org.klesun || {};
org.klesun.RanamTest = function(form){
    "use strict";
    let $$ = (s) => Array.from(document.querySelectorAll(s));

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
        saveAs(blob, 'song.mid', true);
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

    let smfReaderToBuff = function(smfReader)
    {
        let jsmidgenTracks = [];
        for (let readerTrack of smfReader.tracks) {
            let jsmidgenTrack = new Midi.Track();

            // add quarter-tone pitch-bend to every track for test
            for (let i = 0; i < 16; ++i) {
                jsmidgenTrack.addEvent(makePitchBend(0.25, i));
            }

            for (let readerEvent of readerTrack.events) {
                let jsmidgenEvent = readerToJsmidgenEvent(readerEvent);
                if (jsmidgenEvent) {
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

    let main = function (){
        let gui = {
            smfInput: $$('input[type="file"].midi-file', form)[0],
            convertBtn: $$('button.convert-to-arabic', form)[0],
        };
        let currentSmf = null;
        gui.smfInput.onchange =
            (inputEvent) => loadSelectedFile(gui.smfInput.files[0],
            (smfBase64) => {
                let smfBuf = _base64ToArrayBuffer(smfBase64);
                let smf = Ns.Libs.SMFreader(smfBuf);
                for (let track of smf.tracks) {
                    console.log('Parsed SMF track ', track);
                }
                currentSmf = smf;
                gui.convertBtn.removeAttribute('disabled');
            });
        gui.convertBtn.onclick = () => {
            let buff = smfReaderToBuff(currentSmf);
            saveMidiToDisc(buff);
        };
    };

    main();
};