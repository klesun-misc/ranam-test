
/**
 * shows NOTE ON events as rectangles
 * in future gonna add ability to select and modify notes
 */
var klesun = Klesun();
klesun.requires('./Tls.js').then = (Tls) =>
klesun.requires('./MidiUtil.js').then = (MidiUtil ) =>
klesun.whenLoaded = () => {

    let {range, mkDom, opt, promise, deepCopy} = Tls();
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

    let SCALE = 50; /* should make it configurable */
    let POINTER_OFFSET = 50;

    let noteToEvents = (n) => [
        {
            delta: null,
            time: n.time,
            type: "MIDI",
            midiEventType: 9, // note on
            midiChannel: n.chan,
            parameter1: n.tone,
            parameter2: n.velo,
        },
        {
            delta: null,
            time: n.time + n.dura,
            type: "MIDI",
            midiEventType: 8, // note off
            midiChannel: n.chan,
            parameter1: n.tone,
            parameter2: 0,
        },
    ];

    let sortAndAddDelta = (absEvents) => {
        absEvents.sort((a,b) => a.time - b.time);
        let time = 0;
        for (let absEvent of absEvents) {
            absEvent.delta = absEvent.time - time;
            time = absEvent.time;
        }
        return absEvents;
    };

    return (container, smf) => {

        let toPixels = ticks => ticks / smf.ticksPerBeat * SCALE;
        let toTicks = pixels => Math.max(0, pixels * smf.ticksPerBeat / SCALE);

        smf = JSON.parse(JSON.stringify(smf));
        let {notes, otherEvents} = collectNotes(smf);
        let lastTick = notes.reduce((max, n) => Math.max(max, n.time + n.dura), 0);
        let wasChanged = false;
        let noteList = $$('.note-list', container)[0];
        let scroll = $$('.scroll', container)[0];
        let rows = $$(':scope > *', noteList);
        let noteInfoPanel = $$('.note-info-panel', container)[0];

        let getEditorSmf = () => {
            // like normal events, but with absolute
            // time - will be replaced with delta later
            let trackToEvents = [];

            $$('[data-note]', noteList)
                .map(dom => JSON.parse(dom.getAttribute('data-note')))
                .forEach(n => {
                    trackToEvents[n.track] = trackToEvents[n.track] || [];
                    trackToEvents[n.track].push(...noteToEvents(n));
                });
            otherEvents.forEach(r => {
                trackToEvents[r.track] = trackToEvents[r.track] || [];
                let event = r.event;
                event.time = r.time;
                trackToEvents[r.track].push(event);
            });

            /** @debug */
            console.debug('track to abs events', trackToEvents);

            let editorSmf = {
                format: smf.format,
                numTracks: smf.numTracks,
                ticksPerBeat: smf.ticksPerBeat,
                tracks: trackToEvents.map((events,i) => 1 && {
                    byteLength: null,
                    events: sortAndAddDelta(events),
                }),
            };
            console.debug('editorSmf', editorSmf);
            return editorSmf;
        };

        let setCurrentNote = (dom, note) => {
            note = deepCopy(note);
            $$('.selected-note', container).forEach(dom => dom.classList.remove('selected-note'));
            dom.classList.add('selected-note');
            $$('.chan', noteInfoPanel)[0].innerHTML = note.chan;
            $$('.chan', noteInfoPanel)[0].setAttribute('data-channel', note.chan);
            $$('.track', noteInfoPanel)[0].innerHTML = note.track;
            $$('.index', noteInfoPanel)[0].innerHTML = note.index;
            let toneInp = $$('.tone', noteInfoPanel)[0];
            let timeInp = $$('.time', noteInfoPanel)[0];
            let duraInp = $$('.dura', noteInfoPanel)[0];
            let veloInp = $$('.velo', noteInfoPanel)[0];
            timeInp.setAttribute('step', smf.ticksPerBeat / 8);
            duraInp.setAttribute('step', smf.ticksPerBeat / 8);
            toneInp.value = note.tone;
            timeInp.value = note.time;
            duraInp.value = note.dura;
            veloInp.value = note.velo;
            let onInput = () => {
                wasChanged = true;
                note.tone = toneInp.value;
                note.time = timeInp.value;
                note.dura = duraInp.value;
                note.velo = veloInp.value;
                dom.remove();
                let rect = addNoteRect(note);
                setCurrentNote(rect, note);
            };
            toneInp.oninput = onInput;
            timeInp.oninput = onInput;
            duraInp.oninput = onInput;
            veloInp.oninput = onInput;
        };

        let addNoteRect = (note) => {
            let {tone, dura, time, chan, velo, track} = note;
            let yOffset = 127 - tone;
            let row = rows[yOffset];
            let rect = mkDom('div', {
                classList: ['colorize-channel-bg'],
                'data-channel': chan,
                'data-track': track,
                'data-note': JSON.stringify(note),
                style: {
                    position: 'absolute',
                    top: 0,
                    left: toPixels(time) + POINTER_OFFSET,
                    width: toPixels(dura),
                    height: '100%',
                    margin: '0',
                },
                onclick: () => {
                    setCurrentNote(rect, note);
                    onNoteClick(note);
                },
                onmouseover: () => onNoteOver(note),
                onmouseout: () => onNoteOut(note),
            });
            row.appendChild(rect);
            return rect;
        };

        let putNotes = function() {
            let maxX = 0;
            rows.forEach(r => r.innerHTML = '');
            for (let note of notes) {
                let {dura, time} = note;
                addNoteRect(note);
                let endX = POINTER_OFFSET + toPixels(time) + toPixels(dura);
                maxX = Math.max(maxX, endX);
            }
            noteList.style.width = maxX + scroll.clientWidth - POINTER_OFFSET || '100%';
            scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * 2 / 3;
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
            let stopped = false;
            scroll.scrollLeft = 0;
            let entries = Object.entries(ticksToTempo);
            let tempoStartTime = window.performance.now();
            let tempoStartTicks = 0;
            let doNext = (i) => {
                if (stopped) {
                    // ^_^ do nothing
                } else if (i < entries.length) {
                    // scroll till next tempo
                    let [nextTicks, nextTempo] = entries[i];
                    let nextTime = ticksToMillis(nextTicks - tempoStartTicks, ticksPerBeat, tempo);
                    let timeSkip = tempoStartTime + nextTime - window.performance.now();
                    setPointerAt(nextTicks, timeSkip);
                    nowOrLater(timeSkip).then = () => {
                        tempo = nextTempo;
                        tempoStartTime = tempoStartTime + nextTime;
                        tempoStartTicks = nextTicks;
                        doNext(i + 1);
                    };
                } else {
                    // scroll what left
                    let nextTicks = lastTick;
                    let nextTime = ticksToMillis(nextTicks - tempoStartTicks, ticksPerBeat, tempo);
                    let timeSkip = tempoStartTime + nextTime - window.performance.now();
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
        noteList.onmouseout = (e) => {
            $$('.mouse-ticks-holder', noteInfoPanel)[0].innerHTML = '';
            $$('.mouse-semitone-holder', noteInfoPanel)[0].innerHTML = '';
        };
        noteList.onmousemove = (e) => {
            let bounds = noteList.getBoundingClientRect();
            let x = event.clientX - bounds.left;
            let y = event.clientY - bounds.top;
            let ticks = Math.round(toTicks(x - POINTER_OFFSET));
            let semitone = 127 - Math.round(y / rows[0].offsetHeight);
            $$('.mouse-ticks-holder', noteInfoPanel)[0].innerHTML = ticks;
            $$('.mouse-semitone-holder', noteInfoPanel)[0].innerHTML = semitone;
        };

        return {
            set onNoteClick(cb) { onNoteClick = cb; },
            set onNoteOver(cb) { onNoteOver = cb; },
            set onNoteOut(cb) { onNoteOut = cb; },
            animatePointer: (ticksToTempo, ticksPerBeat) => animatePointer(ticksToTempo, ticksPerBeat),
            getEditorSmf: () => wasChanged ? getEditorSmf() : smf,
        };
    };
};


