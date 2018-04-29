
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
        let gui = Gui();
        let {getScaleKeyNotes, getPitchResultNote} = ScaleMapping();

        let audioCtx = new AudioContext();
        let fluidSf = null;
        let noteDisplay = null;
        let stopPlayback = () => {};
        let stopAnimation = () => {};

        let isMouseDown = false;
        form.onmousedown = (e) => isMouseDown |= e.button === 0;
        form.onmouseup = (e) => isMouseDown &= e.button !== 0;

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

        let collectTicksToTempo = function(smf) {
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

        let getTicksToTempo = function (smf) {
            let overwrittenTempo = gui.collectParams().tempo;
            if (overwrittenTempo) {
                return {0: overwrittenTempo};
            } else {
                return collectTicksToTempo(smf);
            }
        };

        let playSmf = (smf, sf2, btn) => {
            if (!ranamSf || !fluidSf) {
                gui.showMessages({errors: ['Wait for soundfont data to load!']});
                return;
            }
            let synth = Synth(audioCtx, ranamSf, () => fluidSf);
            preloadSamples(smf, synth, sf2).then = () => {
                stopPlayback();
                form.classList.add('playing');
                let playbackFinished = () => {
                    form.classList.remove('playing');
                    $$('.destroy-when-music-stops', form)
                        .forEach(dom => dom.remove());
                    $$('button.current-source', form)
                        .forEach(dom => dom.classList.remove('current-source'));
                };

                let playback = PlaySmf(smf, synth, () => gui.collectParams(gui));
                playback.then = playbackFinished;
                gui.switchWithStopBtn(btn).then = () => stopPlayback();
                let ticksToTempo = getTicksToTempo(smf);
                stopAnimation = opt(noteDisplay).map(disp => disp.animatePointer(
                    ticksToTempo, smf.ticksPerBeat)).def(() => {});
                stopPlayback = () => {
                    playbackFinished();
                    stopAnimation();
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

        /**
         * Adds some denormalized info to each track.
         * Maybe I'll also make it provide notes separately
         * from other events and group by absolute ticks...
         */
        let SmfAdapter = function(smf) {
            return {
                tpb: smf.ticksPerBeat,
                tracks: smf.tracks.map(t => {
                    return {
                        totalTicks: getTotalTicks(t.events),
                        totalNotes: getTotalNotes(t.events),
                    };
                }),
            };
        };

        let changeAsUser = function (inputs, value) {
            for (let inp of inputs) {
                inp.value = value;
                let event = new Event('change');
                inp.dispatchEvent(event);
            }
        };

        let checkAsUser = function (checkbox, value) {
            checkbox.checked = value;
            let event = new Event('change');
            checkbox.dispatchEvent(event);
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
            let configTrack = gui.collectParams(gui).configTracks[trackNum];
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
            let smfAdapter = SmfAdapter(smf);
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
                    .forEach(div => gui.updateScaleTimeRanges(div, smfAdapter));
            };
            let lastVisionFlagVal = true;
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
                let hideNotesCls = 'hide-notes-channel-' + i;
                opt($$('.show-in-note-display', tr)[0]).get = flag => {
                    flag.onclick = (e) => e.preventDefault();
                    flag.onchange = () => {
                        lastVisionFlagVal = flag.checked;
                        flag.checked
                            ? form.classList.remove(hideNotesCls)
                            : form.classList.add(hideNotesCls);
                    };
                    opt(flag.parentNode).get = td => {
                        td.onmousedown = (e) => checkAsUser(flag, !flag.checked);
                        td.onmouseover = () => isMouseDown && checkAsUser(flag, lastVisionFlagVal);
                    };
                    flag.onchange();
                };
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
            $$('.show-in-note-display', noneTr)[0].remove();
            gui.trackList.appendChild(noneTr);
            gui.ticksPerBeatHolder.innerHTML = smf.ticksPerBeat;

            let ticksToTempo = collectTicksToTempo(smf);
            let tempos = Object.values(ticksToTempo);
            let tempoStr = tempos.map(t => Math.round(t)).join(', ').slice(0, 20) || '120';
            gui.tempoHolder.innerHTML = tempoStr;
            gui.tempoInput.value = tempos.reduce((sum, t) => sum + t, 0) / tempos.length;
            if (new Set(tempos).size > 1) {
                // hide tempo input, show discard button
                gui.tempoHolder.style.display = 'inline';
                gui.discardTempoChangesBtn.style.display = 'inline';
                gui.tempoInput.style.display = 'none';
            } else {
                // hide unmodifiable span
                gui.tempoHolder.style.display = 'none';
                gui.discardTempoChangesBtn.style.display = 'none';
                gui.tempoInput.style.display = 'inline';
            }
            // probably could reschedule animation instead of completely stopping...
            gui.tempoInput.onchange = () => stopAnimation();

            $$(':scope > div', gui.regionListCont)
                .forEach(div => gui.updateScaleTimeRanges(div, smfAdapter));
            noteDisplay = NoteDisplay(gui.noteDisplayCont, smf);
            noteDisplay.onNoteClick = (note) => opt(ranamSf).get = (sf) => {
                let synth = Synth(audioCtx, sf, fluidSf);
                synth.handleMidiEvent({
                    type: 'MIDI',
                    midiEventType: 9, midiChannel: note.chan,
                    parameter1: note.tone, parameter2: note.velo,
                });
                setTimeout(() => synth.stopAll(), 500);
            };
            noteDisplay.onNoteOver = (note) => gui.noteHoverInfoHolder.innerHTML =
                Object.entries(note).map(([k, v]) => k + ': ' + v).join(' | ');
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
                    let params = gui.collectParams(gui);
                    let ranamed = ToRanamFormat(currentSmf, params);
                    gui.showMessages(ranamed);
                    if (ranamed.smfRanam) {
                        let parsed = Ns.Libs.SMFreader(ranamed.smfRanam);
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
                let params = gui.collectParams(gui);
                let buff = ToRanamFormat(currentSmf, params);
                if (buff) {
                    console.log('Converted SMF', Ns.Libs.SMFreader(buff).tracks);
                    saveMidiToDisc(buff);
                }
            };
            let getCurrentSmfAdapter = () => opt(currentSmf).map(SmfAdapter);
            gui.initScale($$(':scope > *', gui.regionListCont)[0], getCurrentSmfAdapter());
            gui.addAnotherRegionBtn.onclick = () => {
                let cloned = gui.regionRef.cloneNode(true);
                gui.regionListCont.appendChild(cloned);
                gui.initScale(cloned, getCurrentSmfAdapter());
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
