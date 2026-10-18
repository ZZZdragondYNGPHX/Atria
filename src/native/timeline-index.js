import { TIMELINE_INDEX_NAMESPACE as NS, TIMELINE_INDEX_POLICY as POLICY, assertTimelineRoot, assertTimelineNode } from '../../public/shared/native-timeline-index.js';
import { hashNativeDocument, putImmutable } from './repositories/common.js';
import { readCheckedDocument } from './session-snapshot.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';

const key = (handle, sessionId, head) => ({ kind: K.sessionState, handle, sessionId, namespace: NS, head });
async function store(tx, handle, sessionId, node) {
    const head = hashNativeDocument(node); await putImmutable(tx, key(handle, sessionId, head), node);
    return { head, length: node.length };
}
export async function appendTimelineIndex(tx, handle, sessionId, previous, additions) {
    const root = previous ? structuredClone(assertTimelineRoot(previous)) : { schemaVersion: 2, length: 0, sealedLength: 0, tree: null, tail: [] };
    const appendNode = async (ref, level, leaf) => {
        if (level === 0) return [ref, leaf];
        const node = assertTimelineNode(await readCheckedDocument(tx, key(handle, sessionId, ref.head)), level);
        const children = [...node.children.slice(0, -1), ...await appendNode(node.children.at(-1), level - 1, leaf)];
        const chunks = [children.slice(0, POLICY.fanout), children.slice(POLICY.fanout)].filter(items => items.length);
        const result = [];
        for (const group of chunks) result.push(await store(tx, handle, sessionId, { schemaVersion: 1, level, length: group.reduce((n, item) => n + item.length, 0), children: group }));
        return result;
    };
    const seal = async () => {
        if (!root.tail.length) return;
        const leaf = await store(tx, handle, sessionId, { schemaVersion: 1, level: 0, length: root.tail.length, entries: root.tail });
        if (!root.tree) root.tree = { ...leaf, level: 0 };
        else {
            const refs = await appendNode(root.tree, root.tree.level, leaf);
            if (refs.length === 1) root.tree = { ...refs[0], level: root.tree.level };
            else root.tree = { ...await store(tx, handle, sessionId, { schemaVersion: 1, level: root.tree.level + 1,
                length: refs.reduce((n, item) => n + item.length, 0), children: refs }), level: root.tree.level + 1 };
        }
        root.sealedLength += root.tail.length; root.tail = [];
    };
    for (const selection of additions) {
        const nextBytes = Buffer.byteLength(JSON.stringify([...root.tail, selection]));
        if (root.tail.length && (root.tail.length >= POLICY.tailEntries || nextBytes > POLICY.tailBytes)) await seal();
        root.tail.push(selection); root.length++;
    }
    return assertTimelineRoot(root);
}

export async function readTimelineIndex(tx, handle, sessionId, value, from = 0, to = value.length) {
    const root = assertTimelineRoot(value), entries = [];
    const visit = async (ref, level, start, ancestors = new Set()) => {
        if (start >= to || start + ref.length <= from) return;
        if (ancestors.has(ref.head)) throw new TypeError('Timeline index cycle');
        const node = assertTimelineNode(await readCheckedDocument(tx, key(handle, sessionId, ref.head)), level);
        if (node.length !== ref.length) throw new TypeError('Timeline index length mismatch');
        if (level === 0) entries.push(...node.entries.slice(Math.max(0, from - start), Math.min(node.length, to - start)));
        else for (const child of node.children) { await visit(child, level - 1, start, new Set(ancestors).add(ref.head)); start += child.length; }
    };
    if (root.tree) await visit({ ...root.tree, length: root.sealedLength }, root.tree.level, 0);
    entries.push(...root.tail.slice(Math.max(0, from - root.sealedLength), Math.max(0, to - root.sealedLength)));
    return entries;
}

export async function timelineIndexClosure(root, readNode) {
    assertTimelineRoot(root); const nodes = new Map();
    const visit = async (head, level) => {
        if (nodes.has(head)) return;
        const node = assertTimelineNode(await readNode(head), level);
        nodes.set(head, node);
        if (level) for (const child of node.children) await visit(child.head, level - 1);
    };
    if (root.tree) await visit(root.tree.head, root.tree.level);
    return nodes;
}
