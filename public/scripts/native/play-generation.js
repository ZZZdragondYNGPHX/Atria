import { rememberEvidenceReceipt } from './evidence-receipts.js';
import { beginNativeGeneration, executeNativeGeneration, executeNativeOperation } from './generation-client.js';
import { recallNativePackageTurnMemory } from './experience/llm/memory-bridge.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { runtimeRequest } from './runtime-client.js';
import { decodePresetContent } from '../../shared/native-preset-content.js';

export function nativePlayGenerationBusy(runtime) {
    return Boolean(runtime?.host?.isGenerating?.())
        || ['preparing', 'streaming', 'finalizing', 'cancelling'].includes(runtime?.generationProjection?.state);
}

// Keep publication on NativeSessionRuntime's existing Draft/Revision boundary.
export async function runNativePlayGeneration({ runtime, type, signal, input = '', quietPrompt = '', operation, actorId, narrativeRevision, host, execute = executeNativeGeneration, executeOperation = executeNativeOperation, begin = beginNativeGeneration }) {
    if (signal?.aborted) throw Object.assign(new Error('Native generation cancelled'), { code: 'generation_cancelled' });
    runtime.generationProjection = { state: 'preparing', text: '', error: '' };
    let observing = true;
    let anchor = { sessionId: runtime.snapshot?.session?.sessionId, branchId: runtime.snapshot?.revision?.branchId, epoch: runtime.projectionEpoch };
    const ownsProjection = () => observing && runtime.projectionEpoch === anchor.epoch && runtime.snapshot?.session?.sessionId === anchor.sessionId && runtime.snapshot?.revision?.branchId === anchor.branchId;
    const notifyState = () => { if (ownsProjection()) { try { host.onState?.(runtime.generationProjection); } catch { /* Presentation only. */ } } };
    notifyState();
    const originalChunk = host.onChunk;
    host = { ...host, onChunk: chunk => {
        if (!signal?.aborted && ownsProjection()) {
            runtime.generationProjection = { state: 'streaming', text: String(chunk.text ?? runtime.generationProjection.text), error: '',
                ...(chunk.originalResponse ? { pendingOriginalResponse: chunk.originalResponse } : {}) };
            originalChunk?.(chunk);
        }
    } };
    const cancel = () => { if (!ownsProjection()) return; runtime.generationProjection = { ...runtime.generationProjection, state: 'cancelling' }; notifyState(); };
    signal?.addEventListener('abort', cancel, { once: true });
    const originalType = type;
    let generationType;
    try {
        if (signal?.aborted) throw Object.assign(new Error('Native generation cancelled'), { code: 'generation_cancelled' });
        generationType = await runtime.prepareGeneration(type);
        anchor = { sessionId: runtime.snapshot?.session?.sessionId, branchId: runtime.snapshot?.revision?.branchId, epoch: runtime.projectionEpoch };
        await host.started?.(generationType);
        if (signal?.aborted) throw Object.assign(new Error('Native generation cancelled'), { code: 'generation_cancelled' });
        if ([undefined, 'normal'].includes(originalType) && input.trim()) {
            await host.submitUser(input);
            await runtime.persist();
        }
        // Recursive work in the same Draft and quiet child calls share its reply.
        if (originalType !== 'quiet' && !runtime.generation?.replyExecution && runtime.snapshot?.session?.sessionId) {
            const startReply = async () => {
                const source = { sessionId: runtime.snapshot.session.sessionId, revisionId: runtime.snapshot.revision.revisionId };
                const reply = await begin({ ...source, abortSignal: signal });
                runtime.replyExecution = { ...source, generationId: reply.generationId };
                if (runtime.generation) runtime.generation.replyExecution = runtime.replyExecution;
            };
            // Branch initialization can enqueue derived state writes. Drain
            // those writes and pin the budget lookup/begin to one revision.
            if (runtime._queue) await runtime._queue(startReply); else await startReply();
        }
        if (signal?.aborted) throw Object.assign(new Error('Native generation cancelled'), { code: 'generation_cancelled' });
        const game = host.gameApi?.();
        if (runtime.snapshot?.manifest?.runtime?.experienceContract?.taskRuntime?.turn && !['quiet', 'impersonate'].includes(originalType)) {
            if (originalType === 'continue') throw new Error('Package Turn continuation requires an explicit new Turn');
            const context = host.context?.() ?? globalThis.Atria?.getContext?.();
            const turn = runtime.snapshot.manifest.runtime.experienceContract.taskRuntime.turn;
            const sourceSnapshot = runtime.snapshot;
            const assertContextCurrent = () => {
                if (signal?.aborted || runtime.snapshot !== sourceSnapshot) throw Object.assign(new Error('Native Turn context changed'), { name: 'AbortError' });
            };
            const memory = await recallNativePackageTurnMemory({
                assertCurrent: assertContextCurrent,
                context,
                snapshot: runtime.snapshot,
                userInput: input,
                signal,
                informationTaskId: turn.narratorTaskId || null,
            });
            assertContextCurrent();
            memory.assertCurrent?.();
            runtime.markProvisionalTurn();
            const slotBindings = context?.capabilitySettings?.atri_task_bindings?.[runtime.snapshot.session.packageId] ?? {};
            const result = await executeOperation('turn', { slotBindings, userInput: input || runtime.snapshot.timeline.at(-1)?.content,
                ...(narrativeRevision ? { narrativeRevision } : {}),
                invocationId: 'turn-' + crypto.randomUUID(), hostMemoryEvidence: memory.evidence }, { abortSignal: signal, onChunk: host.onChunk,
                source: { sessionId: runtime.snapshot.session.sessionId, revisionId: runtime.snapshot.revision.revisionId } });
            runtime.generationProjection.state = 'finalizing'; notifyState();
            await runtime.acceptOperationSnapshot(result, { turn: true });
            return result.timeline.at(-1)?.content ?? '';
        }
        if ([undefined, 'normal'].includes(originalType) && input.trim() && game?.isActive?.()
            && game.getPackageState?.()?.descriptor?.experience?.mode === 'text'
            && game.getPackageState?.()?.runtime?.game?.logic) {
            return await game.submitFreeText({ userInput: input, abortSignal: signal });
        }
        if (narrativeRevision?.mode === 'replace') {
            if (!narrativeRevision.text?.trim()) throw new TypeError('Replacement reply must not be empty');
            const preview = await runtimeRequest('/preview', { method: 'POST', signal, body: {
                sessionId: runtime.snapshot.session.sessionId, revisionId: runtime.snapshot.revision.revisionId,
                role: 'narrator', requestId: 'revision-' + crypto.randomUUID() } });
            const content = preview.snapshot.promptIr.compilation?.presetContent;
            let text = narrativeRevision.text, presetContent;
            if (content) {
                const decoded = decodePresetContent(text, content.declaration, content);
                if (decoded.status === 'invalid') throw Object.assign(new Error('Replacement reply must preserve the required content format'), { code: 'content_format_invalid' });
                text = decoded.narrative;
                presetContent = { ...decoded, programRef: content.programRef,
                    contextPolicies: Object.fromEntries(content.declaration.types.map(type => [type.type, type.context])) };
            }
            await host.commitAssistant(generationType, text, presetContent);
            await runtime.persist();
            return text;
        }
        const messages = quietPrompt ? [{ role: 'user', content: quietPrompt }]
            : originalType === 'continue' ? [{ role: 'user', content: 'Continue the previous assistant response without repeating its existing text.' }] : [];
        // Recalled Memory reaches the narrator the same way it does for Package Turns.
        let hostMemoryEvidence;
        if (!['quiet', 'impersonate'].includes(originalType)) {
            try {
                const memory = await recallNativePackageTurnMemory({ snapshot: runtime.snapshot, userInput: input, signal,
                    context: host.context?.() ?? globalThis.Atria?.getContext?.() });
                if (memory.evidence?.length) hostMemoryEvidence = memory.evidence;
            } catch (error) {
                if (signal?.aborted) throw error;
                console.warn('[native-play] Memory recall skipped for this reply', error);
            }
        }
        const result = await execute({ role: 'narrator', operation: originalType === 'impersonate' ? 'impersonate' : operation ?? 'narrative',
            ...(actorId ? { actorId } : {}), ...(narrativeRevision ? { narrativeRevision } : {}), messages, abortSignal: signal, onChunk: host.onChunk, ...(hostMemoryEvidence ? { hostMemoryEvidence } : {}) });
        // The Context inspector shows what this reply was actually built from.
        if (result.snapshot?.contextPlan && !['quiet', 'impersonate'].includes(originalType)) {
            runtime.lastReplyContext = { sessionId: runtime.snapshot?.session?.sessionId, plan: result.snapshot.contextPlan };
        }
        if (signal?.aborted) throw Object.assign(new Error('Native generation cancelled'), { code: 'generation_cancelled' });
        if (result.presetContent?.status === 'invalid') {
            runtime.generationProjection = { state: 'failed', text: result.presetContent.preview ?? '', error: 'content_format_invalid', originalResponse: result.presetContent.raw };
            throw Object.assign(new Error(tl('The reply was not in the expected format, so it was not added. Your message is saved — send again to continue.')), { code: 'content_format_invalid', originalResponse: result.presetContent.raw });
        }
        if (originalType === 'quiet') return result.assistantText;
        if (originalType === 'impersonate') { await host.impersonate?.(result.assistantText); return result.assistantText; }
        if (!result.assistantText?.trim()) throw new Error('Native generation returned empty text');
        runtime.generationProjection.state = 'finalizing'; notifyState();
        await host.commitAssistant(generationType, result.assistantText, result.presetContent);
        await runtime.persist();
        if (ownsProjection()) rememberEvidenceReceipt(runtime, result);
        return result.assistantText;
    } catch (error) {
        if (ownsProjection()) await runtime.finalizeStoppedGeneration();
        if (ownsProjection()) {
            const originalResponse = error.originalResponse ?? runtime.generationProjection.pendingOriginalResponse;
            runtime.generationProjection = { state: 'failed', text: '', error: signal?.aborted ? 'generation_cancelled' : error.code ?? 'generation_failed',
                ...(originalResponse ? { originalResponse } : {}) };
        }
        notifyState();
        throw error;
    } finally {
        signal?.removeEventListener('abort', cancel);
        try { await host.ended?.(generationType); } finally {
            if (ownsProjection() && runtime.generationProjection.state !== 'failed') runtime.generationProjection = { state: 'idle', text: '', error: '' };
            notifyState(); observing = false;
        }
    }
}
