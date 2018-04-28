
/** provides default meaning for each musical scale */
define([], () => () => {
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

    return {
        getScaleKeyNotes: (scale) => scaleMapping[scale],
        getPitchResultNote: getPitchResultNote,
    };
});