// Inert projection of canonical text. Every leaf carries an exact source range;
// syntax is consumed by this bounded parser, never by an HTML/Markdown engine.
const sourceMappings = new WeakMap();
export function safeProseLink(value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
    try { const url = new URL(value); return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function compileSafeProse(content) {
    if (typeof content !== 'string' || content.length > 65536) throw new TypeError('Prose text budget exceeded');
    let budget = 0;
    const node = (type, start, end, extra = {}) => {
        if (++budget > 4096) throw new TypeError('Prose node budget exceeded');
        return { type, start, end, ...extra };
    };
    function inline(start, end, depth = 0) {
        if (depth > 8) return [node('text', start, end)];
        const out = [], pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|==([^=\n]+)==|\[([^\]\n]+)\]\(([^)\n]+)\)/g;
        const text = content.slice(start, end); let cursor = 0, match;
        while ((match = pattern.exec(text))) {
            if (match.index > cursor) out.push(node('text', start + cursor, start + match.index));
            const begin = start + match.index, finish = begin + match[0].length;
            const type = match[1] ? 'strong' : match[2] ? 'emphasis' : match[3] ? 'code' : match[4] ? 'mark' : 'link';
            const offset = ['strong', 'mark'].includes(type) ? 2 : 1;
            const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
            const href = type === 'link' ? safeProseLink(match[6]) : null;
            if (type === 'link' && !href) out.push(node('text', begin, finish));
            else out.push(node(type, begin, finish, { children: type === 'code' ? [node('text', begin + offset, begin + offset + value.length)] : inline(begin + offset, begin + offset + value.length, depth + 1), ...(href ? { href } : {}) }));
            cursor = match.index + match[0].length;
        }
        if (cursor < text.length) out.push(node('text', start + cursor, end));
        return out;
    }
    const children = []; let offset = 0, fenced = null;
    for (const line of content.split('\n')) {
        const start = offset, end = start + line.length; offset = end + 1;
        if (/^```/.test(line)) {
            if (fenced !== null) { children.push(node('pre', fenced, end, { children: [node('text', fenced + content.slice(fenced).indexOf('\n') + 1, Math.max(fenced + content.slice(fenced).indexOf('\n') + 1, start - 1))] })); fenced = null; } else fenced = start;
            continue;
        }
        if (fenced !== null) continue;
        const heading = /^(#{1,6}) /.exec(line), quote = /^> /.exec(line), list = /^(?:([-+*]) |(\d+)\. )/.exec(line);
        const prefix = heading?.[0] ?? quote?.[0] ?? list?.[0] ?? '';
        const type = heading ? 'heading' : quote ? 'quote' : list ? 'list' : line ? 'paragraph' : 'break';
        if (list) {
            const item = node('listItem', start, end, { children: inline(start + prefix.length, end) }), previous = children.at(-1);
            if (previous?.type === 'list' && previous.ordered === Boolean(list[2]) && previous.end + 1 === start) { previous.children.push(item); previous.end = end; } else children.push(node('list', start, end, { ordered: Boolean(list[2]), startNumber: Math.min(1000000, Number(list[2] ?? 1)), children: [item] }));
        } else children.push(node(type, start, end, { ...(heading ? { level: heading[1].length } : {}), children: inline(start + prefix.length, end) }));
    }
    if (fenced !== null) children.push(node('paragraph', fenced, content.length, { children: [node('text', fenced, content.length)] }));
    return { version: 1, children };
}
export function assertSafeProse(ast, content) {
    // Exact parser mapping rejects forged ranges, raw nodes, attributes and hrefs.
    const expected = compileSafeProse(content);
    if (JSON.stringify(ast) !== JSON.stringify(expected)) throw new TypeError('Prose mapping differs from canonical text');
    return expected;
}
export function renderSafeProse(root, content, { ast = compileSafeProse(content), openExternal } = {}) {
    const safe = assertSafeProse(ast, content), doc = root.ownerDocument;
    const leaves = new WeakMap();
    const tags = { paragraph: 'p', listItem: 'li', break: 'br', emphasis: 'em', strong: 'strong', quote: 'blockquote', code: 'code', pre: 'pre', mark: 'mark', link: 'a' };
    function render(item) {
        if (item.type === 'text') {
            const leaf = doc.createTextNode(content.slice(item.start, item.end));
            leaves.set(leaf, { start: item.start, end: item.end });
            return leaf;
        }
        const element = doc.createElement(item.type === 'heading' ? 'h' + item.level : item.type === 'list' ? item.ordered ? 'ol' : 'ul' : tags[item.type]);
        element.dataset.atriaProseStart = String(item.start);
        element.dataset.atriaProseEnd = String(item.end);
        const target = element;
        if (item.type === 'list' && item.ordered) element.start = item.startNumber;
        if (item.type === 'link') {
            element.setAttribute('role', 'link'); element.tabIndex = 0;
            const follow = event => { event.preventDefault(); if (safeProseLink(item.href)) openExternal?.(item.href); };
            element.addEventListener('click', follow);
            element.addEventListener('keydown', event => { if (event.key === 'Enter') follow(event); });
        }
        for (const child of item.children ?? []) target.append(render(child));
        return element;
    }
    root.replaceChildren(...safe.children.map(render));
    sourceMappings.set(root, { content, leaves });
}

// Selection is mapped to canonical text, including syntax between selected leaves.
// Figures and other Host decorations have no canonical mapping.
export function canonicalProseSelection(root, range) {
    const mapping = sourceMappings.get(root);
    if (!mapping || !range || range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const walker = root.ownerDocument.createTreeWalker(root, 4);
    let leaf, start = null, end = null;
    while ((leaf = walker.nextNode())) {
        const source = mapping.leaves.get(leaf);
        if (!source || !range.intersectsNode(leaf)) continue;
        const from = range.startContainer === leaf ? range.startOffset : 0;
        const to = range.endContainer === leaf ? range.endOffset : leaf.length;
        if (to <= from) continue;
        start ??= source.start + from;
        end = source.start + to;
    }
    return start === null ? null : { start, end, quote: mapping.content.slice(start, end) };
}

// Stable highlight ranges over existing text leaves; no wrapping/replacing prose.
export function canonicalProseRanges(root, start, end) {
    const mapping = sourceMappings.get(root), ranges = [];
    if (!mapping) return ranges;
    const walker = root.ownerDocument.createTreeWalker(root, 4);
    let leaf;
    while ((leaf = walker.nextNode())) {
        const source = mapping.leaves.get(leaf);
        if (!source || source.end <= start || source.start >= end) continue;
        const range = root.ownerDocument.createRange();
        range.setStart(leaf, Math.max(start, source.start) - source.start);
        range.setEnd(leaf, Math.min(end, source.end) - source.start);
        ranges.push(range);
    }
    return ranges;
}
