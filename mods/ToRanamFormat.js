
/**
 * takes simple MIDI file and converts it to Ranam app format: with Oud and Tabla
 * arabic instruments and pitch-bends following Scale rules defined by user
 *
 * @param params = index.js -> collectParams()
 */
define([], () => (smfReader, formParams) => {

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
            if (isNoteOn(a) && isNoteOff(b)) {
                return 1;
            } else if (isNoteOff(a) && isNoteOn(b)) {
                return -1;
            } else {
                return 0;
            }
        });
        events.forEach(e => e.delta = 0);
        events[0].delta = delta;
        return events;
    };

    let normalizeSmf = function()
    {
        let errors = [];
        let warnings = [];
        smfReader = JSON.parse(JSON.stringify(smfReader));

        let oudTrackNum = formParams.oudTrackNum;
        if (oudTrackNum > smfReader.tracks.length) {
            return 'Specified Oud track number ' + oudTrackNum + ' is outside of ' + smfReader.tracks.length + ' tracks range in the MIDI file';
        }
        let oudTrack = smfReader.tracks[oudTrackNum];

        let openNotes = new Set();
        let sortedEvents = [];
        for (let i = 0; i < oudTrack.events.length; ++i) {
            let tickEvents = takeTickEvents(oudTrack.events, i);
            let chordStart = i;
            i += tickEvents.length - 1;
            tickEvents = sortTickEvents(tickEvents);
            sortedEvents.push(...tickEvents);
            for (let j = 0; j < tickEvents.length; ++j) {
                let event = tickEvents[j];
                if (isNoteOn(event)) {
                    let semitone = event.parameter1;
                    openNotes.add(semitone);
                    if (semitone < 43 || semitone > 64) {
                        errors.push('Notes in the Oud track (' + semitone + ') are outside of range (43-64) at index ' + (chordStart + j));
                    }
                    if (openNotes.size > 1) {
                        console.error('overlap', openNotes, i, j, event, oudTrack.events);
                        errors.push('You have overlapping notes ' + [...openNotes].join(',') + ' at index ' + (chordStart + j) + '. Please fix them and try again');
                    }
                } else if (isNoteOff(event)) {
                    let semitone = event.parameter1;
                    openNotes.delete(semitone);
                } else if (isPitchBend(event)) {
                    warnings.push('Your MIDI has pitchbend already at index ' + (chordStart + j) + '. Please remove them if you don’t want them');
                }
            }
        }
        oudTrack.events = sortedEvents;
        return {
            errors: errors,
            warnings: warnings,
            smf: smfReader,
        };
    };

    let matchesNoteName = function(semitone, name)
    {
        let clean = name.slice(0, 2);
        let sign = name.slice(2);
        let ivory = {'Do': 0,'Re': 2,'Mi':4,'Fa': 5,'So': 7,'La':9,'Si': 11}[clean];
        let offset = {
            '#': +1,
            'b': -1,
            '': 0,
        }[sign];
        return (semitone % 12) === (ivory + offset);
    };

    let getOudPitchBend = function(semitone, scales)
    {
        for (let scaleData of scales) {
            for (let pitchInfo of scaleData.pitchBends) {
                if (matchesNoteName(semitone, pitchInfo.noteName)) {
                    return +pitchInfo.pitchBend;
                }
            }
        }
        return null;
    };

    /** @param {float} absolute koef [-1 ... +1].
     * multiply by current bend range to get the shift in semitone
     * examples if bend radius is set to 2
     * makePitchBend(1.75, 0) will highen pitch 2 * 1.75 = 3.5 semitone for zeroth channel
     * makePitchBend(-1.01, 4) will lower pitch 2 * 1.01 = 2.02 semitone for fourth channel */
    let makePitchBend = function(koef, channel)
    {
        let intvalue = Math.round(16383 / 2 * (koef + 1));
        let [b1,b2] = [intvalue % 128, (intvalue >> 7) % 128];

        return new Midi.Event({
            type: Midi.Event.PITCH_BEND,
            channel: channel,
            param1: b1,
            param2: b2,
            time: 0,
        });
    };

    let makeOudEvents = function(channel) {
        return [
            new Midi.Event({
                type: Midi.Event.CONTROLLER,
                channel: channel,
                param1: 0, // bank select
                param2: 121,
                time: 0,
            }),
            new Midi.Event({
                type: Midi.Event.CONTROLLER,
                channel: channel,
                param1: 32, // bank select 2
                param2: 0,
                time: 0,
            }),
            new Midi.Event({
                type: Midi.Event.PROGRAM_CHANGE,
                channel: channel,
                param1: 123, // bird tweet
                time: 0,
            }),
        ];
    };

    let readerToJsmidgenEvent = function(readerEvent, trackNum)
    {
        let isOudTrack = trackNum === formParams.oudTrackNum;
        let isTablaTrack = trackNum === formParams.tablaTrackNum;

        if (readerEvent.type === 'MIDI') {
            let skip = false;
            if (isOudTrack) {
                if ([14,12].includes(readerEvent.midiEventType)) {
                    // 12 - program change, 14 - Pitch Bend
                    skip = true;
                } else if (readerEvent.midiEventType === 11) {
                    // control change event
                    if ([0,32].includes(readerEvent.parameter1)) {
                        // bank change, me must ensure Ranam bank for Oud
                        skip = true;
                    } else if ([100, 101].includes(readerEvent.parameter1)) {
                        // multi-message event, includes among other, pitch-bend range change
                        skip = true;
                    }
                }
            }
            if (skip) {
                return null;
            } else {
                let channel = readerEvent.midiChannel;
                if (isOudTrack) {
                    channel = 0;
                } else if (channel === 0) {
                    // original song got some notes in 0-th channel we reserve for Oud
                    channel = 8; // 8 is big enough number, the channel is likely free
                }
                if (isTablaTrack) {
                    channel = 10;
                } else if (channel === 10) {
                    // original song got some notes in 10-th channel we reserve for Tabla
                    channel = 7; // close enough to 10
                }
                return new Midi.Event({
                    type: readerEvent.midiEventType * 16,
                    channel: channel,
                    param1: readerEvent.parameter1,
                    param2: readerEvent.parameter2,
                    time: readerEvent.delta,
                });
            }
        } else if (readerEvent.type === 'meta') {
            if (formParams.removeMeta) {
                // we wanna hear how will one song sound without tempo
                return null;
            } else if (readerEvent.metaType === 47) {
                // End Of Track message, will be added automatically by
                // jsmidgen, so no need to dupe it, it causes problems
                return null;
            } else {
                return new Midi.MetaEvent({
                    time: readerEvent.delta,
                    type: readerEvent.metaType,
                    data: readerEvent.metaData,
                });
            }
        } else {
            return null;
        }
    };

    let isInRegion = function(region, timeTicks, noteIdx)
    {
        if (region.fromToFormat === 'Notes') {
            return region.from <= noteIdx && region.to > noteIdx;
        } else {
            return region.from <= timeTicks && region.to > timeTicks;
        }
    };

    let convertToArabicMidi = function(smfReader)
    {
        let jsmidgenTracks = [];
        for (let i = 0; i < smfReader.tracks.length; ++i) {
            let pitchBendNotes = new Set();

            let readerTrack = smfReader.tracks[i];
            let jsmidgenTrack = new Midi.Track();

            let isOudTrack = i === formParams.oudTrackNum;
            if (isOudTrack) {
                // add control change event and program change 123, bird tweet
                makeOudEvents(0)
                    .forEach(e => jsmidgenTrack.addEvent(e));
            }

            let noteIdx = -1;
            let timeTicks = 0;
            let scaleRegions = formParams.scaleRegions;
            let addToNext = 0; // we skip some messages, but delta should remain

            for (let readerEvent of readerTrack.events) {
                readerEvent = Object.assign({}, readerEvent);
                readerEvent.delta += addToNext;
                timeTicks += readerEvent.delta;
                noteIdx += isNoteOn(readerEvent) ? 1 : 0;
                let scales = scaleRegions.filter(s => isInRegion(s, timeTicks, noteIdx));
                let jsmidgenEvent = readerToJsmidgenEvent(readerEvent, i);
                if (isOudTrack && isNoteOn(readerEvent)) {
                    // Oud NOTE ON is about to fire - should set pitch bend
                    let semitone = readerEvent.parameter1;
                    let koef = getOudPitchBend(semitone, scales);
                    if (koef) {
                        jsmidgenTrack.addEvent(makePitchBend(koef, readerEvent.midiChannel));
                        pitchBendNotes.add(semitone);
                    }
                }
                if (jsmidgenEvent) {
                    jsmidgenTrack.addEvent(jsmidgenEvent);
                    addToNext = 0;
                } else {
                    addToNext = readerEvent.delta;
                }
                if (isOudTrack && isNoteOff(readerEvent)) {
                    // Oud NOTE OFF just fired, should reset pitch bend
                    let semitone = readerEvent.parameter1;
                    if (pitchBendNotes.has(semitone)) {
                        jsmidgenTrack.addEvent(makePitchBend(0, readerEvent.midiChannel));
                        pitchBendNotes.delete(semitone);
                    }
                }
            }
            jsmidgenTracks.push(jsmidgenTrack);
        }
        let jsmidgenSmf = new Midi.File({
            ticks: smfReader.ticksPerBeat,
            tracks: jsmidgenTracks,
        });

        let binaryString = jsmidgenSmf.toBytes();

        let buf = new ArrayBuffer(binaryString.length);
        let bufView = new Uint8Array(buf);
        binaryString.split('').forEach((c,i) =>
            bufView[i] = c.charCodeAt(0));

        return buf;
    };

    let main = function()
    {
        /** @debug */
        console.log(formParams);

        let normalized = normalizeSmf();
        if (normalized.errors.length > 0) {
            alert('Invalid MIDI file: ' + normalized.errors.slice(0, 5).join('\n'));
            return null;
        } else {
            if (normalized.warnings.length > 0) {
                alert('Warning: ' + normalized.warnings.slice(0, 5).join('\n'));
            }
            return convertToArabicMidi(normalized.smf);
        }
    };

    return main();
});