
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

    let makeChanGain = () => {
        let node = audioCtx.createGain();
        node.gain.value = 1;
        node.connect(audioCtx.destination);
        return node;
    };

    let channels = range(0, 16).map(i => 1 && {
        bank: 0,
        preset: 0,
        pitchBend: 0,
        volume: 1,
        gainNode: makeChanGain(),
        pressedNotes: [],
    });

    let toneToFactor = (s) => Math.pow(2, 2 * s / 12);

    let setPitchBend = (pitchBend, chan) => {
        channels[chan].pitchBend = pitchBend;
        channels[chan].pressedNotes.forEach(s => s.audioSource.playbackRate.value = s.baseFrequency * toneToFactor(pitchBend));
    };

    let setVolume = (factor, chan) => {
        channels[chan].volume = factor;
        channels[chan].gainNode.gain.value = factor;
    };

    let MAX_VOLUME = 0.10;

    let press = function(sampleData, channel) {
        let gainNode = audioCtx.createGain();
        let panNode = audioCtx.createStereoPanner();
        let audioSource = audioCtx.createBufferSource();

        let baseVolume = MAX_VOLUME * sampleData.volumeKoef;
        let baseFrequency = sampleData.frequencyFactor;
        gainNode.gain.value = baseVolume;
        audioSource.buffer = sampleData.buffer;
        audioSource.playbackRate.value = baseFrequency * toneToFactor(channel.pitchBend);
        audioSource.loopStart = sampleData.loopStart;
        audioSource.loopEnd = sampleData.loopEnd;
        audioSource.loop = sampleData.isLooped;

        gainNode.connect(audioCtx.destination);
        panNode.connect(gainNode);
        audioSource.connect(panNode);

        audioSource.start();
        return {
            audioSource: audioSource,
            gainNode: gainNode,
            baseVolume: baseVolume,
            baseFrequency: sampleData.frequencyFactor,
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
        let channel = channels[midiChannel];
        if (isNoteOn(event)) {
            let params = {
                semitone: parameter1, bank: channel.bank,
                velocity: parameter2, preset: channel.preset,
            };
            /** @debug, dunno why, but bank/program are different in sf2 from what we set in the converter */
            if (midiChannel === 0) { // Ranam Oud
                params.bank = 20;
                params.preset = 25;
            } else if (midiChannel === 10) { // Ranam Tabla
                params.bank = 0;
                params.preset = 0;
            } else if (midiChannel === 9) {
                // drum track
                params.bank = 128;
            }
            sf2Adapter.getSampleData(params, (samples) => {
                if (samples.length === 0) {
                    console.error('No sample in the bank: ' + channel.bank + ' ' + channel.preset + ' ' + parameter1);
                } else if (!preloadOnly) {
                    samples.forEach(sampleData => {
                        channel.pressedNotes.push(press(sampleData, channel));
                    });
                }
            })
        } else if (isNoteOff(event)) {
            channels[midiChannel].pressedNotes.forEach(release);
            channels[midiChannel].pressedNotes = [];
        } else if (midiEventType === 14) { // pitch bend
            let pitchBend = (parameter1 + parameter2 << 7) * 2 / 16384 - 1;
            setPitchBend(pitchBend, midiChannel);
        } else if (midiEventType === 12) { // program change
            channel.preset = parameter1;
        } else if (midiEventType === 11) { // control change
            if (parameter1 === 0) { // bank change
                channel.bank = parameter2;
            } else if (parameter1 === 1) { // volume
                let factor = parameter2 / 127;
                //setVolume(factor);
            }
        } else {
            // unhandled event
        }
    };

    let stopAll = function() {
        for (let channel of channels) {
            channel.pressedNotes.forEach(release);
            channel.pressedNotes = [];
        }
    };

    return {
        handleMidiEvent: handleMidiEvent,
        stopAll: stopAll,
    };
});
