import { ConflictError } from '../errors.js';
import { hashNativeDocument as hash } from '../../native/repositories/common.js';
import { sourceMessageId } from '../../../public/scripts/agents/memory/source-provenance.js';

const reserved = message => message?.extra?.atri_output !== undefined || String(message?.extra?.gen_id ?? '').startsWith('native-output:');

/** User edits preserve existing proof fields; deletion leaves the control WAL intact. */
export function preserveNativeOutputMarkers(before, after) {
    if (!Array.isArray(after)) return after;
    const originals = (before ?? []).filter(message => reserved(message)), used = new Set();
    return after.map((message, index) => {
        const original = originals.find(old => sourceMessageId(old) && sourceMessageId(old) === sourceMessageId(message)
            || old.extra?.gen_id && old.extra.gen_id === message?.extra?.gen_id)
            ?? ((before ?? []).length === after.length && reserved(before?.[index]) ? before[index] : null);
        if (!original) {
            if (reserved(message)) throw new ConflictError('native_rp_output_marker_protected');
            return message;
        }
        const marker = original.extra.atri_output, outputKey = marker?.outputKey;
        if (!outputKey || used.has(outputKey) || message?.extra?.atri_output !== undefined && hash(message.extra.atri_output) !== hash(marker)
            || message?.extra?.gen_id !== undefined && message.extra.gen_id !== original.extra.gen_id)
            throw new ConflictError('native_rp_output_marker_protected');
        used.add(outputKey);
        return { ...message, memory_os_source_id: original.memory_os_source_id,
            extra: { ...(message.extra ?? {}), gen_id: original.extra.gen_id, atri_output: structuredClone(marker) } };
    });
}

export function rejectNativeOutputMarkers(messages) {
    if ((messages ?? []).some(reserved)) throw new ConflictError('native_rp_output_marker_protected');
}
