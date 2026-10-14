import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';
import { MEMORY_MUTATION_SHAPES } from './memory-mutations.js';

const id = z.string().min(1).max(256), hash = z.string().regex(/^[a-f0-9]{64}$/);
const proof = z.array(z.strictObject({ episodeId: id, excerpt: z.string().min(1).max(16000) })).min(1).max(16);
const fact = z.strictObject({ action: z.enum(['create', 'reinforce', 'merge', 'supersede']), text: z.string().min(1).max(2000).optional(), type: z.enum(['explicit', 'inferred', 'summary']).optional(),
    confidence: z.number().min(0).max(1).optional(), importance: z.number().min(0).max(1).optional(), targetId: id.optional(), sourceId: id.optional(),
    reason: z.string().min(1).max(2000).optional(), validFrom: z.string().max(256).optional(), validUntil: z.string().max(256).optional(), evidence: proof.optional() });
const graph = z.strictObject({ action: z.enum(['entity', 'alias', 'rename', 'merge_entity', 'split_entity', 'resolve_pending', 'relation', 'resolve_conflict']), evidence: proof,
    ref: id.optional(), name: z.string().min(1).max(300).optional(), type: z.enum(['Character', 'Location', 'Organization', 'Item', 'Event', 'Quest', 'Concept']).optional(),
    sourceId: id.optional(), targetId: id.optional(), candidateIds: z.array(id).max(64).optional(), resolutionConfidence: z.number().min(0).max(1).optional(),
    reason: z.string().max(2000).optional(), pendingId: id.optional(), predicate: id.optional(), label: z.string().max(300).optional(),
    policy: z.enum(['persistent', 'replace_current', 'multi_active']).optional(), exclusiveSide: z.enum(['source', 'target']).optional(), factId: id.optional(), factIndex: z.number().int().min(0).max(63).optional(),
    validFrom: z.string().max(256).optional(), validUntil: z.string().max(256).optional(), timeOrder: z.number().optional(), untilOrder: z.number().optional(), relationId: id.optional(), loserIds: z.array(id).max(64).optional() });
const root = '/api/native/memory';

export function registerNativeMemoryActions(registry, browser) {
    const request = (path, body, guards = {}) => requestAuthority(browser, 'POST', root + path, body, guards);
    const observe = async body => {
        const result = await request('/observe', body);
        if (!result.ok || !result.serverBootId) throw new Error('Native Memory observer unavailable');
        return result;
    };
    const graphObserve = async body => {
        const result = await request('/graph/observe', body);
        if (!result.ok || !result.serverBootId) throw new Error('Native Memory Graph observer unavailable');
        return result;
    };
    const bounded = response => {
        const data = redact(response.data ?? null);
        if (JSON.stringify(data).length <= 64000) return { ...response, data };
        return { ...response, data: { identity: data.identity ?? null, ledgerFingerprint: data.ledgerFingerprint ?? null, settingsFingerprint: data.settingsFingerprint ?? null,
            contentHash: fingerprint(data), omitted: 'Large Native Memory page; reduce limit or source selection',
            ...(data.sources ? { sources: data.sources.map(source => ({ ...source, content: source.content.slice(0, 1024), truncated: source.content.length > 1024 })) } : {}) } };
    };
    for (const [suffix, path, shape] of [['observe', '/observe', { sessionId: id, revisionId: id.optional(), includeInactive: z.boolean().default(false), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(50) }],
        ['graph.observe', '/graph/observe', { sessionId: id, revisionId: id.optional(), activeOnly: z.boolean().default(true), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(50) }],
        ['sources', '/sources', { sessionId: id, revisionId: id.optional(), messageIds: z.array(id).min(1).max(16) }]]) registry.register({ version: 1, id: 'memory.native.' + suffix, domain: 'memory', title: 'Native Memory ' + suffix,
        risk: 'READ', authority: 'Native Memory source lifecycle / exact Session Revision', adapter: 'fixed-http', externalEffects: [], guards: [], approval: 'none',
        availability: { available: true, reason: 'Authenticated Native Memory pure observation; no loaded Browser or source capture required' } },
    z.strictObject(shape), z.json(), async input => bounded(await request(path, input)));
    registry.register({ version: 1, id: 'memory.native.batch.apply', domain: 'memory', title: 'Native source-bound Fact and Temporal Graph batch', risk: 'MUTATE',
        authority: 'Native Memory source ticket / original provenance ledger / Session commit', adapter: 'fixed-http', externalEffects: ['native-memory-provenance-and-session-revision'],
        guards: ['current-server-boot', 'exact-session-branch-head', 'ledger-and-owner-settings-cas', 'native-source-ticket', 'before-and-after-approval-authority'], approval: 'trusted-approval-required',
        availability: { available: true, reason: 'Existing owner source-write opt-in, exact sources, Policy Ceiling and trusted approval required' } },
    z.strictObject({ sessionId: id, expectedRevisionId: id, expectedBranchId: id, expectedLedgerFingerprint: hash, expectedSettingsFingerprint: hash, commitId: id,
        messageIds: z.array(id).min(1).max(16), facts: z.array(fact).max(64).default([]), graph: z.array(graph).max(64).default([]) })
        .refine(input => input.facts.length + input.graph.length > 0 && JSON.stringify(input).length <= 128000, 'Nonempty bounded Memory batch required'), z.json(),
    async (input, { before }) => {
        let response;
        try { response = await request('/batch', input, before); }
        catch { return { ok: false, partial: true, receiptEvidence: { after: { commitId: input.commitId, status: 'unknown', sessionId: input.sessionId },
            recovery: 'Query the exact Native Session commit receipt using commitId; never replay an unknown Memory write.' } }; }
        const uncertain = response.serverBootId !== before.serverBootId;
        return { ...bounded(response), ok: response.ok && !uncertain, partial: uncertain, receiptEvidence: { after: response.ok ? { identity: response.data.identity, commitReceipt: response.data.commitReceipt, reconciled: response.data.reconciled } : null,
            recovery: 'Observe Native Memory and its exact Session commit receipt before further writes; no automatic replay or background model wake.' } };
    }, async input => {
        const observed = await observe({ sessionId: input.sessionId, limit: 1 });
        const state = observed.data;
        if (state.identity.sessionId !== input.sessionId || state.identity.revisionId !== input.expectedRevisionId || state.identity.branchId !== input.expectedBranchId
            || state.ledgerFingerprint !== input.expectedLedgerFingerprint || state.settingsFingerprint !== input.expectedSettingsFingerprint) throw new Error('Stale Native Memory source or owner settings');
        if (!state.sourceWritesEnabled) throw new Error('Native Memory source writes are not enabled by the owner');
        return { target: { sessionId: input.sessionId }, serverBootId: observed.serverBootId, identity: state.identity,
            ledgerFingerprint: state.ledgerFingerprint, settingsFingerprint: state.settingsFingerprint };
    });
    for (const [action, operation] of Object.entries(MEMORY_MUTATION_SHAPES)) {
        const kind = action.slice('memory.'.length), risk = kind.endsWith('.delete') ? 'DESTRUCTIVE' : 'MUTATE';
        registry.register({ version: 1, id: 'memory.native.' + kind, domain: 'memory', title: 'Native source-guarded Graph ' + kind, risk,
            authority: 'Original Memory Graph write factory / Source ticket / Floor-State / Native Session', adapter: 'fixed-http', externalEffects: ['native-memory-graph-and-provenance-session-commit'],
            guards: ['current-server-boot', 'exact-session-branch-head', 'graph-and-owner-settings-cas', 'native-source-ticket', 'before-and-after-approval-authority'], approval: 'trusted-approval-required',
            availability: { available: true, reason: 'Exact Native Graph/source guards and existing owner source-write consent required' } },
        z.strictObject({ sessionId: id, expectedRevisionId: id, expectedBranchId: id, expectedGraphFingerprint: hash, expectedSettingsFingerprint: hash, commitId: id,
            messageIds: z.array(id).min(1).max(16), operation: z.strictObject(operation) }).refine(input => JSON.stringify(input).length <= 128000, 'Graph input exceeds bound'), z.json(),
        async (input, { before }) => {
            let response;
            try { response = await request('/graph/' + kind.replace('.', '/'), input, before); }
            catch { return { ok: false, partial: true, receiptEvidence: { after: { sessionId: input.sessionId, commitId: input.commitId, status: 'unknown' }, recovery: 'Query the exact Native Session CommitReceipt; never replay an unknown Graph mutation.' } }; }
            const uncertain = response.serverBootId !== before.serverBootId;
            const success = response.ok && response.data.result?.ok !== false && !response.data.result?.error;
            return { ...bounded(response), ok: success && !uncertain, partial: uncertain, receiptEvidence: {
                after: response.ok ? { identity: response.data.identity, commitReceipt: response.data.commitReceipt ?? null, changed: response.data.changed ?? null, result: response.data.result ?? null } : null,
                recovery: 'Observe the original Native Graph and exact Session CommitReceipt before any new write; no automatic replay or background model wake.' } };
        }, async input => {
            const observed = await graphObserve({ sessionId: input.sessionId, limit: 1 }), state = observed.data;
            if (state.identity.sessionId !== input.sessionId || state.identity.revisionId !== input.expectedRevisionId || state.identity.branchId !== input.expectedBranchId
                || state.graphFingerprint !== input.expectedGraphFingerprint || state.settingsFingerprint !== input.expectedSettingsFingerprint) throw new Error('Stale Native Graph or owner settings');
            if (!state.sourceWritesEnabled) throw new Error('Native Memory source writes are not enabled by the owner');
            return { target: { sessionId: input.sessionId }, serverBootId: observed.serverBootId, identity: state.identity, graphFingerprint: state.graphFingerprint, settingsFingerprint: state.settingsFingerprint };
        });
    }
    return registry;
}
