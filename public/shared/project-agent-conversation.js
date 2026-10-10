import { fields as allowedFields } from './native-values.js';

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
