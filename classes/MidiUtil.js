
/**
 * provides functions reusable in different processes
 */
define([], () => () => {

    let isNoteOn = (readerEvent) =>
        readerEvent.type === 'MIDI' &&
        readerEvent.midiEventType === 9 &&
        readerEvent.parameter2 > 0;

    let isNoteOff = (readerEvent) =>
        readerEvent.type === 'MIDI' && (
            readerEvent.midiEventType === 8 ||
            readerEvent.midiEventType === 9 && readerEvent.parameter2 === 0
        );

    let isPitchBend = (readerEvent) =>
        readerEvent.type === 'MIDI' &&
        readerEvent.midiEventType === 14;

    /** multiply by factor and round */
    let scaleVelocity = (velo, factor) =>
        Math.max(Math.min(127, Math.round(velo * factor)), 1);

    let ticksToMillis = function (ticks, ticksPerBeat, tempo) {
        let academic = ticks / ticksPerBeat / 4;
        return 1000 * academic * 60 / (tempo / 4);
    };

    let millisToTicks = function (millis, ticksPerBeat, tempo) {
        let academic = millis / 1000 / 60 * (tempo / 4);
        return academic * ticksPerBeat * 4;
    };

    let tempoToBytes = function(tempo) {
        let mpqn = Math.floor(60000000 / tempo); // & 0xFFFFFF;
        let ret=[];
        do {
            ret.unshift(mpqn & 0xFF);
            mpqn >>= 8;
        } while (mpqn);
        while (ret.length < 3) {
            ret.push(0);
        }
        return ret;
    };

    let bytesToTempo = bytes => 60 * 1000000 / bytes.reduce((a,b) => (a << 8) + b, 0);

    /** take events that happen at current tick */
    let takeTickEvents = function(events, startOffset)
    {
        let taken = [];
        for (let i = startOffset; i < events.length; ++i) {
            let event = events[i];
            if (i === startOffset || event.delta === 0) {
                taken.push(event);
            } else {
                break;
            }
        }
        return taken;
    };

    /**
     * make sure NOTE OFF is always before NOTE ON so we
     * could put PITCH BEND before NOTE ON but after NOTE OFF
     */
    let sortTickEvents = function(events)
    {
        // only first has not 0 delta, it should be reassigned
        // to the event that will become first after sort
        let delta = events[0].delta;
        events = events.sort((a,b) => {
            if (isNoteOn(a) && !isNoteOn(b)) {
                return 1;
            } else if (isNoteOff(a) && !isNoteOff(b)) {
                return -1;
            } else {
                return 0;
            }
        });
        events.forEach(e => e.delta = 0);
        events[0].delta = delta;
        return events;
    };

    /**
     * in the testShifted.mid on Oud note event 75,76 and 78
     * note gets ON at 75, OFF at 76 and then again OFF at 78
     * I'll think from now on that NOTE ON followed by same
     * NOTE OFF is Logic Pro X's artifacts and swap them
     */
    let fixLogicProNoteOffOrder = function(smfReader) {
        smfReader = JSON.parse(JSON.stringify(smfReader));
        for (let track of smfReader.tracks) {
            let sortedEvents = [];
            for (let i = 0; i < track.events.length; ++i) {
                let tickEvents = takeTickEvents(track.events, i);
                i += tickEvents.length - 1;
                tickEvents = sortTickEvents(tickEvents);
                sortedEvents.push(...tickEvents);
            }
            track.events = sortedEvents;
        }
        return smfReader;
    };

    let makeTempo = (delta, tempo) => {
        // tempo = 60 * 1000000 / event.metaData.reduce((a,b) => (a << 8) + b, 0);
        // f(bytes) = Math.floor(60 * 1000000 / tempo)
        let ret = tempoToBytes(tempo);
        return {
            delta: delta,
            type: 'meta',
            metaType: 81,
            metaData: ret,
        };
    };

    let changeTempo = (smf, ticksToTempo) => {
        smf = JSON.parse(JSON.stringify(smf));
        // remove all existing tempo events
        for (let track of smf.tracks) {
            let deltaRest = 0;
            let templessEvents = [];
            for (let event of track.events) {
                if (event.type === 'meta' && event.metaType == 81) { // tempo
                    deltaRest += event.delta;
                } else {
                    event.delta += deltaRest;
                    deltaRest = 0;
                    templessEvents.push(event);
                }
            }
            track.events = templessEvents;
        }

        // add tempo events to zeroth track
        let tempoTicksLeft = Object.keys(ticksToTempo);
        let tempfulEvents = [];
        let ticks = 0;
        for (let event of smf.tracks[0].events) {
            while (tempoTicksLeft.length > 0 && ticks + event.delta >= tempoTicksLeft[0]) {
                let tempoTicks = tempoTicksLeft[0];
                let tempoDelta = tempoTicks - ticks;
                tempfulEvents.push(makeTempo(tempoDelta, ticksToTempo[tempoTicks]));
                ticks += tempoDelta;
                event.delta -= tempoDelta;
                tempoTicksLeft = tempoTicksLeft.slice(1);
            }
            tempfulEvents.push(event);
            ticks += event.delta;
        }
        smf.tracks[0].events = tempfulEvents;
        return smf;
    };

    let getTempo = (ticksNow, ticksToTempo) => {
        let tempoNow = 120;
        for (let [ticks, tempo] of Object.entries(ticksToTempo)) {
            if (ticks <= ticksNow) {
                tempoNow = tempo;
            } else {
                break;
            }
        }
        return tempoNow;
    };

    let getTicksNow = (startTime, startTicks, ticksToTempo, ticksPerBeat) => {
        // first, remove tempo events before start time
        let entries = Object.entries(ticksToTempo);
        let startTempo = 120;
        let skipTo = -1;
        for (let i = 0; i < entries.length; ++i) {
            let [ticks, tempo] = entries[i];
            if (ticks <= startTicks) {
                startTempo = tempo;
                skipTo = i;
            } else {
                break;
            }
        }
        entries = skipTo > -1 ? entries.slice(skipTo + 1) : entries;

        let now = window.performance.now();
        for (let [ticks, tempo] of entries) {
            let deltaTicks = ticks - startTicks;
            let deltaMillis = ticksToMillis(deltaTicks, ticksPerBeat, tempo);
            let tempoTime = startTime + deltaMillis;
            if (tempoTime >= now) {
                break;
            } else {
                startTicks = ticks;
                startTime = tempoTime;
                startTempo = tempo;
            }
        }
        let tillNow = millisToTicks(now - startTime, ticksPerBeat, startTempo);
        return startTicks + tillNow;
    };

    return {
        isNoteOn: isNoteOn,
        isNoteOff: isNoteOff,
        isPitchBend: isPitchBend,
        scaleVelocity: scaleVelocity,
        ticksToMillis: ticksToMillis,
        tempoTyBytes: tempoToBytes,
        bytesToTempo: bytesToTempo,
        getTempo: getTempo,
        getTicksNow: getTicksNow,

        fixLogicProNoteOffOrder: fixLogicProNoteOffOrder,
        changeTempo: changeTempo,
    };
});