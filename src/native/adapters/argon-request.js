import { createHash } from 'node:crypto';
import { GenerationError } from '../model-prompt-runtime/execution-utils.js';

/** A bounded experiment on the wire text, selected by the owning Connection.
 * Request identity fixes the salt so counting, preview and send render alike.
 * It is not a claim about the upstream provider's model identity.
 */
export function applyArgonRequestTest(body, { config, requestId, role } = {}) {
    if (config === undefined) return body;
    if (!config || typeof config !== 'object' || Array.isArray(config)
        || Object.keys(config).some(key => !['mode', 'modelId'].includes(key))
        || !['baseline', 'light', 'strong'].includes(config.mode)
        || config.modelId !== undefined && (typeof config.modelId !== 'string' || config.modelId.length > 160)) {
        throw new GenerationError('generation_adapter_control_unsupported');
    }
    const model = String(body.model || '').toLowerCase();
    const alias = config.modelId?.trim().toLowerCase();
    if (config.mode === 'baseline' || role !== 'role.narrator'
        || !(/argon/i.test(model) || alias && alias === model)) return body;
    if (body.response_format || body.tools?.length || body.cachedContent || body.cached_content
        || body.prompt_cache_key || body.prompt_cache_retention) return body;
    if (typeof requestId !== 'string' || !requestId) throw new GenerationError('generation_request_identity_mismatch');
    if (!Array.isArray(body.messages)) return body;
    if (body.messages.some(message => typeof message.content === 'string' && /^<!-- atria-argon-v1:/.test(message.content))) return body;
    const strong = config.mode === 'strong', cap = strong ? 1200 : 400;
    const messages = [...body.messages];
    const systems = [], users = [];
    const slot = message => {
        if (!message || message.tool_calls || message.function_call) return null;
        if (typeof message.content === 'string') return { text: message.content };
        if (!Array.isArray(message.content)) return null;
        const index = message.content.findIndex(part => part?.type === 'text' && typeof part.text === 'string');
        return index < 0 ? null : { text: message.content[index].text, index };
    };
    const safe = value => value && value.text.trim().length >= 10
        && !/^(?:[<{[]|```|~~~|`|https?:\/\/)/i.test(value.text.trim())
        && !/\[\[IZUMI_CHAT_INDEX_V1\]\]|IZW7_|IZM7_/i.test(value.text);
    for (let index = 0; index < messages.length; index++) {
        const message = messages[index];
        if (message.role === 'user') users.push(index);
        else if (['system', 'developer'].includes(message.role) && safe(slot(message))) systems.push(index);
    }
    const latest = users.at(-1);
    const selected = [...systems.slice(0, 1), ...(latest !== undefined && safe(slot(messages[latest])) ? [latest] : []),
        ...(strong ? systems.slice(1) : [])];
    let added = 0;
    for (const index of selected) {
        const message = messages[index], target = slot(message);
        // Also recognizes a previously prepared body; never salts tool or prefill messages.
        if (/<!-- (?:atria-argon-v1:|argon-v1:|ctx-4a-)/.test(target.text)) continue;
        const token = createHash('sha256').update(requestId + ':' + index).digest('hex');
        const lines = [`<!-- atria-argon-v1:${token.slice(0, 16)} -->`];
        for (let i = 0; i < (strong ? 3 : 1); i++) lines.push(`<!-- ctx-argon-${token.slice(i * 8, i * 8 + 8)} / rev-${token.slice(32 + i * 8, 40 + i * 8)} -->`);
        lines.push(`[_argon_${token.slice(0, 8)}]: # (ctx-${token.slice(16, 28)})`);
        const prefix = lines.join('\n') + '\n\n';
        if (added + prefix.length > cap) continue;
        if (target.index === undefined) messages[index] = { ...message, content: prefix + target.text };
        else {
            const content = [...message.content];
            content[target.index] = { ...content[target.index], text: prefix + target.text };
            messages[index] = { ...message, content };
        }
        added += prefix.length;
    }
    return added ? { ...body, messages } : body;
}
