
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

    return {
        isNoteOn: isNoteOn,
        isNoteOff: isNoteOff,
        isPitchBend: isPitchBend,
        scaleVelocity: scaleVelocity,
        ticksToMillis: ticksToMillis,
        fixLogicProNoteOffOrder: fixLogicProNoteOffOrder,
    };
});