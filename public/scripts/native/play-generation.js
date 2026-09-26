import { executeNativeGeneration, executeNativeOperation } from './generation-client.js';

// Keep publication on NativeSessionRuntime's existing Draft/Revision boundary.
export async function runNativePlayGeneration({ runtime, type, signal, input = '', quietPrompt = '', host, execute = executeNativeGeneration, executeOperation = executeNativeOperation }) {
    if (signal?.aborted) throw Object.assign(new Error('Native generation cancelled'), { code: 'generation_cancelled' });
    const originalType = type;
    const generationType = await runtime.prepareGeneration(type);
    try {
        await host.started?.(generationType);
        if ([undefined, 'normal'].includes(originalType) && input.trim()) {
            await host.submitUser(input);
            await runtime.persist();
        }
        if (signal?.aborted) throw Object.assign(new Error('Native generation cancelled'), { code: 'generation_cancelled' });
        const game = host.gameApi?.();
        if (runtime.snapshot?.manifest?.runtime?.experienceContract?.taskRuntime?.turn && !['quiet', 'impersonate'].includes(originalType)) {
            if (originalType === 'continue') throw new Error('Package Turn continuation requires an explicit new Turn');
            runtime.markProvisionalTurn();
            const context = host.context?.() ?? globalThis.Atria?.getContext?.();
            const slotBindings = context?.capabilitySettings?.atri_task_bindings?.[runtime.snapshot.session.packageId] ?? {};
            const result = await executeOperation('turn', { slotBindings, userInput: input,
                invocationId: 'turn-' + crypto.randomUUID() }, { abortSignal: signal, onChunk: host.onChunk,
                source: { sessionId: runtime.snapshot.session.sessionId, revisionId: runtime.snapshot.revision.revisionId } });
            await runtime.acceptOperationSnapshot(result, { turn: true });
            return result.timeline.at(-1)?.content ?? '';
        }
        if ([undefined, 'normal'].includes(originalType) && input.trim() && game?.isActive?.()
            && game.getPackageState?.()?.descriptor?.experience?.mode === 'text') {
            return await game.submitFreeText({ userInput: input, abortSignal: signal });
        }
        const messages = quietPrompt ? [{ role: 'user', content: quietPrompt }]
            : originalType === 'continue' ? [{ role: 'user', content: 'Continue the previous assistant response without repeating its existing text.' }] : [];
        const orchestration = host.orchestratorApi?.();
        const context = host.context?.();
        const mode = !['quiet', 'impersonate'].includes(originalType) && orchestration?.getGameRuntimeMode?.(context);
        const turnContext = { userInput: input, generationType, anchor: {
            sessionId: runtime.snapshot?.session?.sessionId,
            branchId: runtime.snapshot?.revision?.branchId,
            revisionId: runtime.snapshot?.revision?.revisionId,
        }, recentChat: [] };
        let result;
        if (mode === 'director') {
            const directed = await orchestration.runGameDirector({ context, turnContext, abortSignal: signal });
            if (directed.status !== 'completed' || !directed.finalProse?.trim()) throw new Error('Native Director returned no final response');
            result = { assistantText: directed.finalProse };
        } else {
            if (['spec', 'agenda', 'loop'].includes(mode)) {
                const guidance = await orchestration.runGameGuidance({ context, turnContext, mode, abortSignal: signal });
                if (guidance.guidance) messages.push({ role: 'system', content: 'Advisory orchestration guidance:\n' + guidance.guidance });
            }
            result = await execute({ role: 'narrator', messages, abortSignal: signal, onChunk: host.onChunk });
        }
        if (signal?.aborted) throw Object.assign(new Error('Native generation cancelled'), { code: 'generation_cancelled' });
        if (originalType === 'quiet') return result.assistantText;
        if (originalType === 'impersonate') { await host.impersonate?.(result.assistantText); return result.assistantText; }
        if (!result.assistantText?.trim()) throw new Error('Native generation returned empty text');
        await host.commitAssistant(generationType, result.assistantText);
        await runtime.persist();
        return result.assistantText;
    } catch (error) {
        await runtime.finalizeStoppedGeneration();
        throw error;
    } finally { await host.ended?.(generationType); }
}
