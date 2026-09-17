import { i18n, i18nFormat } from '../i18n.js';
import { createWorkspaceFactoryPreset, getWorkspaceLibrary, workspaceHostProfile } from './host-presets.js';
import { compileWorkspacePreset, updatePresetLibrary, importWorkspacePreset, exportWorkspacePreset, resolvePresetBinding } from '../../../lib/agent-workspace/presets.js';
import { CAPABILITIES } from '../../../lib/orchestration-engine/capabilities.js';
import { renderGraph } from '../../../lib/agent-workspace/graph-view.js';
import { effectiveCapabilities } from '../../../lib/orchestration-engine/capabilities.js';
import { removeWorkspaceAgent } from './agent-editing.js';

export function createPresetAuthoring({ getSettings, save, getScope }) {
    let selectedId = null, searchText = '';
    let notice = '', focusAgentId = null;
    const modeLabel = mode => i18n({ spec: 'Fixed workflow · Spec', loop: 'Research · Loop', agenda: 'Dynamic delegation · Agenda', director: 'Direct writing · Director' }[mode] || mode);
    return function renderPresets(parent, ui) {
        const { el, button, detail } = ui;
        const settings = getSettings(), library = getWorkspaceLibrary(settings), scope = getScope();
        const selected = library.presets.find(item => item.id === selectedId) || library.presets[0];
        selectedId = selected?.id;
        const refresh = () => { parent.replaceChildren(); renderPresets(parent, ui); };
        const status = el('p', notice, parent); status.setAttribute('role', 'status');
        const showError = error => { status.textContent = i18n(error.message); status.scrollIntoView({ block: 'nearest' }); };
        const askName = (label, initial = '') => {
            const value = prompt(i18n(label), initial);
            if (value === null) return null;
            if (!value.trim()) { showError(new Error('Enter a non-empty name.')); return null; }
            return value.trim();
        };
        const transact = (action, message = 'Changes saved.') => {
            try {
                if (!status.isConnected || getSettings() !== settings || JSON.stringify(getScope()) !== JSON.stringify(scope)) throw new Error(i18n('Workspace scope changed. Reopen the preset editor.'));
                if (action.type === 'save') {
                    if (action.preset.planTemplate.agents.some(agent => agent.name !== undefined && !String(agent.name).trim())) throw new Error('Enter a non-empty name.');
                    workspaceHostProfile(action.preset);
                }
                settings.agentWorkspace = updatePresetLibrary(getWorkspaceLibrary(settings), action); save(); notice = i18n(message); refresh();
            } catch (error) { showError(error); }
        };
        status.className = 'workspace-status';
        const layout = el('div', undefined, parent); layout.className = 'workspace-presets';
        const sidebar = el('section', undefined, layout); sidebar.className = 'workspace-library';
        el('h3', 'Unified Preset Library', sidebar);
        const editorPane = el('section', undefined, layout); editorPane.className = 'workspace-editor';
        const section = (host, title, className = '') => {
            const node = el('section', undefined, host); node.className = `workspace-section ${className}`;
            el('h4', title, node); return node;
        };
        const binding = resolvePresetBinding(library, scope);
        el('p', i18nFormat('Effective: ${0} · Selected by: ${1}', library.presets.find(item => item.id === binding.presetId)?.name || i18n('None'), i18n(binding.selectionSource)), sidebar).className = 'workspace-hint';
        const search = el('input', undefined, sidebar); search.type = 'search'; search.placeholder = i18n('Search presets'); search.setAttribute('aria-label', i18n('Search presets')); search.value = searchText;
        const list = el('div', undefined, sidebar); list.className = 'workspace-preset-list';
        for (const preset of library.presets) {
            const item = button(list, `${preset.name} · ${modeLabel(preset.mode)}`, () => { selectedId = preset.id; refresh(); }); item.dataset.name = `${preset.name} ${modeLabel(preset.mode)}`.toLowerCase();
            item.setAttribute('aria-pressed', String(preset.id === selectedId));
            item.hidden = !item.dataset.name.includes(searchText.toLowerCase());
        }
        search.addEventListener('input', () => { searchText = search.value; for (const item of list.children) item.hidden = !item.dataset.name.includes(search.value.toLowerCase()); });
        const creation = el('details', undefined, sidebar); el('summary', 'Create or import', creation);
        creation.open = matchMedia('(min-width: 761px)').matches;
        const mode = el('select', undefined, creation); mode.setAttribute('aria-label', i18n('New preset mode'));
        for (const value of ['loop', 'spec', 'agenda', 'director']) { const option = el('option', modeLabel(value), mode); option.value = value; }
        const createPreset = mode => {
            const name = askName('New preset name'); if (!name) return;
            const preset = createWorkspaceFactoryPreset(mode); preset.name = name; selectedId = preset.id; searchText = '';
            focusAgentId = preset.planTemplate.agents[0]?.id;
            transact({ type: 'save', preset }, i18nFormat('Created: ${0}', name));
        };
        button(creation, 'New', () => createPreset(mode.value));
        button(creation, 'Single Agent template', () => createPreset('single'));
        const importLabel = el('label', 'Import native preset', creation);
        const file = el('input', undefined, importLabel); file.type = 'file'; file.accept = '.json'; file.setAttribute('aria-label', i18n('Import native preset'));
        file.addEventListener('change', async () => {
            try {
                if (!file.files[0]) return;
                const preset = importWorkspacePreset(await file.files[0].text());
                // Import always creates a new identity; never overwrite a bound definition silently.
                preset.id = crypto.randomUUID(); selectedId = preset.id; transact({ type: 'save', preset });
            } catch (error) { status.textContent = error.message; }
        });
        if (!selected) return;
        const heading = el('div', undefined, editorPane); heading.className = 'workspace-editor-heading';
        el('h3', selected.name, heading); el('span', modeLabel(selected.mode), heading);
        const actions = el('div', undefined, editorPane); actions.className = 'workspace-actions';
        button(actions, 'Duplicate', () => { const newId = crypto.randomUUID(); selectedId = newId; transact({ type: 'duplicate', id: selected.id, newId }); });
        button(actions, 'Export', () => {
            const url = URL.createObjectURL(new Blob([exportWorkspacePreset(selected)], { type: 'application/json' }));
            const anchor = el('a'); anchor.href = url; anchor.download = `${selected.id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
        });
        button(actions, 'Delete and clear its bindings', () => {
            if (confirm(i18nFormat('Delete “${0}” and clear all its bindings?', selected.name))) transact({ type: 'delete', id: selected.id, replacementId: null });
        });
        actions.lastElementChild.className = 'workspace-danger';
        const bindings = section(editorPane, 'Use this preset');
        const bindingActions = el('div', undefined, bindings); bindingActions.className = 'workspace-actions';
        for (const [kind, subjectId] of [['default', ''], ['character', scope.character], ['conversation', scope.conversation]]) {
            const action = button(bindingActions, i18n({ default: 'Bind as default', character: 'Bind as character', conversation: 'Bind as conversation' }[kind]), () => transact({ type: 'bind', scope: kind, subjectId, presetId: selected.id }));
            action.disabled = kind !== 'default' && !subjectId;
            if (kind !== 'default' && subjectId) button(bindingActions, i18n(kind === 'character' ? 'Clear character binding' : 'Clear conversation binding'), () => transact({ type: 'bind', scope: kind, subjectId, presetId: null }));
        }
        const draft = structuredClone(selected);
        const basic = section(editorPane, 'Definition and limits', 'workspace-field-grid');
        let fieldHost = basic;
        if (selected.mode !== 'loop') button(actions, selected.mode === 'spec' ? 'Append worker stage' : 'Add specialist', () => {
            const name = askName('New agent name'); if (!name) return;
            const plan = structuredClone(draft.planTemplate), suffix = crypto.randomUUID();
            const nodeId = `worker:${suffix}`, agentId = `agent:${suffix}`;
            const seedNode = plan.nodes.find(node => node.nodeId !== plan.entryNodeId && node.kind === 'agent') || plan.nodes.find(node => node.nodeId === plan.entryNodeId);
            const agent = structuredClone(plan.agents.find(agent => agent.id === seedNode.agentId)); agent.id = agentId;
            agent.name = name;
            agent.instructions = 'Analyze the assigned task and return a concise, source-grounded result.';
            agent.capabilities['reply.submit'] = false;
            const metadata = { legacyAgentId: suffix };
            if (selected.mode === 'spec') Object.assign(metadata, { stageIndex: Math.max(-1, ...plan.nodes.map(node => node.metadata?.stageIndex ?? -1)) + 1,
                nodeIndex: 0, stageId: suffix, nodeSpec: { id: suffix, preset: suffix, type: 'worker' }, isFinalStage: true });
            const node = { nodeId, agentId, kind: 'agent', capabilities: structuredClone(agent.capabilities), metadata };
            plan.agents.push(agent); plan.nodes.push(node);
            const from = selected.mode === 'spec' ? plan.output.ownerNodeId : plan.entryNodeId;
            plan.edges.push({ edgeId: `${from}->${nodeId}`, from, to: nodeId, condition: 'always' });
            if (selected.mode === 'spec') {
                plan.output.ownerNodeId = nodeId;
                for (const item of plan.nodes) if (item.metadata) item.metadata.isFinalStage = item.nodeId === nodeId;
            }
            if (selected.mode === 'director') node.required = false;
            if (selected.mode === 'agenda') { plan.scheduler.workerAgentIds.push(agentId); plan.scheduler.workerNodeIds[agentId] = nodeId; }
            focusAgentId = agentId;
            transact({ type: 'save', preset: { ...draft, planTemplate: plan } }, i18nFormat('Created: ${0}', name));
        });
        const field = (label, value, change, type = 'text') => {
            const wrap = el('label', label, fieldHost); const input = el(type === 'textarea' ? 'textarea' : 'input', undefined, wrap);
            if (type !== 'textarea') input.type = type;
            input.value = value; input.addEventListener('input', () => change(input.value)); return input;
        };
        field('Name', draft.name, value => { draft.name = value; });
        for (const key of ['maxSteps', 'maxTasks', 'maxConcurrency']) field(i18n(key), draft.planTemplate.budgets[key], value => { draft.planTemplate.budgets[key] = Number(value); }, 'number');
        const plan = draft.planTemplate;
        const select = (host, label, values, value, change) => {
            const wrap = el('label', label, host), input = el('select', undefined, wrap);
            for (const key of values) { const option = el('option', i18n(key), input); option.value = key; }
            input.value = value; input.addEventListener('change', () => change(input.value)); return input;
        };
        if (selected.mode === 'agenda') for (const key of ['maxPlannerRounds', 'maxTotalRuns']) {
            field(i18n(key), plan.scheduler[key], value => { plan.scheduler[key] = Number(value); }, 'number');
        }
        const structure = el('details', undefined, editorPane); el('summary', 'Graph, arbitration and output ownership', structure);
        el('p', i18nFormat('Output contract: ${0} · required capability: ${1}', i18n(plan.output.kind), i18n(plan.output.submitCapability)), structure);
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
                : selected.mode === 'loop' ? 'One owner, bounded steps, tools and memory.' : 'Static graph with bounded edges, parallel stages and review.', editorPane);
        for (const agent of draft.planTemplate.agents) {
            const agentCard = el('details', undefined, editorPane); agentCard.className = 'workspace-agent';
            agentCard.open = draft.planTemplate.agents.length === 1 || focusAgentId === agent.id;
            const summary = el('summary', i18nFormat('Agent · ${0}', agent.name || agent.id), agentCard);
            if (focusAgentId === agent.id) {
                focusAgentId = null;
                requestAnimationFrame(() => { if (agentCard.isConnected) { summary.focus(); agentCard.scrollIntoView({ block: 'start' }); } });
            }
            fieldHost = agentCard;
            field('Agent name', agent.name || agent.id, value => {
                agent.name = value.trim(); summary.textContent = i18nFormat('Agent · ${0}', agent.name || agent.id);
            });
            button(agentCard, 'Delete agent', () => {
                if (!confirm(i18nFormat('Delete agent “${0}” and its execution node?', agent.name || agent.id))) return;
                try { transact({ type: 'save', preset: removeWorkspaceAgent(draft, agent.id) }, i18nFormat('Deleted: ${0}', agent.name || agent.id)); } catch (error) { showError(error); }
            });
            field('Instructions', agent.instructions || '', value => { agent.instructions = value; }, 'textarea');
            field('API profile', agent.modelProfile?.apiPresetName || '', value => { (agent.modelProfile ||= {}).apiPresetName = value; });
            field('Prompt profile', agent.modelProfile?.promptPresetName || '', value => { (agent.modelProfile ||= {}).promptPresetName = value; });
            field('Tools (comma separated; * = available host tools)', (agent.tools || []).join(', '), value => { agent.tools = value.split(',').map(item => item.trim()).filter(Boolean); });
            const permissions = el('details', undefined, agentCard); el('summary', 'Capabilities', permissions);
            for (const capability of CAPABILITIES) {
                const label = el('label', capability, permissions), input = el('input', undefined, label);
                input.type = 'checkbox'; input.checked = agent.capabilities?.[capability] === true;
                input.addEventListener('change', () => { agent.capabilities[capability] = input.checked; });
            }
            for (const node of plan.nodes.filter(node => node.agentId === agent.id)) {
                const nodeCaps = el('details', undefined, permissions); el('summary', i18nFormat('Node ceiling · ${0}', node.nodeId), nodeCaps);
                const effective = effectiveCapabilities(plan, node);
                for (const capability of CAPABILITIES) {
                    const label = el('label', i18nFormat('${0} · currently ${1}', i18n(capability), i18n(effective[capability] ? 'Allowed' : 'Denied')), nodeCaps), input = el('input', undefined, label);
                    input.type = 'checkbox'; input.checked = node.capabilities?.[capability] === true;
                    input.addEventListener('change', () => { (node.capabilities ||= {})[capability] = input.checked; });
                }
            }
        }
        const saveBar = el('div', undefined, editorPane); saveBar.className = 'workspace-save-bar';
        button(saveBar, 'Save definition for future runs', () => transact({ type: 'save', preset: draft }));
        detail(editorPane, 'Preset Graph · compiled preview', compileWorkspacePreset(selected));
        const graph = el('details', undefined, editorPane); el('summary', 'Preset Graph · visual', graph);
        graph.addEventListener('toggle', () => { if (graph.open && !graph.querySelector('svg')) renderGraph(graph, selected.planTemplate); });
        const advanced = el('details', undefined, editorPane); el('summary', 'Advanced Plan structure editor', advanced);
        const editor = el('textarea', undefined, advanced); editor.rows = 18; editor.value = JSON.stringify(selected.planTemplate, null, 2); editor.setAttribute('aria-label', i18n('Native Plan JSON'));
        button(advanced, 'Validate and save Plan', () => {
            try { transact({ type: 'save', preset: { ...draft, planTemplate: JSON.parse(editor.value) } }); } catch (error) { status.textContent = error.message; }
        });
    };
}
