
/**
 * takes .sf2 file contents, parses it with sf2-parser
 * by colinbdclark and transforms result to convenient format
 * @param {Uint8Array} $sf2Buf
 */
define([], () => (sf2Buf) => {
    let saveWavToDisc = function(buff)
    {
        let blob = new Blob([buff], {type: "midi/binary"});
        saveAs(blob, 'sample.wav', true);
    };

    // Sf2-Parser lefts null characters when name length is less than 20
    let cleanText = function(rawText)
    {
        rawText = rawText + '\u0000';
        let endIdx = rawText.indexOf('\u0000');
        return rawText.substr(0, endIdx);
    };

    /**
     * @param {Int16Array} sf2Sample
     * @param {ISampleInfo} sampleInfo
     * @return {ArrayBuffer}
     */
    let sf2ToWav = function(sf2Sample, sampleInfo)
    {
        let sampleValues = [...sf2Sample];
        let size = sampleValues.length * 2 + 44; // 44 - RIFF header data
        let wavBuf = new ArrayBuffer(size);
        let view = new DataView(wavBuf);

        let subChunkSize = 16;
        let chanCnt = 1;
        let sampleRate = sampleInfo.sampleRate;
        let bitsPerSample = 16;
        let blockAlign = chanCnt * bitsPerSample / 8;
        let byteRate = blockAlign * sampleRate;

        view.setInt32(0 , 0x52494646, false); // RIFF
        view.setInt32(4 , size - 16, true); // following data length
        view.setInt32(8 , 0x57415645, false); // WAVE
        view.setInt32(12, 0x666D7420, false); // fmt
        view.setInt32(16, subChunkSize, true);
        view.setInt16(20, 1, true); // PCM = 1 means data is not compressed
        view.setInt16(22, chanCnt, true);
        view.setInt32(24, sampleRate, true);
        view.setInt32(28, byteRate, true);
        view.setInt16(32, blockAlign, true);
        view.setInt16(34, bitsPerSample, true);
        view.setInt32(36, 0x64617461, false); // data
        view.setInt32(40, sampleValues.length, true);
        for (let i = 0; i < sampleValues.length; ++i) {
            view.setInt16(44 + i * 2, sampleValues[i], true);
        }

        return wavBuf;
    };

    let main = function()
    {
        let view = new Uint8Array(sf2Buf);
        let parser = new sf2.Parser(view);
        parser.parse();
        for (let sampleHeader of parser.sampleHeader) {
            sampleHeader.sampleName = cleanText(sampleHeader.sampleName);
        }
        let sampleBuf = parser.sample[0];
        let sampleInfo = parser.sampleHeader[0];
        let audioCtx = new AudioContext();
        let wavBuf = sf2ToWav(sampleBuf, sampleInfo);

        console.log('Loaded .sf2 file ', parser);
        saveWavToDisc(wavBuf);
        audioCtx.decodeAudioData(wavBuf, (decoded) => {
            console.log('Decoded audio data', decoded);
            let audioSource = audioCtx.createBufferSource();
            audioSource.buffer = decoded;
            audioSource.connect(audioCtx.destination);
            audioSource.start();
        }, console.error);
    };

    return main();
});