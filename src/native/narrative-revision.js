export function assertNarrativeRevision(value) {
    if (value === undefined || value === null) return null;
    if (!value || !['replace', 'continue'].includes(value.mode) || typeof value.text !== 'string' || !value.text.trim()
        || value.text.length > 1024 * 1024 || typeof (value.prompt ?? '') !== 'string' || (value.prompt?.length ?? 0) > 65536
        || Object.keys(value).some(key => !['mode', 'text', 'prompt'].includes(key))) throw new TypeError('Invalid narrative revision');
    return value;
}

export function narrativeRevisionMessages(value) {
    const revision = assertNarrativeRevision(value);
    return revision?.mode === 'continue' ? [{ role: 'user', content:
        'Continue the draft below. Return the complete narrative, preserving the existing narrative and adding its continuation. Keep the required output format.\n'
        + revision.text + '\n' + (revision.prompt ?? '') }] : [];
}

// A continuation may add to the accepted draft; it cannot silently replace it.
// Keep authored supplemental nodes when the model omits them from its answer.
export function preserveNarrativeContinuation(revision, text, { content = false, envelope = false } = {}) {
    if (revision?.mode !== 'continue') return text;
    const join = (before, after) => after.startsWith(before) ? after : before + '\n\n' + after;
    if (!content && !envelope) return join(revision.text, text);
    // Replies are often wrapped in a ```json fence, which the content decoder accepts.
    // Parsing must accept it too, or the accepted original would be silently dropped.
    const unfence = value => String(value).trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
    let next, before;
    try { next = JSON.parse(unfence(text)); before = content ? JSON.parse(unfence(revision.text)) : null; } catch { return text; }
    if (content) {
        if (!Array.isArray(before.flow) || !Array.isArray(next.flow)) return text;
        const original = before.flow.filter(node => node.kind === 'prose').map(node => node.text).join('\n\n');
        const generated = next.flow.filter(node => node.kind === 'prose').map(node => node.text).join('\n\n');
        if (generated.startsWith(original)) {
            const blocks = new Set(next.flow.filter(node => node.kind === 'block').map(node => node.type));
            next.flow.push(...before.flow.filter(node => node.kind === 'block' && !blocks.has(node.type)));
        } else {
            const originals = new Set(before.flow.filter(node => node.kind === 'block').map(node => JSON.stringify(node)));
            next.flow = [...before.flow, ...next.flow.filter(node => !originals.has(JSON.stringify(node)))];
        }
    } else if (typeof next.narrative === 'string' && !next.narrative.startsWith(revision.text)) {
        next.narrative = join(revision.text, next.narrative);
        if (Array.isArray(next.projection?.flow)) next.projection.flow.unshift({ kind: 'prose', text: revision.text + '\n\n' });
    }
    return JSON.stringify(next);
}
