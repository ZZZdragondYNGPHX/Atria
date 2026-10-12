import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fields, assertJsonDeclaration } from '../../public/shared/native-values.js';
import { informationDefinition, projectInformation, assertInformationAnchor } from '../../public/shared/native-information-runtime.js';
import { prepareHypothetical, hypotheticalCurrent } from './hypothetical-authority.js';
import { prepareAuthorityTransaction } from './authority-transaction.js';
import { actionReceipts } from './action-receipts.js';
import { PredictionService } from './prediction-service.js';
import { hashNativeDocument as hash } from './repositories/common.js';
import { immutable, checkCancellation } from './model-prompt-runtime/execution-utils.js';
import { selectNativeRuntimeRoute } from './adapters/generation-host.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const equal = (a, b) => hash(a) === hash(b);
const scalar = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const engineEntries = new WeakMap();
function projection(base, viewId) {
    const definition = informationDefinition(base), view = definition?.views.find(item => item.id === viewId);
    if (!view || view.audience !== 'player' || !view.exposure.includes('display')) fail('native_comparison_view_denied');
    if (view.sources.some(id => base.states.atri_lifecycle.scopes[definition.sources.find(item => item.id === id)?.scopeId]?.status !== 'active')) fail('native_comparison_scope_unavailable');
    const value = projectInformation(base, viewId, { purpose: 'display', includeRollups: false });
    if (value.truncated || value.availability.some(item => !item.available)) fail('native_comparison_projection_unavailable');
    return value;
}
function read(data, path) {
    let value = data;
    for (const part of path) {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return { available: false };
        value = value[part];
    }
    return { available: true, value };
}
function differences(a, b) {
    if (a === undefined || b === undefined) return a === b ? 0 : 1;
    if (equal(a, b)) return 0;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].reduce((count, key) => count + differences(a[key], b[key]), 0);
    }
    return 1;
}
const publicChanges = (before, after) => {
    const old = new Map(before.items.map(item => [item.id, item.data])), next = new Map(after.items.map(item => [item.id, item.data]));
    return [...new Set([...old.keys(), ...next.keys()])].reduce((count, id) => count + differences(old.get(id), next.get(id)), 0);
};

// Bounded, transient server records carry identity only inside this consumer.
// They neither authorize effects nor write hypothetical futures into repositories.
export class CandidateComparisonService {
    constructor({ host, now = Date.now }) {
        this.host = host; this.now = now;
        const engine = host.persistence?._engine ?? host.sessionCore?._sessions?._engine;
        if (!engine || typeof engine !== 'object') fail('native_comparison_storage_unavailable');
        if (!engineEntries.has(engine)) engineEntries.set(engine, new Map());
        this.entries = engineEntries.get(engine);
    }
    _entry(handle, sessionId, id) {
        this._prune();
        const entry = this.entries.get(id);
        if (!entry || entry.owner !== handle || entry.sessionId !== sessionId) fail('native_comparison_unknown');
        return entry;
    }
    _prune() { for (const [id, entry] of this.entries) if (entry.expiresAt <= this.now()) this.entries.delete(id); }
    async _installed(handle, base) {
        return this.host.sessionCore._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
    }
    async _work(handle, base, routeRef, requestId, descriptor, signal, operation, expectedRouteHash) {
        let route = null;
        if (routeRef !== undefined) {
            fields(routeRef, ['scope', 'runtimeRouteId'], 'Comparison route');
            if (routeRef.scope !== 'player' || typeof routeRef.runtimeRouteId !== 'string') fail('native_comparison_route_invalid');
        }
        if (this.host.persistence?.listRuntimeRoutes) {
            try { route = selectNativeRuntimeRoute(await this.host.persistence.listRuntimeRoutes(handle), 'role.narrator', routeRef); } catch (error) { if (expectedRouteHash !== undefined) fail('native_comparison_source_stale'); throw error; }
        } else if (routeRef !== undefined) route = await this.host.persistence?.getRuntimeRoute(handle, routeRef.runtimeRouteId);
        if ((routeRef !== undefined || this.host.persistence?.listRuntimeRoutes) && (!route || route.scope !== 'player')) fail(expectedRouteHash === undefined ? 'native_comparison_route_invalid' : 'native_comparison_source_stale');
        const routeHash = route ? hash(route) : null;
        if (expectedRouteHash !== undefined && routeHash !== expectedRouteHash) fail('native_comparison_source_stale');
        const resolvedRouteRef = route?.runtimeRouteId ? { scope: 'player', runtimeRouteId: route.runtimeRouteId } : routeRef;
        const attempt = { attemptId: randomUUID(), requestId, kind: 'context_build', estimatedItems: descriptor.items,
            estimatedInputBytes: descriptor.bytes, targetFingerprint: hash(descriptor.fingerprint) };
        const receipt = await this.host.sessionCore.runs.chargeLocalWork(handle, base,
            { branchId: base.revision.branchId, revisionId: base.revision.revisionId }, route?.executionPolicy?.computeBudget, attempt);
        const started = performance.now(), cpu = process.cpuUsage(), work = [];
        let outcome = 'failed';
        try { checkCancellation(signal); const result = await operation(); checkCancellation(signal); outcome = 'completed'; return { result, work, resolvedRouteRef, routeHash }; } finally {
            if (receipt) {
                const used = process.cpuUsage(cpu);
                work.push(await this.host.sessionCore.runs.settleLocalWork(handle, base.session.sessionId, receipt.operation, attempt.attemptId,
                    { wallMs: performance.now() - started, cpuUserMicros: used.user, cpuSystemMicros: used.system,
                        cpuScope: 'process', outcome: signal?.aborted ? 'cancelled' : outcome }));
            }
        }
    }
    async prepare(handle, raw, signal) {
        checkCancellation(signal);
        const input = assertJsonDeclaration(raw, 'Candidate comparison request', 65536);
        fields(input, ['sessionId', 'revisionId', 'request'], 'Candidate comparison request');
        const request = input.request;
        this._prune();
        if (this.entries.size >= 128 || [...this.entries.values()].filter(entry => entry.owner === handle).length >= 32) fail('native_comparison_capacity');
        fields(request, ['viewId', 'anchor', 'requestId', 'candidates', 'goals', 'routeRef', 'prediction'], 'Candidate comparison');
        fields(request.anchor, ['sessionId', 'packageVersionId', 'branchId', 'revisionId', 'scopeEpochs'], 'Comparison anchor');
        if (typeof request.requestId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(request.requestId)) fail('native_comparison_request_invalid');
        if (!Array.isArray(request.candidates) || !request.candidates.length || request.candidates.length > 8
            || !Array.isArray(request.goals) || !request.goals.length || request.goals.length > 16) fail('native_comparison_bounds');
        const ids = new Set();
        for (const candidate of request.candidates) {
            fields(candidate, ['id', 'action'], 'Comparison candidate');
            if (typeof candidate.id !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(candidate.id) || ids.has(candidate.id)) fail('native_comparison_candidate_invalid');
            ids.add(candidate.id);
            fields(candidate.action, candidate.action?.kind === 'transaction' ? ['kind', 'transactionId', 'input'] : ['kind', 'commandId', 'ticks'], 'Comparison action');
        }
        if (request.prediction !== undefined) {
            fields(request.prediction, ['taskId', 'variantId', 'slotBindings'], 'Comparison prediction');
            if (!request.routeRef) fail('native_comparison_route_invalid');
        }
        const base = await this.host.sessionCore.load(handle, input.sessionId);
        if (base.revision.revisionId !== input.revisionId) fail('native_comparison_revision_conflict');
        assertInformationAnchor(base, request.anchor);
        const installed = await this._installed(handle, base);
        const sourceBytes = [...installed.sourceFiles.values(), ...installed.assets.values()].reduce((sum, bytes) => sum + bytes.length, 0);
        const descriptor = { items: request.candidates.length * (1 + base.timeline.length + installed.sourceFiles.size + installed.assets.size
            + Object.values(base.states.atri_lifecycle.domains).reduce((sum, domain) => sum + domain.records.length, 0)),
        bytes: request.candidates.length * (sourceBytes + Buffer.byteLength(JSON.stringify({ base, request }))), fingerprint: request };
        const comparisonId = 'comparison_' + randomUUID().replaceAll('-', ''), policy = immutable({ goals: request.goals,
            ranking: ['all_goals_required', 'goals_satisfied_desc', 'public_scalar_changes_asc', 'candidate_id_asc'] });
        const { result, work, resolvedRouteRef, routeHash } = await this._work(handle, base, request.routeRef, request.requestId, descriptor, signal, async () => {
            const before = projection(base, request.viewId), items = new Map(before.items.map(item => [item.id, item]));
            const goalKeys = new Set();
            for (const goal of request.goals) {
                fields(goal, ['itemId', 'path', 'equals'], 'Comparison goal');
                if (!Array.isArray(goal.path) || !goal.path.length || goal.path.length > 8
                    || goal.path.some(part => typeof part !== 'string' || !part || part.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(part))) fail('native_comparison_goal_denied');
                const basis = read(items.get(goal.itemId)?.data, goal.path), key = hash({ itemId: goal.itemId, path: goal.path });
                if (!basis.available || !scalar(basis.value) || !scalar(goal.equals) || typeof basis.value !== typeof goal.equals
                    || goalKeys.has(key)) fail('native_comparison_goal_denied');
                goalKeys.add(key);
            }
            const candidates = [];
            for (const candidate of request.candidates) {
                checkCancellation(signal);
                const artifact = await prepareHypothetical(base, installed, { ...candidate.action, viewId: request.viewId, anchor: before.anchor });
                if (artifact.projection.truncated) fail('native_comparison_projection_unavailable');
                const after = new Map(artifact.projection.items.map(item => [item.id, item]));
                const goalsSatisfied = request.goals.filter(goal => {
                    const value = read(after.get(goal.itemId)?.data, goal.path); return value.available && equal(value.value, goal.equals);
                }).length;
                const prediction = request.prediction === undefined ? null : await new PredictionService({ host: this.host }).prepare(handle,
                    { sessionId: input.sessionId, revisionId: input.revisionId, request: { ...request.prediction, viewId: request.viewId,
                        anchor: before.anchor, action: candidate.action, invocationId: 'comparison:' + hash({ requestId: request.requestId, candidateId: candidate.id }) } }, signal);
                candidates.push({ id: candidate.id, action: candidate.action, artifact, artifactHash: hash(artifact), goalsSatisfied,
                    publicChanges: publicChanges(before, artifact.projection), prediction });
            }
            const current = await this.host.sessionCore.load(handle, input.sessionId), currentInstalled = await this._installed(handle, current);
            if (candidates.some(candidate => !hypotheticalCurrent(current, currentInstalled, candidate.artifact))) fail('native_comparison_revision_conflict');
            candidates.sort((a, b) => b.goalsSatisfied - a.goalsSatisfied || a.publicChanges - b.publicChanges || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            const selected = candidates[0].goalsSatisfied === request.goals.length ? candidates[0] : null;
            const publicArtifact = immutable(assertJsonDeclaration({ schemaVersion: 1, comparisonId, kind: 'candidate_comparison', mode: 'hypothetical',
                baseAnchor: before.anchor, policyHash: hash(policy), candidates: candidates.map(candidate => ({ id: candidate.id,
                    goalsSatisfied: candidate.goalsSatisfied, publicChanges: candidate.publicChanges, artifactHash: candidate.artifactHash,
                    prediction: candidate.prediction })), selected: selected ? { candidateId: selected.id, action: selected.action,
                    baseAnchor: before.anchor, kind: 'action_proposal' } : null, status: selected ? 'proposed' : 'abstained',
                uncertainty: { realOutcome: 'not_observed', predictionError: 'not_measurable' } }, 'Candidate comparison artifact', 65536));
            return { before, candidates, selected, publicArtifact };
        });
        checkCancellation(signal); this._prune();
        if (this.entries.size >= 128 || [...this.entries.values()].filter(entry => entry.owner === handle).length >= 32) fail('native_comparison_capacity');
        const response = immutable(assertJsonDeclaration({ ...result.publicArtifact, compute: { localWork: work } }, 'Candidate comparison artifact', 65536));
        this.entries.set(comparisonId, { owner: handle, sessionId: input.sessionId, expiresAt: this.now() + 600000,
            selected: result.selected ? immutable(result.selected) : null, sourceSession: immutable(base.session), policy, viewId: request.viewId,
            routeRef: resolvedRouteRef ? immutable(resolvedRouteRef) : undefined, routeHash });
        return response;
    }
    async current(handle, raw) {
        const input = assertJsonDeclaration(raw, 'Comparison current request', 65536);
        fields(input, ['sessionId', 'comparisonId'], 'Comparison current request');
        const entry = this._entry(handle, input.sessionId, input.comparisonId);
        if (!entry.selected) return { current: false };
        const base = await this.host.sessionCore.load(handle, input.sessionId);
        return { current: hypotheticalCurrent(base, await this._installed(handle, base), entry.selected.artifact) };
    }
    async feedback(handle, raw, signal) {
        checkCancellation(signal);
        const input = assertJsonDeclaration(raw, 'Comparison feedback request', 65536);
        fields(input, ['sessionId', 'comparisonId', 'receiptId'], 'Comparison feedback request');
        const entry = this._entry(handle, input.sessionId, input.comparisonId), selected = entry.selected;
        if (!selected) fail('native_comparison_abstained');
        if (selected.action.kind !== 'transaction') fail('native_comparison_feedback_unsupported');
        const current = await this.host.sessionCore.load(handle, input.sessionId), receipt = actionReceipts(current).find(item => item.receiptId === input.receiptId);
        const anchor = selected.artifact.baseAnchor;
        if (!receipt || receipt.status !== 'committed' || receipt.baseRevisionId !== anchor.revisionId || receipt.branchId !== anchor.branchId
            || receipt.committedRevisionId !== current.revision.revisionId || current.revision.branchId !== anchor.branchId
            || receipt.actionId !== selected.action.transactionId || receipt.commandId !== selected.action.transactionId || receipt.inputHash !== hash(selected.action.input)) fail('native_comparison_receipt_denied');
        const installed = await this._installed(handle, current);
        const sourceBytes = [...installed.sourceFiles.values(), ...installed.assets.values()].reduce((sum, bytes) => sum + bytes.length, 0);
        const descriptor = { items: 1 + current.timeline.length + installed.sourceFiles.size + installed.assets.size
            + Object.values(current.states.atri_lifecycle.domains).reduce((sum, domain) => sum + domain.records.length, 0),
        bytes: sourceBytes + Buffer.byteLength(JSON.stringify({ current, selected })),
        fingerprint: { comparisonId: input.comparisonId, receiptId: input.receiptId } };
        const { result, work } = await this._work(handle, current, entry.routeRef, 'feedback:' + input.comparisonId, descriptor, signal, async () => {
            const historical = await this.host.sessionCore.load(handle, input.sessionId, { revisionId: anchor.revisionId });
            // Historical repository reads carry the mutable current Session header.
            // Only HEAD and its update time are restored from the captured header;
            // every other Session field and all immutable revision data stay checked.
            const base = { ...historical, session: { ...historical.session, headRevisionId: entry.sourceSession.headRevisionId, updatedAt: entry.sourceSession.updatedAt } };
            if (!hypotheticalCurrent(base, installed, selected.artifact)) fail('native_comparison_source_stale');
            assertInformationAnchor(current, { ...anchor, revisionId: current.revision.revisionId });
            const prepared = await prepareAuthorityTransaction(base, installed, { transactionId: selected.action.transactionId, input: selected.action.input,
                anchor: { sessionId: anchor.sessionId, packageVersionId: anchor.packageVersionId, branchId: anchor.branchId, revisionId: anchor.revisionId },
                playerMessageId: base.timeline.at(-1)?.messageId });
            if (prepared.identity !== receipt.authorityId || prepared.inputHash !== receipt.inputHash) fail('native_comparison_receipt_denied');
            const actual = projection(current, entry.viewId);
            const newest = await this.host.sessionCore.load(handle, input.sessionId);
            if (newest.revision.revisionId !== current.revision.revisionId || newest.revision.branchId !== current.revision.branchId) fail('native_comparison_revision_conflict');
            return { receipt: { receiptId: receipt.receiptId, authorityId: receipt.authorityId, inputHash: receipt.inputHash,
                baseRevisionId: receipt.baseRevisionId, committedRevisionId: receipt.committedRevisionId, branchId: receipt.branchId },
            deterministicPredictionError: { publicScalarDifferences: publicChanges(selected.artifact.projection, actual),
                exactMatch: equal(selected.artifact.projection.items, actual.items) }, modelPredictionError: 'not_measurable' };
        }, entry.routeHash);
        return immutable({ schemaVersion: 1, kind: 'comparison_observation', comparisonId: input.comparisonId, candidateId: selected.id,
            artifactHash: selected.artifactHash, ...result, compute: { localWork: work } });
    }
}
