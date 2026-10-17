import { randomUUID } from 'node:crypto';
import { fields, assertJsonDeclaration } from '../../public/shared/native-values.js';
import { hashNativeDocument as hash } from './repositories/common.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { immutable, checkCancellation, containsSecret } from './model-prompt-runtime/execution-utils.js';
import { SessionPublicWork } from './session-public-work.js';
import { createMcpHttpClient } from './mcp-http-client.js';
import { canonicalCredentialTarget } from './model-prompt-runtime/credential-targets.js';

const states = new WeakMap(), terminal = new Set(['completed', 'failed', 'cancelled', 'stale']);
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

// Explicit READ consumer of one existing player display item; external data is
// transient provenance, never a World/Memory/Task/Goal publication.
export class McpService {
    #completionProofs = new WeakMap();
    constructor({ host, scheduler = nativeTaskScheduler, clientFactory = createMcpHttpClient, now = Date.now }) {
        Object.assign(this, { host, scheduler, clientFactory, now });
        const engine = host.persistence?._engine ?? host.sessionCore._sessions._engine;
        if (!states.has(engine)) states.set(engine, { id: randomUUID(), records: new Map() });
        this.state = states.get(engine);
        this.publicWork = new SessionPublicWork({ host, protocol: 'mcp',
            permit: (policy, input) => input.toolName ? policy.toolNames.includes(input.toolName) : policy.resourceUris.includes(input.resourceUri) });
    }
    _capture(handle, input) { return this.publicWork.capture(handle, input); }
    _fresh(handle, input, captured) { return this.publicWork.fresh(handle, input, captured); }
    _work(handle, input, captured, signal, operation, kind, trustedWork) { return this.publicWork.work(handle, input, captured, signal, operation, kind, trustedWork); }
    _prune() {
        for (const [id, record] of this.state.records) {
            const operation = record.scheduler.operations.get(id);
            if ((!operation || terminal.has(operation.view.status) && !record.scheduler.running.has(operation)) && record.expiresAt <= this.now()) this.state.records.delete(id);
        }
    }
    async start(handle, raw, signal, trustedWork) {
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
        await this._work(handle, input, captured, signal, async () => {}, 'context_build', trustedWork);
        const record = { owner: handle, scheduler: this.scheduler, input, captured, expiresAt: this.now() + 600000, artifact: null, failure: null, dispatched: false };
        const operation = this.scheduler.submit({ owner: handle, kind: 'auxiliary_task', executionClass: 'interactive', retry: false, signal,
            key: this.state.id + ':mcp:' + randomUUID(), fingerprint: captured.fingerprint,
            resources: [this.state.id + ':mcp:' + handle, 'mcp:' + captured.connection.connectionProfileId],
            anchor: { sessionId: input.sessionId, branchId: captured.base.revision.branchId, revisionId: input.revisionId },
            fresh: () => this._fresh(handle, input, captured),
            run: async ({ signal: taskSignal }) => {
                try {
                    await trustedWork?.assertCurrent();
                    let headers = {}, secret;
                    if (captured.policy.auth === 'secret') {
                        secret = await this.host.secretPort.resolveSecret(captured.connection.secretRef, { handle, signal: taskSignal, connection: captured.connection });
                        if (typeof secret !== 'string' || !secret) fail('native_mcp_secret_unavailable');
                        headers = { Authorization: 'Bearer ' + secret };
                    }
                    const client = this.clientFactory({ url: captured.connection.endpoint, headers,
                        toolNames: captured.policy.toolNames, resourceUris: captured.policy.resourceUris });
                    const options = { signal: taskSignal, aroundRequest: ({ method }, operation) => this._work(handle, input, captured,
                        method === 'notifications/cancelled' ? undefined : taskSignal, async () => {
                            try {
                                const result = await operation(); record.dispatched = true;
                                if (containsSecret(result, secret)) fail('native_mcp_response_contains_secret');
                                return result;
                            } catch (error) {
                                if (error.dispatched) record.dispatched = true;
                                throw error;
                            }
                        }, undefined, trustedWork) };
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
                if (trustedWork?.onCompleted) {
                    const evidence = artifact.provenance.evidence.at(-1);
                    const proof = Object.freeze({});
                    this.#completionProofs.set(proof, { handle, bindingDigest: trustedWork.completionBindingDigest,
                        evidence: immutable({ protocol: 'mcp', operation: input.toolName ? 'tool' : 'resource', operationId: operation.operationId,
                            inputHash: hash(input), endpointBindingDigest: hash(canonicalCredentialTarget(captured.connection)),
                            sourceFingerprint: captured.fingerprint, method: evidence.method, requestFingerprint: evidence.requestFingerprint,
                            resultHash: artifact.provenance.outputFingerprint,
                            responseFingerprint: evidence.responseFingerprint, remoteReportedError: artifact.result.isError === true }) });
                    try { await trustedWork.onCompleted(proof); } finally { this.#completionProofs.delete(proof); }
                }
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
    // A plain object, serialized proof or old scheduler status is never an
    // original completion capability. Valid only inside the awaited callback.
    verifyCompletion(handle, proof, expected) {
        const record = this.#completionProofs.get(proof);
        if (!record || record.handle !== handle || record.bindingDigest !== expected.bindingDigest
            || record.evidence.inputHash !== expected.inputHash || record.evidence.endpointBindingDigest !== expected.endpointBindingDigest
            || record.evidence.operation !== expected.operation) fail('native_mcp_completion_proof_invalid');
        return record.evidence;
    }
    cancel(handle, raw) {
        fields(raw, ['operationId'], 'MCP cancellation');
        const record = this.state.records.get(raw.operationId);
        if (!record || record.owner !== handle || record.scheduler !== this.scheduler) fail('native_mcp_operation_missing');
        return { cancelled: this.scheduler.cancel(handle, raw.operationId), remoteRollbackConfirmed: false };
    }
}
