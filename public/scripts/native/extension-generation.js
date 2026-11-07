import { nativeSessionRuntime as runtime } from './session-runtime.js';
import { getRuntimeEvidence, onRuntimeEvidence, runtimeRequest, runtimeEvidenceMatches } from './runtime-client.js';

export function createExtensionGeneration({ context, assertCurrent, own, signal }) {
    const scope = () => {
        assertCurrent();
        if (!runtime.active || runtime.history || context.sessionId !== runtime.snapshot?.session?.sessionId) throw new Error('An active story is required');
        return { sessionId: runtime.snapshot.session.sessionId, branchId: runtime.snapshot.revision.branchId, revisionId: runtime.snapshot.revision.revisionId };
    };
    const idle = () => {
        const source = scope();
        if (runtime.host.isGenerating() || runtime.generation) throw new Error('Stop the current reply first');
        return source;
    };
    return Object.freeze({
        configuration() { assertCurrent(); return runtimeRequest('/configuration', { signal }); },
        resource(ref) { assertCurrent(); return runtimeRequest('/resources/exact', { method: 'POST', body: ref, signal }); },
        async sample(input, { signal: requestSignal } = {}) {
            assertCurrent();
            const abortSignal = requestSignal ? AbortSignal.any([signal, requestSignal]) : signal;
            const admitted = await runtimeRequest('/authoring/try', { method: 'POST', body: input, signal: abortSignal });
            if (admitted.trial) return admitted;
            const path = '/operations/' + encodeURIComponent(admitted.operationId);
            const cancel = () => { void runtimeRequest(path, { method: 'DELETE' }).catch(() => {}); };
            abortSignal.addEventListener('abort', cancel, { once: true });
            try {
                if (abortSignal.aborted) { cancel(); abortSignal.throwIfAborted(); }
                while (true) {
                    const operation = await runtimeRequest(path, { signal: abortSignal });
                    if (operation.status === 'completed') return { ...await runtimeRequest(path + '/result', { signal: abortSignal }),
                        operationId: admitted.operationId, publication: 'unpublished', sent: true, trial: { status: 'completed' } };
                    if (['failed', 'cancelled', 'stopped'].includes(operation.status)) throw new Error(operation.errorCode || 'generation_cancelled');
                    await new Promise((resolve, reject) => {
                        const abort = () => { clearTimeout(timer); reject(abortSignal.reason); };
                        const timer = setTimeout(() => { abortSignal.removeEventListener('abort', abort); resolve(); }, 300);
                        abortSignal.addEventListener('abort', abort, { once: true });
                    });
                }
            } finally { abortSignal.removeEventListener('abort', cancel); }
        },
        async updateConnectionOptions(connection, options, fingerprint) {
            assertCurrent();
            return runtimeRequest('/configuration/connections', { method: 'PUT', body: { ...connection, options }, expectedFingerprint: fingerprint, signal });
        },
        snapshot() {
            const source = scope(), reply = runtime.snapshot.timeline.at(-1);
            const variant = runtime.snapshot.variants?.find(item => item.variantId === reply?.activeVariantId);
            return structuredClone({ ...source, reply: reply?.role === 'assistant' ? reply : null,
                replySource: variant?.metadata?.runtime?.extra?.preset_content?.raw ?? reply?.metadata?.runtime?.extra?.preset_content?.raw ?? null,
                packageTurn: Boolean(runtime.snapshot.manifest.runtime?.experienceContract?.taskRuntime?.turn) });
        },
        evidence({ role = 'narrator' } = {}) {
            assertCurrent();
            return structuredClone(getRuntimeEvidence({ sessionId: context.sessionId, role })
                ?? (runtime.snapshot?.session?.sessionId === context.sessionId ? runtime.snapshot : null));
        },
        observe(callback, { role = 'narrator' } = {}) {
            assertCurrent();
            return own(onRuntimeEvidence(value => { if (runtimeEvidenceMatches(value, { sessionId: context.sessionId, role })) callback(structuredClone(value)); }));
        },
        async preview({ routeRef } = {}) {
            const source = idle();
            return runtimeRequest('/preview', { method: 'POST', body: { sessionId: source.sessionId, revisionId: source.revisionId,
                role: 'narrator', requestId: 'preview-' + crypto.randomUUID(), ...(routeRef ? { routeRef } : {}) }, signal });
        },
        async revise({ anchor, mode, text = '', prompt = '' }) {
            const source = idle();
            const reply = runtime.snapshot.timeline.at(-1);
            if (!anchor || anchor.sessionId !== source.sessionId || anchor.branchId !== source.branchId
                || anchor.reply?.messageId !== reply?.messageId || anchor.reply?.activeVariantId !== reply?.activeVariantId
                || !['replace', 'continue', 'regenerate'].includes(mode)) throw new Error('Reply revision changed');
            const next = await runtime.forkReply(anchor.reply?.messageId, source.revisionId, { prepareGeneration: true });
            // The branch change intentionally disposes the old extension view.
            // Native's generation controller owns cancellation from this point.
            try {
                const current = runtime.snapshot;
                if (current.session.sessionId !== next.session.sessionId || current.revision.branchId !== next.revision.branchId) throw new Error('Reply revision changed');
                return await globalThis.Atria.getContext().generateNative('normal', { input: '',
                    scope: { sessionId: current.session.sessionId, branchId: current.revision.branchId, revisionId: current.revision.revisionId },
                    ...(mode !== 'regenerate' ? { narrativeRevision: { mode, text, prompt } } : {}) });
            } catch (error) {
                // The old plugin UI is gone after the fork; keep failures visible
                // on the new story's existing generation projection.
                if (runtime.snapshot?.revision?.branchId === next.revision.branchId) {
                    await runtime.finalizeStoppedGeneration();
                    runtime.generationProjection = { state: 'failed', text: '', error: error.code ?? error.message };
                    document.dispatchEvent(new CustomEvent('atria-native-play-draft', { detail: runtime.generationProjection }));
                }
                throw error;
            }
        },
        async switchBranch(branchId) { idle(); return runtime.switchBranch(branchId); },
        cancel() { assertCurrent(); return globalThis.Atria?.getContext?.()?.stopGeneration?.(); },
    });
}
