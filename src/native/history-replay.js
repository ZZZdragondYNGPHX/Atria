import { createHash } from 'node:crypto';
import { HISTORY_REPLAY_NODE_NAMESPACE as NS, HISTORY_REPLAY_LEAF_SIZE, assertHistoryReplayNode, assertHistoryReplayRoot } from '../../public/shared/native-history-replay.js';
import { hashNativeDocument, putImmutable } from './repositories/common.js';
import { readCheckedDocument } from './session-snapshot.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';

const key = (handle, sessionId, head) => ({ kind: K.sessionState, handle, sessionId, namespace: NS, head });
const signature = invocationId => createHash('sha256').update(invocationId).digest('hex');

export async function hasHistoryReplay(tx, handle, sessionId, root, invocationId) {
    if (!root) return false;
    assertHistoryReplayRoot(root);
    const digest = signature(invocationId);
    async function contains(head, digest) {
        let prefix = '';
        while (head) {
            const node = assertHistoryReplayNode(await readCheckedDocument(tx, key(handle, sessionId, head)), prefix);
            if (node.keys) return node.keys.includes(digest);
            const digit = digest[prefix.length]; head = node.children[digit]; prefix += digit;
        }
        return false;
    }
    return await contains(root.head, digest) || Boolean(root.legacy && await contains(root.legacy.head, digest.slice(0, 16).padEnd(64, '0')));
}

// A persistent hash trie lives in the existing immutable Session state store.
// Checkpoints rewrite only touched paths; old roots remain valid for Save/rewind.
export async function appendHistoryReplay(tx, handle, sessionId, previous, invocationIds, legacyChunks = []) {
    if (!invocationIds.length) return previous;
    if (previous) assertHistoryReplayRoot(previous);
    const store = async node => {
        const head = hashNativeDocument(node); await putImmutable(tx, key(handle, sessionId, head), node);
        return { head, count: node.count };
    };
    async function append(head, prefix, additions) {
        const old = head ? assertHistoryReplayNode(await readCheckedDocument(tx, key(handle, sessionId, head)), prefix) : null;
        if (!old || old.keys) {
            const keys = [...new Set([...(old?.keys ?? []), ...additions])].sort();
            if (old && keys.length === old.count) return { head, count: old.count };
            if (keys.length <= HISTORY_REPLAY_LEAF_SIZE) return store({ schemaVersion: 1, prefix, count: keys.length, keys });
            additions = keys;
        }
        const groups = new Map();
        for (const digest of additions) { const digit = digest[prefix.length]; if (!groups.has(digit)) groups.set(digit, []); groups.get(digit).push(digest); }
        const children = { ...old?.children }; let count = old?.children ? old.count : 0;
        for (const [digit, keys] of groups) {
            const prior = children[digit] ? assertHistoryReplayNode(await readCheckedDocument(tx, key(handle, sessionId, children[digit])), prefix + digit) : null;
            const next = await append(children[digit], prefix + digit, keys);
            children[digit] = next.head; count += next.count - (prior?.count ?? 0);
        }
        return store({ schemaVersion: 1, prefix, count, children });
    }
    let legacy = previous?.legacy;
    if (legacyChunks.length) {
        const keys = [];
        for (const chunk of legacyChunks) {
            if (typeof chunk !== 'string' || chunk.length % 16 || !/^[a-f0-9]*$/.test(chunk)) throw new TypeError('Invalid legacy History replay keys');
            for (let at = 0; at < chunk.length; at += 16) keys.push(chunk.slice(at, at + 16).padEnd(64, '0'));
        }
        if (keys.length) legacy = await append(legacy?.head, '', keys);
    }
    return { schemaVersion: 1, ...await append(previous?.head, '', [...new Set(invocationIds.map(signature))]), ...(legacy ? { legacy } : {}) };
}

export async function collectHistoryReplay(root, readNode, collected = new Map()) {
    assertHistoryReplayRoot(root); const nodes = new Map();
    async function visit(head, prefix) {
        if (collected.has(head)) {
            if (collected.get(head) !== prefix) throw new TypeError('History replay node reused');
            return;
        }
        const node = assertHistoryReplayNode(await readNode(head), prefix); nodes.set(head, node);
        collected.set(head, prefix);
        for (const [digit, child] of Object.entries(node.children ?? {})) await visit(child, prefix + digit);
    }
    await visit(root.head, '');
    if (root.legacy) await visit(root.legacy.head, '');
    return nodes;
}
