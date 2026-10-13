const error = code => Object.assign(new Error(code), { code });
export function parseSpeechWav(bytes) {
    if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
        || bytes.readUInt32LE(4) !== bytes.length - 8) throw error('native_speech_audio_invalid');
    let offset = 12, format, dataBytes = 0;
    while (offset + 8 <= bytes.length) {
        const type = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
        if (start + size > bytes.length) throw error('native_speech_audio_invalid');
        if (type === 'fmt ') {
            if (format || size < 16 || bytes.readUInt16LE(start) !== 1) throw error('native_speech_audio_invalid');
            format = { channels: bytes.readUInt16LE(start + 2), sampleRate: bytes.readUInt32LE(start + 4),
                byteRate: bytes.readUInt32LE(start + 8), blockAlign: bytes.readUInt16LE(start + 12), bitsPerSample: bytes.readUInt16LE(start + 14) };
        } else if (type === 'data') {
            if (dataBytes || !size) throw error('native_speech_audio_invalid');
            dataBytes = size;
        }
        offset = start + size + size % 2;
    }
    if (!format || !dataBytes || offset !== bytes.length || format.channels !== 1 || format.sampleRate !== 22050 || format.bitsPerSample !== 16
        || format.blockAlign !== 2 || format.byteRate !== 44100 || dataBytes % format.blockAlign) throw error('native_speech_audio_invalid');
    return { format, dataBytes, durationMs: dataBytes / format.byteRate * 1000 };
}
