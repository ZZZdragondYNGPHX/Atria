import { hashNativeDocument } from '../repositories/common.js';
import { immutable } from './execution-utils.js';
import { promptError } from './prompt-values.js';
import { PROMPT_TARGETS } from '../../../public/shared/prompt-module-order.js';

const roles = new Set(['system', 'user', 'assistant', 'tool']);

// A request-owned semantic projection, never a new resource/permission store.
// The textual IR fields remain useful to inspectors; both projections must agree.
export function semanticBlocks(ir) {
    const slots = new Map(PROMPT_TARGETS.map(target => [target, []]));
    const make = (kind, target, message, provenance = [], evidence = null, metadata = {}) => ({
        kind, target, message, provenance, evidence, source: metadata.source ?? ir.compilation?.source ?? null,
        ...(metadata.expression ? { expression: metadata.expression } : {}),
        ...(metadata.anchorId ? { anchorId: metadata.anchorId, stageId: metadata.stageId } : {}),
        volatility: kind === 'host_policy' ? 'stable' : kind === 'author_instruction' ? 'compiled' : 'request',
    });
    for (const slot of ir.contextSlots) {
        const target = typeof slot === 'string' ? 'context.before_history' : slot.target;
        const content = typeof slot === 'string' ? slot : slot.content;
        if (!slots.has(target) || typeof content !== 'string') promptError('context_slot');
        const author = slot.trust === 'author';
        if (slot.trust !== undefined && !['author', 'evidence'].includes(slot.trust)) promptError('semantic_trust');
        const message = slot.message ?? { role: author ? 'system' : 'user', content };
        if (!roles.has(message.role) || message.role === 'system' && !author && slot.kind !== 'host_policy') promptError('semantic_trust');
        slots.get(target).push({ block: make(author ? 'author_instruction' : slot.kind ?? 'evidence', target,
            message, slot.provenance ?? [], slot.evidence ?? null, slot), position: slot.order ?? -1 });
    }
    const history = ir.history.map((message, index) => {
        if (!['user', 'assistant', 'tool'].includes(message?.role)) promptError('history_authority');
        const source = ir.compilation?.historySources?.[index];
        return make(message.role === 'tool' ? 'tool_result' : 'dialogue', 'history', message, source?.provenance ?? [], source?.evidence ?? null, source);
    });
    const slotBlocks = target => slots.get(target).map(entry => entry.block);
    const leading = ir.directives.map((content, index) => {
        const source = ir.compilation?.directiveSources?.[index];
        return { block: make(source?.kind ?? 'author_instruction', 'directive', { role: 'system', content }, source?.provenance ?? ir.provenance, null, source),
            target: source?.target ?? 'system.foundation', position: source?.order ?? index };
    });
    for (const target of PROMPT_TARGETS.filter(target => target.startsWith('system.') || target.startsWith('agent.'))) {
        leading.push(...slots.get(target).map(entry => ({ ...entry, target })));
    }
    leading.sort((a, b) => PROMPT_TARGETS.indexOf(a.target) - PROMPT_TARGETS.indexOf(b.target) || a.position - b.position);
    const responses = ir.responseDirectives.map((content, index) => ({ block: make('author_instruction', 'response', { role: 'system', content }, ir.compilation?.responseSources?.[index]?.provenance ?? ir.provenance),
        position: ir.compilation?.responseSources?.[index]?.order ?? -1 }));
    responses.push(...slots.get('response.post_history'));
    responses.sort((a, b) => a.position - b.position);
    const blocks = [
        ...leading.map(entry => entry.block),
        ...slotBlocks('context.before_history'), ...history,
        ...slotBlocks('context.after_history'), ...slotBlocks('context.before_input'),
        ...(ir.input ? [make('input', 'input', { role: 'user', content: ir.input })] : []),
        ...slotBlocks('context.after_input'),
        ...responses.map(entry => entry.block),
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
