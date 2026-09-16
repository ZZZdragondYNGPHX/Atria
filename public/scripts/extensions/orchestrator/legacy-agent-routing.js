import { AgentRegistry } from '../../lib/agent-runtime/index.js';
import { copy } from '../../lib/agent-runtime/contracts.js';
import { runLegacyWorkflow, createLegacyWorkflowRunId } from './legacy-workflow-adapter.js';

export const agentKey = (mode, id) => `${mode}/agent/${encodeURIComponent(String(id))}`;

/** Translate saved presets into a run-local graph; never store live state in definitions. */
export function createLegacyAgentGraph(mode, entries) {
    const entryId = `${mode}/controller`;
    const definitions = entries.map(({ id, preset = {}, handoffs = [] }) => ({
        id: agentKey(mode, id), name: String(id), instructions: String(preset?.systemPrompt || ''),
        modelProfile: { apiPresetName: preset?.apiPresetName || '', promptPresetName: preset?.promptPresetName || '' },
        handoffs: handoffs.map(target => agentKey(mode, target)),
        policies: { handoffContextPolicies: ['task_only'] }, metadata: { legacyMode: mode },
    }));
    return { entryId, registry: new AgentRegistry([
        { id: entryId, handoffs: definitions.map(agent => agent.id), policies: { handoffContextPolicies: ['task_only'] } },
        ...definitions,
    ]) };
}

/** Explicit selection copies only requested run inputs; unknown IDs fail before execution. */
export function selectHandoffInputs(entries, ids) {
    const source = new Map(entries);
    return new Map([...new Set(ids)].map(id => {
        if (!source.has(id)) throw new Error(`Unknown handoff input: ${id}`);
        return [id, copy(source.get(id))];
    }));
}

/** Dispatch is a state transition in the same child Runtime that executes its policy.
 * Payload stores input references, not chat/Memory OS content. The adapter resolves
 * those references from the current run before compiling the target's messages.
 */
export function runRoutedLegacyWorkflow(factory, {
    graph, toAgentId, fromAgentId = graph.entryId, task, reason, inputIds = [], parentRunId = null, ...options
}) {
    return runLegacyWorkflow(async function* () {
        const handoff = yield { kind: 'handoff', handoff: {
            toAgentId, task: String(task || `Execute ${toAgentId}`), reason,
            payload: { inputIds: [...new Set(inputIds)] }, contextPolicy: 'task_only',
        } };
        return yield* factory(handoff);
    }, { ...options,
        runId: options.runId || (parentRunId ? `${parentRunId}/${createLegacyWorkflowRunId()}` : createLegacyWorkflowRunId()),
        onEvent: options.onEvent ? event => options.onEvent({ ...event, parentRunId }) : undefined,
        registry: graph.registry, agentId: fromAgentId });
}

export function createSpecAgentRoute(node, preset, options = {}, profile = {}, normalizeNode = value => value) {
    const stages = options.runtime?.stages;
    const slots = Array.isArray(stages) ? stages.flatMap((stage, stageIndex) => (stage.nodes || []).map((raw, nodeIndex) => ({
        node: normalizeNode(raw), stageIndex, nodeIndex,
    }))) : [{ node, stageIndex: options.stageIndex || 0, nodeIndex: options.nodeIndex || 0 }];
    const slotId = slot => `${slot.stageIndex}:${slot.nodeIndex}:${slot.node.id}`;
    const entries = slots.map((slot, index) => ({
        id: slotId(slot), preset: (profile.presets || options.runtime?.agentPresets)?.[slot.node.preset] || (slot.node.id === node.id ? preset : {}),
        // Stage/node slots preserve legacy presets that reuse a node name. Only
        // reviewers can replay earlier slots; the existing target resolver still
        // rejects ambiguous model-requested node names before entering this graph.
        handoffs: slot.node.type === 'review' ? slots.slice(0, index).map(slotId) : [],
    }));
    const target = `${options.stageIndex || 0}:${options.nodeIndex || 0}:${node.id}`;
    return { parentRunId: options.runtime?.runId || null, graph: createLegacyAgentGraph('spec', entries), toAgentId: agentKey('spec', target),
        ...(options.handoffFrom ? { fromAgentId: agentKey('spec', options.handoffFrom) } : {}),
        task: options.rerunReason || `Execute node ${node.id}`, reason: options.handoffFrom ? 'review_rerun' : 'stage_dispatch' };
}
