import { openRuntimeCheckpointStore } from './runtime-checkpoints.js';
import { AgentRuntime, AgentRegistry } from '../../lib/agent-runtime/index.js';
import { compileWorkspacePreset } from '../../lib/agent-workspace/presets.js';
import { compileAgentDefinition } from '../../lib/orchestration-engine/capabilities.js';
import { createHostTokenCounter } from '../../lib/agent-runtime/host-ports.js';

/** A selected preset node, executed by the existing Runtime with attenuated ports.
 * No extension tool registry, arbitrary JS, automatic Memory recall or nested agents.
 * Every tool is an exact operation provided by the approving host, used at most once.
 */
export function createDelegatedRunApi({ getPreset, getScope, getContext, generate }) {
    let active = null;
    const inspect = ({ presetId, nodeId }) => {
        const preset = getPreset(presetId);
        if (!preset) throw new Error('Delegated preset unavailable');
        const plan = compileWorkspacePreset(preset), node = plan.nodes.find(n => n.nodeId === nodeId);
        if (!node || node.kind !== 'agent') throw new Error('Select an explicit Agent node');
        const agent = plan.agents.find(a => a.id === node.agentId);
        const definition = compileAgentDefinition(plan, node, agent.tools);
        return { version: 1, presetId, nodeId, mode: 'delegated-node', preset, definition, scope: getScope() };
    };
    return {
        inspectDelegatedRun: inspect,
        stopDelegatedRun(runId) {
            if (!active || active.runId !== runId) throw new Error('No matching live delegated run');
            active.runtime.cancelRun(runId);
            return { runId, status: 'cancelled' };
        },
        async runDelegated(input, executeOperation) {
            if (active) throw new Error('Delegated run already active');
            const current = inspect(input);
            if (!current.scope.sessionId) throw new Error('Loaded Session required for delegated run');
            if (JSON.stringify(current) !== JSON.stringify(input.expected)) throw new Error('Delegated preset or scope changed');
            if (typeof executeOperation !== 'function' || !Array.isArray(input.operations) || input.operations.length > 8
                || !Number.isInteger(input.maxSteps) || input.maxSteps < 1 || input.maxSteps > 8
                || !Number.isInteger(input.contextBudget) || input.contextBudget < 256 || input.contextBudget > 16000
                || !Number.isInteger(input.timeoutMs) || input.timeoutMs < 1000 || input.timeoutMs > 60000) throw new Error('Invalid delegated envelope');
            if (input.operations.some(o => !current.definition.tools.includes(o.toolName))) throw new Error('Preset denied delegated tool');
            const definition = { ...current.definition, instructions: current.definition.instructions + '\n' + JSON.stringify({
                protocol: 'Return JSON only: {type:"complete",output:string} or {type:"tool",toolName:"operation_N",args:{}}. Exact reviewed operations, once each. No other tools or nested agents.',
                operations: input.operations.map((operation, index) => ({ ...operation, toolName: `operation_${index}` })),
            }), tools: input.operations.map((_, n) => `operation_${n}`), handoffs: [] };
            const evidence = { runId: input.runId, presetId: input.presetId, nodeId: input.nodeId, mode: current.mode,
                modelCalls: [], toolCalls: [], memory: [], denied: [], tokens: null, cost: null, accounting: 'Provider usage when supplied; cost unavailable unless reported' };
            const used = new Set();
            const assertFresh = () => {
                if (JSON.stringify(getScope()) !== JSON.stringify(current.scope)) throw new Error('Delegated Session scope changed');
            };
            const store = await openRuntimeCheckpointStore(input.runId);
            const runtime = new AgentRuntime({ ...(store ? { store } : {}), registry: new AgentRegistry([definition]), contextBudget: input.contextBudget,
                countTokens: createHostTokenCounter(getContext()),
                eventSink: event => { if (event.type === 'effect.failed') evidence.denied.push({ stepId: event.stepId, failureKind: event.failureKind }); },
                ports: {
                    memory: { async recall() { assertFresh(); return { content: '', references: [], assertCurrent: assertFresh }; } },
                    model: { async request(effect) {
                        assertFresh();
                        const response = await generate({ effect, definition, operations: input.operations });
                        assertFresh();
                        evidence.modelCalls.push({ stepId: effect.stepId, modelProfile: definition.modelProfile, usage: response.usage ?? null });
                        if (response.usage) {
                            evidence.tokens ||= { byCall: [] };
                            evidence.tokens.byCall.push(response.usage);
                        }
                        if (Number.isFinite(response.cost)) evidence.cost = (evidence.cost ?? 0) + response.cost;
                        const decision = response.decision ?? JSON.parse(response.text);
                        if (!['complete', 'tool'].includes(decision?.type) || (decision.type === 'tool' && (Object.keys(decision.args || {}).length || !definition.tools.includes(decision.toolName)))) {
                            evidence.denied.push({ stepId: effect.stepId, reason: 'Outside delegated operation envelope' });
                            throw new Error('Delegated decision denied');
                        }
                        return decision;
                    } },
                    tool: { async execute(effect) {
                        assertFresh();
                        const index = definition.tools.indexOf(effect.toolName);
                        if (index < 0 || used.has(index) || Object.keys(effect.args || {}).length) throw new Error('Delegated operation unavailable or spent');
                        used.add(index);
                        const result = await executeOperation({ index, runId: input.runId, stepId: effect.stepId, effectId: effect.effectId });
                        evidence.toolCalls.push({ index, stepId: effect.stepId, effectId: effect.effectId, receiptId: result.receiptId, status: result.status });
                        if (input.operations[index].action.startsWith('memory.')) evidence.memory.push(evidence.toolCalls.at(-1));
                        assertFresh();
                        return { ok: result.status === 'succeeded', value: result };
                    } },
                } });
            active = { runId: input.runId, runtime };
            store?.bindCancel?.(() => runtime.cancelRun(input.runId));
            const timer = setTimeout(() => runtime.cancelRun(input.runId), input.timeoutMs);
            try {
                const state = await runtime.startRun({ runId: input.runId, agentId: definition.id, task: input.task, maxSteps: input.maxSteps });
                return { ...evidence, status: state.status, output: state.output ?? null, error: state.error ?? null };
            } finally { clearTimeout(timer); store?.close(); active = null; }
        },
    };
}
