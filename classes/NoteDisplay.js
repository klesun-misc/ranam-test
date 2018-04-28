
/**
 * shows NOTE ON events as rectangles
 * in future gonna add ability to select and modify notes
 */
var klesun = Klesun();
klesun.requires('./Tls.js').then = (Tls) =>
klesun.whenLoaded = () => {

    let {range, mkDom, opt} = Tls();
    let $$ = (s, root) => [...(root || document).querySelectorAll(s)];

    let isNoteOn = (readerEvent) =>
        readerEvent.type === 'MIDI' &&
        readerEvent.midiEventType === 9 &&
        readerEvent.parameter2 > 0;

    let isNoteOff = (readerEvent) =>
        readerEvent.type === 'MIDI' && (
            readerEvent.midiEventType === 8 ||
            readerEvent.midiEventType === 9 && readerEvent.parameter2 === 0
        );

    let collectNotes = function(smf) {
        let notes = [];
        let otherEvents = [];
        let chanToNotes = range(0,16).map(i => []);
        for (let [i, track] of Object.entries(smf.tracks)) {
            let time = 0;
            let noteOnIndex = 0;
            for (let event of track.events) {
                time += event.delta;
                if (isNoteOn(event)) {
                    let chan = event.midiChannel;
                    let tone = event.parameter1;
                    let velo = event.parameter2;
                    let dura = 0;
                    chanToNotes[chan][tone] = {
                        tone, time, dura, chan, velo,
                        track: i, index: noteOnIndex++,
                    };
                } else if (isNoteOff(event)) {
                    let chan = event.midiChannel;
                    let tone = event.parameter1;
                    let note = chanToNotes[chan][tone];
                    if (note) {
                        note.dura = time - note.time;
                        notes.push(note);
                        delete chanToNotes[chan][tone];
                    }
                } else {
                    otherEvents.push({time, event, track: i});
                }
            }
        }
        return {notes, otherEvents};
    };

    let toPixels = time => time / 10;

    return (container, smf) => {
        smf = JSON.parse(JSON.stringify(smf));
        let {notes, otherEvents} = collectNotes(smf);
        let rows = $$(':scope > *', container);
        rows.forEach(r => r.innerHTML = '');

        let onNoteOver = (note) => {};
        let onNoteOut = (note) => {};

        let maxX = 0;
        for (let note of notes) {
            let {tone, dura, time, chan, velo, track} = note;
            let yOffset = 96 - tone;
            if (yOffset > 0 && yOffset < rows.length) {
                let row = rows[yOffset];
                row.appendChild(mkDom('div', {
                    classList: ['colorize-channel-bg'],
                    'data-channel': chan,
                    style: {
                        position: 'absolute',
                        top: 0,
                        left: toPixels(time),
                        width: toPixels(dura),
                        height: '100%',
                        margin: '0',
                    },
                    onmouseover: () => onNoteOver(note),
                    onmouseout: () => onNoteOut(note),
                }));
                let endX = toPixels(time) + toPixels(dura);
                maxX = Math.max(maxX, endX);
            } else {
                console.debug('note outside the rows ' + yOffset, note);
            }
        }
        container.style.width = maxX || '100%';
        opt(container.parentNode).get = scroller =>
            scroller.scrollTop = scroller.scrollHeight / 3;
        return {
            set onNoteOver(cb) { onNoteOver = cb; },
            set onNoteOut(cb) { onNoteOut = cb; },
        };
    };
};


