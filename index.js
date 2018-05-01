
(function(){
    let klesun = Klesun();
    klesun.requires('./classes/SfAdapter.js').then = (SfAdapter) =>
    klesun.requires('./classes/ToRanamFormat.js').then = (ToRanamFormat) =>
    klesun.requires('./classes/PlaySmf.js').then = (PlaySmf) =>
    klesun.requires('./classes/Synth.js').then = (Synth) =>
    klesun.requires('./classes/Tls.js').then = (Tls) =>
    klesun.requires('./classes/MidiUtil.js').then = (MidiUtil) =>
    klesun.requires('./classes/Gui.js').then = (Gui) =>
    klesun.requires('./classes/NoteDisplay.js').then = (NoteDisplay) =>
    klesun.whenLoaded = () => (form) => {
        "use strict";
        let $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

        let {http, opt, promise, deepCopy} = Tls();
        let {isNoteOn, scaleVelocity} = MidiUtil();
        let gui = Gui(form);

        let audioCtx = new AudioContext();
        let fluidSf = null;
        let noteDisplay = null;
        let stopPlayback = () => {};
        let stopAnimation = () => {};

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

        let collectTicksToTimeSig = function(smf) {
            let ticksToTimeSig = {};
            for (let track of smf.tracks) {
                let ticks = 0;
                for (let event of track.events) {
                    ticks += event.delta;
                    if (event.type === 'meta' && event.metaType === 88) { // time signature
                        let [num, denLog, midClocksPerMetrClick, thirtySecondsPer24Clocks] = event.metaData;
                        ticksToTimeSig[ticks] = {num: num, den: Math.pow(2, denLog)};
                    }
                }
            }
            return ticksToTimeSig;
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

        let playSmf = (smf, sf2, btn, animate) => {
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
                if (animate) {
                    stopAnimation = opt(noteDisplay).map(disp => disp.animatePointer(
                        ticksToTempo, smf.ticksPerBeat)).def(() => {});
                }
                stopPlayback = () => {
                    playbackFinished();
                    stopAnimation();
                    playback.stop();
                };
            };
        };
        let currentSmf = null;
        let ranamSf = null;

        /** getter will be overwritten when Note display is inited */
        let getEditorSmf = () => null;

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

        let saveXmlToDisc = function(buff)
        {
            let blob = new Blob([buff], {type: "xml/text"});
            saveAs(blob, 'ranam_song.xml', true);
        };

        let saveMidiToDisc = function(buff)
        {
            let blob = new Blob([buff], {type: "midi/binary"});
            saveAs(blob, 'ranam_song.mid', true);
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

        /**
         *  sometimes first note in track starts somewhere in the
         * middle of the song - no need to force user to wait all
         * this time when he is listening to just this track
         */
        let trimTrackSilence = function(track) {
            let changed = false;
            for (let event of track.events) {
                if (event.delta > 0) {
                    event.delta = 0;
                    changed = true;
                }
                if (isNoteOn(event)) {
                    break;
                }
            }
            return changed;
        };

        let playTrack = function(trackNum, isOud, isTabla, btn) {
            let configTrack = gui.collectParams(gui).configTracks[trackNum];
            let possible = false;
            let smf = getEditorSmf();
            switch (null) {
                case smf: alert('Load MIDI file first!'); break;
                case ranamSf: alert('Load .sf2 first!'); break;
                case configTrack: alert('No such track ' + trackNum + '!'); break;
                default: possible = true;
            }
            if (possible) {
                let smfCopy = JSON.parse(JSON.stringify(smf));
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
                let timingChanged = trimTrackSilence(smfCopy.tracks[trackNum]);
                smfCopy.tracks[trackNum].events.filter(isNoteOn)
                    .forEach(e => e.parameter2 = scaleVelocity(
                        e.parameter2, configTrack.velocityFactor
                    ));
                console.log('track SMF', smfCopy);
                playSmf(smfCopy, ranamSf, btn, !timingChanged);
            }
        };

        /**
         * Adds some denormalized info to each track.
         * Maybe I'll also make it provide notes separately
         * from other events and group by absolute ticks...
         */
        let SmfAdapter = function(smf) {
            return {
                ticksPerBeat: smf.ticksPerBeat,
                ticksToTempo: collectTicksToTempo(smf),
                ticksToTimeSig: collectTicksToTimeSig(smf),
                tracks: smf.tracks.map(t => {
                    return {
                        trackName: t.trackName,
                        totalTicks: getTotalTicks(t.events),
                        totalNotes: getTotalNotes(t.events),
                        maxVelocity: t.events
                            .filter(isNoteOn).map(e => e.parameter2 / 127 * 100)
                            .map(vol => Math.round(vol))
                            .reduce((max, vel) => Math.max(max, vel), 1),
                        events: t.events,
                    };
                }),
            };
        };

        let populateSmfGui = function(smf) {
            let smfAdapter = SmfAdapter(smf);
            let smfGui = gui.populateSmfGui(smfAdapter);
            smfGui.onPlayTrackClick = playTrack;

            // probably could reschedule animation instead of completely stopping...
            gui.tempoInput.onchange = () => stopAnimation();

            noteDisplay = NoteDisplay(gui.noteDisplayCont, smf);
            noteDisplay.onNoteClick = (note) => opt(ranamSf).get = (sf) => {
                let synth = Synth(audioCtx, sf, () => fluidSf);
                synth.handleMidiEvent({
                    type: 'MIDI',
                    midiEventType: 9, midiChannel: note.chan,
                    parameter1: note.tone, parameter2: note.velo,
                });
                setTimeout(() => synth.stopAll(), 500);
            };
            getEditorSmf = noteDisplay.getEditorSmf;
        };

        let initPlaybackBtns = function() {
            gui.playInputBtn.onclick = () => {
                if (!currentSmf) {
                    alert('MIDI file not loaded');
                } else {
                    playSmf(currentSmf, ranamSf, gui.playInputBtn, true);
                }
            };
            gui.playOutputBtn.onclick = () => {
                let smf = getEditorSmf();
                if (!smf) {
                    alert('MIDI file not loaded');
                } else {
                    let params = gui.collectParams(gui);
                    let ranamed = ToRanamFormat(smf, params);
                    gui.showMessages(ranamed);
                    if (ranamed.smfRanam) {
                        let parsed = Ns.Libs.SMFreader(ranamed.smfRanam);
                        playSmf(parsed, ranamSf, gui.playOutputBtn, true);
                    }
                }
            };
        };

        let prettifyXml = function(xmlDoc) {
            let xsltDoc = new DOMParser().parseFromString([
                // describes how we want to modify the XML - indent everything
                '<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
                '  <xsl:output omit-xml-declaration="yes" indent="yes"/>',
                '    <xsl:template match="node()|@*">',
                '      <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
                '    </xsl:template>',
                '</xsl:stylesheet>',
            ].join('\n'), 'application/xml');

            let xsltProcessor = new XSLTProcessor();
            xsltProcessor.importStylesheet(xsltDoc);
            let resultDoc = xsltProcessor.transformToDocument(xmlDoc);
            let resultXml = new XMLSerializer().serializeToString(resultDoc);
            return resultXml;
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
                let params = gui.collectParams();
                let ranamed = ToRanamFormat(getEditorSmf(), params);
                gui.showMessages(ranamed);
                if (ranamed.smfRanam) {
                    let buff = ranamed.smfRanam;
                    console.log('Converted SMF', Ns.Libs.SMFreader(buff).tracks);
                    saveMidiToDisc(buff);
                }
            };
            gui.saveXmlBtn.onclick = () => {
                let smfParams = gui.collectParams();
                let xmlDoc = gui.collectXmlParams(smfParams.sentences);
                /** @debug */
                console.log(xmlDoc);
                let pretty = prettifyXml(xmlDoc);
                saveXmlToDisc(pretty)
            };
            let getCurrentSmfAdapter = () => opt(currentSmf).map(SmfAdapter);
            gui.initSentence($$(':scope > *', gui.sentenceListCont)[0], getCurrentSmfAdapter());
            gui.addAnotherSentenceBtn.onclick = () => {
                let cloned = gui.sentenceRef.cloneNode(true);
                gui.sentenceListCont.appendChild(cloned);
                gui.initSentence(cloned, getCurrentSmfAdapter());
            };
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
            let sfRanamUrl = 'https://dl.dropbox.com/s/zyh5kzc42zda1ud/ranam_full.sf3?dl=0';
            http(sfRanamUrl, 'arraybuffer').then = (sfBuf) => {
                let statusDom = $$('.sf2-http-status')[0];
                statusDom.style.color = 'rgb(2, 255, 0)';
                statusDom.innerHTML = 'Loaded Ranam soundfont ' + sfBuf.byteLength + ' bytes';
                if (!ranamSf) {
                    ranamSf = SfAdapter(sfBuf, audioCtx, true);
                    initPlaybackBtns();
                }
            };

            let sfFluidUrl = 'https://dl.dropbox.com/s/dm2ocmb96nkl458/fluid.sf3?dl=0';
            http(sfFluidUrl, 'arraybuffer').then = (sfBuf) => {
                let statusDom = $$('.sf2-http-status-fluid')[0];
                statusDom.style.color = 'rgb(2, 255, 0)';
                statusDom.innerHTML = 'Loaded General soundfont ' + sfBuf.byteLength + ' bytes';
                if (!fluidSf) {
                    fluidSf = SfAdapter(sfBuf, audioCtx, true);
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
