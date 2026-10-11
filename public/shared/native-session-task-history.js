import { fields, assertJsonDeclaration } from './native-values.js';

export const sessionTaskHistoryLimits = Object.freeze({ tasks: 8, messages: 54, rounds: 6, bytes: 65536 });
const fail = () => { throw Object.assign(new TypeError('native_session_task_history_invalid'), { code: 'native_session_task_history_invalid' }); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
export function assertSessionTaskHistory(value) {
    fields(value, ['invocationId', 'fingerprint', 'inventoryFingerprint', 'messages'], 'Session Task history');
    if (!id(value.invocationId) || !/^[a-zA-Z0-9._:-]+$/.test(value.invocationId) || !digest(value.fingerprint)
        || !digest(value.inventoryFingerprint) || !Array.isArray(value.messages) || value.messages.length > sessionTaskHistoryLimits.messages) fail();
    let pending = [], rounds = 0;
    for (const message of value.messages) {
        if (message.role === 'assistant') {
            fields(message, ['role', 'content', 'tool_calls'], 'Task assistant');
            if (pending.length || typeof message.content !== 'string' || ++rounds > sessionTaskHistoryLimits.rounds
                || !Array.isArray(message.tool_calls) || message.tool_calls.length < 1 || message.tool_calls.length > 8) fail();
            pending = message.tool_calls.map(call => {
                fields(call, ['id', 'type', 'function'], 'Task tool call');
                fields(call.function, ['name', 'arguments'], 'Task tool function');
                if (!id(call.id) || call.type !== 'function' || !['atri_skill_read', 'atri_skill_files'].includes(call.function.name)
                    || typeof call.function.arguments !== 'string') fail();
                let args;
                try { args = JSON.parse(call.function.arguments); } catch { fail(); }
                if (!args || typeof args !== 'object' || Array.isArray(args)) fail();
                return { id: call.id, name: call.function.name };
            });
            if (new Set(pending.map(call => call.id)).size !== pending.length) fail();
        } else if (message.role === 'tool') {
            fields(message, ['role', 'content', 'tool_call_id', 'name'], 'Task tool result');
            const call = pending.shift();
            if (!call || message.tool_call_id !== call.id || message.name !== call.name || typeof message.content !== 'string') fail();
        } else fail();
    }
    return assertJsonDeclaration(value, 'Session Task history', sessionTaskHistoryLimits.bytes);
}

export function publicSessionTaskMessages(messages) {
    return messages.map(({ providerState: _privateReference, ...message }) => message);
}
