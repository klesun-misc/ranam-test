
var klesun = Klesun();
klesun.requires('./Tls.js').then = (Tls) =>
klesun.requires('./MidiUtil.js').then = (MidiUtil) =>
klesun.whenLoaded = () => (smfReader, synth, getParams) => {

    let {opt} = Tls();
    let {isNoteOn, scaleVelocity, ticksToMillis} = MidiUtil();

    /** do setTimeout() or do on this thread if time is zero */
    let nowOrLater = (millis, callback) => {
        if (millis > 0) {
            setTimeout(callback, millis);
        } else {
            callback();
        }
    };

    let ticksToEvents = {};
    for (let [i, track] of Object.entries(smfReader.tracks)) {
        let timeTicks = 0;
        for (let event of track.events) {
            timeTicks += event.delta;
            ticksToEvents[timeTicks] = ticksToEvents[timeTicks] || [];
            ticksToEvents[timeTicks].push({
                event: event,
                trackNum: i,
            });
        }
    }
    let ticksPerChord = Object.keys(ticksToEvents)
        .sort((a,b) => a - b);
    let tempo = 120;
    let stopped = false;
    let chordIndex = -1;
    let whenDones = [];
    let startParams = getParams();

    /** update volume from config, add tempo event if needed (TODO) */
    let transformEvents = function(records) {
        return records.map(({event, trackNum}) => {
            if (event.type === 'MIDI') {
                let {midiChannel, midiEventType, parameter1, parameter2} = event;
                if (isNoteOn(event)) {
                    // return velocity to the original song value
                    let oldFactor = startParams.configTracks[trackNum].velocityFactor || 1;
                    parameter2 = scaleVelocity(parameter2, 1 / oldFactor);
                    // apply current velocity config
                    let newFactor = getParams().configTracks[trackNum].velocityFactor;
                    parameter2 = scaleVelocity(parameter2, newFactor);
                }
                return {type: event.type, midiChannel, midiEventType, parameter1, parameter2};
            } else {
                return event;
            }
        });
    };

    let tempoStartTime = window.performance.now();
    let tempoStartTicks = 0;
    let playNext = () => {
        if (stopped) {
            synth.stopAll();
        } else if (++chordIndex < ticksPerChord.length) {
            let ticks = ticksPerChord[chordIndex];
            let nextTime = ticksToMillis(ticks - tempoStartTicks, smfReader.ticksPerBeat, tempo);
            let timeSkip = tempoStartTime + nextTime - window.performance.now();
            nowOrLater(timeSkip, () => {
                for (let event of transformEvents(ticksToEvents[ticks])) {
                    if (event.type === 'MIDI') {
                        synth.handleMidiEvent(event);
                    } else if (event.type === 'meta') {
                        // handle tempo and other stuff
                        if (event.metaType === 81) { // tempo
                            // TODO: update currently sounding notes
                            tempo = 60 * 1000000 / event.metaData.reduce((a,b) => (a << 8) + b, 0);
                            tempoStartTime = tempoStartTime + nextTime;
                            tempoStartTicks = ticks;
                        }
                    }
                    opt(getParams().tempo).get = t => {
                        if (t != tempo) {
                            tempo = t;
                            tempoStartTime = tempoStartTime + nextTime;
                            tempoStartTicks = ticks;
                        }
                    };
                }
                playNext();
            });
        } else {
            whenDones.forEach(cb => cb());
        }
    };
    playNext();

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
};