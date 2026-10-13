// Current dev format only. No reader for the retired whole-array format.
export const TIMELINE_INDEX_NAMESPACE = 'atri_timeline_index';
export const TIMELINE_INDEX_POLICY = Object.freeze({ tailEntries: 64, tailBytes: 16384, fanout: 8 });
export function assertTimelineRoot(root) {
    if (root?.schemaVersion !== 2 || !Number.isSafeInteger(root.length) || root.length < 0
        || !Array.isArray(root.tail) || root.tail.length > TIMELINE_INDEX_POLICY.tailEntries
        || !Number.isSafeInteger(root.sealedLength) || root.sealedLength < 0
        || root.sealedLength + root.tail.length !== root.length || Boolean(root.tree) !== Boolean(root.sealedLength)
        || (root.tree && (typeof root.tree.head !== 'string' || !Number.isSafeInteger(root.tree.level) || root.tree.level < 0))) {
        throw new TypeError('Unsupported or invalid Native Timeline index');
    }
    return root;
}
export function assertTimelineNode(node, level) {
    if (node?.schemaVersion !== 1 || node.level !== level || !Number.isSafeInteger(node.length) || node.length < 1
        || (level === 0 ? !Array.isArray(node.entries) || node.entries.length !== node.length
            : !Array.isArray(node.children) || !node.children.length || node.children.length > TIMELINE_INDEX_POLICY.fanout
                || node.children.some(child => typeof child.head !== 'string' || !Number.isSafeInteger(child.length) || child.length < 1)
                || node.children.reduce((n, child) => n + child.length, 0) !== node.length)) throw new TypeError('Invalid Timeline index node');
    return node;
}
export function timelineSelections(root, readNode) {
    assertTimelineRoot(root);
    const visit = (ref, level, seen) => {
        if (seen.has(ref.head)) throw new TypeError('Timeline index cycle');
        const next = new Set(seen).add(ref.head), node = assertTimelineNode(readNode(ref.head), level);
        if (node.length !== ref.length) throw new TypeError('Timeline index length mismatch');
        return level === 0 ? node.entries : node.children.flatMap(child => visit(child, level - 1, next));
    };
    const entries = root.tree ? visit({ ...root.tree, length: root.sealedLength }, root.tree.level, new Set()) : [];
    return [...entries, ...root.tail];
}
