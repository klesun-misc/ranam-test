
/**
 * provides the mapping to HTML dom elements
 * and utilizes the dom-related code
 */
define([], () => (form) => {

    let $$ = (s, root) => [...(root || document).querySelectorAll(s)];

    let gui = {
        smfInput: $$('input[type="file"].midi-file', form)[0],
        sf2Input: $$('input[type="file"].soundfont-file', form)[0],
        smfFieldSet: $$('fieldset.needs-smf', form)[0],
        ticksPerBeatHolder: $$('.ticks-per-beat', form)[0],
        tempoHolder: $$('.tempo-holder', form)[0],
        trackList: $$('tbody.current-tracks', form)[0],
        trackTrRef: $$('.current-tracks tr')[0].cloneNode(true),
        regionListCont: $$('.region-list', form)[0],
        regionRef: $$('.region-list > *', form)[0].cloneNode(true),
        pitchBendRef: $$('.pitch-bend-list > *', form)[0].cloneNode(true),
        addAnotherRegionBtn: $$('button.add-another-region', form)[0],
        resetRegionsBtn: $$('button.reset-regions', form)[0],
        convertBtn: $$('button.convert-to-arabic', form)[0],
        removeMetaFlag: $$('input.remove-meta', form)[0],
        noteDisplayCont: $$('.note-display-cont', form)[0],
        soundfontLoadingImg: $$('img.soundfont-loading', form)[0],
        playInputBtn: $$('button.play-input', form)[0],
        playOutputBtn: $$('button.play-output', form)[0],
        /** @debug */
        testSf3DecodingBtn: $$('button.test-sf3-decoding', form)[0],
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
        scaleRegions: $$(':scope > *', gui.regionListCont).map(collectRegion),
        oudTrackNum: $$('[name="isOudTrack"]:checked', gui.trackList).map(r => +r.value)[0],
        tablaTrackNum: $$('[name="isTablaTrack"]:checked', gui.trackList).map(r => +r.value || null)[0],
        configTracks: $$(':scope > tr.real', gui.trackList).map((t,i) => 1 && {
            velocityFactor: $$('.holder.original-volume', t)[0].innerHTML <= 0 ? 1 :
                $$('input.track-volume', t)[0].value /
                $$('.holder.original-volume', t)[0].innerHTML,
        }),
        removeMeta: gui.removeMetaFlag.checked,
    };

    return {
        gui: gui,
        collectRegion: collectRegion,
        collectParams: collectParams,
    };
});