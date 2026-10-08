import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';

export function m1TransportFailureCode(error, cancelled) {
    return typeof error.code === 'string' && error.code.startsWith('m1_http_') ? error.code : cancelled ? 'm1_cancelled' : 'm1_transport_failed';
}

export function m1BodyFailure(error) {
    return error instanceof SyntaxError || ['AbortError', 'TimeoutError'].includes(error.name)
        || ['AbortError', 'TimeoutError'].includes(error.cause?.name)
        || [error.code, error.cause?.code].some(code => typeof code === 'string' && code.startsWith('UND_ERR_'));
}

// Keep provider error evidence private for every funded failure, not just the
// small diagnostic. Do not retain request headers or consume an unbounded body.
export async function captureM1HttpError(response, model) {
    let body = '', bodyTruncated = false, bodyComplete = false;
    const reader = response.body?.getReader(), decoder = new TextDecoder();
    let bytes = 0;
    try {
        if (reader) {
            while (bytes < 65536) {
                const part = await reader.read();
                if (part.done) { bodyComplete = true; break; }
                const accepted = part.value.subarray(0, 65536 - bytes);
                bytes += accepted.byteLength; body += decoder.decode(accepted, { stream: true });
                if (bytes === 65536) { bodyTruncated = true; await reader.cancel(); break; }
            }
            body += decoder.decode();
        } else bodyComplete = true;
    } catch { if (!body) body = 'error_body_unavailable'; }
    finally { reader?.releaseLock(); }
    return { status: response.status, body, bodyComplete, bodyTruncated, model,
        requestId: response.headers.get('x-request-id'), server: response.headers.get('server') };
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
