
/**
 * shows NOTE ON events as rectangles
 * in future gonna add ability to select and modify notes
 */
var klesun = Klesun();
klesun.requires('./Tls.js').then = (Tls) =>
klesun.requires('./MidiUtil.js').then = (MidiUtil ) =>
klesun.whenLoaded = () => {

    let {range, mkDom, opt, promise} = Tls();
    let {ticksToMillis, isNoteOn, isNoteOff} = MidiUtil();
    let $$ = (s, root) => [...(root || document).querySelectorAll(s)];

    let onNoteClick = (note) => {};
    let onNoteOver = (note) => {};
    let onNoteOut = (note) => {};
    let stopScrolling = () => {};
    let stopTempoScheduling = () => {};

    let nowOrLater = (millis) => promise(done => millis > 0
        ? setTimeout(() => done(123), millis)
        : done(123));

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

    let POINTER_OFFSET = 20;

    let toPixels = ticks => ticks / 10;
    let toTicks = pixels => Math.max(0, (pixels) * 10);

    return (container, smf) => {

        smf = JSON.parse(JSON.stringify(smf));
        let {notes, otherEvents} = collectNotes(smf);
        let lastTick = notes.map(n => n.time).reduce((max, t) => Math.max(max, t), 0);
        let noteList = $$('.note-list', container)[0];
        let scroll = $$('.scroll', container)[0];

        let putNotes = function() {
            let maxX = 0;
            let rows = $$(':scope > *', noteList);
            rows.forEach(r => r.innerHTML = '');
            for (let note of notes) {
                let {tone, dura, time, chan, velo, track} = note;
                let yOffset = 96 - tone;
                if (yOffset > 0 && yOffset < rows.length) {
                    let row = rows[yOffset];
                    row.appendChild(mkDom('div', {
                        classList: ['colorize-channel-bg'],
                        'data-channel': chan,
                        'data-track': track,
                        style: {
                            position: 'absolute',
                            top: 0,
                            left: toPixels(time) + POINTER_OFFSET,
                            width: toPixels(dura),
                            height: '100%',
                            margin: '0',
                        },
                        onclick: () => onNoteClick(note),
                        onmouseover: () => onNoteOver(note),
                        onmouseout: () => onNoteOut(note),
                    }));
                    let endX = POINTER_OFFSET + toPixels(time) + toPixels(dura);
                    maxX = Math.max(maxX, endX);
                } else {
                    console.debug('note outside the rows ' + yOffset, note);
                }
            }
            noteList.style.width = maxX + container.clientWidth || '100%';
            scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * 3 / 4;
            scroll.scrollLeft = 0;
        };

        let setPointerAt = function(endTicks, duration) {
            stopScrolling();
            let scroll = $$('.scroll', container)[0];
            let steps = Math.ceil(duration / 20);
            let stopped = false;
            let startTicks = toTicks(scroll.scrollLeft);
            let startTime = window.performance.now();
            let doNext = (step) => {
                if (!stopped && step <= steps) {
                    let elapsed = window.performance.now() - startTime;
                    let progress = elapsed / duration;
                    let currentTicks = startTicks + progress * (endTicks - startTicks);
                    scroll.scrollLeft = toPixels(currentTicks);
                    let nextTime = startTime + duration * (step + 1) / steps;
                    let timeSkip = nextTime - window.performance.now();
                    nowOrLater(timeSkip).then = () => doNext(step + 1);
                }
            };
            doNext(0);
            stopScrolling = () => stopped = true;
            return stopScrolling;
        };

        let animatePointer = function(ticksToTempo, ticksPerBeat) {
            stopTempoScheduling();
            let tempo = 120;
            let ticks = 0;
            let stopped = false;
            scroll.scrollLeft = 0;
            let entries = Object.entries(ticksToTempo);
            let startTime = window.performance.now();
            let doNext = (i) => {
                if (stopped) {
                    // ^_^ do nothing
                } else if (i < entries.length) {
                    // scroll till next tempo
                    let [nextTicks, nextTempo] = entries[i];
                    let nextTime = ticksToMillis(nextTicks, ticksPerBeat, tempo);
                    let timeSkip = startTime + nextTime - window.performance.now();
                    setPointerAt(nextTicks, timeSkip);
                    nowOrLater(timeSkip).then = () => {
                        tempo = nextTempo;
                        ticks = nextTicks;
                        doNext(i + 1);
                    };
                } else {
                    // scroll what left
                    let nextTicks = lastTick;
                    let nextTime = ticksToMillis(nextTicks, ticksPerBeat, tempo);
                    let timeSkip = startTime + nextTime - window.performance.now();
                    setPointerAt(nextTicks, timeSkip);
                }
            };
            doNext(0);
            stopTempoScheduling = () => {
                stopped = true;
                stopScrolling();
            };
            return stopTempoScheduling;
        };

        putNotes();

        return {
            set onNoteClick(cb) { onNoteClick = cb; },
            set onNoteOver(cb) { onNoteOver = cb; },
            set onNoteOut(cb) { onNoteOut = cb; },
            animatePointer: (ticksToTempo, ticksPerBeat) => animatePointer(ticksToTempo, ticksPerBeat),
        };
    };
};


