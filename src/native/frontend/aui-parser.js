import { FRONTEND_LIMITS, identifier, fields, list } from '../../../public/shared/native-frontend-contract.js';

const TAGS = new Set('div span main section article aside header footer nav p h1 h2 h3 h4 h5 h6 ul ol li button label input textarea select option form fieldset legend table thead tbody tr th td img figure figcaption strong em small br hr component'.split(' '));
const ATTRS = new Set('id class title role aria-label aria-labelledby aria-describedby aria-hidden aria-live tabindex type name value placeholder disabled checked selected multiple required min max step rows cols alt width height for inputmode enterkeyhint autocomplete spellcheck'.split(' '));
const VOID = new Set(['input', 'img', 'br', 'hr']);

export function assertNode(node) {
    fields(node, ['id', 'tag', 'attributes', 'children', 'read', 'action', 'component', 'asset']);
    identifier(node.id);
    if (!TAGS.has(node.tag)) throw new TypeError('Unsupported semantic element: ' + node.tag);
    fields(node.attributes, [...ATTRS], 'DOM attributes');
    if (Object.values(node.attributes).some(value => typeof value !== 'string' || value.length > 4096)) throw new TypeError('Invalid DOM attribute');
    if (node.tag === 'input' && ['file', 'image'].includes(node.attributes.type)) throw new TypeError('Unsupported input type');
    for (const key of ['read', 'action', 'component', 'asset']) if (node[key] !== undefined) identifier(node[key]);
    if ((node.tag === 'component') !== (node.component !== undefined)) throw new TypeError('Invalid Component reference');
    if (node.asset !== undefined && node.tag !== 'img') throw new TypeError('Asset sink requires img');
    if (!Array.isArray(node.children) || (VOID.has(node.tag) && node.children.length)) throw new TypeError('Invalid element children');
    return node;
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
    fields(contract, ['uses'], 'Component contract');
    const uses = list(contract.uses ?? [], identifier, item => item);
    const roots = [], stack = [], ids = new Set();
    const token = /<!--[\s\S]*?-->|<\/[a-z][a-z0-9]*\s*>|<[a-z][a-z0-9]*(?:\s+[a-z][a-z0-9:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>|[^<]+/gy;
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
            const tag = /^<([a-z][a-z0-9]*)/.exec(raw)[1];
            const attrs = Object.create(null);
            for (const attr of raw.matchAll(/([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
                if (Object.hasOwn(attrs, attr[1])) throw new TypeError('Duplicate template attribute');
                attrs[attr[1]] = decode(attr[2] ?? attr[3]);
            }
            const id = identifier(attrs['node-id']); delete attrs['node-id'];
            if (ids.has(id)) throw new TypeError('Duplicate Node identity');
            ids.add(id);
            const node = { id, tag, attributes: {}, children: [] };
            for (const [name, value] of Object.entries(attrs)) {
                const special = { 'read': 'read', 'on:click': 'action', 'ref': 'component', 'asset': 'asset' }[name];
                if (special) node[special] = value;
                else node.attributes[name] = value;
            }
            assertNode(node);
            (stack.at(-1)?.children ?? roots).push(node);
            spans.push({ kind: 'node', id, file, start, end });
            if (node.action) spans.push({ kind: 'interaction', id: id + '.click', file, start, end });
            if (!raw.endsWith('/>') && !VOID.has(tag)) stack.push(node);
        } else {
            if (raw.includes('{{') || raw.includes('${')) throw new TypeError('Expressions require typed bindings; raw evaluation is unsupported');
            if (!stack.length) {
                if (raw.trim()) throw new TypeError('Text outside template root');
            } else stack.at(-1).children.push(decode(raw));
        }
    }
    if (stack.length || roots.length !== 1) throw new TypeError('Template must contain exactly one balanced root');
    const style = blocks.find(block => block.kind === 'style');
    return { cst: { source, blocks }, ast: { root: roots[0], uses }, spans, style };
}
