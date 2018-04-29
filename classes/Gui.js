
/**
 * provides the mapping to HTML dom elements
 * and utilizes the dom-related code
 */
var klesun = Klesun();
klesun.requires('./Tls.js').then = (Tls) =>
klesun.requires('./ScaleMapping.js').then = (ScaleMapping) =>
klesun.whenLoaded = () => (form) => {
    'use strict';

    let $$ = (s, root) => [...(root || document).querySelectorAll(s)];
    let {mkDom, promise, opt, range} = Tls();
    let {getScaleKeyNotes, getPitchResultNote} = ScaleMapping();

    let smfInput = $$('input[type="file"].midi-file', form)[0];
    let sf2Input = $$('input[type="file"].soundfont-file', form)[0];
    let smfFieldSet = $$('fieldset.needs-smf', form)[0];
    let ticksPerBeatHolder = $$('.ticks-per-beat', form)[0];
    let tempoHolder = $$('.tempo-holder', form)[0];
    let discardTempoChangesBtn = $$('button.discard-tempo-changes', form)[0];
    let tempoInput = $$('input.tempo', form)[0];
    let trackList = $$('tbody.current-tracks', form)[0];
    let trackTrRef = $$('.current-tracks tr')[0].cloneNode(true);
    let regionListCont = $$('.region-list', form)[0];
    let regionRef = $$('.region-list > *', form)[0].cloneNode(true);
    let pitchBendRef = $$('.pitch-bend-list > *', form)[0].cloneNode(true);
    let addAnotherRegionBtn = $$('button.add-another-region', form)[0];
    let resetRegionsBtn = $$('button.reset-regions', form)[0];
    let convertBtn = $$('button.convert-to-arabic', form)[0];
    let noteDisplayCont = $$('.note-display-cont', form)[0];
    let noteHoverInfoHolder = $$('.note-hover-info', form)[0];
    let soundfontLoadingImg = $$('img.soundfont-loading', form)[0];
    let playInputBtn = $$('button.play-input', form)[0];
    let playOutputBtn = $$('button.play-output', form)[0];
    let testSf3DecodingBtn = $$('button.test-sf3-decoding', form)[0];
    let msgCont = $$('.message-container', form)[0];

    let isMouseDown = false;
    form.onmousedown = (e) => isMouseDown |= e.button === 0;
    form.onmouseup = (e) => isMouseDown &= e.button !== 0;

    let checkAsUser = function (checkbox, value) {
        checkbox.checked = value;
        let event = new Event('change');
        checkbox.dispatchEvent(event);
    };

    let showMessages = function(record) {
        msgCont.innerHTML = '';
        let pairs = [
            ['WARNING', 'severity-warning', record.warnings || []],
            ['ERROR', 'severity-error', record.errors || []],
        ];
        for (let [prefix, cls, msgs] of pairs) {
            for (let msg of msgs.slice(0,3)) {
                let msgBox = mkDom('div', {
                    classList: [cls],
                    children: [
                        mkDom('span', {
                            innerHTML: prefix + ': ' + msg,
                            style: {float: 'left'},
                        }),
                        mkDom('button', {
                            innerHTML: 'Dismiss',
                            style: {float: 'right'},
                            onclick: () => msgBox.remove(),
                        }),
                        mkDom('br', {clear: 'all'}),
                    ],
                });
                msgCont.insertBefore(msgBox, msgCont.firstChild);
            }
        }
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

    let collectParams = () => 1 && {
        tempo: tempoInput.style.display !== 'none' ? tempoInput.value : null,
        scaleRegions: $$(':scope > *', regionListCont).map(collectRegion),
        oudTrackNum: $$('[name="isOudTrack"]:checked', trackList).map(r => +r.value)[0],
        tablaTrackNum: $$('[name="isTablaTrack"]:checked', trackList).map(r => +r.value || null)[0],
        configTracks: $$(':scope > tr.real', trackList).map((t,i) => 1 && {
            velocityFactor: $$('.holder.original-volume', t)[0].innerHTML <= 0 ? 1 :
                $$('input.track-volume', t)[0].value /
                $$('.holder.original-volume', t)[0].innerHTML,
        }),
    };

    let switchWithStopBtn = (playBtn) => promise(done => {
        playBtn.classList.add('current-source');
        let stopBtn = document.createElement('button');
        stopBtn.innerHTML = 'Stop';
        stopBtn.classList.add('destroy-when-music-stops');
        stopBtn.setAttribute('type', 'button');
        playBtn.parentNode.insertBefore(stopBtn, playBtn);
        stopBtn.onclick = () => done(123);
    });

    let updateScaleTimeRanges = function (div, smfAdapter) {
        let formData = collectParams();
        let ticksPerBeat = smfAdapter.ticksPerBeat;
        let totalTicks = opt(smfAdapter.tracks[formData.oudTrackNum]).map(t => t.totalTicks).def(384);
        let totalNotes = opt(smfAdapter.tracks[formData.oudTrackNum]).map(t => t.totalNotes).def(100);

        let formatSelect = $$('select.from-to-format', div)[0];
        let onchange = () => {
            let step = 1;
            let max = 1;
            let regionData = collectRegion(div);
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

        let pitchBendSpan = pitchBendRef.cloneNode(true);
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

    let initScale = function (div, currentSmfAdapter) {
        currentSmfAdapter.get = smfAdapter =>
            updateScaleTimeRanges(div, smfAdapter);

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

    let populateSmfGui = function(smfAdapter) {
        trackList.innerHTML = '';
        smfFieldSet.removeAttribute('disabled');
        smfFieldSet.removeAttribute('title');
        let oudTrackNum = smfAdapter.tracks.length > 1 ? 1 : 0;
        let playTrack = (trackNum, isOud, isTabla, playBtn) =>
            showMessages({errors: ['Action should be assigned outside']});

        let updateAllScaleRanges = () => $$(':scope > div', regionListCont)
            .forEach(div => updateScaleTimeRanges(div, smfAdapter));

        let lastTrackNums = {};
        let onlyOne = (trackNum, tr, isOud) => {
            let trs = $$(':scope > tr', trackList);
            let oudFlag = $$('input[type="radio"][name="isOudTrack"]', tr)[0];
            let tablaFlag = $$('input[type="radio"][name="isTablaTrack"]', tr)[0];
            if (oudFlag.checked && tablaFlag.checked) {
                // swap them
                let oldTrackNum = lastTrackNums[isOud];
                let neighbor = isOud ? tablaFlag : oudFlag;
                let neighborName = isOud ? 'isTablaTrack' : 'isOudTrack';
                neighbor.checked = false;
                let oldTr = trs[oldTrackNum];
                let selector = 'input[type="radio"][name="' + neighborName + '"]';
                if (oldTrackNum !== undefined && oldTrackNum !== trackNum && oldTr) {
                    $$(selector, oldTr)[0].checked = true;
                    lastTrackNums[!isOud] = oldTrackNum;
                } else {
                    // or just put it on any free row
                    let trackNums = new Set(range(0, trs.length));
                    trackNums.delete(trackNum);
                    for (let trackNum of trackNums) {
                        let tr = trs[trackNum];
                        if (tr) {
                            $$(selector, tr)[0].checked = true;
                            lastTrackNums[!isOud] = trackNum;
                            break;
                        }
                    }
                }
            }
            updateAllScaleRanges();
            lastTrackNums[isOud] = trackNum;
        };
        let lastVisionFlagVal = true;
        for (let i = 0; i < smfAdapter.tracks.length; ++i) {
            let track = smfAdapter.tracks[i];
            let tr = trackTrRef.cloneNode(true);
            tr.classList.add('real');
            $$('.holder.track-number', tr)[0].innerHTML = i;
            $$('.holder.track-name', tr)[0].innerHTML = track.trackName || '';
            $$('.holder.event-cnt', tr)[0].innerHTML = track.events.length;
            let velInp = $$('input.track-volume', tr)[0];
            velInp.value = track.maxVelocity;
            velInp.onchange = () => velInp.value = Math.max(0, Math.min(100, velInp.value));
            $$('.holder.original-volume', tr)[0].innerHTML = track.maxVelocity;
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
            oudRadio.onchange = () => onlyOne(i, tr, true);
            tablaRadio.onchange = () => onlyOne(i, tr, false);
            let playBtn = $$('button.play-track', tr)[0];
            playBtn.onclick = () => playTrack(
                i, oudRadio.checked, tablaRadio.checked, playBtn
            );
            if (i === oudTrackNum) {
                $$('input[name="isOudTrack"]', tr)[0].checked = true;
            }
            trackList.appendChild(tr);
        }
        let noneTr = trackTrRef.cloneNode(true);
        $$('.holder.track-number', noneTr)[0].innerHTML = 'None';
        $$('input[name="isTablaTrack"]', noneTr)[0].checked = true;
        $$('input[name="isTablaTrack"]', noneTr)[0].onchange = updateAllScaleRanges;
        $$('input[name="isOudTrack"]', noneTr)[0].remove();
        $$('button.play-track', noneTr)[0].remove();
        $$('.show-in-note-display', noneTr)[0].remove();
        trackList.appendChild(noneTr);
        ticksPerBeatHolder.innerHTML = smfAdapter.ticksPerBeat;

        let ticksToTempo = smfAdapter.ticksToTempo;
        let tempos = Object.values(ticksToTempo);
        let tempoStr = tempos.map(t => Math.round(t)).join(', ').slice(0, 20) || '120';
        tempoHolder.innerHTML = tempoStr;
        tempoInput.value = tempos.reduce((sum, t) => sum + t, 0) / tempos.length;
        if (new Set(tempos).size > 1) {
            // hide tempo input, show discard button
            tempoHolder.style.display = 'inline';
            discardTempoChangesBtn.style.display = 'inline';
            tempoInput.style.display = 'none';
        } else {
            // hide unmodifiable span
            tempoHolder.style.display = 'none';
            discardTempoChangesBtn.style.display = 'none';
            tempoInput.style.display = 'inline';
        }
        updateAllScaleRanges();
        return {
            set onPlayTrackClick(cb) {
                playTrack = cb;
            },
        };
    };

    return {
        collectParams: collectParams,
        showMessages: showMessages,
        switchWithStopBtn: switchWithStopBtn,
        initScale: initScale,
        populateSmfGui: populateSmfGui,
        // I desire to replace them all with value getters/setters one day
        smfInput: smfInput,
        sf2Input: sf2Input,
        smfFieldSet: smfFieldSet,
        ticksPerBeatHolder: ticksPerBeatHolder,
        tempoHolder: tempoHolder,
        discardTempoChangesBtn: discardTempoChangesBtn,
        tempoInput: tempoInput,
        trackList: trackList,
        trackTrRef: trackTrRef,
        regionListCont: regionListCont,
        regionRef: regionRef,
        pitchBendRef: pitchBendRef,
        addAnotherRegionBtn: addAnotherRegionBtn,
        resetRegionsBtn: resetRegionsBtn,
        convertBtn: convertBtn,
        noteDisplayCont: noteDisplayCont,
        noteHoverInfoHolder: noteHoverInfoHolder,
        soundfontLoadingImg: soundfontLoadingImg,
        playInputBtn: playInputBtn,
        playOutputBtn: playOutputBtn,
        testSf3DecodingBtn: testSf3DecodingBtn,
    };
};