import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';

export function m1BodyFailure(error) {
    return error instanceof SyntaxError || ['AbortError', 'TimeoutError'].includes(error.name)
        || Boolean(error.code?.startsWith('UND_ERR_') || error.cause?.code?.startsWith('UND_ERR_'));
}

// Completeness only: do not retry substantive grades, repair JSON or edit tools.
export function completeM1Response(raw, payload) {
    const message = raw?.choices?.[0]?.message;
    if (!message) return false;
    if (payload.arm === 'judge' || payload.arm === 'extraction') {
        try { parseEvaluationJson(message.content); return true; } catch { return false; }
    }
    if (payload.rendered.body.tools?.length) {
        if (!message.tool_calls?.length) return false;
        return message.tool_calls.every(call => {
            if (!call.function?.name) return false;
            try { JSON.parse(call.function.arguments); return true; } catch { return false; }
        });
    }
    return typeof message.content === 'string' && Boolean(message.content.trim());
}
