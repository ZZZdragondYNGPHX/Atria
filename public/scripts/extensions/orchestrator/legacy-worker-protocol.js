import { canonicalStringifyArgs } from './canonical-stringify.js';

/** Turn execution receipts back into the legacy provider message format. */
export function workerHistory(scratch, readToolResult = entry => entry.result.value) {
    return scratch.flatMap(entry => {
        if (entry.modelTurn) return [entry.modelTurn];
        if (entry.toolCallId) return [{ role: 'tool', tool_call_id: entry.providerCallId, content: readToolResult(entry) }];
        return [];
    });
}

/** Final-output precedence deliberately matches runWorkerNode, including mixed replies. */
export function normalizeWorkerReply(detailed, { nodeId, outputToolName, isFinalStage, enableLoopTools, effectId, getSource }) {
    const calls = Array.isArray(detailed?.toolCalls) ? detailed.toolCalls : [];
    if (!calls.length) throw new Error(`Node '${nodeId}' did not return tool calls.`);
    const final = calls.find(call => String(call?.name || '').trim() === outputToolName);
    if (final) {
        const args = final.args && typeof final.args === 'object' ? final.args : {};
        const output = isFinalStage ? String(args.text ?? '') : args;
        const traceTurn = {
            role: 'assistant', content: String(detailed?.assistantText || ''), reasoning: String(detailed?.reasoning || ''),
            tool_calls: calls.filter(c => String(c?.name || '').trim() === outputToolName)
                .map(c => ({ id: c?.id || '', name: String(c?.name || ''), args: c?.args || {} })),
        };
        if (isFinalStage && !output.trim()) {
            throw Object.assign(new Error(`Node '${nodeId}' returned empty final guidance text.`), { traceTurn });
        }
        return {
            decision: { type: 'complete', output },
            traceTurn,
        };
    }
    const ordinary = calls.filter(call => String(call?.name || '').trim());
    if (!enableLoopTools || !ordinary.length) throw new Error(`Node '${nodeId}' did not return the required output tool '${outputToolName}'.`);
    const normalized = ordinary.map((call, index) => {
        const toolName = String(call.name || '').replace(/\./g, '_');
        return {
            toolName, args: call.args && typeof call.args === 'object' ? call.args : {},
            providerCallId: String(call.id || `${effectId}/call/${index + 1}`), source: getSource(toolName), metadata: { sourceName: String(call.name) },
        };
    });
    const turn = {
        role: 'assistant', content: String(detailed?.assistantText || ''),
        ...(Array.isArray(detailed?.reasoningBlocks) && detailed.reasoningBlocks.length ? { reasoning_blocks: detailed.reasoningBlocks } : {}),
        ...(Array.isArray(detailed?.reasoningDetails) && detailed.reasoningDetails.length ? { reasoning_details: detailed.reasoningDetails } : {}),
        ...(detailed?.reasoning ? { reasoning: String(detailed.reasoning) } : {}),
        tool_calls: normalized.map(call => ({
            id: call.providerCallId, type: 'function',
            function: { name: call.toolName, arguments: canonicalStringifyArgs(call.args) }, source: call.source,
        })),
    };
    return {
        decision: { type: 'tools', calls: normalized, turn },
        traceTurn: {
            role: 'assistant', content: turn.content, reasoning: String(detailed?.reasoning || ''),
            tool_calls: normalized.map((call, index) => ({
                id: call.providerCallId, name: String(ordinary[index].name), args: ordinary[index].args || {}, source: call.source,
            })),
        },
    };
}
