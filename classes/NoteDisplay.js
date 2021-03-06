
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
    let stopScrolling = () => {};
    let stopTempoScheduling = () => {};
    let moveSelectedNote = (x, y) => {};

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
                    chanToNotes[chan][tone] = chanToNotes[chan][tone] || [];
                    chanToNotes[chan][tone].push({
                        tone, time, dura, chan, velo,
                        track: i, index: noteOnIndex++,
                    });
                } else if (isNoteOff(event)) {
                    let chan = event.midiChannel;
                    let tone = event.parameter1;
                    for (let note of chanToNotes[chan][tone] || []) {
                        note.dura = time - note.time;
                        notes.push(note);
                    }
                    chanToNotes[chan][tone] = [];
                } else {
                    otherEvents.push({time, event, track: i});
                }
            }
        }
        return {notes, otherEvents};
    };

    let QUARTER_WIDTH = 50; /* should make it configurable */
    let POINTER_OFFSET = 100;

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
        absEvents.sort((a,b) => {
            if (a.time == b.time) {
                if (isNoteOn(a) && !isNoteOn(b)) {
                    return 1;
                } else if (isNoteOff(a) && !isNoteOff(b)) {
                    return -1;
                } else {
                    return 0;
                }
            } else {
                return a.time - b.time;
            }
        });
        let time = 0;
        for (let absEvent of absEvents) {
            absEvent.delta = absEvent.time - time;
            time = absEvent.time;
        }
        return absEvents;
    };

    return (container, smf) => {

        let toPixels = ticks => ticks / smf.ticksPerBeat * QUARTER_WIDTH;
        let toTicks = pixels => Math.max(0, pixels * smf.ticksPerBeat / QUARTER_WIDTH);

        smf = JSON.parse(JSON.stringify(smf));
        let {notes, otherEvents} = collectNotes(smf);
        let lastTick = notes.reduce((max, n) => Math.max(max, n.time + n.dura), 0);
        let wasChanged = false;
        let noteList = $$('.note-list', container)[0];
        let scrollableContent = $$('.scrollable-content', container)[0];
        let scroll = $$('.scroll', container)[0];
        let rows = $$(':scope > *', noteList);
        let noteInfoPanel = $$('.note-info-panel', container)[0];
        let animateFlag = $$('input[type="checkbox"].allow-animation', container)[0];
        // let slider = $$('.moving-time-pointer .slider', container)[0];
        let slider = $$('.moving-time-pointer .slider', container)[0];
        let sliderRoot = $$('.moving-time-pointer', container)[0];
        let sliderHolder = $$('.slider-holder', container)[0];

        let getRelXy = (event, dom) => {
            let bounds = dom.getBoundingClientRect();
            let x = event.clientX - bounds.left;
            let y = event.clientY - bounds.top;
            return {x, y};
        };

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

        /** return closest pixel to precise multiple of 1/16 note */
        let roundPixelToSixteenth = function(pixels) {
            let quarters = Math.round(pixels / QUARTER_WIDTH * 8);
            return quarters * QUARTER_WIDTH / 8;
        };

        let roundTickToSixteenth = function(ticks) {
            let quarters = Math.round(ticks / smf.ticksPerBeat * 4);
            return quarters * smf.ticksPerBeat / 4;
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
                toneInp.value = Math.max(Math.min(toneInp.value, 127), 0);
                timeInp.value = Math.max(timeInp.value, 0);
                duraInp.value = Math.max(duraInp.value, 1);
                veloInp.value = Math.max(Math.min(veloInp.value, 127), 1);
                note.tone = +toneInp.value;
                note.time = +timeInp.value;
                note.dura = +duraInp.value;
                note.velo = +veloInp.value;
                dom.remove();
                let rect = addNoteRect(note);
                return setCurrentNote(rect, note);
            };

            toneInp.oninput = onInput;
            timeInp.oninput = onInput;
            duraInp.oninput = onInput;
            veloInp.oninput = onInput;

            return {
                onInput: onInput,
                set time(value) {
                    timeInp.value = value;
                },
                set tone(value) {
                    toneInp.value = value;
                },
                set dura(value) {
                    duraInp.value = value;
                },
            };
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
                    width: Math.max(toPixels(dura), 8),
                    height: '100%',
                    margin: '0',
                },
                onmousedown: e => {
                    // for some reason it starts dragging sometimes
                    e.preventDefault();
                    let current = setCurrentNote(rect, note);
                    let {x: relX, y: relY} = getRelXy(e, rect);
                    moveSelectedNote = (newX, newY) => {
                        let ticks = Math.round(toTicks(newX - relX - POINTER_OFFSET));
                        let semitone = 129 - Math.round(newY / rows[0].offsetHeight);
                        current.time = roundTickToSixteenth(ticks);
                        current.tone = semitone;
                        current = current.onInput();
                    };
                    onNoteClick(note);
                },
                children: [mkDom('div', {
                    classList: ['resize-corner'],
                    onmousedown: (e) => {
                        e.stopPropagation();
                        let current = setCurrentNote(rect, note);
                        let {x: relX, y: relY} = getRelXy(e, rect);
                        let {x: absX, y: absY} = getRelXy(e, noteList);
                        moveSelectedNote = (newX, newY) => {
                            let dura = Math.max(1, Math.round(toTicks(newX - absX + relX)));
                            current.dura = roundTickToSixteenth(dura);
                            current = current.onInput();
                        };
                    },
                })],
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
            scrollableContent.style.width = maxX + scroll.clientWidth - POINTER_OFFSET || '100%';
            scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * 2 / 3;
            scroll.scrollLeft = 0;
        };

        let decodeMidiEventType = function(typeNum, byte1) {
            if (typeNum == 11) {
                return {
                    7: 'channel volume',
                    0: 'bank a',
                    32: 'bank b',
                    100: 'multi-message a',
                    101: 'multi-message b',
                }[byte1] || 'ctrl'
            } else {
                return {
                    8: 'note off',
                    9: 'note on',
                    12: 'poly key pressure',
                    14: 'pitch bend',
                }[typeNum] || typeNum;
            }
        };

        let decodeMetaType = function(metaType, metaData) {
            if (metaType > 0 && metaType <= 7) {
                // text
                let name = {
                    1: 'text',
                    2: 'copyright',
                    3: 'track name',
                    4: 'instrument',
                    5: 'lyrics',
                    6: 'marker',
                    7: 'cue point',
                }[metaType] || metaType;
                return '(' + name + ' - ' + metaData.map(b => String.fromCharCode(b)).join('') + ')';
            } else {
                let name = {
                    81: 'tempo',
                    88: 'time signature',
                }[metaType] || metaType;
                return '(' + name + ' - ' + JSON.stringify(metaData) + ')';
            }
        };

        let describeEvents = function(events) {
            let description = '';
            events.sort((...pair) => {
                let types = ['meta', 'MIDI', 'sysex'];
                let [trackA, trackB] = pair.map(r => r.track);
                let [typeOrderA, typeOrderB] = pair.map(r => r.event.type).map(t => types.indexOf(t));
                let sign = 0;
                if (typeOrderA != typeOrderB) {
                    sign = typeOrderA - typeOrderB;
                } else {
                    let type = types[typeOrderA];
                    if (type === 'meta') {
                        let [metaA, metaB] = pair.map(r => r.event.metaType);
                        sign = metaA - metaB;
                    } else if (type === 'MIDI') {
                        let [typeA, typeB] = pair.map(r => r.event.midiEventType);
                        sign = typeA - typeB;
                        if (sign == 0 && typeA == 11) { // control change
                            let [ctrlA, ctrlB] = pair.map(r => r.event.parameter1);
                            sign = ctrlA - ctrlB;
                        }
                    }
                }
                return sign || trackA - trackB;
            });
            for (let event of events) {
                let pad = str => ('   ' + str).slice(-3);
                if (event.event.type === 'MIDI') {
                    description += 'tick: ' + event.time + ' track: ' + pad(event.track) + ' midi chan: ' + pad(event.event.midiChannel) + ' ' +
                        pad(event.event.midiEventType) + ' ' + pad(event.event.parameter1) + ' ' + pad(event.event.parameter2 || '') +
                        ' (' + decodeMidiEventType(event.event.midiEventType, event.event.parameter1) + ')' + '\n';
                } else if (event.event.type === 'meta') {
                    description += 'tick: ' + event.time + ' track: ' + pad(event.track) + ' meta: ' + decodeMetaType(event.event.metaType, event.event.metaData) + '\n';
                } else {
                    description += JSON.stringify(event) + '\n';
                }
            }
            return description;
        };

        let putOtherEvents = function() {
            // group them by whole not, since there may be tons of them in a pitch bend for example
            $$('.other-events', sliderHolder).forEach(m => m.remove());
            let wholeToEvents = [];
            for (let event of otherEvents) {
                let wholes = Math.floor(event.time / smf.ticksPerBeat * 2);
                wholeToEvents[wholes] = wholeToEvents[wholes] || [];
                wholeToEvents[wholes].push(event);
            }
            for (let [wholes, events] of Object.entries(wholeToEvents)) {
                let ticks = wholes * smf.ticksPerBeat / 2;
                sliderHolder.appendChild(mkDom('div', {
                    classList: ['some-marker', 'other-events'],
                    title: describeEvents(events),
                    style: {left: toPixels(ticks) + POINTER_OFFSET},
                    children: [mkDom('div')],
                }));
            }
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

        let animatePointer = function(startAt, ticksToTempo, ticksPerBeat) {
            stopTempoScheduling();
            if (!animateFlag.checked) {
                return;
            }
            let tempo = 120;
            let stopped = false;
            scroll.scrollLeft = toPixels(startAt);
            for (let [ticks, tickTempo] of Object.entries(ticksToTempo)) {
                if (ticks < startAt) {
                    tempo = tickTempo;
                    delete(ticksToTempo[ticks]);
                } else {
                    break;
                }
            }
            let entries = Object.entries(ticksToTempo);
            let tempoStartTime = window.performance.now();
            let tempoStartTicks = startAt;
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

        container.classList.add('initialized');
        sliderRoot.style.left = POINTER_OFFSET;
        putNotes();
        putOtherEvents();
        noteList.onmouseout = (e) => {
            $$('.mouse-ticks-holder', noteInfoPanel)[0].innerHTML = '';
            $$('.mouse-semitone-holder', noteInfoPanel)[0].innerHTML = '';
        };
        let updateMousePos = function(x,y) {
            let ticks = Math.round(toTicks(x - POINTER_OFFSET));
            let semitone = 129 - Math.round(y / rows[0].offsetHeight);
            moveSelectedNote(x, y);
            $$('.mouse-ticks-holder', noteInfoPanel)[0].innerHTML = ticks;
            $$('.mouse-semitone-holder', noteInfoPanel)[0].innerHTML = semitone;
        };
        scrollableContent.onmousemove = (e) => {
            let {x, y} = getRelXy(e, scrollableContent);
            updateMousePos(x,y);
        };
        sliderHolder.onmousedown = e => {
            if (e.button !== 0) return;
            let {x, y} = getRelXy(e, sliderHolder);
            sliderRoot.style.left = Math.max(roundPixelToSixteenth(x), POINTER_OFFSET);
        };
        sliderRoot.ondrag = (e) => {
            // to not who image copy by the cursor
            e.dataTransfer.dropEffect = "move";

            // so that dragging did not cause it to scroll
            scroll.style['overflow-y'] = 'hidden';
            let {x, y} = getRelXy(e, scrollableContent);
            updateMousePos(x,y);

            /** seems like a bug, https://stackoverflow.com/q/12128216/2750743 */
            if (event.screenX !== 0) {
                sliderRoot.style.left = Math.max(roundPixelToSixteenth(x), POINTER_OFFSET);
            }
        };
        sliderRoot.ondragend = (e) => {
            scroll.style['overflow-y'] = 'scroll';
        };

        // set drag cursor... yeah
        sliderRoot.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'none';
        };
        slider.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        };
        sliderHolder.ondragover = e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        noteList.onmouseleave = function(e) {
            moveSelectedNote = (x, y) => {}; // release note
        };
        noteList.onmouseup = function() {
            moveSelectedNote = (x, y) => {}; // release note
        };

        return {
            set onNoteClick(cb) { onNoteClick = cb; },
            animatePointer: animatePointer,
            getEditorSmf: () => wasChanged ? getEditorSmf() : smf,
            getCursorTicks: () => toTicks(sliderRoot.offsetLeft - POINTER_OFFSET),
        };
    };
};


