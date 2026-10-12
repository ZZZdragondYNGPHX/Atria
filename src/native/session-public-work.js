import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { informationDefinition, projectInformation } from '../../public/shared/native-information-runtime.js';
import { hashNativeDocument as hash } from './repositories/common.js';
import { checkCancellation } from './model-prompt-runtime/execution-utils.js';
import { selectNativeRuntimeRoute } from './adapters/generation-host.js';
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

// Shared original Session display authority and RunControl work, not a connector ledger.
export class SessionPublicWork {
    constructor({ host, protocol, permit }) { Object.assign(this, { host, protocol, permit }); }
    async capture(handle, input) {
        const base = await this.host.sessionCore.load(handle, input.sessionId);
        if (base.revision.revisionId !== input.revisionId) fail('native_' + this.protocol + '_revision_conflict');
        await this.host.sessionCore.runs.assert(handle, input.sessionId, 'generate', input.revisionId);
        const view = informationDefinition(base)?.views.find(view => view.id === input.viewId);
        if (view?.audience !== 'player' || !view.exposure.includes('display')) fail('native_' + this.protocol + '_display_denied');
        let scanned = 0;
        const projection = projectInformation(base, view.id, { purpose: 'display', includeRollups: false,
            onScan: count => { scanned += count; if (scanned > 4096) fail('native_' + this.protocol + '_scan_limit'); } });
        const item = projection.items.find(item => item.id === input.itemId);
        if (projection.truncated || !item || item.cognition && (!item.cognition.sourceCurrent || item.cognition.status !== 'active'
            || item.semantic === 'intention' && item.cognition.selection !== 'current')
            || item.memory && (!item.memory.sourceCurrent || item.memory.status !== 'active' || item.memory.applicability !== 'applicable'
                || !['willing', 'reluctant'].includes(item.memory.use))
            || item.causality && !item.causality.sourceCurrent) fail('native_' + this.protocol + '_display_denied');
        const text = item.data.text ?? item.data.content;
        if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 4096) fail('native_' + this.protocol + '_display_denied');
        const route = selectNativeRuntimeRoute(await this.host.persistence.listRuntimeRoutes(handle), 'role.narrator', input.routeRef);
        if (route.scope !== 'player') fail('native_' + this.protocol + '_route_invalid');
        const policy = route.executionPolicy?.[this.protocol];
        if (!policy) return { fallback: { status: 'fallback', reason: 'native_' + this.protocol + '_not_configured' } };
        if (!this.permit(policy, input)) fail('native_' + this.protocol + '_allowlist_denied');
        const connection = await this.host.persistence.getConnectionProfile(handle, policy.connectionProfileId);
        if (connection?.scope !== 'player' || connection.providerAdapter !== 'provider.' + this.protocol || connection.transport !== 'transport.http') fail('native_' + this.protocol + '_connection_invalid');
        return { base, text, route, policy, connection, source: projection.anchor,
            fingerprint: hash({ item, source: projection.anchor, route, connection, input }),
            items: base.timeline.length + Object.values(base.states.atri_lifecycle.domains).reduce((sum, domain) => sum + domain.records.length, 0) + scanned + 1,
            bytes: Buffer.byteLength(JSON.stringify({ base, input, route, connection })) };
    }
    async fresh(handle, input, captured) {
        try { return (await this.capture(handle, input)).fingerprint === captured.fingerprint; } catch { return false; }
    }
    async work(handle, input, captured, signal, operation, kind = this.protocol + '_protocol') {
        checkCancellation(signal);
        const attempt = { attemptId: randomUUID(), requestId: this.protocol + ':' + captured.fingerprint, kind,
            estimatedItems: captured.items, estimatedInputBytes: captured.bytes, targetFingerprint: captured.fingerprint };
        const receipt = await this.host.sessionCore.runs.chargeLocalWork(handle, captured.base,
            { branchId: captured.base.revision.branchId, revisionId: input.revisionId }, captured.route.executionPolicy.computeBudget, attempt);
        if (!receipt) fail('native_' + this.protocol + '_budget_unavailable');
        const start = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed';
        try {
            checkCancellation(signal);
            if (!await this.fresh(handle, input, captured)) fail('native_' + this.protocol + '_source_stale');
            const result = await operation();
            checkCancellation(signal);
            if (!await this.fresh(handle, input, captured)) fail('native_' + this.protocol + '_source_stale');
            outcome = 'completed'; return result;
        } finally {
            const used = process.cpuUsage(cpu);
            await this.host.sessionCore.runs.settleLocalWork(handle, input.sessionId, receipt.operation, attempt.attemptId,
                { wallMs: performance.now() - start, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome: signal?.aborted ? 'cancelled' : outcome });
        }
    }
}
