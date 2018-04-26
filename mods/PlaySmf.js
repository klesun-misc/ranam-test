
define([], () => (smfReader, sf2Adapter, synth) => {

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
    let stopped = false;
    let chordIndex = -1;
    let whenDones = [];

    smfReader.tracks.forEach(t => t.events
        .filter(e => e.type === 'MIDI')
        .forEach(e => synth.handleMidiEvent(e, true)));

    sf2Adapter.onIdle(() => {
        let startTime = window.performance.now();
        let playNext = () => {
            if (stopped) {
                synth.stopAll();
            } else if (++chordIndex < ticksPerChord.length) {
                let ticks = ticksPerChord[chordIndex];
                let academic = ticks / smfReader.ticksPerBeat / 4;
                let nextTime = 1000 * academic * 60 / (tempo / 4);
                let timeSkip = startTime + nextTime - window.performance.now();
                timeoutAsap(timeSkip, () => {
                    for (let event of ticksToEvents[ticks]) {
                        if (event.type === 'MIDI') {
                            synth.handleMidiEvent(event);
                        } else {
                            // handle tempo and other stuff
                        }
                    }
                    playNext();
                });
            } else {
                whenDones.forEach(cb => cb());
            }
        };
        playNext();
    });

    return {
        set then(whenDone) {
            if (chordIndex >= ticksPerChord.length) {
                whenDone();
            } else {
                whenDones.push(whenDone);
            }
        },
        stop: () => stopped = true,
    };
});