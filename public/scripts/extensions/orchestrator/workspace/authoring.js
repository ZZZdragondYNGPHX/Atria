import { createWorkspaceFactoryPreset, getWorkspaceLibrary, workspaceHostProfile } from './host-presets.js';
import { compileWorkspacePreset, updatePresetLibrary, importWorkspacePreset, exportWorkspacePreset, resolvePresetBinding } from '../../../lib/agent-workspace/presets.js';
import { CAPABILITIES } from '../../../lib/orchestration-engine/capabilities.js';
import { renderGraph } from '../../../lib/agent-workspace/graph-view.js';
import { effectiveCapabilities } from '../../../lib/orchestration-engine/capabilities.js';

export function createPresetAuthoring({ getSettings, save, getScope }) {
    let selectedId = null;
    return function renderPresets(parent, ui) {
        const { el, button, detail } = ui;
        const settings = getSettings(), library = getWorkspaceLibrary(settings), scope = getScope();
        const selected = library.presets.find(item => item.id === selectedId) || library.presets[0];
        selectedId = selected?.id;
        const refresh = () => { parent.replaceChildren(); renderPresets(parent, ui); };
        const status = el('p', '', parent); status.setAttribute('role', 'status');
        const transact = action => {
            try {
                if (!status.isConnected || getSettings() !== settings || JSON.stringify(getScope()) !== JSON.stringify(scope)) throw new Error('Workspace scope changed. Reopen the preset editor.');
                if (action.type === 'save') workspaceHostProfile(action.preset);
                settings.agentWorkspace = updatePresetLibrary(getWorkspaceLibrary(settings), action); save(); refresh();
            } catch (error) { status.textContent = error.message; }
        };
        el('h3', 'Unified Preset Library', parent);
        const binding = resolvePresetBinding(library, scope);
        el('p', `Effective: ${library.presets.find(item => item.id === binding.presetId)?.name || 'None'} · Selected by: ${binding.selectionSource}`, parent);
        const search = el('input', undefined, parent); search.type = 'search'; search.placeholder = 'Search presets'; search.setAttribute('aria-label', 'Search presets');
        const list = el('div', undefined, parent);
        for (const preset of library.presets) {
            const item = button(list, `${preset.name} · ${preset.mode}`, () => { selectedId = preset.id; refresh(); }); item.dataset.name = preset.name.toLowerCase();
        }
        search.addEventListener('input', () => { for (const item of list.children) item.hidden = !item.dataset.name.includes(search.value.toLowerCase()); });
        const mode = el('select', undefined, parent); mode.setAttribute('aria-label', 'New preset mode');
        for (const value of ['loop', 'spec', 'agenda', 'director']) { const option = el('option', value, mode); option.value = value; }
        button(parent, 'New', () => { const preset = createWorkspaceFactoryPreset(mode.value); selectedId = preset.id; transact({ type: 'save', preset }); });
        button(parent, 'Single Agent template', () => { const preset = createWorkspaceFactoryPreset('single'); selectedId = preset.id; transact({ type: 'save', preset }); });
        const file = el('input', undefined, parent); file.type = 'file'; file.accept = '.json'; file.setAttribute('aria-label', 'Import native preset');
        file.addEventListener('change', async () => {
            try {
                if (!file.files[0]) return;
                const preset = importWorkspacePreset(await file.files[0].text());
                // Import always creates a new identity; never overwrite a bound definition silently.
                preset.id = crypto.randomUUID(); selectedId = preset.id; transact({ type: 'save', preset });
            } catch (error) { status.textContent = error.message; }
        });
        if (!selected) return;
        button(parent, 'Duplicate', () => { const newId = crypto.randomUUID(); selectedId = newId; transact({ type: 'duplicate', id: selected.id, newId }); });
        button(parent, 'Export', () => {
            const url = URL.createObjectURL(new Blob([exportWorkspacePreset(selected)], { type: 'application/json' }));
            const anchor = el('a'); anchor.href = url; anchor.download = `${selected.id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
        });
        button(parent, 'Delete and clear its bindings', () => {
            if (confirm(`Delete “${selected.name}” and clear all its bindings?`)) transact({ type: 'delete', id: selected.id, replacementId: null });
        });
        for (const [kind, subjectId] of [['default', ''], ['character', scope.character], ['conversation', scope.conversation]]) {
            const action = button(parent, `Bind as ${kind}`, () => transact({ type: 'bind', scope: kind, subjectId, presetId: selected.id }));
            action.disabled = kind !== 'default' && !subjectId;
            if (kind !== 'default' && subjectId) button(parent, `Clear ${kind} binding`, () => transact({ type: 'bind', scope: kind, subjectId, presetId: null }));
        }
        const draft = structuredClone(selected);
        if (selected.mode !== 'loop') button(parent, selected.mode === 'spec' ? 'Append worker stage' : 'Add specialist', () => {
            const plan = structuredClone(selected.planTemplate), suffix = crypto.randomUUID();
            const nodeId = `worker:${suffix}`, agentId = `agent:${suffix}`;
            const seedNode = plan.nodes.find(node => node.nodeId !== plan.entryNodeId && node.kind === 'agent') || plan.nodes.find(node => node.nodeId === plan.entryNodeId);
            const agent = structuredClone(plan.agents.find(agent => agent.id === seedNode.agentId)); agent.id = agentId;
            agent.instructions = 'Analyze the assigned task and return a concise, source-grounded result.';
            agent.capabilities['reply.submit'] = false;
            const metadata = { legacyAgentId: suffix };
            if (selected.mode === 'spec') Object.assign(metadata, { stageIndex: Math.max(-1, ...plan.nodes.map(node => node.metadata?.stageIndex ?? -1)) + 1,
                nodeIndex: 0, stageId: suffix, nodeSpec: { id: suffix, preset: suffix, type: 'worker' }, isFinalStage: true });
            const node = { nodeId, agentId, kind: 'agent', capabilities: structuredClone(agent.capabilities), metadata };
            plan.agents.push(agent); plan.nodes.push(node);
            const from = selected.mode === 'spec' ? plan.output.ownerNodeId : plan.entryNodeId;
            plan.edges.push({ edgeId: `${from}->${nodeId}`, from, to: nodeId, condition: 'always' });
            if (selected.mode === 'spec') plan.output.ownerNodeId = nodeId;
            if (selected.mode === 'director') node.required = false;
            if (selected.mode === 'agenda') { plan.scheduler.workerAgentIds.push(agentId); plan.scheduler.workerNodeIds[agentId] = nodeId; }
            transact({ type: 'save', preset: { ...selected, planTemplate: plan } });
        });
        const field = (label, value, change, type = 'text') => {
            const wrap = el('label', label, parent); const input = el(type === 'textarea' ? 'textarea' : 'input', undefined, wrap);
            if (type !== 'textarea') input.type = type;
            input.value = value; input.addEventListener('input', () => change(input.value)); return input;
        };
        field('Name', draft.name, value => { draft.name = value; });
        for (const key of ['maxSteps', 'maxTasks', 'maxConcurrency']) field(key, draft.planTemplate.budgets[key], value => { draft.planTemplate.budgets[key] = Number(value); }, 'number');
        const plan = draft.planTemplate;
        const select = (host, label, values, value, change) => {
            const wrap = el('label', label, host), input = el('select', undefined, wrap);
            for (const key of values) { const option = el('option', key, input); option.value = key; }
            input.value = value; input.addEventListener('change', () => change(input.value)); return input;
        };
        if (selected.mode === 'agenda') for (const key of ['maxPlannerRounds', 'maxTotalRuns']) {
            field(key, plan.scheduler[key], value => { plan.scheduler[key] = Number(value); }, 'number');
        }
        const structure = el('details', undefined, parent); el('summary', 'Graph, arbitration and output ownership', structure);
        el('p', `Output contract: ${plan.output.kind} · required capability: ${plan.output.submitCapability}`, structure);
        if (selected.mode === 'spec') {
            select(structure, 'Entry node', plan.nodes.map(node => node.nodeId), plan.entryNodeId, value => { plan.entryNodeId = value; });
        }
        if (['spec', 'agenda'].includes(selected.mode)) select(structure, 'Output owner', plan.nodes.map(node => node.nodeId), plan.output.ownerNodeId, value => { plan.output.ownerNodeId = value; });
        select(structure, 'Arbitration policy', selected.mode === 'spec' ? ['pass-through', 'merge', 'synthesize', 'judge', 'consensus', 'best-effort'] : ['pass-through'], plan.arbitration.kind, value => { plan.arbitration.kind = value; });
        for (const key of ['maxCalls', 'maxInputBytes']) {
            const label = el('label', key, structure), input = el('input', undefined, label); input.type = 'number'; input.min = '0'; input.value = plan.arbitration[key] ?? '';
            input.addEventListener('input', () => { if (input.value === '') delete plan.arbitration[key]; else plan.arbitration[key] = Number(input.value); });
        }
        const partialLabel = el('label', 'Allow partial output', structure), partial = el('input', undefined, partialLabel);
        partial.type = 'checkbox'; partial.checked = plan.output.allowPartial === true;
        partial.addEventListener('change', () => { plan.output.allowPartial = partial.checked; plan.arbitration.allowPartial = partial.checked; });
        if (selected.mode === 'spec') {
            el('p', 'Changes are validated together when saved. Removing a node requires repairing its edges, join inputs and output binding.', structure);
            for (const node of plan.nodes) {
                const row = el('details', undefined, structure); el('summary', node.nodeId, row);
                select(row, 'Node kind', ['agent', 'router', 'join', 'judge', 'synthesize', 'terminal'], node.kind, value => { node.kind = value; });
                select(row, 'Agent definition', plan.agents.map(agent => agent.id), node.agentId, value => { node.agentId = value; });
                const label = el('label', 'Join inputs (node IDs, comma separated)', row), input = el('input', undefined, label); input.value = (node.inputs || []).join(', ');
                input.addEventListener('input', () => { node.inputs = input.value.split(',').map(item => item.trim()).filter(Boolean); });
                button(row, 'Remove node from draft', () => { plan.nodes = plan.nodes.filter(item => item !== node); row.remove(); });
            }
            const edges = el('section', undefined, structure);
            const renderEdge = edge => {
                const row = el('article', undefined, edges);
                for (const key of ['from', 'to']) select(row, key, plan.nodes.map(node => node.nodeId), edge[key], value => { edge[key] = value; });
                select(row, 'Condition', ['always', 'completed', 'partial', 'failed', 'approved', 'rejected'], edge.condition || 'always', value => { edge.condition = value; });
                const label = el('label', 'Retry bound (empty = forward edge)', row), input = el('input', undefined, label); input.type = 'number'; input.min = '1'; input.value = edge.maxVisits ?? '';
                input.addEventListener('input', () => { if (!input.value) delete edge.maxVisits; else edge.maxVisits = Number(input.value); });
                button(row, 'Remove edge', () => { plan.edges = plan.edges.filter(item => item !== edge); row.remove(); });
            };
            plan.edges.forEach(renderEdge);
            button(structure, 'Add edge to draft', () => {
                const edge = { edgeId: crypto.randomUUID(), from: plan.entryNodeId, to: plan.output.ownerNodeId, condition: 'always' };
                plan.edges.push(edge); renderEdge(edge);
            });
        }
        el('p', selected.mode === 'agenda' ? 'Edit planner, worker pool and limits. Runtime task graphs are never saved here.'
            : selected.mode === 'director' ? 'Owner controls reply submission. Specialists return delegated results.'
                : selected.mode === 'loop' ? 'One owner, bounded steps, tools and memory.' : 'Static graph with bounded edges, parallel stages and review.', parent);
        for (const agent of draft.planTemplate.agents) {
            el('h4', agent.id, parent);
            field('Instructions', agent.instructions || '', value => { agent.instructions = value; }, 'textarea');
            field('API profile', agent.modelProfile?.apiPresetName || '', value => { (agent.modelProfile ||= {}).apiPresetName = value; });
            field('Prompt profile', agent.modelProfile?.promptPresetName || '', value => { (agent.modelProfile ||= {}).promptPresetName = value; });
            field('Tools (comma separated; * = available host tools)', (agent.tools || []).join(', '), value => { agent.tools = value.split(',').map(item => item.trim()).filter(Boolean); });
            const permissions = el('details', undefined, parent); el('summary', 'Capabilities', permissions);
            for (const capability of CAPABILITIES) {
                const label = el('label', capability, permissions), input = el('input', undefined, label);
                input.type = 'checkbox'; input.checked = agent.capabilities?.[capability] === true;
                input.addEventListener('change', () => { agent.capabilities[capability] = input.checked; });
            }
            for (const node of plan.nodes.filter(node => node.agentId === agent.id)) {
                const nodeCaps = el('details', undefined, permissions); el('summary', `Node ceiling · ${node.nodeId}`, nodeCaps);
                const effective = effectiveCapabilities(plan, node);
                for (const capability of CAPABILITIES) {
                    const label = el('label', `${capability} · currently ${effective[capability] ? 'allowed' : 'denied'}`, nodeCaps), input = el('input', undefined, label);
                    input.type = 'checkbox'; input.checked = node.capabilities?.[capability] === true;
                    input.addEventListener('change', () => { (node.capabilities ||= {})[capability] = input.checked; });
                }
            }
        }
        button(parent, 'Save definition for future runs', () => transact({ type: 'save', preset: draft }));
        detail(parent, 'Preset Graph · compiled preview', compileWorkspacePreset(selected));
        const graph = el('details', undefined, parent); el('summary', 'Preset Graph · visual', graph);
        graph.addEventListener('toggle', () => { if (graph.open && !graph.querySelector('svg')) renderGraph(graph, selected.planTemplate); });
        const advanced = el('details', undefined, parent); el('summary', 'Advanced Plan structure editor', advanced);
        const editor = el('textarea', undefined, advanced); editor.rows = 18; editor.value = JSON.stringify(selected.planTemplate, null, 2); editor.setAttribute('aria-label', 'Native Plan JSON');
        button(advanced, 'Validate and save Plan', () => {
            try { transact({ type: 'save', preset: { ...draft, planTemplate: JSON.parse(editor.value) } }); } catch (error) { status.textContent = error.message; }
        });
    };
}
