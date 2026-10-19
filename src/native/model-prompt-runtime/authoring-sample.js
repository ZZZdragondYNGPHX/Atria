import { fields, assertJsonDeclaration } from '../../../public/shared/native-values.js';
import { assertComputeBudget, bindComputeBudget } from '../../../public/shared/native-compute-budget.js';
import { hashNativeDocument } from '../repositories/common.js';
import { immutable, effectiveOutputReserve } from './execution-utils.js';

export function captureAuthoringSample(value) {
    const sample = assertJsonDeclaration(value, 'Author sample', 524288);
    fields(sample, ['input', 'history', 'materials', 'persona'], 'Author sample');
    const text = value => { if (typeof value !== 'string') throw new TypeError('Author sample text required'); return value; };
    if (sample.history !== undefined && !Array.isArray(sample.history) || sample.materials !== undefined && !Array.isArray(sample.materials)) throw new TypeError('Author sample lists required');
    return immutable({ input: text(sample.input ?? ''), persona: text(sample.persona ?? ''), materials: (sample.materials ?? []).map(text),
        history: (sample.history ?? []).map(message => {
            fields(message, ['role', 'content'], 'Author sample history');
            if (!['user', 'assistant'].includes(message.role)) throw new TypeError('Author sample history requires user or assistant');
            return { role: message.role, content: text(message.content) };
        }) });
}

export function authoringSamplePlan(request, resolved, sample) {
    const provenance = [{ source: 'author.sample', ref: hashNativeDocument(sample) }];
    const reservedOutputTokens = effectiveOutputReserve(resolved);
    return { schemaVersion: 1, requestId: request.requestId, source: { kind: 'authoring', sampleId: hashNativeDocument(sample) },
        items: [...sample.materials.map((content, index) => ({ kind: 'context.fact', id: 'sample.material.' + index, content, provenance })),
            ...(sample.persona ? [{ kind: 'context.player-persona', id: 'sample.persona', content: sample.persona, provenance }] : []),
            ...sample.history.map((content, index) => ({ kind: 'context.history', id: 'sample.history.' + index, content, provenance })),
            { kind: 'context.input', id: 'sample.input', content: sample.input, provenance }], provenance,
        budget: { maxTokens: resolved.model.limits.contextTokens - reservedOutputTokens, reservedOutputTokens } };
}

// This holder belongs to one original Scheduler operation; Compute retains the
// same admission/usage rules as other native sources, without creating a Session.
export function createAuthoringRun(limits) {
    const holder = {};
    bindComputeBudget(holder, assertComputeBudget(limits));
    return holder;
}
