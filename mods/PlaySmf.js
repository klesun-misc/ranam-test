
define([], () => (smfReader, sf2Adapter) => {

    let isNoteOn = (readerEvent) =>
        readerEvent.type === 'MIDI' &&
        readerEvent.midiEventType === 9 &&
        readerEvent.parameter2 > 0;

    let isNoteOff = (readerEvent) =>
        readerEvent.type === 'MIDI' && (
            readerEvent.midiEventType === 8 ||
            readerEvent.midiEventType === 9 && readerEvent.parameter2 === 0
        );

    /** do setTimeout() or do on this thread if time is zero */
    let timeoutAsap = (millis, callback) => {
        if (millis > 0) {
            setTimeout(callback, millis);
        } else {
            callback();
        }
    };

    let ticksToEvents = {};
    for (let track of smfReader.tracks) {
        let timeTicks = 0;
        for (let event of track.events) {
            timeTicks += event.delta;
            ticksToEvents[timeTicks] = ticksToEvents[timeTicks] || [];
            ticksToEvents[timeTicks].push(event);
        }
    }
    let ticksPerChord = Object.keys(ticksToEvents)
        .sort((a,b) => a - b);
    let tempo = 120; // TODO: take from SMF
    let preset = 25; // TODO: take from SMF
    let bank = 20; // TODO: take from SMF
    let stopped = false;
    let pitchToSources = {};
    let chordIndex = -1;
    let startTime = window.performance.now();
    let playNext = () => {
        if (stopped) {
            for (let [semitone, sources] of Object.entries(pitchToSources)) {
                for (let source of sources) {
                    source.stop();
                }
            }
        } else if (++chordIndex < ticksPerChord.length) {
            let ticks = ticksPerChord[chordIndex];
            let academic = ticks / smfReader.ticksPerBeat / 4;
            let nextTime = 1000 * academic * 60 / (tempo / 4);
            let timeSkip = startTime + nextTime - window.performance.now();
            timeoutAsap(timeSkip, () => {
                for (let event of ticksToEvents[ticks]) {
                    if (isNoteOn(event)) {
                        let semitone = event.parameter1;
                        let velocity = event.parameter2;
                        let params = {bank, preset, semitone, velocity};
                        sf2Adapter.getSampleData(params, (samples) => {
                            if (samples.length === 0) {
                                console.error('No sample in the bank: ' + bank + ' ' + preset + ' ' + semitone);
                            }
                            samples.forEach(sampleData => {
                                let audioSource = sampleData.audioSource;
                                audioSource.start();
                                pitchToSources[semitone] = pitchToSources[semitone] || [];
                                pitchToSources[semitone].push(audioSource);
                            });
                        })
                    } else if (isNoteOff(event)) {
                        let sources = pitchToSources[event.parameter1] || [];
                        for (let source of sources) {
                            source.stop();
                        }
                    }
                }
                playNext();
            });
        } else {
            // finished
        }
    };
    let paramSets = smfReader.tracks.reduce(
        (all, track) => all.concat(track.events.filter(isNoteOn).reduce(
        (all, event) => all.concat([{
            bank: bank, preset: preset,
            semitone: event.parameter1,
            velocity: event.parameter2,
        }]), [])), []);
    sf2Adapter.preloadSamples(paramSets, playNext);
    return () => stopped = true;
});