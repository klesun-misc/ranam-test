
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

    return {
        isNoteOn: isNoteOn,
        isNoteOff: isNoteOff,
        isPitchBend: isPitchBend,
        scaleVelocity: scaleVelocity,
    };
});