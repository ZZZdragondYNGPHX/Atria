import { NATIVE_RESOURCE_KINDS as K, assertBranch, assertSessionRevision, assertTimelineEntry, assertVariant } from './contracts.js';
import { assertNativeId } from './identity.js';
import { hashNativeDocument } from './repositories/common.js';
import { NotFoundError } from '../storage/errors.js';

export const SESSION_CORE_NAMESPACE = 'atri_session_core';
export const TIMELINE_NAMESPACE = 'atri_timeline';
export const KNOWLEDGE_NAMESPACE = 'atri_knowledge';
export const RESERVED_SESSION_NAMESPACES = Object.freeze([
    SESSION_CORE_NAMESPACE, TIMELINE_NAMESPACE, KNOWLEDGE_NAMESPACE, 'atri_world_selection', 'atri_action_receipts', 'atri_task_results',
]);

export async function readCheckedDocument(tx, key) {
    const record = await tx.getResource(key);
    if (!record) throw new NotFoundError('native session dependency', { key });
    if (hashNativeDocument(record.doc) !== record.integrity) throw new Error('Native Session resource integrity mismatch');
    return record.doc;
}

export async function readSessionSnapshot(tx, handle, session, value) {
    const revision = assertSessionRevision(value);
    if (revision.sessionId !== session.sessionId) throw new TypeError('Revision belongs to another Session');
    const sessionId = session.sessionId;
    const states = {};
    for (const [namespace, head] of Object.entries({ ...revision.stateHeads, [KNOWLEDGE_NAMESPACE]: revision.knowledgeHead })) {
        const state = await readCheckedDocument(tx, { kind: K.sessionState, handle, sessionId, namespace, head });
        if (hashNativeDocument(state) !== head) throw new Error('Session state head integrity mismatch');
        states[namespace] = state;
    }
    const core = states[SESSION_CORE_NAMESPACE];
    const timeline = states[TIMELINE_NAMESPACE];
    if (core?.schemaVersion !== 1 || !Array.isArray(core.branches) || !Array.isArray(timeline)) {
        throw new TypeError('Missing Native Session Core snapshot');
    }
    if (core.parentRevisionId !== null) assertNativeId(core.parentRevisionId, 'revision');
    const graph = [];
    const ids = new Set();
    for (const node of core.branches) {
        assertNativeId(node.branchId, 'branch');
        assertNativeId(node.headRevisionId, 'revision');
        if (node.forkRevisionId !== null) assertNativeId(node.forkRevisionId, 'revision');
        if (ids.has(node.branchId)) throw new TypeError('Duplicate BranchGraph identity');
        ids.add(node.branchId);
        const branch = assertBranch(await readCheckedDocument(tx, { kind: K.branch, handle, sessionId, branchId: node.branchId }));
        if (branch.sessionId !== sessionId || branch.branchId !== node.branchId) throw new TypeError('Branch identity mismatch');
        graph.push({ ...node, branch });
    }
    if (graph.filter(node => !node.branch.parentBranchId).length !== 1) throw new TypeError('BranchGraph requires one root');
    const byId = new Map(graph.map(node => [node.branchId, node]));
    for (const node of graph) {
        if (node.headRevisionId !== revision.revisionId) {
            const head = assertSessionRevision(await readCheckedDocument(tx, {
                kind: K.sessionRevision, handle, sessionId, revisionId: node.headRevisionId,
            }));
            if (head.sessionId !== sessionId || head.branchId !== node.branchId) throw new TypeError('Branch revision identity mismatch');
        }
        if (node.forkRevisionId) {
            const fork = assertSessionRevision(await readCheckedDocument(tx, {
                kind: K.sessionRevision, handle, sessionId, revisionId: node.forkRevisionId,
            }));
            const forkTimeline = await readCheckedDocument(tx, { kind: K.sessionState, handle, sessionId,
                namespace: TIMELINE_NAMESPACE, head: fork.stateHeads[TIMELINE_NAMESPACE] });
            if (hashNativeDocument(forkTimeline) !== fork.stateHeads[TIMELINE_NAMESPACE]) {
                throw new Error('Fork Timeline integrity mismatch');
            }
            const point = node.branch.forkPoint;
            const matches = point === null ? forkTimeline.length === 0 : forkTimeline.some(item =>
                item.messageId === point.messageId && item.variantIds.includes(point.variantId));
            if (fork.sessionId !== sessionId || fork.branchId !== node.branch.parentBranchId || !matches) {
                throw new TypeError('Branch fork point mismatch');
            }
        } else if (node.branch.forkPoint !== null) throw new TypeError('Root Branch cannot have a fork point');
    }
    for (const node of graph) {
        const seen = new Set();
        let cursor = node;
        while (cursor) {
            if (seen.has(cursor.branchId)) throw new TypeError('BranchGraph cycle');
            seen.add(cursor.branchId);
            const parent = cursor.branch.parentBranchId;
            if (parent && !byId.has(parent)) throw new TypeError('Missing BranchGraph parent');
            if (Boolean(parent) !== Boolean(cursor.forkRevisionId)) throw new TypeError('Branch fork revision mismatch');
            cursor = parent ? byId.get(parent) : null;
        }
    }
    if (byId.get(revision.branchId)?.headRevisionId !== revision.revisionId) throw new TypeError('Branch HEAD mismatch');
    const entries = [];
    const variants = [];
    const messages = new Set();
    const ancestors = new Set();
    let ancestor = byId.get(revision.branchId);
    while (ancestor) {
        ancestors.add(ancestor.branchId);
        ancestor = byId.get(ancestor.branch.parentBranchId);
    }
    for (const selection of timeline) {
        if (messages.has(selection.messageId)) throw new TypeError('Duplicate Timeline message identity');
        messages.add(selection.messageId);
        if (!ancestors.has(selection.branchId)) throw new TypeError('Timeline entry is not on this Branch ancestry');
        const entry = assertTimelineEntry(await readCheckedDocument(tx, {
            kind: K.timelineEntry, handle, sessionId, branchId: selection.branchId, messageId: selection.messageId,
        }));
        if (entry.sessionId !== sessionId || entry.branchId !== selection.branchId || entry.messageId !== selection.messageId) {
            throw new TypeError('Timeline identity mismatch');
        }
        let active;
        if (!Array.isArray(selection.variantIds) || !selection.variantIds.length) throw new TypeError('Missing Timeline variants');
        for (const variantId of selection.variantIds) {
            const variant = assertVariant(await readCheckedDocument(tx, {
                kind: K.timelineVariant, handle, sessionId, messageId: entry.messageId, variantId,
            }));
            if (variant.sessionId !== sessionId || variant.messageId !== entry.messageId || variant.variantId !== variantId) {
                throw new TypeError('Variant identity mismatch');
            }
            if (variantId === selection.activeVariantId) active = variant;
            variants.push(variant);
        }
        if (!active) throw new TypeError('Missing active Variant');
        entries.push(assertTimelineEntry({
            ...entry, sequence: entries.length, content: active.content,
            variantIds: selection.variantIds, activeVariantId: active.variantId,
        }));
    }
    const last = entries.at(-1);
    const head = last ? { messageId: last.messageId, variantId: last.activeVariantId } : null;
    if (hashNativeDocument(head) !== hashNativeDocument(revision.timelineHead)) throw new TypeError('Timeline HEAD mismatch');
    const knowledge = states[KNOWLEDGE_NAMESPACE];
    for (const namespace of [SESSION_CORE_NAMESPACE, TIMELINE_NAMESPACE, KNOWLEDGE_NAMESPACE]) delete states[namespace];
    return { session, revision, graph, timeline: entries, variants, states, knowledge, core };
}
