import { configuredNativeRoute } from '../../../native/runtime-route-ref.js';
import { compileWorkspacePreset } from '../../../lib/agent-workspace/presets.js';

/** Transient host transport shape. Never persist this return value as a preset. */
export function workspaceHostProfile(preset, selectionSource = 'default', promptVersionId = null, strategyVersionId = null) {
    const plan = structuredClone(compileWorkspacePreset(preset));
    if (promptVersionId) plan.metadata = { ...plan.metadata, promptVersionId };
    if (strategyVersionId) plan.metadata = { ...plan.metadata, strategyVersionId };
    const config = agent => ({ ...structuredClone(agent?.metadata?.hostAdapters?.atria || {}),
        systemPrompt: agent?.instructions || '', ...agent?.modelProfile, ...configuredNativeRoute(agent?.modelProfile) });
    const forNode = id => config(plan.agents.find(agent => agent.id === plan.nodes.find(node => node.nodeId === id)?.agentId));
    const options = structuredClone(plan.metadata?.hostAdapters?.atria || {});
    const common = { source: selectionSource, key: preset.id, presetId: preset.id, name: preset.name, mode: preset.mode, orchestrationPlan: plan,
        ...(promptVersionId ? { promptVersionId } : {}), ...(strategyVersionId ? { strategyVersionId } : {}) };
    if (preset.mode !== 'spec' && plan.arbitration.kind !== 'pass-through') {
        throw new Error('This host supports multi-result arbitration in Spec graphs; other modes submit their owner result.');
    }
    if (['loop', 'director'].includes(preset.mode) && (plan.entryNodeId !== 'owner' || plan.output.ownerNodeId !== 'owner')) {
        throw new Error('This host requires the Loop/Director entry and output owner to be named owner');
    }
    if (preset.mode === 'agenda' && (plan.scheduler?.plannerNodeId !== 'planner'
        || plan.nodes.some(node => node.nodeId !== 'planner' && node.nodeId !== `worker:${node.metadata?.legacyAgentId}`))) {
        throw new Error('Agenda authoring edits planner/pool policies; dynamic tasks belong to the running Engine');
    }
    if (preset.mode === 'loop') return { ...options, ...forNode(plan.entryNodeId), system_prompt: forNode(plan.entryNodeId).systemPrompt, max_rounds: plan.budgets.maxSteps, ...common };
    if (preset.mode === 'director') return { ...options, mainAgent: forNode(plan.output.ownerNodeId),
        subAgents: plan.nodes.filter(node => node.nodeId !== plan.output.ownerNodeId).map(node => ({
            ...forNode(node.nodeId), id: node.metadata?.legacyAgentId || node.nodeId })),
        maxRounds: plan.budgets.maxSteps, maxConcurrentSubagents: plan.budgets.maxConcurrency, ...common };
    if (preset.mode === 'agenda') return { ...options, planner: forNode('planner'),
        agents: Object.fromEntries(plan.nodes.filter(node => node.nodeId !== 'planner').map(node => [node.metadata?.legacyAgentId || node.nodeId, forNode(node.nodeId)])),
        finalAgentId: plan.nodes.find(node => node.nodeId === plan.output.ownerNodeId)?.metadata?.legacyAgentId,
        limits: { plannerMaxRounds: plan.scheduler.maxPlannerRounds, maxConcurrentAgents: plan.budgets.maxConcurrency, maxTotalRuns: plan.scheduler.maxTotalRuns }, ...common };
    const stages = [], presets = {};
    // A native graph need not carry Atria's historical stage slots. Derive those
    // transport-only slots from its bounded DAG without changing saved authoring data.
    if (plan.nodes.some(node => node.kind === 'agent' && !Number.isInteger(node.metadata?.stageIndex))) {
        const ranks = new Map(plan.nodes.map(node => [node.nodeId, 0]));
        for (let pass = 0; pass < plan.nodes.length; pass++) for (const edge of plan.edges.filter(edge => !edge.maxVisits)) {
            ranks.set(edge.to, Math.max(ranks.get(edge.to), ranks.get(edge.from) + 1));
        }
        const levels = [...new Set(plan.nodes.filter(node => node.kind === 'agent').map(node => ranks.get(node.nodeId)))].sort((a, b) => a - b);
        const counts = new Map();
        for (const node of plan.nodes.filter(node => node.kind === 'agent')) {
            const stageIndex = levels.indexOf(ranks.get(node.nodeId)), nodeIndex = counts.get(stageIndex) || 0;
            counts.set(stageIndex, nodeIndex + 1);
            node.metadata = { ...node.metadata, stageIndex, nodeIndex, stageId: `graph-${stageIndex}`,
                nodeSpec: node.metadata?.nodeSpec || { id: node.nodeId, preset: node.agentId, type: 'worker' },
                isFinalStage: node.nodeId === plan.output.ownerNodeId };
        }
    }
    for (const node of plan.nodes) {
        const meta = node.metadata;
        if (!Number.isInteger(meta?.stageIndex)) continue;
        const stage = stages[meta.stageIndex] ||= { id: meta.stageId || `stage-${meta.stageIndex}`, mode: 'parallel', nodes: [] };
        stage.nodes[meta.nodeIndex] = structuredClone(meta.nodeSpec);
        presets[meta.nodeSpec.preset || meta.nodeSpec.id] = forNode(node.nodeId);
        if (plan.edges.some(edge => edge.to === node.nodeId && plan.nodes.find(item => item.nodeId === edge.from)?.metadata?.stageIndex === meta.stageIndex)) stage.mode = 'serial';
    }
    return { ...options, spec: { ...options.specOptions, stages }, presets, ...common };
}
