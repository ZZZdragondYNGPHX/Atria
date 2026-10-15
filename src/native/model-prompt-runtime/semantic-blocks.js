import { hashNativeDocument } from '../repositories/common.js';
import { immutable } from './execution-utils.js';
import { promptError } from './prompt-values.js';

const positions = ['context.before_history', 'context.after_history', 'context.before_input', 'context.after_input'];
const roles = new Set(['system', 'user', 'assistant', 'tool']);

// A request-owned semantic projection, never a new resource/permission store.
// The textual IR fields remain useful to inspectors; both projections must agree.
export function semanticBlocks(ir) {
    const slots = new Map(positions.map(target => [target, []]));
    const make = (kind, target, message, provenance = [], evidence = null, metadata = {}) => ({
        kind, target, message, provenance, evidence, source: metadata.source ?? ir.compilation?.source ?? null,
        ...(metadata.expression ? { expression: metadata.expression } : {}),
        volatility: kind === 'host_policy' ? 'stable' : kind === 'author_instruction' ? 'compiled' : 'request',
    });
    for (const slot of ir.contextSlots) {
        const target = typeof slot === 'string' ? 'context.before_history' : slot.target;
        const content = typeof slot === 'string' ? slot : slot.content;
        if (!slots.has(target) || typeof content !== 'string') promptError('context_slot');
        const author = slot.trust === 'author';
        if (slot.trust !== undefined && !['author', 'evidence'].includes(slot.trust)) promptError('semantic_trust');
        slots.get(target).push(make(author ? 'author_instruction' : 'evidence', target,
            { role: author ? 'system' : 'user', content }, slot.provenance ?? [], slot.evidence ?? null, slot));
    }
    const history = ir.history.map((message, index) => {
        if (!['user', 'assistant', 'tool'].includes(message?.role)) promptError('history_authority');
        const source = ir.compilation?.historySources?.[index];
        return make(message.role === 'tool' ? 'tool_result' : 'dialogue', 'history', message, source?.provenance ?? [], source?.evidence ?? null, source);
    });
    const blocks = [
        ...ir.directives.map((content, index) => {
            const source = ir.compilation?.directiveSources?.[index];
            return make(source?.kind ?? 'author_instruction', 'directive', { role: 'system', content }, source?.provenance ?? ir.provenance, null, source);
        }),
        ...slots.get('context.before_history'), ...history,
        ...slots.get('context.after_history'), ...slots.get('context.before_input'),
        ...(ir.input ? [make('input', 'input', { role: 'user', content: ir.input })] : []),
        ...slots.get('context.after_input'),
        ...ir.responseDirectives.map((content, index) => make('author_instruction', 'response', { role: 'system', content }, ir.compilation?.responseSources?.[index]?.provenance ?? ir.provenance)),
        ...(ir.prefill === undefined ? [] : [make('prefill', 'prefill', { role: 'assistant', content: ir.prefill }, ir.provenance)]),
    ];
    return immutable(blocks.map((block, order) => ({ ...block, order })));
}

export function assertSemanticBlocks(blocks, ir) {
    if (!Array.isArray(blocks) || hashNativeDocument(blocks) !== hashNativeDocument(semanticBlocks(ir))) promptError('semantic_projection');
    for (const block of blocks) {
        if (!roles.has(block.message?.role) || ['evidence', 'tool_result', 'dialogue', 'input'].includes(block.kind) && block.message.role === 'system') promptError('semantic_trust');
    }
    return immutable(blocks);
}
