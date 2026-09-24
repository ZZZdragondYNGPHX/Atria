import { assertPromptIR } from './contracts.js';
import { immutable } from './execution-utils.js';
import { promptError } from './prompt-values.js';

export function renderPromptMessages(value) {
    const ir = assertPromptIR(value);
    const slots = new Map(['context.before_history', 'context.after_history', 'context.before_input', 'context.after_input'].map(key => [key, []]));
    for (const slot of ir.contextSlots) {
        const target = typeof slot === 'string' ? 'context.before_history' : slot?.target;
        const content = typeof slot === 'string' ? slot : slot?.content;
        if (!slots.has(target) || typeof content !== 'string') promptError('context_slot');
        slots.get(target).push({ role: 'system', content });
    }
    const messages = [
        ...ir.directives.map(content => ({ role: 'system', content })),
        ...slots.get('context.before_history'), ...ir.history,
        ...slots.get('context.after_history'), ...slots.get('context.before_input'),
        ...(ir.input ? [{ role: 'user', content: ir.input }] : []), ...slots.get('context.after_input'),
        ...ir.responseDirectives.map(content => ({ role: 'system', content })),
        ...(ir.prefill === undefined ? [] : [{ role: 'assistant', content: ir.prefill }]),
    ];
    if (messages.some(item => !item || !['system', 'user', 'assistant', 'tool'].includes(item.role)
        || (typeof item.content !== 'string' && !(item.role === 'assistant' && item.content === null && item.tool_calls?.length))
        || Object.keys(item).some(key => !['role', 'content', 'tool_calls', 'tool_call_id', 'name', 'providerState'].includes(key))
        || (item.providerState !== undefined && item.role !== 'assistant')
        || (item.role === 'tool' && typeof item.tool_call_id !== 'string')
        || (item.tool_calls !== undefined && (item.role !== 'assistant' || !Array.isArray(item.tool_calls)))
        || (item.tool_call_id !== undefined && item.role !== 'tool'))) promptError('message_invalid');
    return immutable(messages);
}

// Protocol fixtures expose tools/output authority separately; concrete adapters must
// support them explicitly or fail closed, never stringify them into instructions.
export function renderPromptProtocol(value, format) {
    const ir = assertPromptIR(value);
    const messages = renderPromptMessages(ir);
    if (messages.some(message => message.providerState !== undefined)) promptError('renderer_unsupported');
    const authority = { tools: ir.tools, outputContract: ir.outputContract };
    if (format === 'openai-compatible') return immutable({ messages, ...authority });
    if (format === 'raw-text') return immutable({
        prompt: messages.map(item => `${item.role}: ${item.content}`).join('\n') + (ir.prefill === undefined ? '\nassistant:' : ''), ...authority,
    });
    if (format === 'anthropic') {
        // Keep interleaved system slots in order: this generic fixture cannot safely
        // hoist post-history directives into Anthropic's top-level system field.
        if (messages.slice(messages.findIndex(item => item.role !== 'system')).some(item => item.role === 'system')) promptError('renderer_unsupported');
        return immutable({ system: messages.filter(item => item.role === 'system').map(item => item.content).join('\n'),
            messages: messages.filter(item => item.role !== 'system'), ...authority });
    }
    if (format === 'gemini') {
        if (messages.slice(messages.findIndex(item => item.role !== 'system')).some(item => item.role === 'system')) promptError('renderer_unsupported');
        return immutable({ systemInstruction: { parts: messages.filter(item => item.role === 'system').map(item => ({ text: item.content })) },
            contents: messages.filter(item => item.role !== 'system').map(item => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }] })), ...authority });
    }
    return promptError('renderer_unsupported');
}
