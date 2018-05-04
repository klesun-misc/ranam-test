
/**
 * a software analog of a MIDI device that
 * takes a MIDI event and produces the sound
 * @param fluidSf2 - optional
 */
define([], () => (audioCtx, sf2Adapter, getFluidSf) => {
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
        let now = audioCtx.currentTime;
        audio.gainNode.gain.exponentialRampToValueAtTime(0.000001, now + audio.fadeMillis / 1000);
        audio.audioSource.stop(now + audio.fadeMillis / 1000);
    };

    let handleMidiEvent = function(event, preloadOnly = false) {
        let {midiEventType, midiChannel, parameter1, parameter2} = event;
        let channel = channels[midiChannel];
        if (isNoteOn(event)) {
            let params = {
                semitone: parameter1, bank: channel.bank,
                velocity: parameter2, preset: channel.preset,
            };
            let useRanamSf2 = false;
            // I guess it is hardcoded somewhere in Ranam app that bank/program
            // are such no matter what they actually are in the soundfont
            if (params.bank == 121 && params.preset == 123) { // Ranam Oud
                params.bank = 20;
                params.preset = 25;
                useRanamSf2 = true;
            } else if (midiChannel === 10) { // Ranam Tabla
                params.bank = 128;
                params.preset = 0;
                useRanamSf2 = true;
            } else if (midiChannel === 9) {
                // drum track
                params.bank = 128;
            }
            let fluidSf = getFluidSf();
            let sf2 = (useRanamSf2 || !fluidSf) ? sf2Adapter : fluidSf;
            sf2.getSampleData(params, (samples) => {
                if (samples.length === 0) {
                    console.error('No sample in the bank: ' + channel.bank + ' ' + channel.preset + ' ' + parameter1);
                } else if (!preloadOnly) {
                    samples.forEach(sampleData => {
                        let pressed = press(sampleData, channel);
                        pressed.semitone = params.semitone;
                        channel.pressedNotes.push(pressed);
                    });
                }
            })
        } else if (isNoteOff(event)) {
            channel.pressedNotes
                .filter(p => p.semitone == event.parameter1)
                .forEach(release);
            channel.pressedNotes = channel.pressedNotes
                .filter(p => p.semitone != event.parameter1);
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
