import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertNativeId } from '../identity.js';
import { hashNativeDocument as hash, cloneNativeDocument } from '../repositories/common.js';
import { assertObject, assertCounter, assertSourceSelector } from '../../../public/shared/native-orchestration-contracts.js';
import { createBindingSourceAuthority } from './binding-source-authority.js';
import { assertRunAccess } from '../run-control.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { RunRepository, assertRunRoot } from './run-repository.js';
import { BudgetPort } from './budget-port.js';
import { readAttempt } from './controller-common.js';
import { readEffect, readApproval } from './effect-contracts.js';

const resync = () => { throw new ConflictError('native_orchestration_projection_resync_required'); };
const selectorFor = root => {
    const source = root.sourceBinding.sourceRef;
    if (root.sourceBinding.sourceAuthority === 'native_session') return { domain: 'native_session', sessionId: source.sessionId, entryPointId: null };
    if (root.sourceBinding.sourceAuthority === 'project') return { domain: 'project', projectId: source.projectId, taskId: source.taskId };
    if (root.sourceBinding.sourceAuthority === 'rp_chat') return { domain: 'rp_chat', controlId: source.controlId };
    throw new TypeError('Unsupported original Run source');
};
const matches = (root, selector) => {
    const source = selectorFor(root);
    return source.domain === selector.domain && Object.entries(source).every(([field, value]) => field === 'entryPointId'
        || field === 'taskId' && selector.taskId === null || selector[field] === value);
};
const boundedLimit = limit => {
    assertCounter(limit, 'limit', 1);
    if (limit > 100) throw new TypeError('limit must be <= 100');
};
const timelineTypes = new Set(['admitted', 'attempt_prepared', 'attempt_identity_reserved', 'attempt_activated', 'attempt_settled',
    'effect_prepared', 'effect_ready', 'effect_dispatch_claimed', 'effect_observed', 'approval_requested', 'approval_decided',
    'graph_transition_admitted', 'graph_patch_accepted', 'graph_patch_rejected', 'fanout_group_frozen', 'join_membership_frozen', 'join_settled',
    'child_delegated', 'child_budget_confirmed', 'control_handed_off', 'handoff_returned', 'result_published', 'task_local_output_committed',
    'rp_narration_ready', 'rp_output_completed', 'session_narration_ready', 'session_output_completed', 'project_round_finished',
    'project_review_published', 'project_review_completed', 'cancel_requested', 'host_recovered']);

/** Owner/source metadata projection. No Result bodies, provider inputs, grants or dispatch tokens. */
export class RunObservationService {
    #cursors = new Map();
    #eventSalt = randomUUID();

    constructor({ engine, sessionCore, projectAgent, studio, rpControl, now = Date.now, pollMs = 1000 }) {
        if (!engine.nativeHostLifecycle) throw new TypeError('Original Host ownership required');
        this.engine = engine; this.now = now; this.pollMs = pollMs;
        this.hostBootId = engine.nativeHostLifecycle.hostBootId;
        this.authorizeSource = createBindingSourceAuthority({ sessionCore, projectAgent, studio, rpControl });
        this.budget = new BudgetPort({ sessionCore, projectAgent, projectRepository: projectAgent?._repository, rpControl });
        this.runs = new RunRepository({ engine, admit: async () => { throw new TypeError('Observation cannot admit Runs'); },
            assertWriter: (handle, tx) => engine.nativeHostLifecycle.assertWriter(handle, tx),
            authorize: async ({ handle, body, tx }) => {
                const row = await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: body.runId });
                if (!row) throw new NotFoundError('orchestration_run');
                assertRunRoot(row.doc, handle);
                await this.#authorize(handle, tx, row.doc);
            } });
    }

    async #authorize(handle, tx, root) {
        const sourceSelector = selectorFor(root);
        await this.authorizeSource({ handle, tx, body: { sourceSelector } });
        // History visibility follows the original Session inspection policy,
        // including ironman. Currentness is never a new execution grant.
        if (sourceSelector.domain === 'native_session') await assertRunAccess(tx, handle, sourceSelector.sessionId, 'inspect', root.sourceBinding.sourceRef.revisionId);
        return hash({ handle, sourceSelector, audience: 'owner_run_metadata', version: 1 });
    }

    #remember(entry) {
        const now = this.now();
        for (const [token, value] of this.#cursors) if (value.expiresAt <= now) this.#cursors.delete(token);
        const owned = [...this.#cursors].filter(([, value]) => value.handle === entry.handle);
        while (owned.length >= 128) this.#cursors.delete(owned.shift()[0]);
        while (this.#cursors.size >= 2048) this.#cursors.delete(this.#cursors.keys().next().value);
        const cursor = randomUUID(); this.#cursors.set(cursor, { ...entry, expiresAt: now + 300000 }); return cursor;
    }

    #lookup(cursor, handle, kind, scope) {
        if (typeof cursor !== 'string' || cursor.length !== 36) resync();
        const entry = this.#cursors.get(cursor);
        if (!entry || entry.expiresAt <= this.now() || entry.handle !== handle || entry.kind !== kind || entry.scope !== scope
            || entry.hostBootId !== this.hostBootId) resync();
        return entry;
    }

    async #costs(handle, tx, root, effects) {
        const costs = { status: 'not_started', closed: false, modelAttempts: 0, knownTotalTokens: 0, unknownAttempts: 0, reservedUpperTokens: 0,
            localJobs: 0, localUnknownJobs: 0, localWallMs: 0 };
        if (!effects.length) return costs;
        costs.closed = true;
        try {
            for (let start = 0; start < effects.length; start += 1024) {
                const effectIds = effects.slice(start, start + 1024).map(item => item.effectId);
                const closure = await this.budget.observeEffectClosure(handle, { authorityRef: root.budgetAuthorityRef, effectIds }, { tx });
                costs.closed &&= closure.closed;
                for (const ref of closure.budgetAttemptRefs) {
                    const row = await this.budget.observeAttempt(handle, ref);
                    if (ref.kind === 'local_work') {
                        costs.localJobs++; costs.localWallMs += row.usage?.wallMs ?? 0;
                        if (row.status !== 'settled') costs.localUnknownJobs++;
                    } else {
                        costs.modelAttempts++;
                        if (row.status === 'settled') costs.knownTotalTokens += row.usage.totalTokens;
                        else { costs.unknownAttempts++; costs.reservedUpperTokens += row.estimatedTokens; }
                    }
                }
            }
            costs.status = costs.closed ? 'settled' : 'pending';
        } catch (error) {
            if (error.code !== 'native_orchestration_budget_unavailable') throw error;
            costs.status = 'unavailable'; costs.closed = false;
        }
        return costs;
    }

    async list(handle, input) {
        assertObject(input, ['sourceSelector', 'cursor', 'limit'], 'Run list');
        const sourceSelector = assertSourceSelector(input.sourceSelector); boundedLimit(input.limit);
        const scope = hash(sourceSelector), previous = input.cursor === null ? null : this.#lookup(input.cursor, handle, 'list', scope);
        return this.engine.withTransaction(handle, async tx => {
            await this.authorizeSource({ handle, tx, body: { sourceSelector } });
            const rows = [];
            for (const listed of await tx.listResources({ kind: K.orchestrationRun, handle })) {
                const root = (await checkedRecord(tx, listed.key))?.doc;
                if (!root) throw new TypeError('Missing Run list record');
                assertRunRoot(root, handle);
                if (!matches(root, sourceSelector)) continue;
                await this.#authorize(handle, tx, root);
                rows.push(root);
            }
            rows.sort((a, b) => b.createdAt - a.createdAt || a.runId.localeCompare(b.runId));
            const remaining = rows.filter(root => !previous || root.createdAt < previous.after.createdAt
                || root.createdAt === previous.after.createdAt && root.runId > previous.after.runId);
            const selected = remaining.slice(0, input.limit);
            // Access is checked again after the final asynchronous storage read.
            await this.authorizeSource({ handle, tx, body: { sourceSelector } });
            const items = selected.map(root => ({ runId: root.runId, planRef: root.planRef, source: selectorFor(root),
                status: root.status, cancelRequested: root.cancelRequested, createdAt: root.createdAt, updatedAt: root.updatedAt }));
            const last = selected.at(-1);
            return { items, cursor: remaining.length > selected.length ? this.#remember({ handle, kind: 'list', scope,
                hostBootId: this.hostBootId, after: { runId: last.runId, createdAt: last.createdAt } }) : null };
        });
    }

    async #view(handle, runId) {
        const result = await this.engine.withTransaction(handle, async tx => {
            try {
                const root = await this.runs.get(handle, runId), revision = await readPlanRevision(tx, handle, root.planRef);
                const visibilityDigest = await this.#authorize(handle, tx, root), attempts = [], effects = [], approvals = [];
                for (const id of root.attemptRefs) {
                    const attempt = (await readAttempt(tx, handle, root, id)).doc;
                    for (const field of ['startedAt', 'endedAt']) if (attempt[field] !== null) assertCounter(attempt[field], field);
                    attempts.push({ attemptId: id, nodeId: attempt.nodeId, attemptNumber: attempt.attemptNumber, status: attempt.status,
                        startedAt: attempt.startedAt, endedAt: attempt.endedAt });
                    for (const effectId of attempt.effectRefs) {
                        const effect = (await readEffect(tx, handle, root, effectId)).doc;
                        effects.push({ effectId, nodeAttemptId: id, status: effect.status, risk: effect.risk, requiresApproval: effect.requiresApproval });
                    }
                }
                for (const id of root.pendingApprovalRefs) {
                    const approval = (await readApproval(tx, handle, root, id)).doc;
                    if (!['R0', 'R1', 'R2', 'R3'].includes(approval.risk)) throw new TypeError('Invalid approval risk');
                    approvals.push({ approvalId: id, effectId: approval.effectId, status: approval.status, risk: approval.risk, expiresAt: approval.expiresAt,
                        reviewAvailable: false });
                }
                const events = [];
                for (const row of await tx.listResources({ kind: K.orchestrationRecord, handle, runId, recordType: 'event' })) {
                    const event = (await checkedRecord(tx, row.key))?.doc;
                    if (!event || event.runId !== runId || event.schemaVersion !== 1 || !Number.isSafeInteger(event.eventSeq)
                        || event.eventSeq < 0 || event.eventSeq > root.eventSeq || row.key.recordId !== 'event:' + event.eventSeq)
                        throw new TypeError('Invalid Run timeline event');
                    for (const field of ['createdAt', 'epoch', 'graphRevision']) assertCounter(event[field], field);
                    if (event.epoch > root.epoch || event.graphRevision > root.graphRevision) throw new TypeError('Invalid Run timeline versions');
                    if (timelineTypes.has(event.type)) events.push({ internalOrder: event.eventSeq, eventId: hash({ salt: this.#eventSalt, runId, eventSeq: event.eventSeq }),
                        type: event.type, createdAt: event.createdAt, epoch: event.epoch, graphRevision: event.graphRevision });
                }
                events.sort((a, b) => a.internalOrder - b.internalOrder);
                const costs = await this.#costs(handle, tx, root, effects);
                const diagnostics = [];
                if (root.cancelRequested) diagnostics.push({ code: 'native_orchestration_cancel_requested', severity: 'info' });
                if (effects.some(effect => ['unknown', 'dispatching'].includes(effect.status))) diagnostics.push({ code: 'native_orchestration_effect_reconcile_required', severity: 'blocking' });
                if (costs.status === 'pending') diagnostics.push({ code: 'native_orchestration_budget_unsettled', severity: 'blocking' });
                if (costs.status === 'unavailable') diagnostics.push({ code: 'native_orchestration_budget_unavailable', severity: 'blocking' });
                if (approvals.length) diagnostics.push({ code: 'native_orchestration_approval_channel_unavailable', severity: 'blocking' });
                if (root.hostBootId !== this.hostBootId) diagnostics.push({ code: 'native_orchestration_host_recovery_required', severity: 'blocking' });
                const payload = { status: root.status, cancelRequested: root.cancelRequested, source: selectorFor(root), planRef: root.planRef,
                    versions: { epoch: root.epoch, stateVersion: root.stateVersion, graphRevision: root.graphRevision },
                    graph: { nodes: root.graph.nodes.map(node => ({ nodeId: node.nodeId, kind: node.kind,
                        label: revision.definition.nodes.find(original => original.nodeId === node.nodeId)?.label ?? null })),
                    edges: root.graph.edges.map(edge => ({ edgeId: edge.edgeId, from: edge.from, to: edge.to, loopBack: edge.loopBack })) },
                    attempts, effects, approvals, events: events.map(({ internalOrder: _order, ...event }) => event), costs, diagnostics,
                    controls: { cancel: !['completed', 'partial', 'failed', 'cancelled', 'stale'].includes(root.status) && root.hostBootId === this.hostBootId,
                        resume: false, reconcile: false, approve: false }, createdAt: root.createdAt, updatedAt: root.updatedAt };
                if (visibilityDigest !== await this.#authorize(handle, tx, root)) resync();
                const current = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId }))?.doc;
                if (hash(current) !== hash(root)) resync();
                return { view: { root, visibilityDigest, payload: cloneNativeDocument(payload) } };
            } catch (error) {
                // Preserve lawful reentrant source/control changes even when
                // they revoke this observer during its final read.
                if (error instanceof ConflictError || error instanceof NotFoundError) return { error };
                throw error;
            }
        });
        if (result.error) throw result.error;
        return result.view;
    }

    async observe(handle, input, { signal } = {}) {
        assertObject(input, ['runId', 'cursor', 'limit'], 'Run observe');
        assertNativeId(input.runId, 'orchestrationRun'); boundedLimit(input.limit);
        let view = await this.#view(handle, input.runId);
        const previous = input.cursor === null ? null : this.#lookup(input.cursor, handle, 'projection', input.runId);
        if (previous && previous.limit !== input.limit) resync();
        if (previous && (previous.epoch !== view.root.epoch || previous.visibilityDigest !== view.visibilityDigest)) resync();
        if (previous && previous.digest === hash(view.payload) && this.pollMs > 0) {
            await delay(this.pollMs, undefined, { signal }); view = await this.#view(handle, input.runId);
            if (previous.epoch !== view.root.epoch || previous.visibilityDigest !== view.visibilityDigest) resync();
        }
        const changed = !previous || previous.digest !== hash(view.payload), seq = previous ? previous.seq + (changed ? 1 : 0) : 0;
        const projectionId = previous?.projectionId ?? randomUUID();
        // A cursor advances one stream once. Concurrent/replayed reads resync
        // instead of assigning the same visible sequence to different states.
        if (previous) {
            if (this.#cursors.get(input.cursor) !== previous) resync();
            this.#cursors.delete(input.cursor);
        }
        const cursor = this.#remember({ handle, kind: 'projection', scope: input.runId, hostBootId: this.hostBootId,
            projectionId, epoch: view.root.epoch, visibilityDigest: view.visibilityDigest, digest: hash(view.payload), seq, limit: input.limit });
        return { schemaVersion: 1, runId: input.runId, projectionId, hostBootId: this.hostBootId, epoch: view.root.epoch,
            projectionVersion: 1, visibilityDigest: view.visibilityDigest, seq, cursor, kind: previous ? 'deltaBatch' : 'snapshot',
            payload: previous ? { fromSeq: previous.seq, toSeq: seq, baseProjectionVersion: 1,
                changes: changed ? [{ seq, snapshot: this.#window(view.payload, input.limit) }] : [] } : this.#window(view.payload, input.limit) };
    }

    #window(payload, limit) {
        const value = cloneNativeDocument(payload), hasMore = {};
        for (const collection of ['nodes', 'edges', 'attempts', 'effects', 'approvals', 'events']) {
            const holder = ['nodes', 'edges'].includes(collection) ? value.graph : value;
            hasMore[collection] = holder[collection].length > limit; holder[collection] = holder[collection].slice(0, limit);
        }
        return { ...value, hasMore };
    }

    async details(handle, input) {
        assertObject(input, ['runId', 'collection', 'cursor', 'limit'], 'Run details');
        assertNativeId(input.runId, 'orchestrationRun'); boundedLimit(input.limit);
        if (!['nodes', 'edges', 'attempts', 'effects', 'approvals', 'events'].includes(input.collection)) throw new TypeError('Invalid Run metadata collection');
        const scope = hash({ runId: input.runId, collection: input.collection });
        const previous = input.cursor === null ? null : this.#lookup(input.cursor, handle, 'details', scope);
        const { root, payload, visibilityDigest } = await this.#view(handle, input.runId);
        if (previous && (previous.version !== root.stateVersion || previous.epoch !== root.epoch || previous.visibilityDigest !== visibilityDigest)) resync();
        const collection = ['nodes', 'edges'].includes(input.collection) ? payload.graph[input.collection] : payload[input.collection];
        const start = previous?.offset ?? 0, items = collection.slice(start, start + input.limit);
        return { runId: input.runId, collection: input.collection, versions: payload.versions, items,
            cursor: start + items.length < collection.length ? this.#remember({ handle, kind: 'details', scope, hostBootId: this.hostBootId,
                version: root.stateVersion, epoch: root.epoch, visibilityDigest, offset: start + items.length }) : null };
    }

    async diagnostics(handle, input) {
        assertObject(input, ['runId'], 'Run diagnostics'); assertNativeId(input.runId, 'orchestrationRun');
        const { payload } = await this.#view(handle, input.runId);
        return { runId: input.runId, diagnostics: payload.diagnostics, controls: payload.controls };
    }

    async cancel(handle, commandId, input) {
        // The original Run CAS fences the entire descendant tree and preserves
        // pending Effects/fees. Disconnection never calls this method.
        const root = await this.runs.cancel(handle, commandId, input);
        return { runId: root.runId, status: root.status, cancelRequested: root.cancelRequested,
            versions: { epoch: root.epoch, stateVersion: root.stateVersion, graphRevision: root.graphRevision } };
    }
}
