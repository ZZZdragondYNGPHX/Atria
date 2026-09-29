import ts from 'typescript';

// JSON is still strict JSON. TypeScript's JSON CST supplies offsets only; the
// formal compiler owns all semantics. Unchanged tokens/trivia stay byte-stable.
export function editJson(source, path, value) {
    JSON.parse(source);
    const tree = ts.parseJsonText('source.json', source);
    const unique = node => {
        if (ts.isObjectLiteralExpression(node) && new Set(node.properties.map(item => item.name.text)).size !== node.properties.length) throw new TypeError('Ambiguous duplicate JSON keys');
        ts.forEachChild(node, unique);
    };
    unique(tree);
    let node = tree.statements[0].expression;
    for (const key of path.slice(0, -1)) {
        node = ts.isArrayLiteralExpression(node) ? node.elements[Number(key)]
            : node.properties?.find(item => item.name?.text === String(key))?.initializer;
        if (!node) throw new TypeError('Unknown semantic JSON path');
    }
    const key = path.at(-1);
    const encode = item => JSON.stringify(item, null, source.includes('\n') ? (source.match(/\n([ \t]+)"/)?.[1] || '  ') : undefined);
    if (!path.length) return replaceSpan(source, node.getStart(tree), node.end, encode(value).replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n'));
    const property = node.properties?.find(item => item.name?.text === String(key));
    const target = ts.isArrayLiteralExpression(node) ? node.elements[Number(key)] : property?.initializer;
    if (target) {
        const start = target.getStart(tree), indent = source.slice(0, start).split('\n').at(-1).match(/^\s*/)[0];
        return source.slice(0, start) + encode(value).replaceAll('\n', (source.includes('\r\n') ? '\r\n' : '\n') + indent) + source.slice(target.end);
    }
    if (!ts.isObjectLiteralExpression(node) || typeof key !== 'string') throw new TypeError('Unknown semantic JSON target');
    const last = node.properties.at(-1), end = last?.end ?? node.end - 1;
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const indent = last ? source.slice(0, last.getStart(tree)).split('\n').at(-1).match(/^[ \t]*/)[0] : '  ';
    const separator = last ? (source.slice(node.getStart(tree), node.end).includes('\n') ? ',' + newline + indent : ', ') : '';
    return replaceSpan(source, end, end, separator + JSON.stringify(key) + ': ' + encode(value).replaceAll('\n', newline + indent));
}

export function replaceSpan(source, start, end, text) { return source.slice(0, start) + text + source.slice(end); }
export function escapeAui(value, quote = '"') {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll(quote, quote === '"' ? '&quot;' : '&apos;');
}

export function editNode(source, span, edit) {
    const raw = source.slice(span.start, span.end);
    const opening = /^<[a-zA-Z][a-zA-Z0-9]*(?:\s+[a-zA-Z][a-zA-Z0-9:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>/.exec(raw)?.[0];
    if (!opening) throw new TypeError('Node opening tag unavailable');
    if (edit.field === 'text') {
        const closing = raw.lastIndexOf('</');
        if (closing < opening.length || /<[^!]|<!--/.test(raw.slice(opening.length, closing))) throw new TypeError('Text edit requires a text-only Node; use source editing for mixed content');
        return replaceSpan(source, span.start + opening.length, span.start + closing, escapeAui(String(edit.value)));
    }
    if (!/^[a-zA-Z][a-zA-Z0-9:-]*$/.test(edit.field) || edit.field === 'node-id') throw new TypeError('Node identity is immutable');
    const attrs = [...opening.matchAll(/\s+([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*("[^"]*"|'[^']*')/g)];
    const attr = attrs.find(item => item[1] === edit.field);
    let next;
    if (attr) {
        const quote = attr[2][0], valueStart = attr.index + attr[0].indexOf(quote);
        next = edit.value === null ? replaceSpan(opening, attr.index, attr.index + attr[0].length, '')
            : replaceSpan(opening, valueStart + 1, valueStart + attr[2].length - 1, escapeAui(String(edit.value), quote));
    } else {
        if (edit.value === null) return source;
        const at = opening.search(/\s*\/?>$/);
        next = replaceSpan(opening, at, at, ' ' + edit.field + '="' + escapeAui(String(edit.value)) + '"');
    }
    return replaceSpan(source, span.start, span.start + opening.length, next);
}
