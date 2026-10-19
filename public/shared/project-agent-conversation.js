import { fields as allowedFields } from './native-values.js';

export function normalizeProjectAgentToolCalls(result) {
    return (Array.isArray(result?.toolCalls) ? result.toolCalls : [])
        .map((call, index) => ({ id: String(call?.raw?.id || call?.id || `agent_call_${Date.now()}_${index}`),
            name: String(call?.name || '').trim(), args: call?.args && typeof call.args === 'object' ? call.args : {},
            arguments: typeof call?.raw?.function?.arguments === 'string' ? call.raw.function.arguments : JSON.stringify(call?.args || {}) }))
        .filter(call => call.name);
}

export function projectAgentAssistantToolMessage(text, calls, providerState) {
    return { role: 'assistant', content: text || '', ...(providerState ? { providerState } : {}),
        tool_calls: calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) };
}

export function projectAgentToolResultMessage(call, result) {
    if (result?.taskId) {
        const { conversation: _conversation, attempts: _attempts, timeline: _timeline, compute: _compute, ...task } = result;
        result = task;
    }
    return { role: 'tool', tool_call_id: call.id, name: call.name, content: JSON.stringify(result) };
}

/** The public transcript of one actual response and its original tool results. */
export function projectAgentRoundConversation({ conversation, intent, response, results }) {
    const transcript = [...conversation];
    if (!transcript.length) transcript.push({ role: 'user', content: intent });
    const text = response.providerState ? String(response.assistantText || '') : String(response.assistantText || '').trim();
    const calls = normalizeProjectAgentToolCalls(response);
    if (calls.length !== results.length || new Set(results.map(item => item.callId)).size !== results.length) throw new TypeError('Original Project tool results required');
    if (!calls.length) {
        if (text) transcript.push({ role: 'assistant', content: text });
    } else {
        transcript.push(projectAgentAssistantToolMessage(text, calls));
        for (const call of calls) {
            const result = results.find(item => item.callId === call.id);
            if (!result) throw new TypeError('Original Project tool result missing');
            transcript.push(projectAgentToolResultMessage(call, result.result));
        }
    }
    return projectAgentConversation(transcript);
}

function fields(value, keys, label) {
    try { allowedFields(value, keys, label); } catch (error) { throw new TypeError(error.message); }
}

export function assertProjectAgentConversation(messages) {
    if (!Array.isArray(messages) || messages.length > 128) throw new TypeError('Project Agent conversation limit');
    for (const message of messages) {
        fields(message, ['role', 'content', 'tool_calls', 'tool_call_id', 'name'], 'Project Agent message');
        if (!['user', 'assistant', 'tool'].includes(message.role) || typeof message.content !== 'string') throw new TypeError('Invalid Project Agent message');
        if (message.role === 'tool') {
            if (typeof message.tool_call_id !== 'string' || !message.tool_call_id || typeof message.name !== 'string') throw new TypeError('Invalid Project Agent tool message');
        } else if (message.tool_call_id !== undefined || message.name !== undefined) throw new TypeError('Invalid Project Agent message fields');
        if (message.tool_calls !== undefined) {
            if (message.role !== 'assistant' || !Array.isArray(message.tool_calls) || message.tool_calls.length > 32) throw new TypeError('Invalid Project Agent tool calls');
            const ids = new Set();
            for (const call of message.tool_calls) {
                fields(call, ['id', 'type', 'function'], 'Project Agent tool call');
                fields(call.function, ['name', 'arguments'], 'Project Agent function');
                if (call.type !== 'function' || typeof call.id !== 'string' || !call.id || ids.has(call.id)
                    || typeof call.function.name !== 'string' || typeof call.function.arguments !== 'string') throw new TypeError('Invalid Project Agent tool call');
                ids.add(call.id);
            }
        }
    }
    return messages;
}

// Public conversation only. Provider-private execution state stays in its original runtime.
export function projectAgentConversation(messages) {
    return assertProjectAgentConversation(messages.map(({ role, content, tool_calls, tool_call_id, name }) => ({
        role, content: String(content || ''),
        ...(tool_calls === undefined ? {} : { tool_calls }),
        ...(tool_call_id === undefined ? {} : { tool_call_id }),
        ...(name === undefined ? {} : { name }),
    })));
}

// Never replay an unfinished tool-call group after a browser restart.
export function completeProjectAgentConversation(messages) {
    let end = 0;
    for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        if (message.role === 'tool') break;
        if (message.tool_calls?.length) {
            const calls = new Set(message.tool_calls.map(call => call.id));
            while (calls.size && messages[index + 1]?.role === 'tool') {
                if (!calls.delete(messages[++index].tool_call_id)) return messages.slice(0, end);
            }
            if (calls.size) break;
        }
        end = index + 1;
    }
    return messages.slice(0, end);
}

// Public observations can be reread without replaying provider-private tool state.
export function projectAgentResumeMessages(messages) {
    return completeProjectAgentConversation(messages).flatMap(message => {
        if (message.role === 'tool') return [{ role: 'user', content: `Previous tool observation (${message.name}): ${message.content}` }];
        if (message.tool_calls?.length) return message.content ? [{ role: 'assistant', content: message.content }] : [];
        return [{ role: message.role, content: message.content }];
    });
}
