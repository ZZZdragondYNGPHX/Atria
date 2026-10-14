import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';

const root = '/api/native/generation';
const integer = value => Number.isSafeInteger(value) && value > 0;
export class NativeDelegatedGeneration {
    constructor(browser) { this.browser = browser; }
    async request(method, path, body = {}, guards = {}) {
        const result = await requestAuthority(this.browser, method, path, body, guards);
        if (!result.ok || !result.serverBootId) throw new Error('Controlled delegated Native authority unavailable: ' + result.status);
        return result;
    }
    async review(scope, runtimeRouteId) {
        const routeRef = { scope: 'player', runtimeRouteId };
        const preflight = await this.request('POST', root + '/execution/preflight', { role: 'orchestrator', sessionId: scope.sessionId, revisionId: scope.revisionId, routeRef });
        const value = preflight.data;
        if (value.source?.sessionId !== scope.sessionId || value.source.revisionId !== scope.revisionId || value.source.branchId !== scope.branchId
            || value.route?.runtimeRouteId !== runtimeRouteId || value.route.role !== 'role.orchestrator') throw new Error('Controlled delegation Native source or route mismatch.');
        if (!value.credentialTarget?.authorized) throw new Error('Controlled delegation credential destination approval required.');
        const budget = value.budget;
        if (!integer(budget?.maxRequests) || !integer(budget?.maxTokens)) throw new Error('Controlled delegation requires a Native compute budget.');
        return { source: { sessionId: scope.sessionId, revisionId: scope.revisionId, branchId: scope.branchId }, runtimeRouteId,
            serverBootId: preflight.serverBootId, configurationFingerprint: value.configurationFingerprint,
            budget, modelProfileId: value.model.modelProfileId, connectionProfileId: value.connection.connectionProfileId, remoteModelId: value.model.remoteModelId,
            providerTarget: value.credentialTarget.target, permitFingerprint: value.credentialTarget.permitFingerprint, economics: value.economics ?? null,
            policy: 'Native durable compute bank; no automatic retry/fallback or unrelated model wake' };
    }
    async execute(run, request) {
        run.signal?.throwIfAborted();
        if (run.cancelRequested || Date.now() >= run.deadline || run.modelRequests.has(request.effectId) || run.modelRequests.size >= run.maxSteps) throw new Error('Delegated model effect cancelled, spent or outside bound.');
        run.modelRequests.set(request.effectId, { state: 'preparing', cancelRequested: false });
        const pending = run.modelRequests.get(request.effectId), approved = run.generation;
        const input = { role: 'orchestrator', sessionId: approved.source.sessionId, revisionId: approved.source.revisionId,
            routeRef: { scope: 'player', runtimeRouteId: approved.runtimeRouteId }, requestId: 'delegated-' + fingerprint({ runId: run.runId, effectId: request.effectId }),
            messages: request.messages, tools: [], fallbackMode: 'disabled' };
        pending.nativeRequestId = input.requestId;
        const view = await this.review(approved.source, approved.runtimeRouteId);
        if (fingerprint(view) !== fingerprint(approved)) throw new Error('Approved delegated Native configuration or budget changed.');
        const preview = await this.request('POST', root + '/preview', input);
        if (preview.serverBootId !== approved.serverBootId || !preview.data.preview) throw new Error('Delegated model preview unavailable.');
        if (preview.data.snapshot.runtimeRouteId !== approved.runtimeRouteId || preview.data.snapshot.modelProfileId !== approved.modelProfileId
            || preview.data.snapshot.connectionProfileId !== approved.connectionProfileId || fingerprint(preview.data.snapshot.diagnostics?.executionPlan?.policy?.computeBudget) !== fingerprint(approved.budget))
            throw new Error('Delegated effective Native model or budget changed.');
        const { createdAt: _time, ...stableSnapshot } = preview.data.snapshot;
        run.signal?.throwIfAborted();
        if (run.cancelRequested || pending.cancelRequested || Date.now() >= run.deadline) throw new Error('Delegated model cancelled before Native admission.');
        // Claim before sending. An unknown HTTP acknowledgement is never resent.
        pending.state = 'dispatched';
        const accepted = await this.request('POST', root + '/execute/start', { input, approvedReview: {
            snapshotFingerprint: fingerprint(stableSnapshot), configurationFingerprint: approved.configurationFingerprint } }, { serverBootId: approved.serverBootId });
        if (accepted.serverBootId !== approved.serverBootId || typeof accepted.data.operationId !== 'string') throw new Error('Native delegated admission identity unknown.');
        pending.operationId = accepted.data.operationId;
        for (;;) {
            if (run.signal?.aborted || run.cancelRequested || pending.cancelRequested || Date.now() >= run.deadline) {
                await this.cancel(run, request.effectId); throw new Error('Native delegated cancellation requested; fees may remain unknown.');
            }
            const status = await this.request('GET', root + '/operations/' + pending.operationId);
            if (status.serverBootId !== approved.serverBootId) throw new Error('Delegated Native Host changed; outcome unknown.');
            if (status.data.status === 'completed') break;
            if (['failed', 'cancelled', 'stale'].includes(status.data.status)) throw new Error('Native delegated execution ' + status.data.status + '; inspect its original budget and operation.');
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        const result = await this.request('GET', root + '/operations/' + pending.operationId + '/result');
        if (result.serverBootId !== approved.serverBootId) throw new Error('Native delegated result Host changed.');
        pending.state = 'completed';
        const response = result.data.response ?? result.data.result?.response;
        const text = response?.assistantText ?? response?.text;
        if (typeof text !== 'string') throw new Error('Native delegated model result unavailable.');
        return { text, usage: response.usage ?? null, nativeOperationId: pending.operationId, nativeRequestId: pending.nativeRequestId };
    }
    async cancel(run, effectId) {
        const pending = run.modelRequests.get(effectId); if (!pending) return { cancelled: false };
        pending.cancelRequested = true;
        if (!pending.operationId || pending.state === 'completed' || pending.cancelSent) return { cancelled: false, outcome: pending.state };
        pending.cancelSent = true;
        return this.request('DELETE', root + '/operations/' + pending.operationId, {}, { serverBootId: run.generation.serverBootId });
    }
}
