
define(['./mods/Sf2Adapter.js', './mods/ToRanamFormat.js'], (Sf2Adapter, ToRanamFormat) => (form) => {

    "use strict";
    let $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

    // http://stackoverflow.com/a/21797381/2750743
    let _base64ToArrayBuffer = function(base64)
    {
        var binary_string =  atob(base64);

        return new Uint8Array(binary_string.length)
            .fill(0)
            .map((_, i) => binary_string.charCodeAt(i))
            .buffer;
    };

    let loadSelectedFile = function(fileInfo, whenLoaded)
    {
        if (!fileInfo) {
            // if user cancelled "Choose File" pop-up
            return null;
        }

        let reader = new FileReader();
        reader.readAsDataURL(fileInfo);
        reader.onload = (e) => {
            whenLoaded(e.target.result.split(',')[1]);
        }
    };

    let scaleMapping = {
        Bayati: {
            Do: [{noteName: 'Re' , pitchBend: -0.25, pitched: 'Re ½b'}],
            Re: [{noteName: 'Mi' , pitchBend: -0.25, pitched: 'Mi ½b'}],
            Mi: [{noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}],
            Fa: [{noteName: 'So' , pitchBend: -0.25, pitched: 'So ½b'}],
            So: [{noteName: 'La' , pitchBend: -0.25, pitched: 'La ½b'}],
            La: [{noteName: 'Si' , pitchBend: -0.25, pitched: 'Si ½b'}],
            Si: [{noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}],
        },
        Saba: {
            Do: [{noteName: 'Re' , pitchBend: -0.25, pitched: 'Re ½b'}],
            Re: [{noteName: 'Mi' , pitchBend: -0.25, pitched: 'Mi ½b'}],
            Mi: [{noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}],
            Fa: [{noteName: 'So' , pitchBend: -0.25, pitched: 'So ½b'}],
            So: [{noteName: 'La' , pitchBend: -0.25, pitched: 'La ½b'}],
            La: [{noteName: 'Si' , pitchBend: -0.25, pitched: 'Si ½b'}],
            Si: [{noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}],
        },
        Sikah: {
            Do: [{noteName: 'Do', pitchBend: -0.25, pitched: 'Do ½b'}],
            Re: [{noteName: 'Re', pitchBend: -0.25, pitched: 'Re ½b'}],
            Mi: [{noteName: 'Mi', pitchBend: -0.25, pitched: 'Mi ½b'}],
            Fa: [{noteName: 'Fa', pitchBend: -0.25, pitched: 'Fa ½b'}],
            So: [{noteName: 'So', pitchBend: -0.25, pitched: 'So ½b'}],
            La: [{noteName: 'La', pitchBend: -0.25, pitched: 'La ½b'}],
            Si: [{noteName: 'Si', pitchBend: -0.25, pitched: 'Si ½b'}],
        },
        Rast: {
            Do: [{noteName: 'Mi' , pitchBend: -0.25, pitched: 'Mi ½b'}, {noteName: 'Si' , pitchBend: -0.25, pitched: 'Si ½b'}],
            Re: [{noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}, {noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}],
            Mi: [{noteName: 'So#', pitchBend: -0.25, pitched: 'So ½#'}, {noteName: 'Re#', pitchBend: -0.25, pitched: 'Re ½#'}],
            Fa: [{noteName: 'La' , pitchBend: -0.25, pitched: 'La ½b'}, {noteName: 'Mi' , pitchBend: -0.25, pitched: 'Mi ½b'}],
            So: [{noteName: 'Si' , pitchBend: -0.25, pitched: 'Si ½b'}, {noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}],
            La: [{noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}, {noteName: 'So#', pitchBend: -0.25, pitched: 'So ½#'}],
            Si: [{noteName: 'Re#', pitchBend: -0.25, pitched: 'Re ½#'}, {noteName: 'La' , pitchBend: -0.25, pitched: 'La ½#'}],
        },
        // no pitch bend in the following
        Hijaz: {
        },
        Nahawand: {
        },
        Kurd: {
        },
        Ajam: {
        },
    };

    let numOrNull = val => val === '' ? null : +val;

    let collectRegion = div => 1 && {
        scale: $$('select.scale', div)[0].value,
        startingNote: $$('select.key-note', div)[0].value,
        fromToFormat: $$('select.from-to-format', div)[0].value,
        from: $$('input.from', div)[0].value,
        to: $$('input.to', div)[0].value,
        pitchBends: $$('.pitch-bend-list > *', div)
            .map(span => 1 && {
                noteName: $$('select.pitched-note', span)[0].value,
                pitchBend: $$('input.pitch-bend', span)[0].value,
            }),
    };

    let collectParams = (gui) => 1 && {
        scaleRegions: $$(':scope > *', gui.regionListCont)
            .map(collectRegion),
        oudTrackNum: numOrNull(gui.oudTrackNumInput.value),
        tablaTrackNum: numOrNull(gui.tablaTrackNumInput.value),
        removeMeta: gui.removeMetaFlag.checked,
    };

    let gui = {
        smfInput: $$('input[type="file"].midi-file', form)[0],
        sf2Input: $$('input[type="file"].soundfont-file', form)[0],
        ticksPerBeatHolder: $$('.ticks-per-beat', form)[0],
        regionListCont: $$('.region-list', form)[0],
        regionRef: $$('.region-list > *', form)[0].cloneNode(true),
        pitchBendRef: $$('.pitch-bend-list > *', form)[0].cloneNode(true),
        currentTracks: $$('tbody.current-tracks', form)[0],
        addAnotherRegionBtn: $$('button.add-another-region', form)[0],
        resetRegionsBtn: $$('button.reset-regions', form)[0],
        oudTrackNumInput: $$('input.oud-track-num', form)[0],
        tablaFlag: $$('input[type="checkbox"].tabla-flag', form)[0],
        tablaTrackNumInput: $$('input.tabla-track-num', form)[0],
        convertBtn: $$('button.convert-to-arabic', form)[0],
        removeMetaFlag: $$('input.remove-meta', form)[0],
    };

    let getTotalTicks = function(smfReader)
    {
        let ticksPerTrack = smfReader.tracks.map(t => t.events.reduce((sum, e) => sum + e.delta, 0));
        return Math.max(...ticksPerTrack);
    };

    let isNoteOn = (readerEvent) =>
        readerEvent.type === 'MIDI' &&
        readerEvent.midiEventType === 9 &&
        readerEvent.parameter2 > 0;

    let getTotalNotes = function(smfReader)
    {
        let notesPerTrack = smfReader.tracks
            .map(t => t.events.filter(isNoteOn).length);
        return Math.max(...notesPerTrack);
    };

    let updateScaleTimeRanges = function(div, ticksPerBeat, totalTicks, totalNotes)
    {
        let onchange = () => {
            let fromProg = 0;
            let toProg = 1;
            let step = 1;
            let max = 1;
            let data = collectRegion(div);
            if (data.fromToFormat === 'Notes') {
                // last was Ticks
                fromProg = data.from / totalTicks;
                toProg = data.to / totalTicks;
                step = 1;
                max = totalNotes;
            } else if (data.fromToFormat === 'Ticks') {
                // last was Notes
                fromProg = data.from / totalNotes;
                toProg = data.to / totalNotes;
                step = ticksPerBeat;
                max = totalTicks;
            }
            $$('input.from', div)[0].setAttribute('step', step);
            $$('input.from', div)[0].setAttribute('max', max);
            $$('input.from', div)[0].value = Math.round(max * fromProg / step) * step;

            $$('input.to', div)[0].setAttribute('step', step);
            $$('input.to', div)[0].setAttribute('max', max);
            $$('input.to', div)[0].value = Math.round(max * toProg / step) * step || max;
        };
        $$('select.from-to-format', div)[0].onchange = onchange;
        onchange();
    };

    let getFractionChar = function(num)
    {
        if (num == '1') {
            return '';
        } else if (num == '0.75') {
            return '¾';
        } else if (num == '0.5') {
            return '½';
        } else if (num == '0.25') {
            return '¼';
        } else if (Math.abs(num - 0.3333333333) < 0.0000001) {
            return '⅓';
        } else if (Math.abs(num - 0.6666666666) < 0.0000001) {
            return '⅔';
        } else {
            return num + '';
        }
    };

    let getPitchResultNote = function(noteName, pitchBend)
    {
        let clean = noteName.slice(0, 2);
        let sign = noteName.slice(2);
        if (pitchBend == 0) {
            return noteName;
        } else if (sign == '#' && pitchBend < 0) {
            return clean + ' ' + getFractionChar(-pitchBend * 2) + sign;
        } else if (sign == '' && pitchBend < 0) {
            return clean + ' ' + getFractionChar(-pitchBend * 2) + 'b';
        } else {
            return '';
        }
    };

    let addPitchBendNote = function(pitchBendList)
    {
        let scaleBlock = pitchBendList.parentNode.parentNode;
        let infoBlock = $$('.no-pitch-bend-msg', scaleBlock)[0];
        infoBlock.style.display = 'none';

        let pitchBendSpan = gui.pitchBendRef.cloneNode(true);
        let onchange = () => {
            let noteName = $$('select.pitched-note', pitchBendSpan)[0].value;
            let pitchBend = $$('input.pitch-bend', pitchBendSpan)[0].value;
            $$('.pitch-result', pitchBendSpan)[0].value = getPitchResultNote(noteName, pitchBend);
        };
        $$('select.pitched-note', pitchBendSpan)[0].onchange = onchange;
        $$('input.pitch-bend', pitchBendSpan)[0].oninput = onchange;
        $$('button.remove-pitched-note', pitchBendSpan)[0]
            .onclick = () => {
                pitchBendSpan.remove();
                if ($$('.pitch-bend-list > *', scaleBlock).length === 0) {
                    infoBlock.style.display = 'inline';
                }
            };
        pitchBendList.appendChild(pitchBendSpan);
        return pitchBendSpan;
    };

    let updateScaleInfo = function(div)
    {
        let pitchBendList = $$('.pitch-bend-list', div)[0];
        pitchBendList.innerHTML = '';
        let scale = $$('select.scale', div)[0].value;
        let keyNote = $$('select.key-note', div)[0].value;
        let keyNotes = scaleMapping[scale];
        pitchBendList.innerHTML = '';
        if (keyNotes) {
            for (let pitchInfo of keyNotes[keyNote] || []) {
                let pitchBend = addPitchBendNote(pitchBendList);
                $$('select.pitched-note', pitchBend)[0].value = pitchInfo.noteName;
                $$('input.pitch-bend', pitchBend)[0].value = pitchInfo.pitchBend;
                $$('.pitch-result', pitchBend)[0].value = pitchInfo.pitched;
            }
        }
        if (!pitchBendList.innerHTML) {
            $$('.no-pitch-bend-msg', div).forEach(span => span.style.display = 'inline');
        } else {
            $$('.no-pitch-bend-msg', div).forEach(span => span.style.display = 'none');
        }
    };

    let initScale = function(div)
    {
        let onchange = () => updateScaleInfo(div);
        $$('select.scale', div)[0].onchange = onchange;
        $$('select.key-note', div)[0].onchange = onchange;
        $$('button.remove-region', div)[0].onclick = () => {
            let regions = div.parentNode.children;
            if (regions.length > 1) {
                console.log(regions);
                div.remove();
            } else {
                alert('There should be at least 1 region');
            }
        };
        $$('button.add-pitch-bend', div)[0].onclick = () => {
            addPitchBendNote($$('.pitch-bend-list', div)[0]);
        };
        onchange();
    };

    let shouldDiffer = function(input, getExcluded)
    {
        input.onchange = function(e){
            let min = input.min;
            let max = input.max;
            input.value = Math.min(input.value, max);
            input.value = Math.max(input.value, min);
            let oldValue = input.oldValue !== undefined ? input.oldValue : input.defaultValue;
            let excluded = getExcluded();
            if (input.value === excluded) {
                let delta = +input.value - oldValue;
                let nextValue = +input.value + delta;
                if (nextValue >= min && nextValue <= max) {
                    input.value = nextValue;
                } else {
                    input.value = oldValue;
                }
            }
            input.oldValue = input.value;
        };
    };

    let changeAsUser = function(inputs, value)
    {
        for (let inp of inputs) {
            inp.value = value;
            let event = new Event('change');
            inp.dispatchEvent(event);
        }
    };

    let main = function (){
        let currentSmf = null;
        gui.smfInput.onclick = (e) => { gui.smfInput.value = null; };
        gui.smfInput.onchange =
            (inputEvent) => loadSelectedFile(gui.smfInput.files[0],
            (smfBase64) => {
                let smfBuf = _base64ToArrayBuffer(smfBase64);
                let smf = Ns.Libs.SMFreader(smfBuf);
                gui.currentTracks.innerHTML = '';
                for (let i = 0; i < smf.tracks.length; ++i) {
                    let track = smf.tracks[i];
                    gui.currentTracks.innerHTML += '<tr>' +
                        '<td>' + i + '</td>' +
                        '<td>' + (track.trackName || '') + '</td>' +
                        '<td>' + track.events.length + '</td>' +
                    '</tr>';
                    console.log('Parsed SMF track ', track);
                }
                let totalTicks = getTotalTicks(smf);
                let totalNotes = getTotalNotes(smf);
                gui.ticksPerBeatHolder.innerHTML = smf.ticksPerBeat;
                gui.oudTrackNumInput.setAttribute('max', smf.tracks.length - 1);
                gui.tablaTrackNumInput.setAttribute('max', smf.tracks.length - 1);
                $$(':scope > div', gui.regionListCont)
                    .forEach(div => updateScaleTimeRanges(
                        div, smf.ticksPerBeat, totalTicks, totalNotes
                    ));
                updateScaleTimeRanges(gui.regionRef, smf.ticksPerBeat, totalTicks, totalNotes);

                currentSmf = smf;
                gui.convertBtn.removeAttribute('disabled');
            });
        gui.sf2Input.onclick = (e) => { gui.smfInput.value = null; };
        gui.sf2Input.onchange =
            (inputEvent) => loadSelectedFile(gui.sf2Input.files[0],
            (sf2Base64) => {
                let sf2Buf = _base64ToArrayBuffer(sf2Base64);
                Sf2Adapter(sf2Buf);
            });
        gui.convertBtn.onclick = () => {
            let params = collectParams(gui);
            ToRanamFormat(currentSmf, params);
        };
        initScale($$(':scope > *', gui.regionListCont)[0]);
        gui.addAnotherRegionBtn.onclick = () => {
            let cloned = gui.regionRef.cloneNode(true);
            initScale(cloned);
            gui.regionListCont.appendChild(cloned);
        };
        gui.resetRegionsBtn.onclick = () => {
            $$(':scope > *', gui.regionListCont).slice(1)
                .forEach(reg => reg.remove());
            $$(':scope > *', gui.regionListCont)
                .forEach(reg => {
                    changeAsUser($$('select.from-to-format', reg), 'Notes');
                    changeAsUser($$('input.from', reg), 0);
                    changeAsUser($$('input.to', reg), $$('input.to', reg)[0].getAttribute('max'));
                    changeAsUser($$('select.scale', reg), 'Bayati');
                    changeAsUser($$('select.key-note', reg), 'Do');
                });
        };
        shouldDiffer(gui.oudTrackNumInput, () => gui.tablaTrackNumInput.value);
        shouldDiffer(gui.tablaTrackNumInput, () => gui.oudTrackNumInput.value);

        gui.tablaFlag.onchange = () => {
            if (gui.tablaFlag.checked) {
                gui.tablaTrackNumInput.removeAttribute('disabled');
            } else {
                gui.tablaTrackNumInput.setAttribute('disabled', 'disabled');
                gui.tablaTrackNumInput.value = '';
            }
        };
        gui.tablaFlag.onchange();
    };

    main();
});