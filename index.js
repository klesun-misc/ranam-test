
(function(){
    let klesun = Klesun();
    klesun.requires('./mods/Sf2Adapter.js').then = (Sf2Adapter) =>
    klesun.requires('./mods/ToRanamFormat.js').then = (ToRanamFormat) =>
    klesun.requires('./mods/PlaySmf.js').then = (PlaySmf) =>
    klesun.requires('./mods/Synth.js').then = (Synth) =>
    klesun.requires('./mods/Tls.js').then = (Tls) =>
    klesun.whenLoaded = () => (form) => {
        "use strict";
        let $$ = (s, root) => Array.from((root || document).querySelectorAll(s));
        let audioCtx = new AudioContext();
        let tls = Tls();
        let stopPlayback = () => {};
        let playSmf = (smf, sf2, synth) => {
            stopPlayback();
            stopPlayback = PlaySmf(smf, sf2, synth);
        };
        let currentSmf = null;
        let currentSf2 = null;

        let loadSelectedFile = function (fileInfo, whenLoaded) {
            if (!fileInfo) {
                // if user cancelled "Choose File" pop-up
                return null;
            }

            let reader = new FileReader();
            // reader.readAsDataURL(fileInfo);
            reader.readAsArrayBuffer(fileInfo);
            reader.onload = (e) => {
                whenLoaded(e.target.result);
            }
        };

        let saveMidiToDisc = function(buff)
        {
            let blob = new Blob([buff], {type: "midi/binary"});
            saveAs(blob, 'ranam_song.mid', true);
        };

        let scaleMapping = {
            Bayati: {
                Do: [{noteName: 'Re', pitchBend: -0.25, pitched: 'Re ½b'}],
                Re: [{noteName: 'Mi', pitchBend: -0.25, pitched: 'Mi ½b'}],
                Mi: [{noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}],
                Fa: [{noteName: 'So', pitchBend: -0.25, pitched: 'So ½b'}],
                So: [{noteName: 'La', pitchBend: -0.25, pitched: 'La ½b'}],
                La: [{noteName: 'Si', pitchBend: -0.25, pitched: 'Si ½b'}],
                Si: [{noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}],
            },
            Saba: {
                Do: [{noteName: 'Re', pitchBend: -0.25, pitched: 'Re ½b'}],
                Re: [{noteName: 'Mi', pitchBend: -0.25, pitched: 'Mi ½b'}],
                Mi: [{noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}],
                Fa: [{noteName: 'So', pitchBend: -0.25, pitched: 'So ½b'}],
                So: [{noteName: 'La', pitchBend: -0.25, pitched: 'La ½b'}],
                La: [{noteName: 'Si', pitchBend: -0.25, pitched: 'Si ½b'}],
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
                Do: [{noteName: 'Mi', pitchBend: -0.25, pitched: 'Mi ½b'}, {
                    noteName: 'Si',
                    pitchBend: -0.25,
                    pitched: 'Si ½b'
                }],
                Re: [{noteName: 'Fa#', pitchBend: -0.25, pitched: 'Fa ½#'}, {
                    noteName: 'Do#',
                    pitchBend: -0.25,
                    pitched: 'Do ½#'
                }],
                Mi: [{noteName: 'So#', pitchBend: -0.25, pitched: 'So ½#'}, {
                    noteName: 'Re#',
                    pitchBend: -0.25,
                    pitched: 'Re ½#'
                }],
                Fa: [{noteName: 'La', pitchBend: -0.25, pitched: 'La ½b'}, {
                    noteName: 'Mi',
                    pitchBend: -0.25,
                    pitched: 'Mi ½b'
                }],
                So: [{noteName: 'Si', pitchBend: -0.25, pitched: 'Si ½b'}, {
                    noteName: 'Fa#',
                    pitchBend: -0.25,
                    pitched: 'Fa ½#'
                }],
                La: [{noteName: 'Do#', pitchBend: -0.25, pitched: 'Do ½#'}, {
                    noteName: 'So#',
                    pitchBend: -0.25,
                    pitched: 'So ½#'
                }],
                Si: [{noteName: 'Re#', pitchBend: -0.25, pitched: 'Re ½#'}, {
                    noteName: 'La',
                    pitchBend: -0.25,
                    pitched: 'La ½#'
                }],
            },
            // no pitch bend in the following
            Hijaz: {},
            Nahawand: {},
            Kurd: {},
            Ajam: {},
        };

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
            scaleRegions: $$(':scope > *', gui.regionListCont).map(collectRegion),
            oudTrackNum: $$('[name="isOudTrack"]:checked', gui.currentTracks).map(r => +r.value)[0],
            tablaTrackNum: $$('[name="isTablaTrack"]:checked', gui.currentTracks).map(r => +r.value || null)[0],
            removeMeta: gui.removeMetaFlag.checked,
        };

        let gui = {
            smfInput: $$('input[type="file"].midi-file', form)[0],
            sf2Input: $$('input[type="file"].soundfont-file', form)[0],
            ticksPerBeatHolder: $$('.ticks-per-beat', form)[0],
            currentTracks: $$('tbody.current-tracks', form)[0],
            trackTrRef: $$('.current-tracks tr')[0].cloneNode(true),
            regionListCont: $$('.region-list', form)[0],
            regionRef: $$('.region-list > *', form)[0].cloneNode(true),
            pitchBendRef: $$('.pitch-bend-list > *', form)[0].cloneNode(true),
            addAnotherRegionBtn: $$('button.add-another-region', form)[0],
            resetRegionsBtn: $$('button.reset-regions', form)[0],
            convertBtn: $$('button.convert-to-arabic', form)[0],
            removeMetaFlag: $$('input.remove-meta', form)[0],
            soundfontLoadingImg: $$('img.soundfont-loading', form)[0],
            playInputBtn: $$('button.play-input', form)[0],
            playOutputBtn: $$('button.play-output', form)[0],
        };

        let getTotalTicks = function (smfReader) {
            let ticksPerTrack = smfReader.tracks.map(t => t.events.reduce((sum, e) => sum + e.delta, 0));
            return Math.max(...ticksPerTrack);
        };

        let isNoteOn = (readerEvent) =>
            readerEvent.type === 'MIDI' &&
            readerEvent.midiEventType === 9 &&
            readerEvent.parameter2 > 0;

        let getTotalNotes = function (smfReader) {
            let notesPerTrack = smfReader.tracks
                .map(t => t.events.filter(isNoteOn).length);
            return Math.max(...notesPerTrack);
        };

        let updateScaleTimeRanges = function (div, ticksPerBeat, totalTicks, totalNotes) {
            let formatSelect = $$('select.from-to-format', div)[0];
            let onchange = () => {
                let step = 1;
                let max = 1;
                let data = collectRegion(div);

                let fromProg = data.from / $$('input.from', div)[0].getAttribute('max');
                let toProg = data.to / $$('input.to', div)[0].getAttribute('max');

                if (data.fromToFormat === 'Notes') {
                    step = 1;
                    max = totalNotes;
                } else if (data.fromToFormat === 'Ticks') {
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
            formatSelect.onchange = onchange;
            onchange();
        };

        let getFractionChar = function (num) {
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

        let getPitchResultNote = function (noteName, pitchBend) {
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

        let addPitchBendNote = function (pitchBendList) {
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

        let updateScaleInfo = function (div) {
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

        let initScale = function (div) {
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

        let changeAsUser = function (inputs, value) {
            for (let inp of inputs) {
                inp.value = value;
                let event = new Event('change');
                inp.dispatchEvent(event);
            }
        };

        /** change all preset/bank change messages to 121/123 */
        let oudizeTrack = function(track) {
            // preset event
            track.events.unshift({
                delta: 0, type: 'MIDI', midiEventType: 12,
                midiChannel: 0, parameter1: 123,
            });
            // bank event
            track.events.unshift({
                delta: 0, type: 'MIDI', midiEventType: 11,
                midiChannel: 0, parameter1: 0, parameter2: 121,
            });
            track.events.filter(e => e.type === 'MIDI').forEach(e => {
                e.midiChannel = 0;
                if (e.midiEventType === 12) {
                    e.parameter1 = 123; // override preset
                } else if (e.midiEventType === 11 && e.parameter1 === 0) {
                    e.parameter2 = 121; // override bank
                }
            });
        };

        let playTrack = function(trackNum, isOud, isTabla) {
            let possible = false;
            switch (null) {
                case currentSmf: alert('Load MIDI file first!'); break;
                case currentSf2: alert('Load .sf2 first!'); break;
                default: possible = true;
            }
            if (possible) {
                let smfCopy = JSON.parse(JSON.stringify(currentSmf));
                // 0 - config track with tempo and stuff
                let isIrrelevant = (_,i) => i !== 0 && i !== trackNum;
                //let params = collectParams(gui);
                smfCopy.tracks.filter(isIrrelevant).forEach((t) => t.events = []);
                if (isOud) {
                    oudizeTrack(smfCopy.tracks[trackNum]);
                } else if (isTabla) {
                    smfCopy.tracks[trackNum].events
                        .filter(e => e.type === 'MIDI')
                        .forEach(e => e.midiChannel = 10);
                }
                let synth = Synth(audioCtx, currentSf2);
                playSmf(smfCopy, currentSf2, synth);
            }
        };

        let populateSmfGui = function(smf) {
            gui.currentTracks.innerHTML = '';
            let oudTrackNum = smf.tracks.length > 1 ? 1 : 0;
            let onlyOne = () => {
                $$(':scope > tr.real', gui.currentTracks)
                    .forEach(tr => {
                        let occupied = $$('input[type="radio"]:checked', tr).length > 0;
                        $$('input[type="radio"]:not(:checked)', tr).forEach(radio => {
                            if (occupied) {
                                radio.setAttribute('disabled', 'disabled');
                            } else {
                                radio.removeAttribute('disabled');
                            }
                        });
                    });
            };
            for (let i = 0; i < smf.tracks.length; ++i) {
                let track = smf.tracks[i];
                let tr = gui.trackTrRef.cloneNode(true);
                tr.classList.add('real');
                $$('.holder.track-number', tr)[0].innerHTML = i;
                $$('.holder.track-name', tr)[0].innerHTML = track.trackName || '';
                $$('.holder.event-cnt', tr)[0].innerHTML = track.events.length;
                let oudRadio = $$('input[name="isOudTrack"]', tr)[0];
                let tablaRadio = $$('input[name="isTablaTrack"]', tr)[0];
                oudRadio.value = i;
                tablaRadio.value = i;
                oudRadio.onchange = onlyOne;
                tablaRadio.onchange = onlyOne;
                $$('button.play-track', tr)[0].onclick = () => playTrack(
                    i, oudRadio.checked, tablaRadio.checked
                );
                if (i === oudTrackNum) {
                    $$('input[name="isOudTrack"]', tr)[0].checked = true;
                    $$('input[name="isTablaTrack"]', tr)[0].setAttribute('disabled', 'disabled');
                }
                gui.currentTracks.appendChild(tr);
            }
            let noneTr = gui.trackTrRef.cloneNode(true);
            $$('.holder.track-number', noneTr)[0].innerHTML = 'None';
            $$('input[name="isTablaTrack"]', noneTr)[0].checked = true;
            $$('input[name="isTablaTrack"]', noneTr)[0].onchange = onlyOne;
            $$('input[name="isOudTrack"]', noneTr)[0].remove();
            $$('button.play-track', noneTr)[0].remove();
            gui.currentTracks.appendChild(noneTr);

            let totalTicks = getTotalTicks(smf);
            let totalNotes = getTotalNotes(smf);
            gui.ticksPerBeatHolder.innerHTML = smf.ticksPerBeat;
            $$(':scope > div', gui.regionListCont)
                .forEach(div => updateScaleTimeRanges(
                    div, smf.ticksPerBeat, totalTicks, totalNotes
                ));
            updateScaleTimeRanges(gui.regionRef, smf.ticksPerBeat, totalTicks, totalNotes);
        };

        let initPlaybackBtns = function() {
            gui.playInputBtn.onclick = () => {
                let synth = Synth(audioCtx, currentSf2);
                if (!currentSmf) {
                    alert('MIDI file not loaded');
                } else {
                    playSmf(currentSmf, currentSf2, synth);
                }
            };
            gui.playOutputBtn.onclick = () => {
                if (!currentSmf) {
                    alert('MIDI file not loaded');
                } else {
                    let synth = Synth(audioCtx, currentSf2);
                    let params = collectParams(gui);
                    let buff = ToRanamFormat(currentSmf, params);
                    if (buff) {
                        let parsed = Ns.Libs.SMFreader(buff);
                        playSmf(parsed, currentSf2, synth);
                    }
                }
            };
        };

        let main = function () {
            gui.smfInput.onclick = (e) => {
                gui.smfInput.value = null;
            };
            gui.smfInput.onchange =
                (inputEvent) => loadSelectedFile(gui.smfInput.files[0],
                (smfBuf) => {
                    let smf = Ns.Libs.SMFreader(smfBuf);
                    console.log('Parsed SMF', smf);
                    populateSmfGui(smf);
                    currentSmf = smf;
                    gui.convertBtn.removeAttribute('disabled');
                });
            gui.sf2Input.onclick = (e) => {
                gui.smfInput.value = null;
            };
            gui.sf2Input.onchange = (inputEvent) => {
                if (!gui.sf2Input.files[0]) {
                    return; // user pressed "Cancel"
                }
                gui.soundfontLoadingImg.style.display = 'inline-block';
                loadSelectedFile(gui.sf2Input.files[0], (sf2Buf) => {
                    gui.soundfontLoadingImg.style.display = 'none';
                    currentSf2 = Sf2Adapter(sf2Buf, audioCtx);
                    initPlaybackBtns();
                });
            };
            gui.convertBtn.onclick = () => {
                let params = collectParams(gui);
                let buff = ToRanamFormat(currentSmf, params);
                if (buff) {
                    /** @debug */
                    console.log('Converted SMF', Ns.Libs.SMFreader(buff).tracks);
                    saveMidiToDisc(buff);
                }
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
            tls.http('./sf2/ranam_full.sf2', 'arraybuffer').then = (sf2Buf) => {
                let statusDom = $$('.sf2-http-status')[0];
                statusDom.style.color = 'rgb(2, 255, 0)';
                statusDom.innerHTML = 'Loaded .sf2 ' + sf2Buf.byteLength + ' bytes';
                if (!currentSf2) {
                    currentSf2 = Sf2Adapter(sf2Buf, audioCtx);
                    initPlaybackBtns();
                }
            };
        };

        main();
    };
}());