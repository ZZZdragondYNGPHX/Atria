import { compilePreset } from '../engine-v2/preset-compiler.js';
import { createFactoryPresetForMode, DEFAULT_SINGLE_AGENT_SYSTEM_PROMPT, DEFAULT_SINGLE_AGENT_USER_PROMPT_TEMPLATE } from '../defaults.js';
import { compileWorkspacePreset, emptyPresetLibrary, updatePresetLibrary, resolvePresetBinding } from '../../../lib/agent-workspace/presets.js';
import { AGENDA_BUILTIN_REVISION } from '../agenda-defaults.js';

const WEB_TOOL_NAMES = Object.freeze(['search_search', 'search_visit']);

function setWebAccessFlags(tools, enabled) {
    const target = tools && typeof tools === 'object' ? tools : {};
    target.custom = target.custom && typeof target.custom === 'object' ? target.custom : {};
    for (const name of WEB_TOOL_NAMES) target.custom[name] = Boolean(enabled);
    return target;
}

function applyFactoryWebAccessPolicy(profile, mode) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const target = mode === 'director' && source.director && typeof source.director === 'object'
        ? source.director
        : source;

    // New Atria factory presets use least-privilege web access. Existing
    // user presets are not rewritten by this helper: it runs only while a
    // factory preset is being constructed.
    if (target.tools || mode === 'loop' || mode === 'director') {
        target.tools = setWebAccessFlags(target.tools, false);
    }
    if (target.defaultTools) target.defaultTools = setWebAccessFlags(target.defaultTools, false);
    if (target.planner?.tools) target.planner.tools = setWebAccessFlags(target.planner.tools, false);
    for (const preset of Object.values(target.presets || {})) {
        preset.tools = setWebAccessFlags(preset.tools, false);
    }
    for (const agent of Object.values(target.agents || {})) {
        agent.tools = setWebAccessFlags(agent.tools, false);
    }
    if (target.mainAgent) target.mainAgent.tools = setWebAccessFlags(target.mainAgent.tools, false);
    for (const agent of target.subAgents || []) {
        agent.tools = setWebAccessFlags(agent.tools, agent?.id === 'canon_scout');
    }
    return source;
}

/** One-time factory construction, not an importer of old user libraries. */
export function createWorkspaceFactoryPreset(mode, id = crypto.randomUUID()) {
    const single = mode === 'single';
    if (single) mode = 'spec';
    const factory = single ? { spec: { stages: [{ id: 'single', mode: 'serial', nodes: [{ id: 'owner', preset: 'owner', type: 'worker' }] }] },
        presets: { owner: { systemPrompt: DEFAULT_SINGLE_AGENT_SYSTEM_PROMPT, userPromptTemplate: DEFAULT_SINGLE_AGENT_USER_PROMPT_TEMPLATE } } } : createFactoryPresetForMode(mode);
    const profile = applyFactoryWebAccessPolicy(
        structuredClone(Array.isArray(factory) ? factory.at(-1) : factory),
        mode,
    );
    const plan = structuredClone(compilePreset(profile, { mode, presetId: id }));
    delete plan.compatibility;
    plan.source = { mode, presetId: id };
    // Opaque adapter settings live under an explicit host namespace. Definitions
    // and graph topology are stored once, in Plan agents/nodes, never in this bag.
    const hostOptions = structuredClone(profile.director || profile);
    for (const key of ['spec', 'presets', 'planner', 'agents', 'mainAgent', 'subAgents', 'systemPrompt', 'system_prompt', 'userPromptTemplate', 'apiPresetName', 'promptPresetName',
        'max_rounds', 'maxRounds', 'maxConcurrentSubagents', 'limits', 'finalAgentId']) delete hostOptions[key];
    if (profile.spec) { hostOptions.specOptions = structuredClone(profile.spec); delete hostOptions.specOptions.stages; }
    plan.metadata = { hostAdapters: { atria: hostOptions } };
    if (mode === 'agenda') plan.metadata.builtinAgendaRevision = AGENDA_BUILTIN_REVISION;
    for (const agent of plan.agents) {
        const settings = structuredClone(agent.metadata.config);
        if (settings.name) agent.name = settings.name;
        if (mode === 'loop') agent.instructions = settings.system_prompt || '';
        for (const key of ['name', 'systemPrompt', 'system_prompt', 'apiPresetName', 'promptPresetName']) delete settings[key];
        agent.metadata = { hostAdapters: { atria: settings } };
        agent.tools = mode === 'agenda' ? [] : ['*'];
    }
    return { schemaVersion: 1, id, name: single ? 'Single Agent' : mode === 'agenda' ? profile.name : `${mode[0].toUpperCase()}${mode.slice(1)}`, mode, planTemplate: plan, editorMetadata: {} };
}

export function getWorkspaceLibrary(settings) {
    if (!settings.agentWorkspace) {
        let library = emptyPresetLibrary();
        for (const mode of ['spec', 'loop', 'agenda', 'director']) {
            library = updatePresetLibrary(library, { type: 'save', preset: createWorkspaceFactoryPreset(mode, `builtin-${mode}`) });
        }
        settings.agentWorkspace = updatePresetLibrary(library, { type: 'bind', scope: 'default', presetId: 'builtin-spec' });
    } else {
        // Replace the retired shipped Agenda in place once. Keep every binding,
        // user-owned preset ID and already-admitted run snapshot intact. Do not
        // resurrect a built-in the user deleted, or reapply over later edits.
        const agenda = settings.agentWorkspace.presets.find(preset => preset.id === 'builtin-agenda' && preset.mode === 'agenda');
        if (agenda && !agenda.planTemplate.metadata?.builtinAgendaRevision) {
            settings.agentWorkspace = updatePresetLibrary(settings.agentWorkspace, {
                type: 'save', preset: createWorkspaceFactoryPreset('agenda', 'builtin-agenda'),
            });
        }
    }
    return settings.agentWorkspace;
}

/** Transient host transport shape. Never persist this return value as a preset. */
export function workspaceHostProfile(preset, selectionSource = 'default') {
    const plan = structuredClone(compileWorkspacePreset(preset));
    const config = agent => ({ ...structuredClone(agent?.metadata?.hostAdapters?.atria || {}),
        systemPrompt: agent?.instructions || '', ...agent?.modelProfile });
    const forNode = id => config(plan.agents.find(agent => agent.id === plan.nodes.find(node => node.nodeId === id)?.agentId));
    const options = structuredClone(plan.metadata?.hostAdapters?.atria || {});
    const common = { source: selectionSource, key: preset.id, presetId: preset.id, name: preset.name, mode: preset.mode, orchestrationPlan: plan };
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

export function resolveWorkspaceProfile(settings, scope) {
    const library = getWorkspaceLibrary(settings);
    const binding = resolvePresetBinding(library, scope);
    const preset = library.presets.find(item => item.id === binding.presetId);
    if (!preset) throw new Error('Select a default orchestration preset in Workspace');
    return workspaceHostProfile(preset, binding.selectionSource);
}
