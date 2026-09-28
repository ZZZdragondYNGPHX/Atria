import { FRONTEND_LIMITS, identifier, fields, list } from '../../../public/shared/native-frontend-contract.js';
import { assertPresentationNode, assertPresentationContract, VOID_TAGS } from '../../../public/shared/native-frontend-presentation.js';

export function assertNode(node) {
    return assertPresentationNode(node);
}

function decode(text) {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };
    if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(text)) throw new TypeError('Unsupported entity');
    return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, key) => entities[key]);
}

// CST keeps the exact source (including trivia) and offsets. Semantic identities
// are explicit, so whitespace edits never change Component/Node/Interaction IDs.
export function parseAui(source, file) {
    if (typeof source !== 'string' || Buffer.byteLength(source) > FRONTEND_LIMITS.bytes) throw new TypeError('AUI source exceeds limits');
    const spans = [];
    const blocks = [];
    const blockPattern = /\s+|<!--[\s\S]*?-->|<(template|style|contract)>([\s\S]*?)<\/\1>/gy;
    let offset = 0;
    while (offset < source.length) {
        blockPattern.lastIndex = offset;
        const match = blockPattern.exec(source);
        if (!match) throw new TypeError(file + ':' + offset + ': Invalid AUI block');
        if (match[1]) {
            if (blocks.some(block => block.kind === match[1])) throw new TypeError('Duplicate AUI block');
            blocks.push({ kind: match[1], start: offset, end: blockPattern.lastIndex, contentStart: offset + match[1].length + 2, content: match[2] });
        }
        offset = blockPattern.lastIndex;
    }
    const template = blocks.find(block => block.kind === 'template');
    if (!template) throw new TypeError('AUI requires template');
    const contractBlock = blocks.find(block => block.kind === 'contract');
    const contract = contractBlock ? JSON.parse(contractBlock.content) : {};
    fields(contract, ['uses', 'props', 'emits', 'slots', 'state', 'interactions', 'lifecycle', 'nodeRefs', 'dynamicStyles'], 'Component contract');
    const uses = list(contract.uses ?? [], identifier, item => item);
    const { uses: _uses, ...presentationSource } = contract;
    const presentation = assertPresentationContract(presentationSource);
    const roots = [], stack = [], ids = new Set();
    const token = /<!--[\s\S]*?-->|<\/[a-zA-Z][a-zA-Z0-9]*\s*>|<[a-zA-Z][a-zA-Z0-9]*(?:\s+[a-zA-Z][a-zA-Z0-9:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>|[^<]+/gy;
    offset = 0;
    let count = 0;
    while (offset < template.content.length) {
        token.lastIndex = offset;
        const match = token.exec(template.content);
        if (!match) throw new TypeError(file + ':' + (template.contentStart + offset) + ': Invalid template token');
        const raw = match[0], start = template.contentStart + offset, end = template.contentStart + token.lastIndex;
        offset = token.lastIndex;
        if (raw.startsWith('<!--')) continue;
        if (raw.startsWith('</')) {
            const open = stack.pop();
            if (!open || open.tag !== raw.slice(2, -1).trim()) throw new TypeError('Unbalanced template element');
            spans.find(span => span.kind === 'node' && span.id === open.id).end = end;
        } else if (raw.startsWith('<')) {
            if (++count > FRONTEND_LIMITS.nodes || stack.length >= FRONTEND_LIMITS.depth) throw new TypeError('Template exceeds limits');
            const tag = /^<([a-zA-Z][a-zA-Z0-9]*)/.exec(raw)[1];
            const attrs = Object.create(null);
            for (const attr of raw.matchAll(/([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
                if (Object.hasOwn(attrs, attr[1])) throw new TypeError('Duplicate template attribute');
                attrs[attr[1]] = decode(attr[2] ?? attr[3]);
            }
            const id = identifier(attrs['node-id']); delete attrs['node-id'];
            if (ids.has(id)) throw new TypeError('Duplicate Node identity');
            ids.add(id);
            const node = { id, tag, attributes: {}, children: [] };
            for (const [name, value] of Object.entries(attrs)) {
                if (name.startsWith('on:')) {
                    if (name === 'on:click' && !Object.hasOwn(presentation.interactions, value) && tag !== 'component') node.action = value;
                    else (node.events ??= {})[name.slice(3)] = value;
                    continue;
                }
                const group = { bind: 'bindings', prop: 'props', style: 'styles' }[name.split(':')[0]];
                if (group && name.includes(':')) { (node[group] ??= {})[name.split(':')[1]] = { get: value }; continue; }
                if (name === 'if') { node.condition = { get: value }; continue; }
                if (name === 'each') { node.each = { get: value }; continue; }
                if (name === 'item-key') { node.key = value; continue; }
                if (name === 'window-size') { node.windowSize = Number(value); continue; }
                if (name === 'row-height') { node.rowHeight = Number(value); continue; }
                const special = { read: 'read', ref: 'component', asset: 'asset', 'slot-name': 'slot' }[name];
                if (special) node[special] = value;
                else node.attributes[name] = value;
            }
            assertNode(node);
            (stack.at(-1)?.children ?? roots).push(node);
            spans.push({ kind: 'node', id, file, start, end });
            if (node.action) spans.push({ kind: 'interaction', id: id + '.click', file, start, end });
            for (const event of Object.keys(node.events ?? {})) spans.push({ kind: 'interaction', id: id + '.' + event, file, start, end });
            if (!raw.endsWith('/>') && !VOID_TAGS.has(tag)) stack.push(node);
        } else {
            if (raw.includes('{{') || raw.includes('${')) throw new TypeError('Expressions require typed bindings; raw evaluation is unsupported');
            if (!stack.length) {
                if (raw.trim()) throw new TypeError('Text outside template root');
            } else stack.at(-1).children.push(decode(raw));
        }
    }
    if (stack.length || roots.length !== 1) throw new TypeError('Template must contain exactly one balanced root');
    const style = blocks.find(block => block.kind === 'style');
    return { cst: { source, blocks }, ast: { root: roots[0], uses, presentation }, spans, style };
}
