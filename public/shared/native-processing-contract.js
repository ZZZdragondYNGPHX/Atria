import { fields, assertJsonDeclaration } from './native-values.js';
import { resourcePath } from './native-frontend-contract.js';
import { taskId } from './native-task-contract.js';

export const PROCESSING_LIMITS = Object.freeze({ text: 65536, total: 262144, processors: 32 });
export function processingText(text) {
    if (typeof text !== 'string' || text.length > PROCESSING_LIMITS.text) throw new TypeError('Processing text limit');
    return text;
}
export function assertProcessingRuntime(raw) {
    const value = assertJsonDeclaration(raw, 'Processing', PROCESSING_LIMITS.total);
    fields(value, ['schemaVersion', 'processors'], 'Processing runtime');
    if (value.schemaVersion !== 1 || !Array.isArray(value.processors) || value.processors.length > PROCESSING_LIMITS.processors) throw new TypeError('Processing runtime limit/version');
    const ids = new Set();
    for (const item of value.processors) {
        fields(item, ['id', 'stage', 'kind', 'find', 'replacement', 'source'], 'Processor');
        taskId(item.id);
        if (ids.has(item.id)) throw new TypeError('Duplicate Processor'); ids.add(item.id);
        if (!['output', 'context', 'presentation'].includes(item.stage)) throw new TypeError('Unknown Processing stage');
        if (item.kind === 'replace') {
            fields(item, ['id', 'stage', 'kind', 'find', 'replacement'], 'Replace Processor');
            if (!processingText(item.find)) throw new TypeError('Replace Processor requires nonempty literal');
            processingText(item.replacement);
        } else if (item.kind === 'trim') fields(item, ['id', 'stage', 'kind'], 'Trim Processor');
        else if (item.kind === 'script') {
            fields(item, ['id', 'stage', 'kind', 'source'], 'Script Processor');
            resourcePath(item.source);
            if (item.stage === 'presentation') throw new TypeError('Presentation Processing requires data-only transforms');
        } else throw new TypeError('Unknown Processor kind');
    }
    return value;
}
export function transformProcessingText(item, raw) {
    const text = processingText(raw);
    if (item.kind === 'trim') return text.trim();
    if (item.kind !== 'replace') throw new TypeError('Processing host required');
    const parts = text.split(item.find);
    // Check expanded length before allocating a potentially huge replacement.
    if (text.length + (parts.length - 1) * (item.replacement.length - item.find.length) > PROCESSING_LIMITS.text) throw new TypeError('Processing text limit');
    return processingText(parts.join(item.replacement));
}
export function presentationText(runtime, raw) {
    let total = raw.length;
    return (runtime?.processors ?? []).filter(item => item.stage === 'presentation').reduce((text, item) => {
        const transformed = transformProcessingText(item, text); total += transformed.length;
        if (total > PROCESSING_LIMITS.total) throw new TypeError('Presentation Processing cumulative limit');
        return transformed;
    }, raw);
}
