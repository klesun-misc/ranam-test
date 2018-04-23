
/**
 * a software analog of a MIDI device that
 * takes a MIDI event and produces the sound
 */
define([], () => (audioCtx, sf2Adapter) => {
    "use strict";

    let isNoteOn = (readerEvent) =>
        readerEvent.type === 'MIDI' &&
        readerEvent.midiEventType === 9 &&
        readerEvent.parameter2 > 0;

    let isNoteOff = (readerEvent) =>
        readerEvent.type === 'MIDI' && (
            readerEvent.midiEventType === 8 ||
            readerEvent.midiEventType === 9 && readerEvent.parameter2 === 0
        );

    let range = (l, r) => new Array(r - l).fill(0).map((_, i) => l + i);

    let chanToPressed = range(0, 16).map(i => new Set([]));

    let channelNodes = range(0, 16).map(i => {
        let node = audioCtx.createGain();
        node.gain.value = 1;
        node.connect(audioCtx.destination);
        return node;
    });

    let channels = range(0, 16).map(i => 1 && {
        bank: 0,
        preset: 0,
        pitchBend: 0,
        volume: 1,
        pressedNotes: new Set(),
    });

    let semitoneToFactor = (s) => Math.pow(2, s / 12);

    let setPitchBend = (pitchBend, chan) => {
        channels[chan].pitchBend = pitchBend;
        chanToPressed[chan].forEach(s => s.src.playbackRate.value = s.baseFrequency * semitoneToFactor(pitchBend));
    };

    let setVolume = (factor, chan) => {
        channels[chan].volume = factor;
        chanToPressed[chan].forEach(s => s.gain.gain.value = s.baseVolume * Math.max(factor, 0.0001));
    };

    let MAX_VOLUME = 0.10;
    let pitchToAudios = {};

    let press = function(sampleData) {
        let audioSource = audioCtx.createBufferSource();
        let gainNode = audioCtx.createGain();
        gainNode.gain.value = MAX_VOLUME * sampleData.volumeKoef;
        audioSource.buffer = sampleData.buffer;
        audioSource.playbackRate.value = sampleData.frequencyFactor;
        audioSource.loopStart = sampleData.loopStart;
        audioSource.loopEnd = sampleData.loopEnd;
        audioSource.loop = sampleData.isLooped;
        gainNode.connect(audioCtx.destination);
        audioSource.connect(gainNode);
        audioSource.start();
        return {
            audioSource: audioSource,
            gainNode: gainNode,
            fadeMillis: sampleData.fadeMillis,
        };
    };

    let release = function(audio) {
        let iterations = 10;
        let baseVolume = audio.gainNode.gain.value;
        let fade = (i) => {
            if (i >= 0) {
                audio.gainNode.gain.value = Math.max(baseVolume * (i / iterations), 0.0001);
                setTimeout(() => fade(i - 1), audio.fadeMillis / iterations);
            } else {
                audio.audioSource.stop();
            }
        };
        fade(iterations - 1);
    };

    let handleMidiEvent = function(event, preloadOnly = false) {
        let {midiEventType, midiChannel, parameter1, parameter2} = event;
        /** @debug */
        let preset = 25; // TODO: take from SMF
        let bank = 20; // TODO: take from SMF
        if (isNoteOn(event)) {
            let semitone = parameter1;
            let velocity = parameter2;
            let params = {bank, preset, semitone, velocity};
            sf2Adapter.getSampleData(params, (samples) => {
                if (samples.length === 0) {
                    console.error('No sample in the bank: ' + bank + ' ' + preset + ' ' + semitone);
                } else if (!preloadOnly) {
                    samples.forEach(sampleData => {
                        pitchToAudios[semitone] = pitchToAudios[semitone] || [];
                        pitchToAudios[semitone].push(press(sampleData));
                    });
                }
            })
        } else if (isNoteOff(event)) {
            let audios = pitchToAudios[event.parameter1] || [];
            audios.forEach(release);
            pitchToAudios[event.parameter1] = [];
        } else if (midiEventType === 14) { // pitch bend
            let pitchBend = (parameter1 + parameter2 << 7) * 2 / 16383 - 1;
            setPitchBend(pitchBend, midiChannel);
        //} else if () {

        } else {
            // unhandled event
        }
    };

    let stopAll = function() {
        for (let [semitone, audios] of Object.entries(pitchToAudios)) {
            audios.forEach(release);
        }
        pitchToAudios = {};
    };

    return {
        handleMidiEvent: handleMidiEvent,
        stopAll: stopAll,
    };
});
