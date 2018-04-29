
(function(){
    let klesun = Klesun();
    klesun.requires('./classes/SfAdapter.js').then = (SfAdapter) =>
    klesun.requires('./classes/ToRanamFormat.js').then = (ToRanamFormat) =>
    klesun.requires('./classes/PlaySmf.js').then = (PlaySmf) =>
    klesun.requires('./classes/Synth.js').then = (Synth) =>
    klesun.requires('./classes/Tls.js').then = (Tls) =>
    klesun.requires('./classes/MidiUtil.js').then = (MidiUtil) =>
    klesun.requires('./classes/Gui.js').then = (Gui) =>
    klesun.requires('./classes/ScaleMapping.js').then = (ScaleMapping) =>
    klesun.requires('./classes/NoteDisplay.js').then = (NoteDisplay) =>
    klesun.whenLoaded = () => (form) => {
        "use strict";
        let $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

        let {http, opt, promise} = Tls();
        let {isNoteOn, scaleVelocity} = MidiUtil();
        let {gui, collectRegion, collectParams} = Gui();
        let {getScaleKeyNotes, getPitchResultNote} = ScaleMapping();

        let audioCtx = new AudioContext();
        let fluidSf = null;
        let noteDisplay = null;
        let stopPlayback = () => {};
        
        let preloadSamples = (smfReader, synth, ranamSf2) => promise(done => {
            let fluidOk = !fluidSf ? true : false;
            let ranamOk = false;
            let report = () => {
                if (fluidOk && ranamOk) {
                    done(123);
                }
            };
            smfReader.tracks.forEach(t => t.events
                .filter(e => e.type === 'MIDI')
                .forEach(e => synth.handleMidiEvent(e, true)));
            ranamSf2.onIdle(() => {
                ranamOk = true;
                report();
            });
            opt(fluidSf).get = (fl) => fl.onIdle(() => {
                fluidOk = true;
                report();
            });
        });

        let getTotalTicks = function (events) {
            return events.reduce((sum, e) => sum + e.delta, 0);
        };

        let getTotalNotes = function (events) {
            return events.filter(isNoteOn).length;
        };

        let getTicksToTempo = function (smf) {
            let ticksToTempo = {};
            for (let track of smf.tracks) {
                let ticks = 0;
                for (let event of track.events) {
                    ticks += event.delta;
                    if (event.type === 'meta' && event.metaType === 81) { // tempo
                        let tempo = 60 * 1000000 / event.metaData.reduce((a,b) => (a << 8) + b, 0);
                        ticksToTempo[ticks] = tempo;
                    }
                }
            }
            return ticksToTempo;
        };

        let playSmf = (smf, sf2, btn) => {
            let synth = Synth(audioCtx, ranamSf, fluidSf);
            preloadSamples(smf, synth, sf2).then = () => {
                stopPlayback();
                form.classList.add('playing');
                let playbackFinished = () => {
                    form.classList.remove('playing');
                    $$('.destroy-when-music-stops', form)
                        .forEach(dom => dom.remove());
                    $$('button.current-source')
                        .forEach(dom => dom.classList.remove('current-source'));
                };

                let playback = PlaySmf(smf, synth, () => collectParams(gui));
                playback.then = playbackFinished;
                switchWithStopBtn(btn);
                //playback.onStep = (ticks, duration) => opt(noteDisplay)
                //    .get = disp => disp.setPointerAt(ticks, duration);
                let ticksToTempo = getTicksToTempo(smf);
                let stopScroll = opt(noteDisplay).map(disp => disp.animatePointer(
                    ticksToTempo, smf.ticksPerBeat)).def(() => {});
                stopPlayback = () => {
                    playbackFinished();
                    stopScroll();
                    playback.stop();
                };
            };
        };
        let currentSmf = null;
        let ranamSf = null;

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

        let switchWithStopBtn = function(playBtn) {
            playBtn.classList.add('current-source');
            let stopBtn = document.createElement('button');
            stopBtn.innerHTML = 'Stop';
            stopBtn.classList.add('destroy-when-music-stops');
            stopBtn.setAttribute('type', 'button');
            playBtn.parentNode.insertBefore(stopBtn, playBtn);
            stopBtn.onclick = () => stopPlayback();
        };

        let updateScaleTimeRanges = function (div) {
            let formatSelect = $$('select.from-to-format', div)[0];
            let onchange = () => {
                let step = 1;
                let max = 1;
                let formData = collectParams(gui);
                let regionData = collectRegion(div);
                let ticksPerBeat = opt(currentSmf).map(smf => smf.ticksPerBeat).def(384);
                let oudEvents = opt(currentSmf).map(smf => smf.tracks[formData.oudTrackNum]).fmp(t => t.events);
                let totalTicks = getTotalTicks(oudEvents);
                let totalNotes = getTotalNotes(oudEvents);

                let fromProg = regionData.from / $$('input.from', div)[0].getAttribute('max');
                let toProg = regionData.to / $$('input.to', div)[0].getAttribute('max');

                if (regionData.fromToFormat === 'Notes') {
                    step = 1;
                    max = totalNotes;
                } else if (regionData.fromToFormat === 'Ticks') {
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
            let keyNotes = getScaleKeyNotes(scale);
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

        let playTrack = function(trackNum, isOud, isTabla, btn) {
            let configTrack = collectParams(gui).configTracks[trackNum];
            let possible = false;
            switch (null) {
                case currentSmf: alert('Load MIDI file first!'); break;
                case ranamSf: alert('Load .sf2 first!'); break;
                case configTrack: alert('No such track ' + trackNum + '!'); break;
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
                smfCopy.tracks[trackNum].events.filter(isNoteOn)
                    .forEach(e => e.parameter2 = scaleVelocity(
                        e.parameter2, configTrack.velocityFactor
                    ));
                console.log('track SMF', smfCopy);
                playSmf(smfCopy, ranamSf, btn);
                return true;
            } else {
                return false;
            }
        };

        let populateSmfGui = function(smf) {
            gui.trackList.innerHTML = '';
            gui.smfFieldSet.removeAttribute('disabled');
            gui.smfFieldSet.removeAttribute('title');
            let oudTrackNum = smf.tracks.length > 1 ? 1 : 0;
            let onlyOne = () => {
                $$(':scope > tr.real', gui.trackList)
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
                $$(':scope > div', gui.regionListCont)
                    .forEach(div => updateScaleTimeRanges(div));
            };
            for (let i = 0; i < smf.tracks.length; ++i) {
                let track = smf.tracks[i];
                let tr = gui.trackTrRef.cloneNode(true);
                tr.classList.add('real');
                $$('.holder.track-number', tr)[0].innerHTML = i;
                $$('.holder.track-name', tr)[0].innerHTML = track.trackName || '';
                $$('.holder.event-cnt', tr)[0].innerHTML = track.events.length;
                let maxVel = track.events
                    .filter(isNoteOn).map(e => e.parameter2 / 127 * 100)
                    .map(vol => Math.round(vol))
                    .reduce((max, vel) => Math.max(max, vel), 1);
                let velInp = $$('input.track-volume', tr)[0];
                velInp.value = maxVel;
                velInp.onchange = () => velInp.value = Math.max(0, Math.min(100, velInp.value));
                $$('.holder.original-volume', tr)[0].innerHTML = maxVel;
                let oudRadio = $$('input[name="isOudTrack"]', tr)[0];
                let tablaRadio = $$('input[name="isTablaTrack"]', tr)[0];
                oudRadio.value = i;
                tablaRadio.value = i;
                oudRadio.onchange = onlyOne;
                tablaRadio.onchange = onlyOne;
                let playBtn = $$('button.play-track', tr)[0];
                playBtn.onclick = () => playTrack(
                    i, oudRadio.checked, tablaRadio.checked, playBtn
                );
                if (i === oudTrackNum) {
                    $$('input[name="isOudTrack"]', tr)[0].checked = true;
                    $$('input[name="isTablaTrack"]', tr)[0].setAttribute('disabled', 'disabled');
                }
                gui.trackList.appendChild(tr);
            }
            let noneTr = gui.trackTrRef.cloneNode(true);
            $$('.holder.track-number', noneTr)[0].innerHTML = 'None';
            $$('input[name="isTablaTrack"]', noneTr)[0].checked = true;
            $$('input[name="isTablaTrack"]', noneTr)[0].onchange = onlyOne;
            $$('input[name="isOudTrack"]', noneTr)[0].remove();
            $$('button.play-track', noneTr)[0].remove();
            gui.trackList.appendChild(noneTr);
            gui.ticksPerBeatHolder.innerHTML = smf.ticksPerBeat;

            let ticksToTempo = getTicksToTempo(smf);
            let tempos = Object.values(ticksToTempo);
            let tempoStr = tempos.map(t => Math.round(t)).join(', ') || '120';
            gui.tempoHolder.innerHTML = tempoStr;

            $$(':scope > div', gui.regionListCont)
                .forEach(div => updateScaleTimeRanges(div));
            updateScaleTimeRanges(gui.regionRef);
            noteDisplay = NoteDisplay(gui.noteDisplayCont, smf);
            noteDisplay.onNoteOver = (note) => gui.noteHoverInfoHolder.innerHTML =
                Object.entries(note).map(([k,v]) => k + ': ' + v).join(' | ');
            noteDisplay.onNoteOut = (note) => gui.noteHoverInfoHolder.innerHTML = '...';
        };

        let initPlaybackBtns = function() {
            gui.playInputBtn.onclick = () => {
                if (!currentSmf) {
                    alert('MIDI file not loaded');
                } else {
                    playSmf(currentSmf, ranamSf, gui.playInputBtn);
                }
            };
            gui.playOutputBtn.onclick = () => {
                if (!currentSmf) {
                    alert('MIDI file not loaded');
                } else {
                    let params = collectParams(gui);
                    let buff = ToRanamFormat(currentSmf, params);
                    if (buff) {
                        let parsed = Ns.Libs.SMFreader(buff);
                        playSmf(parsed, ranamSf, gui.playOutputBtn);
                    }
                }
            };
        };

        let main = function () {
            gui.smfInput.value = null;
            gui.smfInput.onchange =
                (inputEvent) => loadSelectedFile(gui.smfInput.files[0],
                (smfBuf) => {
                    let smf = Ns.Libs.SMFreader(smfBuf);
                    if (smf) {
                        console.log('Parsed SMF', smf);
                        currentSmf = smf;
                        populateSmfGui(smf);
                    } else {
                        gui.smfInput.value = null;
                    }
                });
            gui.sf2Input.value = null;
            gui.sf2Input.onchange = (inputEvent) => {
                let file = gui.sf2Input.files[0];
                if (!file) {
                    return; // user pressed "Cancel"
                }
                let isSf3 = file.name.endsWith('.sf3');
                gui.soundfontLoadingImg.style.display = 'inline-block';
                loadSelectedFile(file, (sf2Buf) => {
                    gui.soundfontLoadingImg.style.display = 'none';
                    ranamSf = SfAdapter(sf2Buf, audioCtx, isSf3);
                    initPlaybackBtns();
                });
            };
            gui.convertBtn.onclick = () => {
                let params = collectParams(gui);
                let buff = ToRanamFormat(currentSmf, params);
                if (buff) {
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
            //let sf2Url = './sf2/ranam_full.sf2';
            // let sfRanamUrl = 'https://dl.dropbox.com/s/ighf7wpdw2yfu6x/ranam_full.sf2?dl=0';
            // let isSf3Ranam = false;
            let sfRanamUrl = 'https://dl.dropbox.com/s/zyh5kzc42zda1ud/ranam_full.sf3?dl=0';
            let isSf3Ranam = true;
            http(sfRanamUrl, 'arraybuffer').then = (sfBuf) => {
                let statusDom = $$('.sf2-http-status')[0];
                statusDom.style.color = 'rgb(2, 255, 0)';
                statusDom.innerHTML = 'Loaded Ranam soundfont ' + sfBuf.byteLength + ' bytes';
                if (!ranamSf) {
                    ranamSf = SfAdapter(sfBuf, audioCtx, isSf3Ranam);
                    initPlaybackBtns();
                }
            };

            let sfFluidUrl = 'https://dl.dropbox.com/s/dm2ocmb96nkl458/fluid.sf3?dl=0';
            let isSf3Fluid = true;
            http(sfFluidUrl, 'arraybuffer').then = (sfBuf) => {
                let statusDom = $$('.sf2-http-status-fluid')[0];
                statusDom.style.color = 'rgb(2, 255, 0)';
                statusDom.innerHTML = 'Loaded General soundfont ' + sfBuf.byteLength + ' bytes';
                if (!fluidSf) {
                    fluidSf = SfAdapter(sfBuf, audioCtx, isSf3Fluid);
                    initPlaybackBtns();
                    gui.testSf3DecodingBtn.onclick = () => {
                        let params = {bank: 0, preset: 0, semitone: 60, velocity: 100};
                        fluidSf.getSampleData(params, (samples) => {
                            console.log('loaded sample for', params, samples);
                        });
                    };
                }
            };
        };

        main();
    };
}());
