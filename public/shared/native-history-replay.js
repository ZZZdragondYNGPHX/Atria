export const HISTORY_REPLAY_NAMESPACE = 'atri_history_replay';
export const HISTORY_REPLAY_NODE_NAMESPACE = 'atri_history_replay_node';
export const HISTORY_REPLAY_LEAF_SIZE = 256;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function assertHistoryReplayRoot(root) {
    if (root?.schemaVersion !== 1 || !Number.isSafeInteger(root.count) || root.count < 1 || !hash(root.head)) throw new TypeError('Invalid History replay root');
    if (root.legacy && (!hash(root.legacy.head) || !Number.isSafeInteger(root.legacy.count) || root.legacy.count < 1)) throw new TypeError('Invalid legacy History replay root');
    return root;
}
export function assertHistoryReplayNode(node, prefix) {
    if (node?.schemaVersion !== 1 || node.prefix !== prefix || prefix.length > 64
        || !Number.isSafeInteger(node.count) || node.count < 1) throw new TypeError('Invalid History replay node');
    if (node.keys) {
        if (!Array.isArray(node.keys) || node.keys.length !== node.count || node.count > HISTORY_REPLAY_LEAF_SIZE || node.children
            || node.keys.some((key, i) => !hash(key) || !key.startsWith(prefix) || i > 0 && key <= node.keys[i - 1])) throw new TypeError('Invalid History replay leaf');
    } else if (prefix.length >= 64 || !node.children || Array.isArray(node.children) || typeof node.children !== 'object'
        || !Object.keys(node.children).length || Object.entries(node.children).some(([digit, head]) => !/^[a-f0-9]$/.test(digit) || !hash(head))) throw new TypeError('Invalid History replay branch');
    return node;
}

// Used at the external save boundary, not on each lookup. Routing prefixes
// prove disjoint leaves; counts also detect incomplete imported closures.
export function historyReplayClosure(root, readNode, validated = new Map()) {
    assertHistoryReplayRoot(root);
    const heads = new Set();
    function visit(head, prefix) {
        const known = validated.get(head);
        if (known) { if (known.prefix !== prefix) throw new TypeError('History replay node reused'); return known.count; }
        const node = assertHistoryReplayNode(readNode(head), prefix);
        if (node.children && Object.entries(node.children).reduce((n, [digit, child]) => n + visit(child, prefix + digit), 0) !== node.count) throw new TypeError('History replay count mismatch');
        validated.set(head, { prefix, count: node.count }); heads.add(head);
        return node.count;
    }
    if (visit(root.head, '') !== root.count) throw new TypeError('History replay root count mismatch');
    if (root.legacy && visit(root.legacy.head, '') !== root.legacy.count) throw new TypeError('Legacy History replay count mismatch');
    return heads;
}
