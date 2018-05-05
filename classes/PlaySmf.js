
var klesun = Klesun();
klesun.requires('./Tls.js').then = (Tls) =>
klesun.requires('./MidiUtil.js').then = (MidiUtil) =>
klesun.whenLoaded = () => (smfReader, synth, getParams, startAt) => {

    let {opt} = Tls();
    let {isNoteOn, scaleVelocity, ticksToMillis, getTempo,
        tempoTyBytes, bytesToTempo,
    } = MidiUtil();

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
        .map(a => +a).sort((a,b) => a - b);
    let tempo = 120;
    let stopped = false;
    let chordIndex = -1;
    let whenDones = [];
    let startParams = getParams();
    let tempoStartTime = window.performance.now();
    let tempoStartTicks = 0;

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

    let handleChord = function(ticks, chordAbsTime, realSound) {
        for (let event of transformEvents(ticksToEvents[ticks])) {
            if (event.type === 'MIDI') {
                synth.handleMidiEvent(event, !realSound);
            } else if (event.type === 'meta') {
                // handle tempo and other stuff
                if (event.metaType === 81) { // tempo
                    tempo = bytesToTempo(event.metaData);
                    tempoStartTime = chordAbsTime;
                    tempoStartTicks = ticks;
                }
            }
        }
    };

    // rewind to the start point, apply all program/bank/tempo/etc... events
    let rewindToStart = function(ticksPerChord) {
        let startIdx = 0;
        for (let ticks of ticksPerChord) {
            if (ticks >= startAt) {
                break;
            } else {
                ++startIdx;
                handleChord(ticks, 0, false);
            }
        }
        return ticksPerChord.slice(startIdx)
    };

    ticksPerChord = rewindToStart(ticksPerChord);
    tempoStartTicks = ticksPerChord[0] || 0;
    tempoStartTime = window.performance.now();
    let playNext = () => {
        if (stopped) {
            synth.stopAll();
        } else if (++chordIndex < ticksPerChord.length) {
            let ticks = ticksPerChord[chordIndex];
            let chordRelTime = ticksToMillis(ticks - tempoStartTicks, smfReader.ticksPerBeat, tempo);
            let chordAbsTime = tempoStartTime + chordRelTime;
            let timeSkip = chordAbsTime - window.performance.now();
            nowOrLater(timeSkip, () => {
                handleChord(ticks, chordAbsTime, true);
                let t = getTempo(ticks, getParams().ticksToTempo);
                if (t != tempo) {
                    t = bytesToTempo(tempoTyBytes(t)); // normalize to prevent timing errors
                    tempo = t;
                    tempoStartTime = chordAbsTime;
                    tempoStartTicks = ticks;
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