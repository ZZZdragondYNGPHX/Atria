import { copy } from '../../../lib/agent-runtime/contracts.js';
import { CAPABILITIES, validateGraph } from '../../../lib/orchestration-engine/index.js';

export const ENGINE_COMPILER_VERSION = 1;
const positive = (value, fallback) => Math.max(1, Math.floor(Number(value) || fallback));
const privileges = (role, mode) => Object.fromEntries(CAPABILITIES.map(key => [key,
    key.startsWith('reply.') ? mode === 'director' && (role === 'owner' || key === 'reply.read')
        : key === 'graph.mutate' ? role === 'planner' : key === 'agent.delegate' ? ['planner', 'owner'].includes(role) : true]));

/** Read-only adaptation: keep the complete effective profile in the identity, never save it to settings. */
export function compilePreset(profile, { mode = profile.mode || profile.source || 'spec', settings = {}, presetId = '', toolsByNode = {} } = {}) {
    const source = copy(profile);
    if (source.orchestrationPlan) return validateGraph(source.orchestrationPlan).plan;
    if (!['single', 'spec', 'loop', 'agenda', 'director'].includes(mode)) mode = 'spec';
    const plan = { schemaVersion: 1, planId: `engine-v${ENGINE_COMPILER_VERSION}:${presetId || mode}`,
        source: { mode, presetId, profile: source, runtimeSettings: copy(settings), compilerVersion: ENGINE_COMPILER_VERSION },
        agents: [], nodes: [], edges: [], entryNodeId: '',
        capabilities: Object.fromEntries(CAPABILITIES.map(key => [key, true])),
        scheduler: { failurePolicy: 'settled' }, arbitration: { kind: 'pass-through', allowPartial: true },
        output: { kind: mode === 'director' ? 'reply' : 'guidance', ownerNodeId: '', allowPartial: mode !== 'director', submitCapability: mode === 'director' ? 'reply.submit' : 'result.submit' },
        budgets: { maxSteps: 1000, maxTasks: 128, maxConcurrency: positive(settings.agendaMaxConcurrentAgents, 4) },
        compatibility: { readOnly: true, sourceMode: mode } };
    const node = (nodeId, config, metadata = {}, role = 'worker') => {
        const capabilities = privileges(role, mode);
        const agentId = `agent:${nodeId}`;
        plan.agents.push({ id: agentId, instructions: String(config?.systemPrompt || ''),
            modelProfile: { apiPresetName: String(config?.apiPresetName || ''), promptPresetName: String(config?.promptPresetName || '') },
            tools: toolsByNode[nodeId] || [], handoffs: [], capabilities, policies: { maxConcurrency: plan.budgets.maxConcurrency }, metadata: { config: copy(config || {}) } });
        plan.nodes.push({ nodeId, agentId, kind: 'agent', capabilities, metadata });
        return nodeId;
    };
    const edge = (from, to) => plan.edges.push({ edgeId: `${from}->${to}`, from, to, condition: 'always' });
    if (mode === 'spec' || mode === 'single') {
        const stages = source.spec?.stages || [];
        let previous = [];
        stages.forEach((stage, stageIndex) => {
            const parallel = stage.mode === 'parallel' && !stage.nodes.some(raw => raw?.type === 'review');
            const current = [];
            stage.nodes.forEach((raw, nodeIndex) => {
                const spec = typeof raw === 'string' ? { id: raw, preset: raw, type: 'worker' } : raw;
                const id = node(`stage:${stageIndex}/node:${nodeIndex}`, source.presets?.[spec.preset || spec.id],
                    { stageIndex, nodeIndex, stageId: String(stage.id || ''), nodeSpec: copy(spec), isFinalStage: stageIndex === stages.length - 1 });
                if (!plan.entryNodeId) plan.entryNodeId = id;
                for (const from of parallel || !current.length ? previous : [current.at(-1)]) edge(from, id);
                current.push(id);
            });
            previous = parallel ? current : current.slice(-1);
        });
        // A synthetic entry makes all first-stage parallel nodes reachable without an extra model call.
        const roots = plan.nodes.filter(item => !plan.edges.some(edge => edge.to === item.nodeId));
        if (roots.length > 1) {
            const id = node('entry', {}, {}, 'owner');
            const entry = plan.nodes.at(-1); entry.kind = 'router'; entry.metadata.entry = true;
            roots.forEach(root => edge(id, root.nodeId)); plan.entryNodeId = id;
        }
        plan.output.ownerNodeId = `stage:${stages.length - 1}/node:0`;
        plan.scheduler.reviewMaxRounds = Math.max(0, Math.floor(Number(settings.reviewRerunMaxRounds) || 0));
        plan.scheduler.failurePolicy = 'fail_fast';
    } else if (mode === 'agenda') {
        plan.budgets.maxTasks = Math.min(positive(settings.agendaMaxTotalRuns, 24), positive(source.limits?.maxTotalRuns, 24));
        plan.budgets.maxConcurrency = Math.min(positive(settings.agendaMaxConcurrentAgents, 3), positive(source.limits?.maxConcurrentAgents, 3));
        const planner = node('planner', source.planner, {}, 'planner');
        plan.entryNodeId = planner; plan.scheduler.plannerNodeId = planner;
        plan.scheduler.workerAgentIds = []; plan.scheduler.workerNodeIds = {};
        for (const [id, config] of Object.entries(source.agents || {})) {
            const nodeId = node(`worker:${id}`, config, { legacyAgentId: id });
            edge(planner, nodeId);
            const agentId = plan.nodes.at(-1).agentId;
            plan.scheduler.workerAgentIds.push(agentId); plan.scheduler.workerNodeIds[agentId] = nodeId;
        }
        plan.output.ownerNodeId = `worker:${source.finalAgentId}`;
        plan.scheduler.maxPlannerRounds = Math.min(positive(settings.agendaPlannerMaxRounds, 6), positive(source.limits?.plannerMaxRounds, 6));
        plan.budgets.maxSteps = plan.budgets.maxTasks + plan.scheduler.maxPlannerRounds + 1;
    } else {
        const config = mode === 'director' ? source.director || source : source;
        plan.entryNodeId = node('owner', mode === 'director' ? config.mainAgent : config, {}, 'owner');
        plan.output.ownerNodeId = plan.entryNodeId;
        if (mode === 'director') for (const agent of config.subAgents || []) {
            const id = node(`worker:${agent.id}`, agent, { legacyAgentId: agent.id });
            plan.nodes.at(-1).required = false; edge(plan.entryNodeId, id);
        }
        plan.budgets.maxSteps = positive(mode === 'loop' ? config.max_rounds : config.maxRounds, 40);
    }
    return validateGraph(plan).plan;
}
