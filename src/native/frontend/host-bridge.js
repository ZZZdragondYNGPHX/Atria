import { fixedHostTarget } from '../../../public/shared/native-frontend-host.js';
import { readFixedHost, writeFixedHost } from './host-services.js';
import { onFrontendEpochInvalidated } from './epoch.js';
import { randomUUID } from 'node:crypto';
import { fields } from '../../../public/shared/native-frontend-contract.js';
import { bridgeFailure, bridgeReceipt, bridgeValue, mapBridgeInput, publicBridgeError, projectBridgeCollection } from '../../../public/shared/native-frontend-bridge.js';
import { canonicalJson, hash } from './bridge.js';
import { projectApplication } from '../lifecycle-authority.js';
import { resolveNativeRuntimePackage } from '../runtime-descriptor.js';

// Transient capability/receipt cache, never an authority store. Authority CAS and
// durable invocation receipts remain in SessionCore / NativeGenerationHost.
export class FrontendBridgeService {
    constructor({ retention = 128, ttl = 30 * 60 * 1000 } = {}) { this.experiences = new Map(); this.retention = retention; this.ttl = ttl; this.unsubscribe = onFrontendEpochInvalidated((owner, id) => this.revoke(owner, id)); }
    dispose() { this.unsubscribe(); for (const state of this.experiences.values()) this.revoke(state.owner, state.sessionId); }
    revoke(owner, sessionId) {
        for (const [key, state] of this.experiences) if (state.owner === owner && state.sessionId === sessionId) {
            state.revoked = true; state.operations.forEach(op => op.controller.abort()); this.experiences.delete(key);
        }
    }
    close(owner, epoch) {
        const state = this.experiences.get(epoch);
        if (state?.owner === owner) { state.revoked = true; state.operations.forEach(op => op.controller.abort()); this.experiences.delete(epoch); }
    }
    async open(services, owner, sessionId, previous = null) {
        if (previous) { const old = this.experiences.get(previous); if (old?.owner === owner && old.sessionId === sessionId) this.close(owner, previous); }
        for (const state of this.experiences.values()) if (state.expires < Date.now()) this.close(state.owner, state.epoch);
        if (this.experiences.size >= this.retention) throw bridgeFailure('bridge_backpressure');
        const snapshot = await services.core.load(owner, sessionId);
        const installed = await services.core._openPackage(owner, snapshot.session.packageId, snapshot.session.packageVersionId, snapshot.session.entryPointId);
        const resolved = resolveNativeRuntimePackage(installed, snapshot.session.entryPointId);
        const graph = resolved.frontendGraph;
        if (!graph) throw bridgeFailure('bridge_unavailable');
        const scopes = new Map(graph.resources.filter(ref => ref.kind === 'component').map(ref => {
            const ir = JSON.parse(installed.sourceFiles.get(ref.path).toString('utf8')); return [ir.id, new Set(ir.uses)];
        }));
        const epoch = randomUUID();
        const state = { owner, sessionId, epoch, graph, scopes, installed, branchId: snapshot.revision.branchId,
            packageHash: snapshot.session.packageContentHash, expires: Date.now() + this.ttl, cursors: new Map(), receipts: new Map(), operations: new Map(), revoked: false };
        if (this.experiences.size >= this.retention) throw bridgeFailure('bridge_backpressure');
        this.experiences.set(epoch, state);
        return bridgeReceipt({ epoch, revision: snapshot.revision.revisionId, data: { descriptorDigest: hash(canonicalJson(graph.bridge)) } });
    }
    async current(services, state) {
        if (state.revoked || state.expires < Date.now()) { this.close(state.owner, state.epoch); throw bridgeFailure('bridge_epoch_stale'); }
        const base = await services.core.load(state.owner, state.sessionId);
        if (state.revoked || base.revision.branchId !== state.branchId || base.session.packageContentHash !== state.packageHash) {
            this.revoke(state.owner, state.sessionId); throw bridgeFailure('bridge_epoch_stale');
        }
        return base;
    }
    async request(services, owner, request) {
        let state, binding, base;
        try {
            fields(request, ['epoch', 'componentId', 'bindingId', 'method', 'input', 'revision', 'cursor', 'idempotencyKey', 'operationId']);
            state = this.experiences.get(request.epoch);
            if (!state || state.owner !== owner) throw bridgeFailure('bridge_epoch_stale');
            base = await this.current(services, state);
            if (request.method === 'status') return bridgeReceipt({ epoch: state.epoch, revision: base.revision.revisionId });
            binding = state.graph.bridge.bindings.find(item => item.id === request.bindingId);
            if (!binding || !state.scopes.get(request.componentId)?.has(binding.id)) throw bridgeFailure('bridge_binding_denied');
            const receipt = values => bridgeReceipt({ bindingId: binding.id, epoch: state.epoch, revision: base.revision.revisionId, schemaDigest: binding.schemaDigest, ...values });
            if (request.method === 'host.authorize') {
                if (!binding.target.service || !fixedHostTarget(binding.target, binding.outputSchema?.properties?.data).local) throw bridgeFailure('bridge_method_denied');
                if (request.revision !== base.revision.revisionId) throw bridgeFailure('bridge_revision_stale');
                bridgeValue(request.input ?? {}, binding.inputSchema);
                return receipt({});
            }
            if (['operation.get', 'operation.cancel'].includes(request.method)) {
                const op = state.operations.get(request.operationId);
                if (!op || op.bindingId !== binding.id || binding.kind !== 'operation') throw bridgeFailure('bridge_operation_denied');
                if (request.method === 'operation.cancel' && !['completed', 'failed', 'cancelled'].includes(op.status)) { op.controller.abort(); op.status = 'cancelled'; }
                return receipt({ status: op.status, operationId: request.operationId, data: op.status === 'completed' ? op.data : null, error: op.error ?? null });
            }
            const input = bridgeValue(request.input ?? {}, binding.inputSchema);
            if (binding.kind !== 'read') {
                if (typeof request.idempotencyKey !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(request.idempotencyKey)) throw bridgeFailure('bridge_idempotency_required');
                const key = binding.id + ':' + request.idempotencyKey;
                const fingerprint = hash(canonicalJson({ input, revision: request.revision, method: request.method }));
                const previous = state.receipts.get(key);
                if (previous) { if (previous.fingerprint !== fingerprint) throw bridgeFailure('bridge_idempotency_conflict'); if (previous.result) return await previous.result; }
                if (state.receipts.size >= 256) throw bridgeFailure('bridge_backpressure');
                if (!binding.target.transactionId && request.revision !== base.revision.revisionId) throw bridgeFailure('bridge_revision_stale');
                const result = this.write(services, state, binding, request, input, base, receipt);
                const cached = { fingerprint, result };
                state.receipts.set(key, cached);
                if (binding.target.transactionId) result.catch(() => { cached.result = null; });
                return await result;
            }
            if (request.revision !== base.revision.revisionId) throw bridgeFailure('bridge_revision_stale');
            const values = binding.target.service ? await readFixedHost(services.core, owner, state, base, binding, mapBridgeInput(binding, input)) : binding.target.resourceId
                ? JSON.parse(state.installed.assets.get(state.installed.manifest.runtime.experienceContract.dataResources.find(ref => ref.resourceId === binding.target.resourceId).assetId).toString('utf8'))
                : projectApplication(base, binding.target.domainId).map(({ id, value }) => ({ id, value }));
            if (state.revoked) throw bridgeFailure('bridge_epoch_stale');
            if (!binding.collection) {
                if (request.method !== 'read.snapshot' || request.cursor) throw bridgeFailure('bridge_method_denied');
                return receipt({ data: bridgeValue(values, binding.outputSchema) });
            }
            if (request.method !== 'read.page' || !Array.isArray(values) || values.length > 10000) throw bridgeFailure('bridge_method_denied');
            const query = hash(canonicalJson({ input, binding: binding.id, order: binding.collection.orderBy, source: hash(canonicalJson(values)) }));
            let offset = 0;
            if (request.cursor) {
                const cursor = state.cursors.get(request.cursor);
                if (!cursor || cursor.query !== query || cursor.revision !== base.revision.revisionId) throw bridgeFailure('bridge_cursor_stale');
                offset = cursor.offset;
            }
            const { pageSize } = binding.collection;
            const rows = projectBridgeCollection(binding, values, input);
            let cursor = null;
            if (offset + pageSize < rows.length) {
                if (state.cursors.size >= 512) throw bridgeFailure('bridge_backpressure');
                cursor = randomUUID(); state.cursors.set(cursor, { query, revision: base.revision.revisionId, offset: offset + pageSize });
            }
            return receipt({ data: rows.slice(offset, offset + pageSize), cursor });
        } catch (error) {
            return bridgeReceipt({ bindingId: binding?.id ?? null, epoch: state?.epoch ?? null, revision: base?.revision.revisionId ?? null,
                status: 'failed', error: publicBridgeError(error) });
        }
    }
    async write(services, state, binding, request, input, base, receipt) {
        const mapped = mapBridgeInput(binding, input);
        if (binding.target.service) {
            if (request.method !== 'action.invoke') throw bridgeFailure('bridge_method_denied');
            return receipt(await writeFixedHost(services.core, state.owner, state, binding, mapped, request.revision));
        }
        const invocationId = 'fb:' + hash(canonicalJson({ epoch: state.epoch, binding: binding.id, key: request.idempotencyKey }));
        if (binding.kind === 'action' && binding.target.transactionId && request.method === 'action.invoke') {
            const host = services.generationHost ?? await services.getGenerationHost?.();
            if (!host) throw bridgeFailure('bridge_operation_unavailable');
            const tasks = base.manifest.runtime.experienceContract.taskRuntime.tasks;
            const slotBindings = Object.assign({}, ...await Promise.all(tasks.map(task => services.taskBindings?.(state.owner, base.session.packageId, task) ?? {})));
            // Epoch is a transport capability, not the durable action identity.
            const turnId = 'fb-at:' + hash(canonicalJson({ sessionId: state.sessionId, binding: binding.id, key: request.idempotencyKey }));
            const snapshot = await host.executeTurn(state.owner, { sessionId: state.sessionId, revisionId: request.revision,
                invocationId: turnId, slotBindings }, undefined, undefined,
            { transaction: { transactionId: binding.target.transactionId, input: mapped } });
            if (snapshot.states.atri_run?.status !== 'dead' || snapshot.states.atri_run.mode !== 'ironman') await this.current(services, state);
            return receipt({ revision: snapshot.revision.revisionId, data: {} });
        }
        if (binding.kind === 'action' && request.method === 'action.invoke') {
            const snapshot = await services.core.applyLifecycleCommand(state.owner, state.sessionId, { type: 'lifecycle', invocationId,
                action: { kind: 'app.command', domainId: binding.target.domainId, commandId: binding.target.commandId, recordId: binding.target.recordId ?? binding.target.domainId, args: mapped } },
            { expectedRevisionId: request.revision });
            await this.current(services, state);
            return receipt({ revision: snapshot.revision.revisionId, data: {} });
        }
        if (binding.kind !== 'operation' || request.method !== 'operation.start') throw bridgeFailure('bridge_method_denied');
        if ((!services.generationHost && !services.getGenerationHost) || !services.taskBindings) throw bridgeFailure('bridge_operation_unavailable');
        if (state.operations.size >= 64) throw bridgeFailure('bridge_backpressure');
        const task = state.installed.manifest.runtime.experienceContract.taskRuntime.tasks.find(item => item.id === binding.target.taskId);
        const operationId = randomUUID(), op = { bindingId: binding.id, status: 'queued', controller: new AbortController() };
        state.operations.set(operationId, op);
        const run = async () => {
            try {
                const generationHost = services.generationHost ?? await services.getGenerationHost();
                const slotBindings = await services.taskBindings(state.owner, base.session.packageId, task);
                await this.current(services, state);
                if (op.controller.signal.aborted) throw bridgeFailure('bridge_cancelled');
                op.status = 'running';
                const result = await generationHost.executeTask(state.owner, { sessionId: state.sessionId, revisionId: request.revision, taskId: task.id,
                    variantId: binding.target.variantId ?? task.variants[0].id, input: mapped, invocationId, slotBindings }, op.controller.signal,
                chunk => { if (!state.revoked && !op.controller.signal.aborted && chunk.text !== undefined) op.status = 'progress'; });
                await this.current(services, state);
                if (!op.controller.signal.aborted) { op.data = bridgeValue(result.record.payload, binding.outputSchema); op.status = 'completed'; }
            } catch (error) { if (!state.revoked) { op.error = publicBridgeError(error); op.status = op.controller.signal.aborted ? 'cancelled' : 'failed'; } }
        };
        void run();
        return receipt({ operationId, status: 'queued' });
    }
}
export const frontendBridgeService = new FrontendBridgeService();
