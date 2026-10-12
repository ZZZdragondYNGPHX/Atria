import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fields, assertJsonDeclaration } from '../../public/shared/native-values.js';
import { informationDefinition, projectInformation } from '../../public/shared/native-information-runtime.js';
import { hashNativeDocument as hash } from './repositories/common.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { immutable, checkCancellation } from './model-prompt-runtime/execution-utils.js';
import { selectNativeRuntimeRoute } from './adapters/generation-host.js';
import { createMcpHttpClient } from './mcp-http-client.js';

const states = new WeakMap(), terminal = new Set(['completed', 'failed', 'cancelled', 'stale']);
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

// Explicit READ consumer of one existing player display item; external data is
// transient provenance, never a World/Memory/Task/Goal publication.
export class McpService {
    constructor({ host, scheduler = nativeTaskScheduler, clientFactory = createMcpHttpClient, now = Date.now }) {
        Object.assign(this, { host, scheduler, clientFactory, now });
        const engine = host.persistence?._engine ?? host.sessionCore._sessions._engine;
        if (!states.has(engine)) states.set(engine, { id: randomUUID(), records: new Map() });
        this.state = states.get(engine);
    }
    async _capture(handle, input) {
        const base = await this.host.sessionCore.load(handle, input.sessionId);
        if (base.revision.revisionId !== input.revisionId) fail('native_mcp_revision_conflict');
        await this.host.sessionCore.runs.assert(handle, input.sessionId, 'generate', input.revisionId);
        const view = informationDefinition(base)?.views.find(view => view.id === input.viewId);
        if (view?.audience !== 'player' || !view.exposure.includes('display')) fail('native_mcp_display_denied');
        let scanned = 0;
        const projection = projectInformation(base, view.id, { purpose: 'display', includeRollups: false,
            onScan: count => { scanned += count; if (scanned > 4096) fail('native_mcp_scan_limit'); } });
        const item = projection.items.find(item => item.id === input.itemId);
        if (projection.truncated || !item || item.cognition && (!item.cognition.sourceCurrent || item.cognition.status !== 'active'
            || item.semantic === 'intention' && item.cognition.selection !== 'current')
            || item.memory && (!item.memory.sourceCurrent || item.memory.status !== 'active' || item.memory.applicability !== 'applicable'
                || !['willing', 'reluctant'].includes(item.memory.use))
            || item.causality && !item.causality.sourceCurrent) fail('native_mcp_display_denied');
        const text = item.data.text ?? item.data.content;
        if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 4096) fail('native_mcp_display_denied');
        const route = selectNativeRuntimeRoute(await this.host.persistence.listRuntimeRoutes(handle), 'role.narrator', input.routeRef);
        if (route.scope !== 'player') fail('native_mcp_route_invalid');
        const policy = route.executionPolicy?.mcp;
        if (!policy) return { fallback: { status: 'fallback', reason: 'native_mcp_not_configured' } };
        if (input.toolName ? !policy.toolNames.includes(input.toolName) : !policy.resourceUris.includes(input.resourceUri)) fail('native_mcp_allowlist_denied');
        const connection = await this.host.persistence.getConnectionProfile(handle, policy.connectionProfileId);
        if (connection?.scope !== 'player' || connection.providerAdapter !== 'provider.mcp' || connection.transport !== 'transport.http') fail('native_mcp_connection_invalid');
        return { base, text, route, policy, connection, source: projection.anchor,
            fingerprint: hash({ item, source: projection.anchor, route, connection, input }),
            items: base.timeline.length + Object.values(base.states.atri_lifecycle.domains).reduce((sum, domain) => sum + domain.records.length, 0) + scanned + 1,
            bytes: Buffer.byteLength(JSON.stringify({ base, input, route, connection })) };
    }
    async _fresh(handle, input, captured) {
        try { return (await this._capture(handle, input)).fingerprint === captured.fingerprint; } catch { return false; }
    }
    async _work(handle, input, captured, signal, operation, kind = 'mcp_protocol') {
        checkCancellation(signal);
        const attempt = { attemptId: randomUUID(), requestId: 'mcp:' + captured.fingerprint, kind,
            estimatedItems: captured.items, estimatedInputBytes: captured.bytes, targetFingerprint: captured.fingerprint };
        const receipt = await this.host.sessionCore.runs.chargeLocalWork(handle, captured.base,
            { branchId: captured.base.revision.branchId, revisionId: input.revisionId }, captured.route.executionPolicy.computeBudget, attempt);
        if (!receipt) fail('native_mcp_budget_unavailable');
        const start = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed';
        try {
            checkCancellation(signal);
            if (!await this._fresh(handle, input, captured)) fail('native_mcp_source_stale');
            const result = await operation();
            checkCancellation(signal);
            if (!await this._fresh(handle, input, captured)) fail('native_mcp_source_stale');
            outcome = 'completed'; return result;
        } finally {
            const used = process.cpuUsage(cpu);
            await this.host.sessionCore.runs.settleLocalWork(handle, input.sessionId, receipt.operation, attempt.attemptId,
                { wallMs: performance.now() - start, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome: signal?.aborted ? 'cancelled' : outcome });
        }
    }
    _prune() {
        for (const [id, record] of this.state.records) {
            const operation = record.scheduler.operations.get(id);
            if ((!operation || terminal.has(operation.view.status) && !record.scheduler.running.has(operation)) && record.expiresAt <= this.now()) this.state.records.delete(id);
        }
    }
    async start(handle, raw, signal) {
        const input = assertJsonDeclaration(raw, 'MCP request', 4096);
        fields(input, ['sessionId', 'revisionId', 'viewId', 'itemId', 'toolName', 'resourceUri', 'routeRef'], 'MCP request');
        if (![input.viewId, input.itemId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256)
            || (input.toolName !== undefined) === (input.resourceUri !== undefined)
            || input.toolName !== undefined && (typeof input.toolName !== 'string' || !input.toolName || input.toolName.length > 96)
            || input.resourceUri !== undefined && (typeof input.resourceUri !== 'string' || !input.resourceUri || input.resourceUri.length > 256)) fail('native_mcp_request_invalid');
        if (input.routeRef !== undefined) {
            fields(input.routeRef, ['scope', 'runtimeRouteId'], 'MCP Route');
            if (input.routeRef.scope !== 'player') fail('native_mcp_route_invalid');
        }
        checkCancellation(signal); this._prune();
        const captured = await this._capture(handle, input);
        if (captured.fallback) return captured.fallback;
        if (!captured.route.executionPolicy.computeBudget?.localWork) return { status: 'fallback', reason: 'native_mcp_budget_unavailable' };
        if (this.state.records.size >= 128) fail('native_mcp_retention_limit');
        await this._work(handle, input, captured, signal, async () => {}, 'context_build');
        const record = { owner: handle, scheduler: this.scheduler, input, captured, expiresAt: this.now() + 600000, artifact: null, failure: null, dispatched: false };
        const operation = this.scheduler.submit({ owner: handle, kind: 'auxiliary_task', executionClass: 'interactive', retry: false, signal,
            key: this.state.id + ':mcp:' + randomUUID(), fingerprint: captured.fingerprint,
            resources: [this.state.id + ':mcp:' + handle, 'mcp:' + captured.connection.connectionProfileId],
            anchor: { sessionId: input.sessionId, branchId: captured.base.revision.branchId, revisionId: input.revisionId },
            fresh: () => this._fresh(handle, input, captured),
            run: async ({ signal: taskSignal }) => {
                try {
                    let headers = {};
                    if (captured.policy.auth === 'secret') {
                        const secret = await this.host.secretPort.resolveSecret(captured.connection.secretRef, { handle, signal: taskSignal });
                        if (!secret) fail('native_mcp_secret_unavailable');
                        headers = { Authorization: 'Bearer ' + secret };
                    }
                    const client = this.clientFactory({ url: captured.connection.endpoint, headers,
                        toolNames: captured.policy.toolNames, resourceUris: captured.policy.resourceUris });
                    const options = { signal: taskSignal, aroundRequest: ({ method }, operation) => this._work(handle, input, captured,
                        method === 'notifications/cancelled' ? undefined : taskSignal, async () => {
                            try { const result = await operation(); record.dispatched = true; return result; } catch (error) {
                                if (error.dispatched) record.dispatched = true;
                                throw error;
                            }
                        }) };
                    const evidence = [(await client.initialize(options)).evidence];
                    let output;
                    if (input.toolName) {
                        const discovery = await client.listTools(options);
                        evidence.push(discovery.evidence);
                        if (!discovery.result.tools.some(tool => tool.name === input.toolName)) fail('native_mcp_tool_unavailable');
                        output = await client.callTool(input.toolName, { text: captured.text }, options);
                    } else {
                        const discovery = await client.listResources(options);
                        evidence.push(discovery.evidence);
                        if (!discovery.result.resources.some(resource => resource.uri === input.resourceUri)) fail('native_mcp_resource_unavailable');
                        output = await client.readResource(input.resourceUri, options);
                    }
                    evidence.push(output.evidence);
                    return immutable({ schemaVersion: 1, kind: 'mcp_external_data', result: output.result,
                        provenance: { external: true, connectionProfileId: captured.connection.connectionProfileId, profileFingerprint: hash(captured.connection),
                            protocolVersion: captured.policy.protocolVersion, source: captured.source, sourceFingerprint: captured.fingerprint,
                            inputFingerprint: hash(input.toolName ? { text: captured.text } : { uri: input.resourceUri }), outputFingerprint: hash(output.result), evidence } });
                } catch (error) {
                    if (/^mcp_[a-z_]+$/.test(error.code ?? '')) error.code = 'native_' + error.code;
                    const dispatched = error.dispatched === true || record.dispatched;
                    record.failure = { code: /^native_mcp_[a-z_]+$/.test(error.code ?? '') ? error.code : 'native_mcp_failed',
                        outcome: error.outcome === 'unknown' || dispatched ? 'unknown' : 'failed',
                        dispatched, remoteOutcome: dispatched ? 'unknown' : 'not_dispatched', remoteRollbackConfirmed: false };
                    throw error;
                }
            },
            finalize: async artifact => {
                if (!await this._fresh(handle, input, captured)) fail('native_mcp_source_stale');
                record.artifact = artifact; return artifact;
            },
        });
        this.state.records.set(operation.operationId, record);
        return { status: 'queued', operationId: operation.operationId };
    }
    async status(handle, raw) {
        fields(raw, ['operationId'], 'MCP status'); this._prune();
        const record = this.state.records.get(raw.operationId);
        if (!record || record.owner !== handle || record.scheduler !== this.scheduler) fail('native_mcp_operation_missing');
        const operation = this.scheduler.project(handle, raw.operationId), current = await this._fresh(handle, record.input, record.captured);
        return immutable({ ...operation, current, artifact: current && operation.status === 'completed' ? record.artifact : null, failure: record.failure });
    }
    cancel(handle, raw) {
        fields(raw, ['operationId'], 'MCP cancellation');
        const record = this.state.records.get(raw.operationId);
        if (!record || record.owner !== handle || record.scheduler !== this.scheduler) fail('native_mcp_operation_missing');
        return { cancelled: this.scheduler.cancel(handle, raw.operationId), remoteRollbackConfirmed: false };
    }
}
