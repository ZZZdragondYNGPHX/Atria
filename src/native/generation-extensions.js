import { runPackageComputation } from './package-computation.js';
import { extensionManifest } from '../../public/shared/generation-extension-contract.js';
import { scriptMatches } from '../../public/shared/extension-contract.js';
import { renderPromptMessages } from './model-prompt-runtime/prompt-renderers.js';
import { semanticBlocks } from './model-prompt-runtime/semantic-blocks.js';
import { immutable, GenerationError } from './model-prompt-runtime/execution-utils.js';

const fail = code => { throw new GenerationError('generation_extension_' + code); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const requestClocks = new Map();
function requestTimestamp(handle, requestId) {
    const key = JSON.stringify([handle, requestId]);
    if (!requestClocks.has(key)) requestClocks.set(key, Date.now());
    const timestamp = requestClocks.get(key);
    while (requestClocks.size > 256) requestClocks.delete(requestClocks.keys().next().value);
    return timestamp;
}

/** One execution owns the installed revisions, settings and per-plugin state.
 * Guest code runs in the existing disposable computation workers, never Node.
 */
export class GenerationExtensions {
    constructor({ store, handle, context, signal, resolveContext }) {
        Object.assign(this, { store, handle, context, signal, resolveContext });
        this.entries = null; this.round = 0; this.followup = []; this.observations = [];
        this.repeats = 0; this.continuations = 0;
        this.timestamp = Date.now();
    }
    async load() {
        if (this.entries) return;
        const rows = (await this.store.list(this.handle)).filter(row => row.manifest?.generation && row.enabled);
        this.entries = await Promise.all(rows.map(async row => {
            const record = await this.store.get(this.handle, row.id);
            const preferences = await this.store.preferences(this.handle, row.id);
            return { record, manifest: extensionManifest(record.files, record.entrypoint), preferences, state: {},
                sourceFiles: new Map(Object.entries(record.files).map(([path, text]) => [path, Buffer.from(text)])) };
        }));
    }
    async current() {
        this.signal?.throwIfAborted();
        for (const entry of this.entries ?? []) {
            const current = await this.store.get(this.handle, entry.record.id);
            if (!current.enabled || current.revision !== entry.record.revision) fail('changed');
        }
    }
    async call(entry, stage, value) {
        this.signal?.throwIfAborted();
        let result;
        try {
            result = await runPackageComputation({ sourceFiles: entry.sourceFiles }, entry.manifest.generation.entrypoint, 'transform', {
                stage, context: this.requestContext, config: entry.preferences.value, state: entry.state, ...value,
            }, { signal: this.signal });
        } catch (error) {
            this.signal?.throwIfAborted();
            console.warn('[generation-extension]', entry.record.id, stage, error.code ?? error.name);
            fail('execution_failed');
        }
        if (!object(result.value)) fail('result_invalid');
        const { state, observation, ...output } = result.value;
        if (state !== undefined) entry.state = state;
        if (observation !== undefined) this.observations.push({ pluginId: entry.record.id, stage, round: this.round, value: observation });
        return output;
    }
    async prepare({ resolved, contextPlan, promptIr }) {
        await this.load();
        if (!this.entries.length) return null;
        await this.current();
        this.timestamp = requestTimestamp(this.handle, promptIr.requestId);
        this.requestContext = {
            ...this.context, ...await this.resolveContext?.(resolved), requestId: promptIr.requestId, round: this.round, role: resolved.route.role, timestamp: this.timestamp,
            connectionId: resolved.connection.connectionProfileId, modelId: resolved.model.remoteModelId,
            provider: resolved.connection.providerAdapter, reservedOutputTokens: contextPlan.budget.reservedOutputTokens,
            sampling: resolved.generation.sampling, streaming: resolved.generation.streaming,
            hasTools: Boolean(promptIr.tools.length), hasOutputContract: Boolean(promptIr.outputContract || promptIr.compilation?.presetContent),
        };
        const source = renderPromptMessages(promptIr);
        const blocks = promptIr.semanticBlocks ?? semanticBlocks(promptIr);
        const writable = source.map((message, index) => typeof message.content === 'string' && !message.providerState
            && !message.tool_calls && message.role !== 'tool' && !['host_policy', 'prefill', 'tool_result'].includes(blocks[index]?.kind));
        let request = { messages: source, writable, parameters: {}, extras: {}, carrier: null,
            followup: this.followup, limits: { repeats: 0, continuations: 0 } };
        for (const entry of this.entries) {
            entry.active = scriptMatches(entry.record, this.requestContext);
            if (!entry.active) continue;
            const caps = entry.manifest.generation.capabilities;
            const output = await this.call(entry, 'request', { request });
            if (output.active === false) { entry.active = false; continue; }
            entry.frames = output.frames !== false;
            if (!output.request) continue;
            const next = output.request;
            if (!Array.isArray(next.messages) || next.messages.length !== source.length) fail('messages_invalid');
            for (let index = 0; index < source.length; index++) {
                const { content: before, ...identity } = source[index];
                const { content: after, ...nextIdentity } = next.messages[index] ?? {};
                if (!equal(identity, nextIdentity) || !writable[index] && before !== after
                    || writable[index] && typeof after !== 'string') fail('message_authority');
            }
            if (!caps.includes('request.text') && !equal(next.messages, request.messages)) fail('capability_denied');
            if (!caps.includes('request.parameters') && (!equal(next.parameters, request.parameters) || !equal(next.extras, request.extras))) fail('capability_denied');
            if (!caps.includes('response.carrier') && !equal(next.carrier, request.carrier)) fail('capability_denied');
            if (next.carrier && (promptIr.tools.length || promptIr.outputContract || promptIr.compilation?.presetContent)) fail('carrier_conflict');
            for (const name of ['repeats', 'continuations']) {
                if (!Number.isSafeInteger(next.limits?.[name]) || next.limits[name] < 0) fail('limits_invalid');
                if (next.limits[name] && !caps.includes(name === 'repeats' ? 'generation.repeat' : 'generation.continue')) fail('capability_denied');
            }
            request = { ...next, writable, followup: this.followup };
        }
        if (!this.entries.some(entry => entry.active)) { this.prepared = null; return null; }
        this.prepared = immutable(request);
        return immutable({ ...request, plugins: this.entries.filter(entry => entry.active).map(entry => ({ id: entry.record.id, revision: entry.record.revision, settingsRevision: entry.preferences.revision })) });
    }
    /** True when an active extension rewrites stream frames, so raw text is not final yet. */
    get transformsFrames() {
        return (this.entries ?? []).some(entry => entry.active && entry.frames && entry.manifest.generation.capabilities.includes('response.frames'));
    }
    async frame(frame, format) {
        let value = frame;
        for (const entry of this.entries ?? []) {
            if (!entry.active || !entry.frames || !entry.manifest.generation.capabilities.includes('response.frames')) continue;
            const result = await this.call(entry, 'frame', { frame: value, format });
            if (result.frame !== undefined) value = preserveFrameAuthority(value, result.frame);
        }
        return value;
    }
    async response(response) {
        let value = response, decision = null;
        for (const entry of this.entries ?? []) {
            if (!entry.active || !entry.manifest.generation.capabilities.some(cap => ['response.text', 'response.carrier', 'generation.repeat', 'generation.continue'].includes(cap))) continue;
            const output = await this.call(entry, 'response', { response: value, request: this.prepared });
            if (output.response) {
                const next = output.response;
                if (!entry.manifest.generation.capabilities.includes('response.text') && next.text !== value.text) fail('capability_denied');
                if (typeof next.text !== 'string') fail('response_invalid');
                const carrier = this.prepared?.carrier?.name;
                const expected = (value.toolCalls ?? []).filter(call => call.name !== carrier);
                if (!equal(next.toolCalls ?? [], expected)) fail('tool_authority');
                const consumedCarrier = carrier && value.toolCalls?.length && !expected.length;
                if (value.providerState && !consumedCarrier && (next.text !== value.text || !equal(expected, value.toolCalls ?? []))) fail('native_continuity_conflict');
                // Accounting and Provider identity are observations, not plugin output.
                value = { ...value, text: next.text, assistantText: next.text, toolCalls: expected,
                    ...(typeof next.truncated === 'boolean' ? { truncated: next.truncated } : {}) };
                if (consumedCarrier) delete value.providerState;
            }
            if (output.decision && output.decision.action !== 'accept') {
                if (!entry.manifest.generation.capabilities.includes(output.decision.action === 'continue' ? 'generation.continue' : 'generation.repeat')) fail('capability_denied');
                if (decision) fail('decision_conflict');
                decision = output.decision;
            }
        }
        if (decision) {
            const continuation = decision.action === 'continue';
            if (!continuation && decision.action !== 'repeat') fail('decision_invalid');
            const field = continuation ? 'continuations' : 'repeats';
            if (this[field] >= this.prepared.limits[field]) decision = null;
            else {
                if (!Array.isArray(decision.messages) || decision.messages.some(message => !['assistant', 'user'].includes(message.role)
                    || typeof message.content !== 'string' || Object.keys(message).some(key => !['role', 'content'].includes(key)))) fail('followup_invalid');
                if (!Number.isSafeInteger(decision.delayMs ?? 0) || (decision.delayMs ?? 0) < 0) fail('delay_invalid');
                this[field]++; this.followup = decision.messages; this.round++;
            }
        }
        return { response: value, decision, observations: this.observations.slice(-100) };
    }
}

// A response transformer owns presentation text. Provider identity, usage,
// termination, errors, signatures and genuine tool arguments remain evidence.
export function preserveFrameAuthority(before, after, key = '') {
    if (['tool_use', 'input_json_delta', 'function_call', 'thinking', 'redacted_thinking'].includes(before?.type)
        || before?.signature || before?.thoughtSignature) return before;
    if (Array.isArray(before)) {
        if (!Array.isArray(after) || before.length !== after.length) return before;
        return before.map((value, index) => preserveFrameAuthority(value, after[index], key));
    }
    if (object(before) && !object(after)) return before;
    if (!object(after) && !Array.isArray(after)) return after;
    const protectedKeys = new Set(['usage', 'usageMetadata', 'model', 'modelVersion', 'id', 'response_id', 'finish_reason', 'finishReason',
        'stop_reason', 'stop_sequence', 'error', 'status', 'incomplete_details', 'promptFeedback', 'safetyRatings', 'signature', 'thoughtSignature',
        'tool_calls', 'function_call', 'functionCall', 'partial_json', 'arguments', 'refusal', 'blocked', 'type', 'index']);
    const result = Array.isArray(after) ? [...after] : { ...after };
    for (const name of new Set([...Object.keys(before ?? {}), ...Object.keys(after)])) {
        if (protectedKeys.has(name)) {
            if (Object.hasOwn(before ?? {}, name)) result[name] = before[name]; else delete result[name];
        } else if (before?.[name] && typeof before[name] === 'object' || result[name] && typeof result[name] === 'object') result[name] = preserveFrameAuthority(before?.[name], result[name], name);
    }
    return result;
}

/** Adapters lower this prepared view; the authored PromptIR remains unchanged. */
export function extensionRequestView(resolved, promptIr, prepared) {
    if (!prepared) return { resolved, messages: renderPromptMessages(promptIr), tools: promptIr.tools };
    const parameters = prepared.parameters ?? {};
    if (!object(parameters) || Object.keys(parameters).some(key => !['temperature', 'topP', 'stream', 'stop'].includes(key))) fail('parameters_invalid');
    const generation = { ...resolved.generation, sampling: { ...resolved.generation.sampling }, streaming: { ...resolved.generation.streaming }, stop: { ...resolved.generation.stop } };
    if (parameters.temperature !== undefined && (!Number.isFinite(parameters.temperature) || parameters.temperature < 0 || parameters.temperature > 2)
        || parameters.topP !== undefined && (!Number.isFinite(parameters.topP) || parameters.topP < 0 || parameters.topP > 1)
        || parameters.stream !== undefined && typeof parameters.stream !== 'boolean'
        || parameters.stop !== undefined && (!Array.isArray(parameters.stop) || parameters.stop.some(item => typeof item !== 'string'))) fail('parameters_invalid');
    for (const key of ['temperature', 'topP']) if (parameters[key] !== undefined) generation.sampling[key] = parameters[key];
    if (parameters.stream !== undefined) generation.streaming.enabled = parameters.stream;
    if (parameters.stop !== undefined) generation.stop.sequences = parameters.stop;
    let tools = promptIr.tools;
    if (prepared.carrier) {
        const { name, description, schema } = prepared.carrier;
        if (tools.length || typeof name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name) || typeof description !== 'string' || !object(schema)) fail('carrier_invalid');
        tools = [{ type: 'function', function: { name, description, parameters: schema } }];
        generation.toolChoice = { value: 'required' };
    }
    return { resolved: { ...resolved, generation }, messages: [...prepared.messages, ...prepared.followup], tools };
}

export function extensionRequestExtras(body, prepared) {
    const extras = prepared?.extras ?? {};
    // Extras may control intermediary routing only. Core protocol, destinations,
    // credentials, tools and model selection never come from arbitrary JSON.
    if (!object(extras) || Object.keys(extras).some(key => !['allow_fallbacks', 'fallback', 'enable_fallback', 'disable_fallback', 'provider'].includes(key))) fail('extras_invalid');
    for (const [key, value] of Object.entries(extras)) {
        if (key === 'provider') {
            if (!object(value) || Object.keys(value).some(name => name !== 'allow_fallbacks') || typeof value.allow_fallbacks !== 'boolean') fail('extras_invalid');
        } else if (typeof value !== 'boolean') fail('extras_invalid');
    }
    return { ...body, ...extras };
}
