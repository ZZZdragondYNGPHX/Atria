import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fields } from '../../public/shared/native-values.js';
import { informationDefinition, projectInformation } from '../../public/shared/native-information-runtime.js';
import { hashNativeDocument as hash } from './repositories/common.js';
import { checkCancellation } from './model-prompt-runtime/execution-utils.js';
import { selectNativeRuntimeRoute } from './adapters/generation-host.js';
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

export const usablePublicItem = item => (!item.cognition || item.cognition.sourceCurrent && item.cognition.status === 'active'
    && (item.semantic !== 'intention' || item.cognition.selection === 'current'))
    && (!item.memory || item.memory.sourceCurrent && item.memory.status === 'active' && item.memory.applicability === 'applicable'
        && ['willing', 'reluctant'].includes(item.memory.use)) && (!item.causality || item.causality.sourceCurrent);

export async function describeSessionProtocols(host, handle, input) {
    fields(input, ['sessionId', 'revisionId'], 'Protocol description');
    const base = await host.sessionCore.load(handle, input.sessionId);
    if (base.revision.revisionId !== input.revisionId) fail('native_generation_revision_conflict');
    await host.sessionCore.runs.assert(handle, input.sessionId, 'generate', input.revisionId);
    const route = selectNativeRuntimeRoute(await host.persistence.listRuntimeRoutes(handle), 'role.narrator');
    const services = [];
    for (const protocol of ['mcp', 'a2a']) {
        const policy = route.executionPolicy?.[protocol]; if (!policy) continue;
        const connection = await host.persistence.getConnectionProfile(handle, policy.connectionProfileId);
        if (connection?.scope !== 'player' || connection.providerAdapter !== 'provider.' + protocol || connection.transport !== 'transport.http') continue;
        if (protocol === 'mcp') {
            for (const toolName of policy.toolNames) services.push({ protocol, toolName, label: 'MCP · ' + toolName });
            for (const resourceUri of policy.resourceUris) services.push({ protocol, resourceUri, label: 'MCP · ' + resourceUri });
        } else for (const skillId of policy.skillIds) services.push({ protocol, skillId, label: 'A2A · ' + skillId });
    }
    const items = []; let scanned = 0;
    for (const view of informationDefinition(base)?.views ?? []) {
        if (view.audience !== 'player' || !view.exposure.includes('display')) continue;
        const projection = projectInformation(base, view.id, { purpose: 'display', includeRollups: false,
            onScan: count => { scanned += count; if (scanned > 4096) fail('native_protocol_scan_limit'); } });
        if (projection.truncated) continue;
        for (const item of projection.items) {
            const content = item.data.text ?? item.data.content;
            if (items.length < 32 && usablePublicItem(item) && typeof content === 'string' && content.trim() && Buffer.byteLength(content) <= 4096) {
                items.push({ viewId: view.id, itemId: item.id, label: content.slice(0, 80) });
            }
        }
    }
    const control = await host.sessionCore.runs.status(handle, input.sessionId), tasks = [], identities = new Set();
    for (const operation of Object.values(control?.operations ?? {})) {
        if (operation.anchor?.revisionId !== input.revisionId || operation.anchor.branchId !== base.revision.branchId) continue;
        for (const [operationId, row] of Object.entries(operation.externalTasks ?? {}).reverse()) {
            if (!row.identity || row.expiresAt <= Date.now() || !services.some(service => service.skillId === row.input.skillId)
                || !items.some(item => item.viewId === row.input.viewId && item.itemId === row.input.itemId)) continue;
            const id = JSON.stringify(row.identity); if (identities.has(id)) continue; identities.add(id);
            tasks.push({ operationId, sessionId: input.sessionId, label: row.input.skillId });
        }
    }
    return { sessionId: input.sessionId, revisionId: input.revisionId, services, items, tasks,

        routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId } };
}

// Shared original Session display authority and RunControl work, not a connector ledger.
export class SessionPublicWork {
    constructor({ host, protocol, permit }) { Object.assign(this, { host, protocol, permit }); }
    async capture(handle, input, { readOnly = false } = {}) {
        const base = await this.host.sessionCore[readOnly ? 'observe' : 'load'](handle, input.sessionId);
        if (base.revision.revisionId !== input.revisionId) fail('native_' + this.protocol + '_revision_conflict');
        await this.host.sessionCore.runs.assert(handle, input.sessionId, 'generate', input.revisionId);
        const view = informationDefinition(base)?.views.find(view => view.id === input.viewId);
        if (view?.audience !== 'player' || !view.exposure.includes('display')) fail('native_' + this.protocol + '_display_denied');
        let scanned = 0;
        const projection = projectInformation(base, view.id, { purpose: 'display', includeRollups: false,
            onScan: count => { scanned += count; if (scanned > 4096) fail('native_' + this.protocol + '_scan_limit'); } });
        const item = projection.items.find(item => item.id === input.itemId);
        if (projection.truncated || !item || !usablePublicItem(item)) fail('native_' + this.protocol + '_display_denied');
        const text = item.data.text ?? item.data.content;
        if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 4096) fail('native_' + this.protocol + '_display_denied');
        const route = selectNativeRuntimeRoute(await this.host.persistence.listRuntimeRoutes(handle), 'role.narrator', input.routeRef);
        if (route.scope !== 'player') fail('native_' + this.protocol + '_route_invalid');
        const policy = route.executionPolicy?.[this.protocol];
        if (!policy) return { fallback: { status: 'fallback', reason: 'native_' + this.protocol + '_not_configured' } };
        if (!this.permit(policy, input)) fail('native_' + this.protocol + '_allowlist_denied');
        const connection = await this.host.persistence.getConnectionProfile(handle, policy.connectionProfileId);
        if (connection?.scope !== 'player' || connection.providerAdapter !== 'provider.' + this.protocol || connection.transport !== 'transport.http') fail('native_' + this.protocol + '_connection_invalid');
        if (policy.auth === 'secret' && !connection.secretRef) fail('native_' + this.protocol + '_secret_unavailable');
        return { base, text, route, policy, connection, source: projection.anchor,
            fingerprint: hash({ item, source: projection.anchor, route, connection, input }),
            items: base.timeline.length + Object.values(base.states.atri_lifecycle.domains).reduce((sum, domain) => sum + domain.records.length, 0) + scanned + 1,
            bytes: Buffer.byteLength(JSON.stringify({ base, input, route, connection })) };
    }
    async fresh(handle, input, captured) {
        try { return (await this.capture(handle, input)).fingerprint === captured.fingerprint; } catch { return false; }
    }
    async work(handle, input, captured, signal, operation, kind = this.protocol + '_protocol', trustedWork) {
        checkCancellation(signal);
        await trustedWork?.assertCurrent();
        const attempt = { attemptId: trustedWork ? trustedWork.nextAttemptId() : randomUUID(), requestId: this.protocol + ':' + captured.fingerprint, kind,
            estimatedItems: captured.items, estimatedInputBytes: captured.bytes, targetFingerprint: captured.fingerprint };
        const receipt = trustedWork ? await trustedWork.chargeLocalWork(captured.route.executionPolicy.computeBudget, attempt)
            : await this.host.sessionCore.runs.chargeLocalWork(handle, captured.base,
                { branchId: captured.base.revision.branchId, revisionId: input.revisionId }, captured.route.executionPolicy.computeBudget, attempt);
        if (!receipt) fail('native_' + this.protocol + '_budget_unavailable');
        const start = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed';
        try {
            checkCancellation(signal);
            if (!await this.fresh(handle, input, captured)) fail('native_' + this.protocol + '_source_stale');
            await trustedWork?.assertCurrent();
            const result = await operation();
            checkCancellation(signal);
            if (!await this.fresh(handle, input, captured)) fail('native_' + this.protocol + '_source_stale');
            outcome = 'completed'; return result;
        } finally {
            const used = process.cpuUsage(cpu);
            const usage = { wallMs: performance.now() - start, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome: signal?.aborted ? 'cancelled' : outcome };
            if (trustedWork) await trustedWork.settleLocalWork(attempt.attemptId, usage);
            else await this.host.sessionCore.runs.settleLocalWork(handle, input.sessionId, receipt.operation, attempt.attemptId, usage);
        }
    }
}
