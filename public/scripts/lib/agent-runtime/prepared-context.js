import { compileContextAsync } from './context-compiler.js';
import { createHostTokenCounter } from './host-ports.js';

/** Opt in only at orchestration ModelPorts; ordinary plugin/editor APIs stay unchanged. */
export function withRuntimeContext(request, context, assertMemoryCurrent = null) {
    return typeof context?.generateTask === 'function' ? { ...request, runtimeContext: assertMemoryCurrent ? { assertMemoryCurrent } : true } : request;
}

/** Read the same named-preset limits used by the existing sender. Never change the preset. */
export function resolvePreparedBudget(requestApi, senders, presetName) {
    let limit, response;
    if (requestApi === 'openai') {
        const runtime = senders?.getOpenAiRuntime?.();
        const index = runtime?.openai_setting_names?.[presetName];
        const preset = Number.isInteger(index) ? runtime?.openai_settings?.[index] : null;
        const settings = { ...runtime?.oai_settings, ...preset };
        limit = Number(settings.openai_max_context);
        response = Number(settings.openai_max_tokens);
    } else if (['kobold', 'koboldhorde', 'novel', 'textgenerationwebui'].includes(requestApi)) {
        // This existing host snapshot exposes script.js's shared context/output
        // settings, also used by Novel and text-completion generation builders.
        const runtime = senders?.getKoboldRuntime?.();
        limit = Number(runtime?.max_context);
        response = Number(runtime?.amount_gen);
    }
    // Unsupported/unspecified families retain their existing sender authority.
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(response) || response < 0) return null;
    return Math.max(0, Math.floor(limit - response));
}

/** Final assembly boundary: card/world-info/preset messages have already been added once.
 * Counts remain host-tokenizer estimates (provider framing/conversion can differ).
 * No history, tool pair, memory record or user preset is silently trimmed.
 */
export async function compilePreparedContext({ messages, tools, requestApi, senders, presetName, signal, context, assertMemoryCurrent }) {
    const assertCurrent = () => {
        if (signal?.aborted) throw Object.assign(new Error('Context compilation aborted'), { name: 'AbortError' });
        assertMemoryCurrent?.();
    };
    const budget = resolvePreparedBudget(requestApi, senders, presetName);
    const tokenizerAvailable = typeof context?.getTokenCountAsync === 'function';
    assertCurrent();
    try {
        if (budget === 0 && tokenizerAvailable) throw new Error('Response reservation exhausts context');
        const compiled = await compileContextAsync({ legacyMessages: messages, tools: tools || [],
            countTokens: createHostTokenCounter(context || {}),
            budget: tokenizerAvailable && budget !== null ? budget : Number.MAX_SAFE_INTEGER, assertCurrent });
        return { tokens: compiled.tokens, diagnostics: compiled.diagnostics, budget,
            tokenCounting: tokenizerAvailable ? 'host-tokenizer-estimate' : 'utf8-bytes-estimate',
            budgetScope: 'assembled-messages-and-tools', enforced: tokenizerAvailable && budget !== null };
    } catch (error) {
        assertCurrent();
        throw Object.assign(new Error(`Runtime context budget: ${error.message}`), { code: 'context_budget', cause: error });
    }
}
