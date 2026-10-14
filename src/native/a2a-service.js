import { randomUUID } from 'node:crypto';
import { fields, assertJsonDeclaration } from '../../public/shared/native-values.js';
import { hashNativeDocument as hash } from './repositories/common.js';
import { SessionPublicWork } from './session-public-work.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { immutable, checkCancellation, containsSecret } from './model-prompt-runtime/execution-utils.js';
import { createA2aHttpClient } from './a2a-http-client.js';

const states = new WeakMap(), terminal = new Set(['completed', 'failed', 'cancelled', 'stale']);
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

// Remote tasks are external evidence. Acquired identities live only in the
// original RunControl bank; restart never resends an uncertain SendMessage.
export class A2aService {
    constructor({ host, scheduler = nativeTaskScheduler, clientFactory = createA2aHttpClient, now = Date.now, retentionMs = 7 * 86400000 }) {
        if (!Number.isSafeInteger(retentionMs) || retentionMs < 1 || retentionMs > 30 * 86400000) fail('native_a2a_retention_invalid');
        Object.assign(this, { host, scheduler, clientFactory, now, retentionMs });
        const engine = host.persistence?._engine ?? host.sessionCore._sessions._engine;
        if (!states.has(engine)) states.set(engine, { id: randomUUID(), records: new Map() });
        this.state = states.get(engine);
        this.publicWork = new SessionPublicWork({ host, protocol: 'a2a', permit: (policy, input) => policy.skillIds.includes(input.skillId) });
    }
    _prune() {
        for (const [id, record] of this.state.records) {
            const operation = record.scheduler.operations.get(record.latestOperationId);
            if ((!operation || terminal.has(operation.view.status) && !record.scheduler.running.has(operation)) && record.expiresAt <= this.now()) this.state.records.delete(id);
        }
    }
    async _record(handle, raw) {
        fields(raw, ['operationId', 'sessionId'], 'A2A operation'); this._prune();
        let record = this.state.records.get(raw.operationId);
        if (record) {
            if (record.owner !== handle || record.scheduler !== this.scheduler || raw.sessionId && raw.sessionId !== record.input.sessionId) fail('native_a2a_operation_missing');
            return record;
        }
        if (typeof raw.sessionId !== 'string' || !raw.sessionId) fail('native_a2a_operation_missing');
        const base = await this.host.sessionCore.load(handle, raw.sessionId);
        const retained = await this.host.sessionCore.runs.externalTask(handle, raw.sessionId,
            { branchId: base.revision.branchId, revisionId: base.revision.revisionId }, raw.operationId);
        if (!retained || retained.expiresAt <= this.now()) fail('native_a2a_operation_missing');
        const captured = await this.publicWork.capture(handle, retained.input);
        if (captured.fallback || captured.fingerprint !== retained.fingerprint) fail('native_a2a_source_stale');
        record = { owner: handle, scheduler: this.scheduler, input: retained.input, captured, identity: retained.identity,
            artifact: null, failure: retained.status !== 'completed' ? { code: 'native_a2a_restart_unknown', outcome: 'unknown', dispatched: true, remoteOutcome: 'unknown', remoteRollbackConfirmed: false } : null,
            expiresAt: retained.expiresAt, latestOperationId: raw.operationId, durableStatus: retained.status, dispatched: retained.status !== 'queued', aliases: new Set([raw.operationId]) };
        this.state.records.set(raw.operationId, record); return record;
    }
    async _persist(record, status) {
        const retained = { protocol: 'a2a', input: record.input, fingerprint: record.captured.fingerprint,
            identity: record.identity, status, expiresAt: record.expiresAt };
        for (const operationId of record.aliases) await this.host.sessionCore.runs.externalTask(record.owner, record.input.sessionId,
            { branchId: record.captured.base.revision.branchId, revisionId: record.input.revisionId }, operationId, retained);
        record.durableStatus = status;
    }
    async start(handle, raw, signal) {
        const input = assertJsonDeclaration(raw, 'A2A request', 4096);
        fields(input, ['sessionId', 'revisionId', 'viewId', 'itemId', 'skillId', 'routeRef'], 'A2A request');
        if (![input.viewId, input.itemId, input.skillId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256)) fail('native_a2a_request_invalid');
        if (input.routeRef !== undefined) {
            fields(input.routeRef, ['scope', 'runtimeRouteId'], 'A2A Route');
            if (input.routeRef.scope !== 'player') fail('native_a2a_route_invalid');
        }
        checkCancellation(signal); this._prune();
        const captured = await this.publicWork.capture(handle, input);
        if (captured.fallback) return captured.fallback;
        if (!captured.route.executionPolicy.computeBudget?.localWork) return { status: 'fallback', reason: 'native_a2a_budget_unavailable' };
        if (this.state.records.size >= 128) fail('native_a2a_retention_limit');
        await this.publicWork.work(handle, input, captured, signal, async () => {}, 'context_build');
        const record = { owner: handle, scheduler: this.scheduler, input, captured, identity: null, artifact: null, failure: null,
            expiresAt: this.now() + this.retentionMs, latestOperationId: null, dispatched: false, aliases: new Set() };
        return this._submit(record, 'send', signal);
    }
    async _submit(record, action, signal) {
        const { owner: handle, input, captured } = record;
        const current = this.scheduler.operations.get(record.latestOperationId);
        if (current && (!terminal.has(current.view.status) || this.scheduler.running.has(current))) fail('native_a2a_operation_busy');
        record.failure = null;
        const operation = this.scheduler.submit({ owner: handle, kind: 'auxiliary_task', executionClass: 'interactive', retry: false, signal,
            key: this.state.id + ':a2a:' + randomUUID(), fingerprint: captured.fingerprint,
            resources: [this.state.id + ':a2a:' + handle, 'a2a:' + captured.connection.connectionProfileId],
            anchor: { sessionId: input.sessionId, branchId: captured.base.revision.branchId, revisionId: input.revisionId },
            fresh: () => this.publicWork.fresh(handle, input, captured),
            run: async ({ signal: taskSignal }) => {
                try {
                    await record.admission;
                    await this._persist(record, 'dispatched');
                    let headers = {}, secret;
                    if (captured.policy.auth === 'secret') {
                        secret = await this.host.secretPort.resolveSecret(captured.connection.secretRef, { handle, signal: taskSignal, connection: captured.connection });
                        if (typeof secret !== 'string' || !secret) fail('native_a2a_secret_unavailable');
                        headers = { Authorization: 'Bearer ' + secret };
                    }
                    const client = this.clientFactory({ url: captured.connection.endpoint, headers, skillIds: captured.policy.skillIds });
                    const options = { signal: taskSignal, aroundRequest: (_descriptor, request) => this.publicWork.work(handle, input, captured, taskSignal, async () => {
                        try {
                            const output = await request(); record.dispatched = true;
                            if (containsSecret(output, secret)) fail('native_a2a_response_contains_secret');
                            return output;
                        } catch (error) {
                            if (error.dispatched) record.dispatched = true;
                            throw error;
                        }
                    }) };
                    const discovery = await client.initialize(options);
                    if (!discovery.result.skills.some(skill => skill.id === input.skillId)) fail('native_a2a_skill_unavailable');
                    const output = action === 'send' ? await client.sendMessage(input.skillId, captured.text, options)
                        : action === 'get' ? await client.getTask(record.identity, options) : await client.cancelTask(record.identity, options);
                    const task = action === 'send' ? output.result.task : output.result;
                    if (task) record.identity = immutable({ id: task.id, contextId: task.contextId });
                    return immutable({ schemaVersion: 1, kind: 'a2a_external_data', action, result: output.result,
                        remoteRollbackConfirmed: false, recovery: 'durable_identity',
                        provenance: { external: true, connectionProfileId: captured.connection.connectionProfileId, profileFingerprint: hash(captured.connection),
                            protocolVersion: captured.policy.protocolVersion, source: captured.source, sourceFingerprint: captured.fingerprint,
                            inputFingerprint: hash(action === 'send' ? { skillId: input.skillId, text: captured.text } : record.identity),
                            outputFingerprint: hash(output.result), evidence: [discovery.evidence, output.evidence] } });
                } catch (error) {
                    if (/^a2a_[a-z_]+$/.test(error.code ?? '')) error.code = 'native_' + error.code;
                    const dispatched = error.dispatched === true || record.dispatched;
                    record.failure = { code: /^native_a2a_[a-z_]+$/.test(error.code ?? '') ? error.code : 'native_a2a_failed',
                        outcome: dispatched ? 'unknown' : 'failed', dispatched, remoteOutcome: dispatched ? 'unknown' : 'not_dispatched', remoteRollbackConfirmed: false };
                    try { await this._persist(record, dispatched ? 'unknown' : 'failed'); } catch { /* Existing charge/queued proof remains unknown, never resend. */ }
                    throw error;
                }
            },
            finalize: async artifact => {
                if (!await this.publicWork.fresh(handle, input, captured)) fail('native_a2a_source_stale');
                await this._persist(record, 'completed'); record.artifact = artifact; return artifact;
            },
        });
        record.latestOperationId = operation.operationId;
        record.aliases.add(operation.operationId);
        record.admission = this._persist(record, 'queued');
        try { await record.admission; } catch (error) { this.scheduler.cancel(handle, operation.operationId); throw error; }
        this.state.records.set(operation.operationId, record);
        return { sessionId: input.sessionId, status: 'queued', operationId: operation.operationId, action, remoteRollbackConfirmed: false };
    }
    async reconnect(handle, raw, signal) {
        const record = await this._record(handle, raw);
        if (!record.identity) fail('native_a2a_identity_unavailable');
        checkCancellation(signal);
        if (!await this.publicWork.fresh(handle, record.input, record.captured)) fail('native_a2a_source_stale');
        return this._submit(record, 'get', signal);
    }
    async status(handle, raw) {
        const record = await this._record(handle, raw), current = await this.publicWork.fresh(handle, record.input, record.captured);
        const operation = this.scheduler.operations.has(record.latestOperationId) ? this.scheduler.project(handle, record.latestOperationId)
            : { operationId: record.latestOperationId, status: 'interrupted', reason: 'native_a2a_process_restarted' };
        return immutable({ ...operation, current, artifact: current && operation.status === 'completed' ? record.artifact : null,
            failure: record.failure, canReconnect: current && Boolean(record.identity), recovery: 'durable_identity' });
    }
    async cancel(handle, raw, signal) {
        const record = await this._record(handle, raw);
        const operation = this.scheduler.operations.get(record.latestOperationId);
        if (operation && (!terminal.has(operation.view.status) || this.scheduler.running.has(operation))) {
            return { cancelled: this.scheduler.cancel(handle, record.latestOperationId), remoteRollbackConfirmed: false, remoteOutcome: 'unknown' };
        }
        if (!record.identity) return { cancelled: false, remoteRollbackConfirmed: false, remoteOutcome: 'unknown' };
        checkCancellation(signal);
        if (!await this.publicWork.fresh(handle, record.input, record.captured)) fail('native_a2a_source_stale');
        return this._submit(record, 'cancel', signal);
    }
}
