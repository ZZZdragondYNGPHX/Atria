// Tiny OpenAI-compatible mock LLM endpoint so tests don't burn real API
// credits for paths that don't care about model quality (most chat-flow,
// branch, swipe, persistence, MG-extraction-fired, etc).
//
// Each spec calls `startMockLLM({ scriptedReplies })` and gets back a
// base URL it can plug into Atria as a CUSTOM chat-completion endpoint
// via the connection profile.
//
// `scriptedReplies` is a queue of strings; each /v1/chat/completions
// request pops the next reply. If exhausted, falls back to a deterministic
// echo derived from the last user message so tests don't randomly hang.
//
// Streaming: if request body has stream:true, sends server-sent events
// with one chunk per word and a final [DONE] frame. Tools: if request
// has tools, the mock can be scripted to reply with a tool_calls choice
// via `nextTool({name, arguments})` before the next chat call.
//
import http from 'node:http';

const DEFAULT_REPLY = '*Ash glances toward the sea and answers in two careful sentences, eyes lingering on the path behind you both.* The reef has been restless tonight, but the lantern still holds. We can keep moving.';

/**
 * @param {object} opts
 * @param {string[]} [opts.scriptedReplies]
 * @param {Array<{name:string, arguments:object}>} [opts.scriptedToolCalls]
 * @param {number} [opts.latencyMs]
 * @returns {Promise<{
 *   port:number,
 *   baseURL:string,
 *   scriptReply:(s:string)=>void,
 *   scriptToolCall:(t:object)=>void,
 *   scriptCompletion:(route:Function|null)=>void,
 *   clearScriptedCompletion:()=>void,
 *   requests:object[],
 *   stop:()=>Promise<void>,
 * }>}
 */
export async function startMockLLM({ scriptedReplies = [], scriptedToolCalls = [], latencyMs = 0, streamChunkDelayMs = 0 } = {}) {
    const replies = [...scriptedReplies];
    const tools = [...scriptedToolCalls];
    const requests = [];
    // Per-stream drip delay between SSE frames (default 0 = burst).
    // 11.2 (reconnect) uses this to keep a stream open long enough that
    // the test can go offline mid-flight; server-side buffering + WS
    // replay must still deliver every chunk.
    let chunkDelayMsGlobal = streamChunkDelayMs;
    function setChunkDelay(ms) { chunkDelayMsGlobal = Math.max(0, Number(ms) || 0); }

    // Generic completion route: { text } | { tool, arguments } |
    // { toolCalls: [...] } | null (fall through to the scripted queue).
    let genericRoute = null;
    let genericTurn = 0;
    function setGenericRoute(fn) {
        genericRoute = typeof fn === 'function' ? fn : null;
        genericTurn = 0;
    }

    // One-shot failure injection for the /responses endpoint. The next
    // /responses request is answered with the given status + raw body and
    // consumes no scripted queue entries; the flag then clears itself.
    let failNext = null;
    function failNextResponses({ status = 500, body = 'upstream error' } = {}) {
        failNext = { status, body };
    }

    const server = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        let parsed = {};
        try { parsed = JSON.parse(body || '{}'); } catch { /* non-JSON body — treat as empty */ }
        // Track when the mock received this request and when it emitted
        // the first response byte. Barrier / cache-warmup tests use
        // these to assert follower-request timing relative to lead
        // first-chunk delivery. The record is appended before
        // any await so `mock.requests` reflects arrival order.
        const record = { url: req.url, method: req.method, body: parsed, headers: req.headers, receivedAt: Date.now(), firstByteAt: null };
        requests.push(record);

        // Patch res.write / res.end once per request so the FIRST byte
        // sent for this response stamps firstByteAt. This is transparent
        // to callers that don't inspect the field.
        const origWrite = res.write.bind(res);
        const origEnd = res.end.bind(res);
        res.write = (chunk, ...rest) => {
            if (record.firstByteAt === null) record.firstByteAt = Date.now();
            return origWrite(chunk, ...rest);
        };
        res.end = (chunk, ...rest) => {
            if (chunk && record.firstByteAt === null) record.firstByteAt = Date.now();
            return origEnd(chunk, ...rest);
        };

        if (latencyMs > 0) await new Promise(r => setTimeout(r, latencyMs));

        // Models list endpoint — Atria probes this for the model dropdown.
        if (req.url.endsWith('/models') || req.url.endsWith('/v1/models')) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
                object: 'list',
                data: [
                    { id: 'mock-gpt-4o', object: 'model' },
                    { id: 'mock-claude-sonnet', object: 'model' },
                ],
            }));
            return;
        }

        // Embeddings — deterministic per-string vector derived from a
        // bag-of-tokens hash so semantically overlapping strings cluster
        // by cosine similarity. Real shape, no real model: every input is
        // mapped to a fixed-dim float array via per-token hash → bucket.
        if (req.url.endsWith('/embeddings') || req.url.endsWith('/v1/embeddings')) {
            const inputs = Array.isArray(parsed?.input)
                ? parsed.input
                : (typeof parsed?.input === 'string' ? [parsed.input] : []);
            const model = String(parsed?.model || 'mock-embed');
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
                object: 'list',
                data: inputs.map((text, index) => ({
                    object: 'embedding',
                    index,
                    embedding: deterministicEmbedding(String(text == null ? '' : text)),
                })),
                model,
                usage: { prompt_tokens: 0, total_tokens: 0 },
            }));
            return;
        }

        // Chat completions.
        if (req.url.endsWith('/chat/completions') || req.url.endsWith('/v1/chat/completions')) {
            const isStream = parsed.stream === true;

            // Generic completion route supports per-turn text/tool-call scripts.
            if (genericRoute) {
                let generic = null;
                try {
                    generic = genericRoute({
                        turn: genericTurn,
                        body: parsed,
                        stream: isStream,
                        systemPrompts: (parsed?.messages || [])
                            .filter((m) => m && m.role === 'system')
                            .map((m) => stringifyMessageContent(m.content)),
                        userMessages: (parsed?.messages || [])
                            .filter((m) => m && m.role === 'user')
                            .map((m) => stringifyMessageContent(m.content)),
                        toolNames: (Array.isArray(parsed?.tools) ? parsed.tools : [])
                            .map((t) => String(t?.function?.name || t?.name || ''))
                            .filter(Boolean),
                    });
                } catch (err) {
                    res.writeHead(500, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: `mock generic route threw: ${err?.message || err}` } }));
                    return;
                }
                if (generic !== null && generic !== undefined) {
                    genericTurn += 1;
                    respondFromRouter(res, parsed, generic, isStream);
                    return;
                }
            }

            // Fallback: existing queue-based behavior.
            // Tool calls take precedence — when a tool is scripted next,
            // don't also pop a reply (they were ending up out of sync, so
            // the spec's next "plain text" assertion saw the wrong slot).
            // After the tool completes, the next call picks up the next
            // reply normally. This matches how a real model behaves: it
            // either returns content OR tool_calls, not both per turn.
            const toolCall = tools.length ? tools.shift() : null;
            const reply = toolCall ? null : (replies.length ? replies.shift() : deriveEcho(parsed));
            if (isStream) {
                res.writeHead(200, {
                    'content-type': 'text/event-stream',
                    'cache-control': 'no-cache',
                    'connection': 'keep-alive',
                });
                if (toolCall) {
                    // ToolManager.parseToolCalls requires `typeof choice.index === 'number'`
                    // and silently skips choices without it. Without `index: 0` here,
                    // every streaming tool_call gets dropped on the floor.
                    const frame = {
                        choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'mock-tc-1', type: 'function', function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) } }] }, finish_reason: null }],
                    };
                    res.write(`data: ${JSON.stringify(frame)}\n\n`);
                    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
                } else {
                    const words = reply.split(/\s+/);
                    for (let i = 0; i < words.length; i++) {
                        const piece = (i === 0 ? '' : ' ') + words[i];
                        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
                        if (chunkDelayMsGlobal > 0 && i < words.length - 1) {
                            await new Promise(r => setTimeout(r, chunkDelayMsGlobal));
                        }
                    }
                    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
                }
                res.write('data: [DONE]\n\n');
                res.end();
                return;
            }
            const choice = toolCall
                ? { index: 0, message: { role: 'assistant', tool_calls: [{ id: 'mock-tc-1', type: 'function', function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) } }] }, finish_reason: 'tool_calls' }
                : { index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' };
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
                id: 'mock-cmpl-1',
                object: 'chat.completion',
                created: 0,
                model: parsed.model || 'mock-gpt-4o',
                choices: [choice],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }));
            return;
        }

        // OpenAI Responses API. Reuses the same scripted queues (replies/tools)
        // and generic route as chat completions, but emits semantic
        // Responses events instead of chat chunks. The request body carries an
        // input[] array instead of messages[], so synthesize a messages view
        // for the generic route.
        if (req.url.endsWith('/responses')) {
            if (failNext) {
                const { status, body } = failNext;
                failNext = null;
                res.writeHead(status, { 'content-type': 'text/plain' });
                res.end(String(body));
                return;
            }
            const isStreamFlagged = parsed.stream === true;
            const classifyView = { ...parsed, messages: responsesInputToMessages(parsed.input) };

            if (genericRoute) {
                let generic = null;
                try {
                    generic = genericRoute({
                        turn: genericTurn,
                        body: classifyView,
                        stream: isStreamFlagged,
                        systemPrompts: (classifyView.messages || [])
                            .filter((m) => m && m.role === 'system')
                            .map((m) => stringifyMessageContent(m.content)),
                        userMessages: (classifyView.messages || [])
                            .filter((m) => m && m.role === 'user')
                            .map((m) => stringifyMessageContent(m.content)),
                        toolNames: (Array.isArray(parsed?.tools) ? parsed.tools : [])
                            .map((t) => String(t?.function?.name || t?.name || ''))
                            .filter(Boolean),
                    });
                } catch (err) {
                    res.writeHead(500, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: `mock generic route threw: ${err?.message || err}` } }));
                    return;
                }
                if (generic !== null && generic !== undefined) {
                    genericTurn += 1;
                    await respondFromResponsesRoute(res, parsed, isStreamFlagged, { response: generic }, chunkDelayMsGlobal);
                    return;
                }
            }

            // Queue fallback — same precedence as chat completions: tools
            // before replies.
            const toolCall = tools.length ? tools.shift() : null;
            const reply = toolCall ? null : (replies.length ? replies.shift() : deriveEcho(classifyView));
            const scripted = toolCall
                ? { response: { tool: toolCall.name, arguments: toolCall.arguments } }
                : { response: { text: reply } };
            await respondFromResponsesRoute(res, parsed, isStreamFlagged, scripted, chunkDelayMsGlobal);
            return;
        }

        // Status / generic 200 for unknown probes.
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    return {
        port,
        baseURL: `http://127.0.0.1:${port}/v1`,
        scriptReply(s) { replies.push(s); },
        scriptToolCall(t) { tools.push(t); },
        setStreamChunkDelayMs(ms) { setChunkDelay(ms); },
        scriptCompletion(route) { setGenericRoute(route); },
        clearScriptedCompletion() { setGenericRoute(null); },
        failNextResponses,
        requests,
        stop: () => new Promise((resolve) => server.close(() => resolve())),
    };
}

/**
 * Emit a single chat-completion response derived from the router's return
 * value. Handles four shapes uniformly across streaming and non-streaming
 * transports:
 *   - { text }                                   → assistant text + finish=stop
 *   - { tool, arguments, text? }                 → single tool_call (text optional)
 *   - { toolCalls: [{name, args}], text? }       → N parallel tool_calls (text optional)
 *   - { reasoning } may accompany any of the above
 *
 * When `text` accompanies tool_calls, both are emitted so callers can
 * exercise narration alongside tool execution.
 *
 * For streaming, each tool_call gets its own index in the delta array
 * (parallel-dispatch case) — without distinct indices the runtime's
 * tool-call assembler collapses them into one.
 */
function respondFromRouter(res, parsed, response, isStream) {
    const toolCalls = normalizeToolCalls(response);
    const text = String(response.text ?? '');
    const reasoning = response.reasoning != null ? String(response.reasoning) : '';
    if (isStream) {
        res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'connection': 'keep-alive',
        });
        // Role hint on the first delta — harmless when present, missed
        // when absent. Some consumers expect it.
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
        // Reasoning chunks first so the panel's reasoning section gets
        // populated before the text/tool_call deltas land.
        if (reasoning.length > 0) {
            const rwords = reasoning.split(/\s+/);
            for (let i = 0; i < rwords.length; i++) {
                const piece = (i === 0 ? '' : ' ') + rwords[i];
                res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: piece }, finish_reason: null }] })}\n\n`);
            }
        }
        if (text.length > 0) {
            // Stream the body word-by-word so live consumers (run panel,
            // reasoning fold) see incremental updates instead of one big
            // burst at the end.
            const words = text.split(/\s+/);
            for (let i = 0; i < words.length; i++) {
                const piece = (i === 0 ? '' : ' ') + words[i];
                res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
            }
        }
        if (toolCalls.length > 0) {
            // Emit each tool_call as its own delta. Distinct `index`
            // values within the tool_calls array are what tells the
            // runtime "these are N separate calls, not chunks of one".
            for (let i = 0; i < toolCalls.length; i++) {
                const tc = toolCalls[i];
                const frame = {
                    choices: [{
                        index: 0,
                        delta: {
                            tool_calls: [{
                                index: i,
                                id: `mock-tc-${i + 1}`,
                                type: 'function',
                                function: { name: tc.name, arguments: tc.arguments },
                            }],
                        },
                        finish_reason: null,
                    }],
                };
                res.write(`data: ${JSON.stringify(frame)}\n\n`);
            }
            res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return;
    }
    // Non-streaming.
    const message = { role: 'assistant', content: text };
    if (reasoning) message.reasoning = reasoning;
    if (toolCalls.length > 0) {
        message.tool_calls = toolCalls.map((tc, i) => ({
            id: `mock-tc-${i + 1}`,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
        }));
    }
    const choice = {
        index: 0,
        message,
        finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
        id: 'mock-cmpl-1',
        object: 'chat.completion',
        created: 0,
        model: parsed.model || 'mock-gpt-4o',
        choices: [choice],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }));
}

/**
 * Emit a Responses-API reply derived from the same scripted shapes as
 * respondFromRouter ({ text } / { tool, arguments } / { toolCalls } /
 * optional { reasoning }). Streaming emits semantic Responses events;
 * non-streaming returns the full response object.
 */
async function respondFromResponsesRoute(res, parsed, isStream, scripted, chunkDelayMs = 0) {
    const toolCalls = normalizeToolCalls(scripted.response);
    const text = String(scripted.response.text ?? '');
    const reasoning = scripted.response.reasoning != null ? String(scripted.response.reasoning) : '';

    if (!isStream) {
        const output = [];
        if (reasoning.length > 0) {
            output.push({ type: 'reasoning', summary: [{ type: 'summary_text', text: reasoning }] });
        }
        if (text.length > 0) {
            output.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
        }
        toolCalls.forEach((tc, i) => {
            output.push({ type: 'function_call', id: `fc_${i + 1}`, call_id: `mock-call-${i + 1}`, name: tc.name, arguments: tc.arguments });
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
            id: 'resp_mock_1',
            object: 'response',
            status: 'completed',
            model: parsed.model || 'mock-gpt-4o',
            output,
            usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
        }));
        return;
    }

    res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
    });
    const send = (obj) => res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`);
    send({ type: 'response.created', response: { id: 'resp_mock_1' } });
    send({ type: 'response.in_progress', response: { id: 'resp_mock_1' } });

    let outputIndex = 0;
    if (reasoning.length > 0) {
        send({ type: 'response.output_item.added', output_index: outputIndex, item: { type: 'reasoning' } });
        send({ type: 'response.reasoning_summary_part.added', item_id: 'rs_1', output_index: outputIndex, summary_index: 0 });
        const rpieces = splitPieces(reasoning);
        for (let i = 0; i < rpieces.length; i++) {
            send({ type: 'response.reasoning_summary_text.delta', item_id: 'rs_1', output_index: outputIndex, delta: rpieces[i] });
            if (chunkDelayMs > 0 && i < rpieces.length - 1) {
                await new Promise(r => setTimeout(r, chunkDelayMs));
            }
        }
        send({ type: 'response.reasoning_summary_text.done', item_id: 'rs_1', output_index: outputIndex });
        send({ type: 'response.output_item.done', output_index: outputIndex, item: { type: 'reasoning' } });
        outputIndex += 1;
    }
    if (text.length > 0) {
        send({ type: 'response.output_item.added', output_index: outputIndex, item: { type: 'message', role: 'assistant' } });
        send({ type: 'response.content_part.added', item_id: 'msg_1', output_index: outputIndex, content_index: 0, part: { type: 'output_text', text: '' } });
        const tpieces = splitPieces(text);
        for (let i = 0; i < tpieces.length; i++) {
            send({ type: 'response.output_text.delta', item_id: 'msg_1', output_index: outputIndex, delta: tpieces[i] });
            if (chunkDelayMs > 0 && i < tpieces.length - 1) {
                await new Promise(r => setTimeout(r, chunkDelayMs));
            }
        }
        send({ type: 'response.output_text.done', item_id: 'msg_1', output_index: outputIndex });
        send({ type: 'response.output_item.done', output_index: outputIndex, item: { type: 'message', role: 'assistant' } });
        outputIndex += 1;
    }
    for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        send({ type: 'response.output_item.added', output_index: outputIndex, item: { type: 'function_call', id: `fc_${i + 1}`, call_id: `mock-call-${i + 1}`, name: tc.name, arguments: '' } });
        send({ type: 'response.function_call_arguments.delta', item_id: `fc_${i + 1}`, output_index: outputIndex, delta: tc.arguments });
        send({ type: 'response.function_call_arguments.done', item_id: `fc_${i + 1}`, output_index: outputIndex, arguments: tc.arguments });
        send({ type: 'response.output_item.done', output_index: outputIndex, item: { type: 'function_call', id: `fc_${i + 1}`, call_id: `mock-call-${i + 1}`, name: tc.name, arguments: tc.arguments } });
        outputIndex += 1;
    }
    send({
        type: 'response.completed',
        response: { id: 'resp_mock_1', status: 'completed', usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } },
    });
    res.end();
}

function splitPieces(s) {
    // Word-by-word with leading spaces preserved so consumers see
    // incremental updates identical to the chat-completions path.
    return s.split(/\s+/).map((w, i) => (i === 0 ? '' : ' ') + w).filter(Boolean);
}

/**
 * Convert a Responses-API input[] back into a chat-completions-style
 * messages array for the generic route. function_call / function_call_output
 * items are omitted from this message-only view. A bare string input is
 * treated as a single user turn.
 */
function responsesInputToMessages(input) {
    if (typeof input === 'string') return [{ role: 'user', content: input }];
    if (!Array.isArray(input)) return [];
    return input
        .filter((item) => item && typeof item === 'object' && typeof item.role === 'string')
        .map((item) => ({ role: item.role, content: stringifyMessageContent(item.content) }));
}

/**
 * Normalize the three permitted router-response shapes into a uniform
 * `[{ name, arguments: string }]` list. Empty list signals "this is a
 * text response, not a tool call".
 *
 * The `arguments` field is always serialized to a string — OpenAI's
 * wire format requires it, and the runtime's tool-call assembler does
 * JSON.parse on the way out. Passing an object pre-stringifies it
 * here so test code can write `{ arguments: { text: '...' } }`
 * without remembering to JSON.stringify.
 */
function normalizeToolCalls(response) {
    if (!response || typeof response !== 'object') return [];
    if (Array.isArray(response.toolCalls)) {
        return response.toolCalls
            .filter(tc => tc && typeof tc === 'object' && (tc.name || tc.tool))
            .map(tc => ({
                name: String(tc.name || tc.tool || ''),
                arguments: serializeToolArgs(tc.arguments),
            }));
    }
    if (response.tool || response.toolName) {
        return [{
            name: String(response.tool || response.toolName || ''),
            arguments: serializeToolArgs(response.arguments),
        }];
    }
    return [];
}

function serializeToolArgs(args) {
    if (typeof args === 'string') return args;
    try { return JSON.stringify(args ?? {}); }
    catch { return '{}'; }
}

/**
 * Some clients send tool / system message content as an array of parts
 * (e.g. `[{ type: 'text', text: '...' }]`). Flatten to a single string
 * so router code can grep without worrying about which shape is in use.
 */
function stringifyMessageContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map(p => (typeof p === 'string' ? p : (p?.text || '')))
            .join('');
    }
    return '';
}

function deriveEcho(parsed) {
    const msgs = Array.isArray(parsed?.messages) ? parsed.messages : [];
    const lastUser = [...msgs].reverse().find(m => m.role === 'user');
    const content = typeof lastUser?.content === 'string' ? lastUser.content : (Array.isArray(lastUser?.content) ? lastUser.content.map(p => p.text || '').join(' ') : '');
    if (!content) return DEFAULT_REPLY;
    // Echo with a small RP wrap so it reads like an in-world reply, not "you said: ...".
    return `*Ash pauses, considering your words.* "${content.slice(0, 200)}" *They look up at the lantern light.*`;
}

// ---------------------------------------------------------------------------
// Embeddings — deterministic bag-of-tokens hash → fixed-dim float vector.
//
// Each whitespace-separated token of the input maps to one of EMBED_DIMS
// buckets via a stable djb2-style hash. The token contributes a small
// signed weight to that bucket; collisions average out across many tokens.
// L2-normalize at the end so cosine similarity (= dot product) is bounded
// in [-1, 1]. Strings that share many tokens (e.g. "navigate the coast"
// and "Coastal navigation in fog") end up with overlapping bucket sets
// and positive cosine, which is exactly what the e2e vector tests rely
// on — no real semantic embedding required.
// ---------------------------------------------------------------------------
const EMBED_DIMS = 384;

function hashToken(token) {
    // djb2 — stable across runs, fits in a 32-bit signed range.
    let h = 5381;
    for (let i = 0; i < token.length; i++) {
        h = ((h << 5) + h + token.charCodeAt(i)) | 0;
    }
    return h;
}

function tokenize(text) {
    // Lowercase + strip non-alphanumeric (keep ASCII letters, digits, and
    // BMP letters above U+00C0 so CJK / accented prose still tokenizes
    // reasonably) so capitalization, punctuation, and quotes don't
    // fragment the bag. Empty tokens dropped.
    return String(text).toLowerCase()
        .replace(/[^a-z0-9À-￿]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

function deterministicEmbedding(text) {
    const vec = new Array(EMBED_DIMS).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) {
        // Avoid the zero vector (cosine undefined). Seed from raw bytes
        // so that two "empty after tokenize" strings still produce
        // distinct vectors (e.g. pure punctuation, whitespace, etc.).
        const seed = hashToken(text || ' ') | 0;
        for (let i = 0; i < EMBED_DIMS; i++) {
            // Small mixed sequence — keep magnitudes tiny so a single empty
            // input doesn't dominate downstream cosine math.
            vec[i] = (((seed ^ (i * 2654435761)) | 0) % 1000) / 100000;
        }
    } else {
        for (const token of tokens) {
            const h = hashToken(token);
            const bucket = ((h % EMBED_DIMS) + EMBED_DIMS) % EMBED_DIMS;
            // Sign bit from a different hash region so adjacent tokens
            // don't all push the same direction.
            const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
            // Magnitude derives from token length so common short stop-
            // words contribute less than longer content words. Cheap
            // approximation of TF-IDF weighting without a real corpus.
            const weight = sign * (1 + Math.min(token.length, 12)) / 13;
            vec[bucket] += weight;
            // Also stamp two neighboring buckets at decreasing weight so
            // a near-miss (same token in slightly different form) still
            // overlaps a bit. Keeps the index from being knife-edge.
            const left = (bucket - 1 + EMBED_DIMS) % EMBED_DIMS;
            const right = (bucket + 1) % EMBED_DIMS;
            vec[left] += weight * 0.3;
            vec[right] += weight * 0.3;
        }
    }
    // L2-normalize so cosine = dot product. Backends typically assume
    // unit vectors when computing similarity.
    let norm = 0;
    for (let i = 0; i < EMBED_DIMS; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < EMBED_DIMS; i++) vec[i] = vec[i] / norm;
    return vec;
}
