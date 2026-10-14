import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fields, assertJsonDeclaration } from '../../public/shared/native-values.js';
import { informationContext } from '../../public/shared/native-information-runtime.js';
import { deriveExpressionPlan } from '../../public/shared/native-expression-runtime.js';
import { hashNativeDocument as hash } from './repositories/common.js';
import { createNativeId } from './identity.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { immutable, checkCancellation } from './model-prompt-runtime/execution-utils.js';
import { selectNativeRuntimeRoute } from './adapters/generation-host.js';
import { createLocalSpeechProvider } from './adapters/speech-provider.js';

const states = new WeakMap(), TTL = 600000;
const fail = code => { throw Object.assign(new TypeError(code), { code }); };

// An explicit auxiliary consumer of an existing public Timeline message.
// It produces an owned AssetStore file, never a World/Task result publication.
export class SpeechService {
    constructor({ host, scheduler = nativeTaskScheduler, provider = createLocalSpeechProvider(), now = Date.now }) {
        Object.assign(this, { host, scheduler, provider, now });
        this.assets = host.packageInstaller._assetStore;
        const engine = host.persistence?._engine ?? host.sessionCore._sessions._engine;
        if (!states.has(engine)) states.set(engine, { id: randomUUID(), records: new Map() });
        this.state = states.get(engine);
    }
    voices(signal) { return this.provider.listVoices({ signal }); }
    async describe(handle, raw, { observe = false } = {}) {
        fields(raw, ['sessionId', 'revisionId'], 'Speech description');
        const base = await (observe ? this.host.sessionCore.observe(handle, raw.sessionId) : this.host.sessionCore.load(handle, raw.sessionId));
        if (base.revision.revisionId !== raw.revisionId) fail('native_speech_revision_conflict');
        let scanned = 0;
        const onScan = count => { scanned += count; if (scanned > 4096) fail('native_speech_scan_limit'); };
        const information = informationContext(base, { kind: 'narrator' }, undefined, { includeRollups: false, onScan });
        const plan = deriveExpressionPlan(base, information, { onScan });
        if (plan?.status !== 'ready') return { items: [], revisionId: raw.revisionId };
        const items = [];
        for (const item of plan.items) {
            const captured = await this._capture(handle, { ...raw, itemId: item.id, voiceId: '', rate: 0, volume: 100 }, { observe });
            if (!captured.fallback) items.push({ itemId: item.id, messageId: item.recordId, actorId: plan.actorId });
        }
        return { items, revisionId: raw.revisionId };
    }

    observeDescription(handle, raw) { return this.describe(handle, raw, { observe: true }); }
    async _capture(handle, input, { observe = false } = {}) {
        const base = await (observe ? this.host.sessionCore.observe(handle, input.sessionId) : this.host.sessionCore.load(handle, input.sessionId));
        if (base.revision.revisionId !== input.revisionId) fail('native_speech_revision_conflict');
        await this.host.sessionCore.runs.assert(handle, input.sessionId, 'generate', input.revisionId);
        let scanned = 0;
        const onScan = count => { scanned += count; if (scanned > 4096) fail('native_speech_scan_limit'); };
        const information = informationContext(base, { kind: 'narrator' }, undefined, { includeRollups: false, onScan });
        const plan = deriveExpressionPlan(base, information, { onScan });
        if (plan?.status !== 'ready') return { fallback: { status: 'fallback', reason: 'native_speech_public_text_unavailable' } };
        const item = plan.items.find(item => item.id === input.itemId);
        const source = base.manifest.runtime.experienceContract.informationRuntime.sources.find(value => value.id === item?.sourceId);
        const entry = base.timeline.find(value => value.messageId === item?.recordId);
        if (source?.kind !== 'timeline' || !item?.variantId || entry?.role !== 'assistant' || entry.actorId !== plan.actorId
            || item.data.actorId !== plan.actorId || item.data.content !== entry.content || item.variantId !== entry.activeVariantId
            || typeof entry.content !== 'string' || !entry.content.trim() || entry.content.length > 2048) {
            return { fallback: { status: 'fallback', reason: 'native_speech_public_text_unavailable' } };
        }
        const route = selectNativeRuntimeRoute(await this.host.persistence.listRuntimeRoutes(handle), 'role.narrator', input.routeRef);
        if (route.scope !== 'player') fail('native_speech_route_invalid');
        return { base, text: entry.content, plan, route, fingerprint: hash({ plan, item, route, voiceId: input.voiceId, rate: input.rate, volume: input.volume }),
            items: base.timeline.length + Object.values(base.states.atri_lifecycle.domains).reduce((count, domain) => count + domain.records.length, 0) + 1,
            bytes: Buffer.byteLength(JSON.stringify({ base, input })) };
    }
    async _fresh(handle, input, captured) {
        try {
            const current = await this._capture(handle, { ...input, routeRef: { scope: 'player', runtimeRouteId: captured.route.runtimeRouteId } });
            return !current.fallback && current.fingerprint === captured.fingerprint;
        } catch { return false; }
    }
    async _prune() {
        for (const [id, record] of this.state.records) {
            const operation = record.scheduler.operations.get(id);
            if (operation && (record.expiresAt > this.now() || !['completed', 'failed', 'cancelled', 'stale'].includes(operation.view.status) || record.scheduler.running.has(operation))) continue;
            if (record.artifact) {
                try { await this.assets.deleteRef(record.owner, record.artifact.asset.assetId); } catch (error) {
                    if (error.code !== 'native_asset_ref_referenced') throw error;
                }
            }
            this.state.records.delete(id);
        }
    }
    async _work(handle, captured, kind, signal, operation) {
        checkCancellation(signal);
        const attempt = { attemptId: randomUUID(), requestId: 'speech:' + captured.fingerprint, kind,
            estimatedItems: captured.items, estimatedInputBytes: captured.bytes, targetFingerprint: captured.fingerprint };
        const receipt = await this.host.sessionCore.runs.chargeLocalWork(handle, captured.base,
            { branchId: captured.base.revision.branchId, revisionId: captured.base.revision.revisionId }, captured.route.executionPolicy.computeBudget, attempt);
        if (!receipt) fail('native_speech_budget_unavailable');
        const start = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed';
        try { const result = await operation(); checkCancellation(signal); outcome = 'completed'; return result; } finally {
            const used = process.cpuUsage(cpu);
            await this.host.sessionCore.runs.settleLocalWork(handle, captured.base.session.sessionId, receipt.operation, attempt.attemptId,
                { wallMs: performance.now() - start, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome: signal?.aborted ? 'cancelled' : outcome });
        }
    }
    async _publish(handle, captured, input, audio, record) {
        let asset = null;
        try {
            const artifact = await this._work(handle, captured, 'speech_publish', undefined, async () => {
                if (audio.voiceId !== input.voiceId) fail('native_speech_voice_conflict');
                if (!await this._fresh(handle, input, captured)) fail('native_speech_source_stale');
                asset = await this.assets.put(handle, { assetId: createNativeId('asset'), mediaType: 'audio/wav',
                    size: audio.bytes.length, contentHash: createHash('sha256').update(audio.bytes).digest('hex') }, audio.bytes);
                if (!await this._fresh(handle, input, captured)) fail('native_speech_source_stale');
                return immutable({ schemaVersion: 1, kind: 'speech_audio', asset, text: captured.text, source: captured.plan.anchor,
                    sourceFingerprint: captured.fingerprint, itemId: input.itemId, actorId: captured.plan.actorId,
                    voice: { provider: audio.providerId ?? this.provider.id ?? 'windows.sapi', voiceId: audio.voiceId, name: audio.voiceName, language: audio.language,
                        rate: input.rate ?? 0, volume: input.volume ?? 100 }, durationMs: audio.durationMs, capabilities: audio.capabilities,
                    timing: 'total_duration_only' });
            });
            record.artifact = artifact;
            return artifact;
        } catch (error) {
            if (asset) {
                try { await this.assets.deleteRef(handle, asset.assetId); } catch { error.assetCleanupFailed = true; }
            }
            throw error;
        }
    }
    async start(handle, raw, signal) {
        const input = structuredClone(assertJsonDeclaration(raw, 'Speech request', 8192));
        fields(input, ['sessionId', 'revisionId', 'itemId', 'voiceId', 'rate', 'volume', 'routeRef'], 'Speech request');
        if (typeof input.itemId !== 'string' || input.itemId.length > 256 || typeof input.voiceId !== 'string' || !input.voiceId || input.voiceId.length > 1024
            || input.rate !== undefined && (!Number.isInteger(input.rate) || input.rate < -10 || input.rate > 10)
            || input.volume !== undefined && (!Number.isInteger(input.volume) || input.volume < 0 || input.volume > 100)) fail('native_speech_request_invalid');
        if (input.routeRef !== undefined) {
            fields(input.routeRef, ['scope', 'runtimeRouteId'], 'Speech Route');
            if (input.routeRef.scope !== 'player') fail('native_speech_route_invalid');
        }
        input.rate ??= 0; input.volume ??= 100;
        checkCancellation(signal); await this._prune();
        const captured = await this._capture(handle, input);
        if (captured.fallback) return captured.fallback;
        if (!captured.route.executionPolicy?.computeBudget?.localWork) return { status: 'fallback', reason: 'native_speech_budget_unavailable', text: captured.text };
        for (const [operationId, record] of this.state.records) {
            if (record.owner === handle && record.fingerprint === captured.fingerprint && record.expiresAt > this.now()) {
                if (record.scheduler !== this.scheduler) continue;
                const view = this.scheduler.project(handle, operationId);
                if (['queued', 'running', 'streaming', 'finalizing', 'completed'].includes(view.status)) return { status: view.status, operationId, cached: view.status === 'completed', text: captured.text };
            }
        }
        if (this.state.records.size >= 128) fail('native_speech_retention_limit');
        await this._work(handle, captured, 'context_build', signal, async () => {
            if (!await this._fresh(handle, input, captured)) fail('native_speech_source_stale');
        });
        const record = { owner: handle, fingerprint: captured.fingerprint, input, captured, scheduler: this.scheduler, expiresAt: this.now() + TTL, artifact: null };
        const operation = this.scheduler.submit({ owner: handle, kind: 'auxiliary_task', executionClass: 'interactive', retry: false, signal,
            key: this.state.id + ':speech:' + captured.fingerprint, fingerprint: captured.fingerprint,
            resources: [this.state.id + ':speech:' + handle, 'provider:' + (this.provider.id ?? 'windows.sapi')],
            anchor: { sessionId: input.sessionId, branchId: captured.base.revision.branchId, revisionId: input.revisionId, speechStep: 'audio' },
            fresh: () => this._fresh(handle, input, captured),
            run: ({ signal: taskSignal }) => this._work(handle, captured, 'speech_synthesis', taskSignal,
                () => this.provider.synthesize({ text: captured.text, voiceId: input.voiceId, rate: input.rate ?? 0, volume: input.volume ?? 100 }, { signal: taskSignal })),
            finalize: audio => this._publish(handle, captured, input, audio, record),
        });
        if (!this.state.records.has(operation.operationId)) this.state.records.set(operation.operationId, record);
        return { status: 'queued', operationId: operation.operationId, cached: false, text: captured.text };
    }
    async status(handle, raw) {
        fields(raw, ['operationId'], 'Speech status'); await this._prune();
        const record = this.state.records.get(raw.operationId);
        if (!record || record.owner !== handle || record.scheduler !== this.scheduler) fail('native_speech_operation_missing');
        const operation = this.scheduler.project(handle, raw.operationId), current = await this._fresh(handle, record.input, record.captured);
        return immutable({ ...operation, current, text: current ? record.captured.text : null,
            artifact: current && operation.status === 'completed' ? record.artifact : null,
            fallback: ['failed', 'cancelled', 'stale'].includes(operation.status) ? 'text' : null });
    }
    async observe(handle, raw) {
        fields(raw, ['operationId'], 'Speech observation');
        const record = this.state.records.get(raw.operationId);
        if (!record || record.owner !== handle || record.scheduler !== this.scheduler || record.expiresAt <= this.now()) fail('native_speech_operation_missing');
        const operation = this.scheduler.project(handle, raw.operationId);
        let current = false;
        try {
            const captured = await this._capture(handle, { ...record.input, routeRef: { scope: 'player', runtimeRouteId: record.captured.route.runtimeRouteId } }, { observe: true });
            current = !captured.fallback && captured.fingerprint === record.captured.fingerprint;
        } catch { /* Stale or inaccessible sources disclose no text or artifact. */ }
        return immutable({ ...operation, current, text: current ? record.captured.text : null,
            artifact: current && operation.status === 'completed' ? record.artifact : null,
            fallback: ['failed', 'cancelled', 'stale'].includes(operation.status) ? 'text' : null,
            persistence: 'host process only; absent after restart is unknown, never resubmit automatically' });
    }
    cancel(handle, raw) {
        fields(raw, ['operationId'], 'Speech cancellation');
        const record = this.state.records.get(raw.operationId);
        if (record?.owner !== handle || record.scheduler !== this.scheduler) fail('native_speech_operation_missing');
        return { cancelled: this.scheduler.cancel(handle, raw.operationId) };
    }
}
