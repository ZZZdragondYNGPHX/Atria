// Mirrors src/endpoints/backends/chat-completions.js:78-85 verbatim. Kept in
// sync manually because that file runs server-side and can't be imported from
// browser code. Any change to that mapping MUST be reflected here or the
// streaming code path will diverge from the non-streaming path's finishReason.
const CLAUDE_STOP_REASON_TO_OAI = {
    end_turn: 'stop',
    max_tokens: 'length',
    stop_sequence: 'stop',
    tool_use: 'tool_calls',
    pause_turn: 'stop',
    refusal: 'content_filter',
};

// Mirrors src/endpoints/backends/chat-completions.js:244-254 verbatim.
const GEMINI_FINISH_REASON_TO_OAI = {
    STOP: 'stop',
    MAX_TOKENS: 'length',
    SAFETY: 'content_filter',
    RECITATION: 'content_filter',
    PROHIBITED_CONTENT: 'content_filter',
    BLOCKLIST: 'content_filter',
    SPII: 'content_filter',
    MALFORMED_FUNCTION_CALL: 'stop',
    OTHER: 'stop',
};

// Mirrors src/endpoints/backends/chat-completions.js Cohere mapping.
const COHERE_FINISH_REASON_TO_OAI = {
    complete: 'stop',
    max_tokens: 'length',
    tool_call: 'tool_calls',
    stop_sequence: 'stop',
    error: 'stop',
};

/**
 * Normalize a raw provider-specific finish/stop reason to the OAI vocabulary
 * used by isTruncatedFinishReason(). Used by the streaming code path in
 * openai.js where SSE chunks pass through unchanged from the upstream
 * provider (server-side normalization only happens on non-streaming JSON).
 *
 * @param {string} source One of chat_completion_sources values ('claude',
 *   'makersuite'/'google_ai_studio' for Gemini, 'cohere', ...) — anything
 *   else is treated as OAI-native (no remapping).
 * @param {unknown} rawReason The raw stop_reason / finish_reason value read
 *   from the SSE chunk.
 * @returns {string|null} Normalized OAI finish_reason, or null if input empty.
 */
export function normalizeStreamingFinishReason(source, rawReason) {
    if (rawReason === null || rawReason === undefined || rawReason === '') return null;
    const v = String(rawReason);
    const s = String(source || '').toLowerCase();
    if (s === 'claude') return CLAUDE_STOP_REASON_TO_OAI[v] ?? v;
    if (s === 'makersuite' || s === 'google_ai_studio' || s === 'vertexai') {
        return GEMINI_FINISH_REASON_TO_OAI[v] ?? v;
    }
    if (s === 'cohere') return COHERE_FINISH_REASON_TO_OAI[v.toLowerCase()] ?? v;
    return v;
}
