
/**
 * provides the mapping to HTML dom elements
 * and utilizes the dom-related code
 */
var klesun = Klesun();
klesun.requires('./Tls.js').then = (Tls) =>
klesun.whenLoaded = () => (form) => {

    let $$ = (s, root) => [...(root || document).querySelectorAll(s)];
    let {mkDom, promise} = Tls();

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
        let ticksPerBeat = smfAdapter.tpb;
        let totalTicks = smfAdapter.tracks[formData.oudTrackNum].totalTicks;
        let totalNotes = smfAdapter.tracks[formData.oudTrackNum].totalNotes;

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

    return {
        collectParams: collectParams,
        showMessages: showMessages,
        switchWithStopBtn: switchWithStopBtn,
        updateScaleTimeRanges: updateScaleTimeRanges,
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