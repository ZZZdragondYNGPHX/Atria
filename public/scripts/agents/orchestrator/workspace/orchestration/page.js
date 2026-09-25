import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '../../../../popup.js';
import { i18n, i18nFormat } from '../../i18n.js';
import { createWorkspaceFactoryPreset, getWorkspaceLibrary, isNativeWorkspacePresetId, prepareImportedWorkspacePreset, restoreNativeWorkspacePresets, uniqueWorkspacePresetName, workspaceHostProfile } from '../host-presets.js';
import { compileWorkspacePreset, updatePresetLibrary, importWorkspacePreset, exportWorkspacePreset, resolvePresetBinding } from '../../../../lib/agent-workspace/presets.js';
import { CAPABILITIES, effectiveCapabilities } from '../../../../lib/orchestration-engine/capabilities.js';
import { renderGraph } from '../../../../lib/agent-workspace/graph-view.js';
import { removeWorkspaceAgent } from '../agent-editing.js';
import { renderCapabilityPanel, renderToolPermissionPanel } from './permissions.js';
import { mountRuntimeRoutePicker } from '../../../../native/runtime-route-picker.js';

const MODES = ['loop', 'spec', 'agenda', 'director'];

export function createPresetAuthoring({ getSettings, save, getScope, getTools = () => [] }) {
    let selectedId = null;
    let lastRequestedId = null;
    let searchText = '';
    let notice = '';
    let draft = null;
    let draftPresetId = null;
    let selectedAgentId = null;
    let inspectorMode = null;

    const modeLabel = mode => i18n({
        spec: 'Fixed workflow · Spec',
        loop: 'Research · Loop',
        agenda: 'Dynamic delegation · Agenda',
        director: 'Direct writing · Director',
    }[mode] || mode);

    return function renderPresets(parent, ui) {
        const { el, button, inspector } = ui;
        const literal = (tag, text, parent) => { const node = el(tag, undefined, parent); node.textContent = text; return node; };
        if (ui.presetId && ui.presetId !== lastRequestedId) selectedId = ui.presetId;
        lastRequestedId = ui.presetId || null;
        const settings = getSettings();
        const library = getWorkspaceLibrary(settings);
        const scope = getScope();
        const selected = library.presets.find(item => item.id === selectedId) || library.presets[0];

        if (!selected) {
            parent.replaceChildren();
            inspector?.replaceChildren();
            if (inspector) inspector.hidden = true;
            const empty = el('section', undefined, parent);
            empty.className = 'workspace-empty-state';
            el('h3', 'No orchestration presets', empty);
            el('p', 'Create a preset to start building an agent workflow.', empty);
            return () => {};
        }

        selectedId = selected.id;
        if (!draft || draftPresetId !== selected.id) {
            const presetChanged = draftPresetId !== selected.id;
            draft = structuredClone(selected);
            draftPresetId = selected.id;
            if (!draft.planTemplate.agents.some(agent => agent.id === selectedAgentId)) {
                selectedAgentId = draft.planTemplate.agents[0]?.id || null;
            }
            if (presetChanged || inspectorMode === null) {
                inspectorMode = 'closed';
            }
        }

        const nativePreset = isNativeWorkspacePresetId(draft.id);

        const status = el('p', notice, parent);
        status.className = 'workspace-status';
        status.setAttribute('role', 'status');

        const refresh = ({ resetDraft = false } = {}) => {
            if (resetDraft) draft = null;
            parent.replaceChildren();
            inspector?.replaceChildren();
            renderPresets(parent, ui);
        };

        const showError = error => {
            status.textContent = i18n(error.message || String(error));
            status.tabIndex = -1;
            status.focus();
            status.scrollIntoView({ block: 'nearest' });
        };

        const askName = async (label, initial = '') => {
            const value = await callGenericPopup(i18n(label), POPUP_TYPE.INPUT, initial);
            if (!status.isConnected || getSettings() !== settings || JSON.stringify(getScope()) !== JSON.stringify(scope)) return null;
            if (typeof value !== 'string') return null;
            if (!value.trim()) {
                showError(new Error('Enter a non-empty name.'));
                return null;
            }
            return value.trim();
        };

        const validatePreset = value => {
            if (value.planTemplate.agents.some(agent => agent.name !== undefined && !String(agent.name).trim())) {
                throw new Error('Enter a non-empty name.');
            }
            compileWorkspacePreset(value);
            workspaceHostProfile(value);
        };

        const transact = (action, message = 'Changes saved.') => {
            try {
                if (!status.isConnected || getSettings() !== settings || JSON.stringify(getScope()) !== JSON.stringify(scope)) {
                    throw new Error(i18n('Workspace scope changed. Reopen the preset editor.'));
                }
                if ((action.type === 'save' || action.type === 'delete') && isNativeWorkspacePresetId(action.type === 'save' ? action.preset?.id : action.id)) {
                    throw new Error('Native presets are fixed. Duplicate the preset to customize it.');
                }
                if (action.type === 'save') validatePreset(action.preset);
                settings.agentWorkspace = updatePresetLibrary(getWorkspaceLibrary(settings), action);
                save();
                notice = i18n(message);
                refresh({ resetDraft: action.type !== 'bind' });
            } catch (error) {
                showError(error);
            }
        };

        const saveDraft = (message = 'Changes saved.') => transact({ type: 'save', preset: draft }, message);

        const duplicateDraft = () => {
            try {
                const source = nativePreset ? selected : draft;
                validatePreset(source);
                let next = getWorkspaceLibrary(settings);
                if (!nativePreset) next = updatePresetLibrary(next, { type: 'save', preset: draft });
                const newId = crypto.randomUUID();
                const name = uniqueWorkspacePresetName(next, `${source.name} copy`, 'copy');
                next = updatePresetLibrary(next, { type: 'duplicate', id: source.id, newId, name });
                settings.agentWorkspace = next;
                save();
                selectedId = newId;
                notice = i18n('Changes saved.');
                refresh({ resetDraft: true });
            } catch (error) {
                showError(error);
            }
        };

        const exportDraft = () => {
            try {
                const url = URL.createObjectURL(new Blob([exportWorkspacePreset(draft)], { type: 'application/json' }));
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `${draft.id}.json`;
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 0);
            } catch (error) {
                showError(error);
            }
        };

        const bindSelected = (kind, subjectId) => transact({
            type: 'bind',
            scope: kind,
            subjectId,
            presetId: draft.id,
        }, i18nFormat('Applied preset to ${0}', i18n(kind)));

        const clearBinding = (kind, subjectId) => transact({
            type: 'bind',
            scope: kind,
            subjectId,
            presetId: null,
        }, i18nFormat('Cleared ${0} binding', i18n(kind)));

        const addAgent = async () => {
            const name = await askName('New agent name');
            if (!name) return;
            try {
                const next = structuredClone(draft);
                const plan = next.planTemplate;
                const suffix = crypto.randomUUID();
                const nodeId = `worker:${suffix}`;
                const agentId = `agent:${suffix}`;
                const seedNode = plan.nodes.find(node => node.nodeId !== plan.entryNodeId && node.kind === 'agent')
                    || plan.nodes.find(node => node.nodeId === plan.entryNodeId);
                const seedAgent = plan.agents.find(agent => agent.id === seedNode?.agentId);
                if (!seedAgent) throw new Error('No agent definition can be used as a template.');
                const agent = structuredClone(seedAgent);
                agent.id = agentId;
                agent.name = name;
                agent.instructions = 'Analyze the assigned task and return a concise, source-grounded result.';
                agent.capabilities['reply.submit'] = false;
                const metadata = { legacyAgentId: suffix };
                if (next.mode === 'spec') Object.assign(metadata, {
                    stageIndex: Math.max(-1, ...plan.nodes.map(node => node.metadata?.stageIndex ?? -1)) + 1,
                    nodeIndex: 0,
                    stageId: suffix,
                    nodeSpec: { id: suffix, preset: suffix, type: 'worker' },
                    isFinalStage: true,
                });
                const node = {
                    nodeId,
                    agentId,
                    kind: 'agent',
                    capabilities: structuredClone(agent.capabilities),
                    metadata,
                };
                plan.agents.push(agent);
                plan.nodes.push(node);
                const from = next.mode === 'spec' ? plan.output.ownerNodeId : plan.entryNodeId;
                plan.edges.push({ edgeId: `${from}->${nodeId}`, from, to: nodeId, condition: 'always' });
                if (next.mode === 'spec') {
                    plan.output.ownerNodeId = nodeId;
                    for (const item of plan.nodes) if (item.metadata) item.metadata.isFinalStage = item.nodeId === nodeId;
                }
                if (next.mode === 'director') node.required = false;
                if (next.mode === 'agenda') {
                    plan.scheduler.workerAgentIds.push(agentId);
                    plan.scheduler.workerNodeIds[agentId] = nodeId;
                }
                selectedAgentId = agentId;
                inspectorMode = 'agent';
                draft = next;
                saveDraft(i18nFormat('Created: ${0}', name));
            } catch (error) {
                showError(error);
            }
        };

        const renderPresetInspector = () => {
            if (!inspector) return;
            inspectorMode = 'preset';
            inspector.hidden = false;
            inspector.replaceChildren();

            const head = el('div', undefined, inspector);
            head.className = 'workspace-inspector-heading';
            el('span', 'Preset settings', head).className = 'workspace-eyebrow';
            el('h3', draft.name, head);
            el('span', modeLabel(draft.mode), head).className = 'workspace-hint';

            const close = button(head, 'Close inspector', () => {
                inspectorMode = 'closed';
                inspector.hidden = true;
            });
            close.className = 'workspace-inspector-close';

            const field = (host, label, value, change, type = 'text') => {
                const wrap = el('label', label, host);
                wrap.className = 'workspace-inspector-field';
                const input = el(type === 'textarea' ? 'textarea' : 'input', undefined, wrap);
                if (type !== 'textarea') input.type = type;
                input.value = value;
                input.addEventListener('input', () => change(input.value));
                return input;
            };
            const select = (host, label, values, value, change) => {
                const wrap = el('label', label, host);
                wrap.className = 'workspace-inspector-field';
                const input = el('select', undefined, wrap);
                for (const key of values) {
                    const option = el('option', i18n(key), input);
                    option.value = key;
                }
                input.value = value;
                input.addEventListener('change', () => change(input.value));
                return input;
            };

            const basic = el('section', undefined, inspector);
            basic.className = 'workspace-inspector-section';
            el('h4', 'Definition and limits', basic);
            field(basic, 'Name', draft.name, value => { draft.name = value; });
            for (const key of ['maxSteps', 'maxTasks', 'maxConcurrency']) {
                field(basic, i18n(key), draft.planTemplate.budgets[key], value => {
                    draft.planTemplate.budgets[key] = Number(value);
                }, 'number');
            }
            if (draft.mode === 'agenda') {
                for (const key of ['maxPlannerRounds', 'maxTotalRuns']) {
                    field(basic, i18n(key), draft.planTemplate.scheduler[key], value => {
                        draft.planTemplate.scheduler[key] = Number(value);
                    }, 'number');
                }
            }

            const plan = draft.planTemplate;
            const structure = el('details', undefined, inspector);
            structure.className = 'workspace-inspector-section';
            el('summary', 'Graph, arbitration and output ownership', structure);
            if (draft.mode === 'spec') {
                select(structure, 'Entry node', plan.nodes.map(node => node.nodeId), plan.entryNodeId, value => { plan.entryNodeId = value; });
            }
            if (['spec', 'agenda'].includes(draft.mode)) {
                select(structure, 'Output owner', plan.nodes.map(node => node.nodeId), plan.output.ownerNodeId, value => { plan.output.ownerNodeId = value; });
            }
            select(structure, 'Arbitration policy', draft.mode === 'spec'
                ? ['pass-through', 'merge', 'synthesize', 'judge', 'consensus', 'best-effort']
                : ['pass-through'], plan.arbitration.kind, value => { plan.arbitration.kind = value; });
            const partial = el('label', 'Allow partial output', structure);
            partial.className = 'workspace-toggle-row';
            const partialInput = el('input', undefined, partial);
            partialInput.type = 'checkbox';
            partialInput.checked = plan.output.allowPartial === true;
            partialInput.addEventListener('change', () => {
                plan.output.allowPartial = partialInput.checked;
                plan.arbitration.allowPartial = partialInput.checked;
            });

            const advanced = el('details', undefined, inspector);
            advanced.className = 'workspace-inspector-section';
            el('summary', 'Advanced Plan', advanced);
            el('p', 'Complex graph surgery and raw JSON are intentionally kept out of the default editing path.', advanced).className = 'workspace-hint';
            if (draft.mode === 'spec') {
                const graphEditor = el('details', undefined, advanced);
                el('summary', 'Advanced graph structure', graphEditor);
                for (const node of plan.nodes) {
                    const row = el('details', undefined, graphEditor);
                    el('summary', node.nodeId, row);
                    select(row, 'Node kind', ['agent', 'router', 'join', 'judge', 'synthesize', 'terminal'], node.kind, value => { node.kind = value; });
                    select(row, 'Agent definition', plan.agents.map(agent => agent.id), node.agentId, value => { node.agentId = value; });
                }
                const edges = el('details', undefined, graphEditor);
                el('summary', i18nFormat('Edges · ${0}', plan.edges.length), edges);
                for (const edge of plan.edges) {
                    const row = el('div', undefined, edges);
                    row.className = 'workspace-edge-row';
                    el('span', `${edge.from} → ${edge.to}`, row);
                    el('small', edge.condition || 'always', row);
                }
            }
            const raw = el('details', undefined, advanced);
            el('summary', 'Raw Plan JSON', raw);
            const editor = el('textarea', undefined, raw);
            editor.rows = 18;
            editor.value = JSON.stringify(draft.planTemplate, null, 2);
            editor.setAttribute('aria-label', i18n('Native Plan JSON'));
            button(raw, 'Apply JSON to draft', () => {
                try {
                    draft.planTemplate = JSON.parse(editor.value);
                    validatePreset(draft);
                    notice = i18n('Definition valid.');
                    renderCanvas();
                    renderPresetInspector();
                } catch (error) {
                    showError(error);
                }
            });

            const saveBar = el('div', undefined, inspector);
            saveBar.className = 'workspace-inspector-save';
            button(saveBar, 'Save', () => saveDraft());
        };

        const renderAgentInspector = agentId => {
            if (!inspector) return;
            const agent = draft.planTemplate.agents.find(item => item.id === agentId);
            if (!agent) {
                renderPresetInspector();
                return;
            }
            selectedAgentId = agent.id;
            inspectorMode = 'agent';
            inspector.hidden = false;
            inspector.replaceChildren();

            const head = el('div', undefined, inspector);
            head.className = 'workspace-inspector-heading';
            el('span', 'Agent', head).className = 'workspace-eyebrow';
            literal('h3', agent.name || agent.id, head);
            const nodes = draft.planTemplate.nodes.filter(node => node.agentId === agent.id);
            el('p', nodes.map(node => node.nodeId).join(' · '), head).className = 'workspace-hint';
            const close = button(head, 'Close inspector', () => {
                inspectorMode = 'closed';
                inspector.hidden = true;
            });
            close.className = 'workspace-inspector-close';

            const field = (host, label, value, change, type = 'text') => {
                const wrap = el('label', label, host);
                wrap.className = 'workspace-inspector-field';
                const input = el(type === 'textarea' ? 'textarea' : 'input', undefined, wrap);
                if (type !== 'textarea') input.type = type;
                input.value = value;
                input.addEventListener('input', () => change(input.value));
                return input;
            };

            const basic = el('section', undefined, inspector);
            basic.className = 'workspace-inspector-section';
            el('h4', 'Basic', basic);
            const nameInput = field(basic, 'Agent name', agent.name || agent.id, value => {
                agent.name = value.trim();
                head.querySelector('h3').textContent = agent.name || agent.id;
                updateAgentSelection();
            });
            nameInput.setAttribute('autocomplete', 'off');
            field(basic, 'Instructions', agent.instructions || '', value => { agent.instructions = value; }, 'textarea');

            const model = el('section', undefined, inspector);
            model.className = 'workspace-inspector-section';
            el('h4', 'Model', model);
            mountRuntimeRoutePicker({ parent: model, role: 'orchestrator', value: agent.modelProfile?.nativeRouteRef, change: value => {
                agent.modelProfile = value ? { nativeRouteRef: value } : {};
            } });

            const toolsSection = el('details', undefined, inspector);
            toolsSection.className = 'workspace-inspector-section';
            toolsSection.open = true;
            el('summary', 'Tools', toolsSection);
            try {
                const webStatus = globalThis?.Atria?.searchTools?.getStatus?.();
                if (webStatus) {
                    const webLine = webStatus.available
                        ? `Web Access · Available · ${webStatus.label || webStatus.provider}`
                        : `Web Access · Unavailable · ${webStatus.reason || webStatus.provider}`;
                    const webHint = el('p', webLine, toolsSection);
                    webHint.className = 'workspace-hint workspace-web-status';
                }
            } catch { /* Search Tools is optional. */ }
            const catalog = new Map(getTools(draft, agent).map(tool => [tool.name, tool]));
            for (const name of agent.tools || []) {
                if (name !== '*' && !catalog.has(name)) catalog.set(name, { name, missing: true });
            }
            renderToolPermissionPanel({
                parent: toolsSection,
                el,
                button,
                agent,
                tools: [...catalog.values()],
                i18n,
            });

            const permissions = el('details', undefined, inspector);
            permissions.className = 'workspace-inspector-section';
            el('summary', 'Capabilities', permissions);
            renderCapabilityPanel({
                parent: permissions,
                el,
                button,
                plan: draft.planTemplate,
                agent,
                capabilities: CAPABILITIES,
                effectiveCapabilities,
                i18n,
            });

            const danger = el('details', undefined, inspector);
            danger.className = 'workspace-inspector-section workspace-danger-zone';
            el('summary', 'Danger zone', danger);
            const remove = button(danger, 'Delete agent', async () => {
                if (await callGenericPopup(i18nFormat('Delete agent “${0}” and its execution node?', agent.name || agent.id), POPUP_TYPE.CONFIRM) !== POPUP_RESULT.AFFIRMATIVE) return;
                if (!status.isConnected || getSettings() !== settings || JSON.stringify(getScope()) !== JSON.stringify(scope)) return;
                try {
                    const next = removeWorkspaceAgent(draft, agent.id);
                    draft = next;
                    selectedAgentId = next.planTemplate.agents[0]?.id || null;
                    inspectorMode = 'closed';
                    saveDraft(i18nFormat('Deleted: ${0}', agent.name || agent.id));
                } catch (error) {
                    showError(error);
                }
            });
            remove.className = 'workspace-danger';

            const saveBar = el('div', undefined, inspector);
            saveBar.className = 'workspace-inspector-save';
            button(saveBar, 'Save', () => saveDraft());
        };

        const layout = el('div', undefined, parent);
        layout.className = 'workspace-authoring-layout';

        const sidebar = el('details', undefined, layout);
        sidebar.open = parent.closest('[data-atria-viewport]')?.dataset.atriaViewport !== 'compact';
        literal('summary', draft.name, sidebar).className = 'workspace-library-disclosure';
        sidebar.className = 'workspace-library workspace-authoring-library';
        const libraryHead = el('div', undefined, sidebar);
        libraryHead.className = 'workspace-library-heading';
        el('span', 'Preset Library', libraryHead).className = 'workspace-eyebrow';
        el('h3', 'Orchestration', libraryHead);

        const binding = resolvePresetBinding(library, scope);
        const effectivePreset = library.presets.find(item => item.id === binding.presetId);
        const effective = el('div', undefined, sidebar);
        effective.className = 'workspace-effective-preset';
        el('small', 'Effective preset', effective);
        literal('strong', effectivePreset?.name || i18n('None'), effective);
        el('span', i18n(binding.selectionSource), effective);

        const search = el('input', undefined, sidebar);
        search.type = 'search';
        search.placeholder = i18n('Search presets');
        search.setAttribute('aria-label', i18n('Search presets'));
        search.value = searchText;

        const list = el('div', undefined, sidebar);
        list.className = 'workspace-preset-list';
        const noMatches = el('p', 'No matching presets', sidebar);
        noMatches.setAttribute('role', 'status');
        const paintList = () => {
            const needle = search.value.trim().toLowerCase();
            for (const item of list.children) item.hidden = !item.dataset.name.includes(needle);
            noMatches.hidden = [...list.children].some(item => !item.hidden);
        };
        for (const preset of library.presets) {
            const item = button(list, undefined, () => {
                selectedId = preset.id;
                selectedAgentId = null;
                inspectorMode = null;
                refresh({ resetDraft: true });
            });
            item.dataset.name = `${preset.name} ${modeLabel(preset.mode)}`.toLowerCase();
            item.setAttribute('aria-pressed', String(preset.id === selectedId));
            const name = literal('strong', preset.name, item);
            name.className = 'workspace-preset-name';
            el('small', modeLabel(preset.mode), item);
            if (isNativeWorkspacePresetId(preset.id)) {
                const badge = el('small', i18n('Native · fixed'), item);
                badge.className = 'workspace-preset-native';
            }
        }
        search.addEventListener('input', () => {
            searchText = search.value;
            paintList();
        });
        paintList();

        const create = el('div', undefined, sidebar);
        create.className = 'workspace-library-actions';
        const mode = el('select', undefined, create);
        mode.setAttribute('aria-label', i18n('New preset mode'));
        for (const value of MODES) {
            const option = el('option', modeLabel(value), mode);
            option.value = value;
        }
        button(create, 'New', async () => {
            const name = await askName('New preset name');
            if (!name) return;
            const preset = createWorkspaceFactoryPreset(mode.value);
            preset.name = name;
            selectedId = preset.id;
            selectedAgentId = preset.planTemplate.agents[0]?.id || null;
            settings.agentWorkspace = updatePresetLibrary(getWorkspaceLibrary(settings), { type: 'save', preset });
            save();
            notice = i18nFormat('Created: ${0}', name);
            refresh({ resetDraft: true });
        });

        const moreCreate = el('details', undefined, sidebar);
        moreCreate.className = 'workspace-library-more';
        el('summary', 'More', moreCreate);
        button(moreCreate, 'Add / restore native presets', () => {
            settings.agentWorkspace = restoreNativeWorkspacePresets(settings.agentWorkspace);
            save();
            notice = i18n('Native presets restored.');
            refresh({ resetDraft: true });
        });
        button(moreCreate, 'Single Agent template', async () => {
            const name = await askName('New preset name');
            if (!name) return;
            const preset = createWorkspaceFactoryPreset('single');
            preset.name = name;
            selectedId = preset.id;
            settings.agentWorkspace = updatePresetLibrary(getWorkspaceLibrary(settings), { type: 'save', preset });
            save();
            refresh({ resetDraft: true });
        });
        const importLabel = el('label', 'Import native preset', moreCreate);
        importLabel.className = 'workspace-file-action';
        const file = el('input', undefined, importLabel);
        file.type = 'file';
        file.accept = '.json';
        file.setAttribute('aria-label', i18n('Import native preset'));
        file.addEventListener('change', async () => {
            try {
                if (!file.files[0]) return;
                const imported = importWorkspacePreset(await file.files[0].text());
                const preset = prepareImportedWorkspacePreset(getWorkspaceLibrary(settings), imported);
                selectedId = preset.id;
                settings.agentWorkspace = updatePresetLibrary(getWorkspaceLibrary(settings), { type: 'save', preset });
                save();
                refresh({ resetDraft: true });
            } catch (error) {
                showError(error);
            }
        });

        const canvasPane = el('section', undefined, layout);
        canvasPane.className = 'workspace-authoring-canvas-pane';

        const topbar = el('div', undefined, canvasPane);
        topbar.className = 'workspace-authoring-topbar';
        const heading = el('div', undefined, topbar);
        el('span', modeLabel(draft.mode), heading).className = 'workspace-eyebrow';
        literal('h3', draft.name, heading);
        el('p', draft.editorMetadata?.description || modeDescription(draft.mode), heading).className = 'workspace-hint';

        if (nativePreset) {
            const nativeNotice = el('p', i18n('Native preset · fixed by Atria. Duplicate it before customizing.'), canvasPane);
            nativeNotice.className = 'workspace-hint';
        }

        const actions = el('div', undefined, topbar);
        actions.className = 'workspace-actions';
        const saveButton = button(actions, 'Save', () => saveDraft());
        saveButton.className = 'workspace-primary-action';
        saveButton.disabled = nativePreset;
        if (nativePreset) saveButton.title = i18n('Duplicate this native preset to customize it.');
        button(actions, 'Validate', () => {
            try {
                validatePreset(draft);
                notice = i18n('Definition valid.');
                status.textContent = notice;
            } catch (error) {
                showError(error);
            }
        });
        if (draft.mode !== 'loop') button(actions, draft.mode === 'spec' ? 'Append worker stage' : 'Add specialist', addAgent);

        const menu = el('details', undefined, actions);
        menu.className = 'workspace-more-menu';
        el('summary', 'More', menu);
        button(menu, 'Preset settings', () => {
            menu.open = false;
            renderPresetInspector();
        });
        button(menu, 'Duplicate', duplicateDraft);
        button(menu, 'Export', exportDraft);
        const removePreset = button(menu, 'Delete preset', async () => {
            if (await callGenericPopup(i18nFormat('Delete “${0}” and clear all its bindings?', draft.name), POPUP_TYPE.CONFIRM) === POPUP_RESULT.AFFIRMATIVE) {
                if (!status.isConnected || getSettings() !== settings || JSON.stringify(getScope()) !== JSON.stringify(scope)) return;
                transact({ type: 'delete', id: draft.id, replacementId: null });
            }
        });
        removePreset.className = 'workspace-danger';
        removePreset.disabled = nativePreset;
        if (nativePreset) removePreset.title = i18n('Native presets are fixed and restored automatically.');

        const defaults = el('details', undefined, canvasPane);
        defaults.className = 'workspace-authoring-defaults';
        el('summary', 'Workspace defaults', defaults);
        const enabledLabel = el('label', 'Enable agent orchestration', defaults);
        enabledLabel.className = 'workspace-toggle-row';
        const enabled = el('input', undefined, enabledLabel);
        enabled.type = 'checkbox';
        enabled.checked = settings.enabled === true;
        enabled.addEventListener('change', () => {
            getSettings().enabled = enabled.checked;
            save();
        });
        el('p', 'Agents without an override use the orchestrator role’s primary Runtime Route. Prompt, generation and fallback policies are configured in Runtime.', defaults).className = 'workspace-hint';
        button(defaults, 'Open Runtime Routes', () => globalThis.Atria?.shell?.getWorkspaceHost?.().openRuntimeSection('routes'));

        const bindingBar = el('div', undefined, canvasPane);
        bindingBar.className = 'workspace-binding-bar';
        const bindingCopy = el('div', undefined, bindingBar);
        el('small', 'Apply preset', bindingCopy);
        el('strong', binding.presetId === draft.id ? i18nFormat('Active via ${0}', i18n(binding.selectionSource)) : i18n('Not active in current scope'), bindingCopy);
        const bindingActions = el('div', undefined, bindingBar);
        bindingActions.className = 'workspace-binding-actions';
        for (const [kind, subjectId, label] of [
            ['default', '', 'Default'],
            ['character', scope.character, 'Character'],
            ['conversation', scope.conversation, 'Conversation'],
        ]) {
            const action = button(bindingActions, label, () => bindSelected(kind, subjectId));
            action.setAttribute('aria-label', i18n({ default: 'Bind as default', character: 'Bind as character', conversation: 'Bind as conversation' }[kind]));
            action.disabled = kind !== 'default' && !subjectId;
            const current = kind === 'default'
                ? library.bindings.defaultPresetId === draft.id
                : library.bindings.entries.some(item => item.scope === kind && item.subjectId === subjectId && item.presetId === draft.id);
            action.classList.toggle('is-active', current);
        }
        if (binding.selectionSource !== 'default' && binding.presetId === draft.id) {
            button(bindingActions, 'Clear', () => clearBinding(binding.selectionSource, scope[binding.selectionSource]));
        }

        const planSummary = el('div', undefined, canvasPane);
        planSummary.className = 'workspace-plan-summary';
        for (const [label, value] of [
            ['Agents', draft.planTemplate.agents.length],
            ['Nodes', draft.planTemplate.nodes.length],
            ['Max steps', draft.planTemplate.budgets.maxSteps],
            ['Concurrency', draft.planTemplate.budgets.maxConcurrency],
        ]) {
            const item = el('div', undefined, planSummary);
            el('small', label, item);
            el('strong', String(value), item);
        }

        const graphSection = el('section', undefined, canvasPane);
        graphSection.className = 'workspace-authoring-graph';
        const graphHead = el('div', undefined, graphSection);
        graphHead.className = 'workspace-section-heading';
        el('h3', 'Plan', graphHead);

        const graphCanvas = el('div', undefined, graphSection);
        graphCanvas.className = 'workspace-graph-canvas workspace-plan-canvas';

        const agentStrip = el('div', undefined, graphSection);
        agentStrip.className = 'workspace-agent-strip';

        const updateAgentSelection = () => {
            for (const item of agentStrip.children) {
                const agent = draft.planTemplate.agents.find(entry => entry.id === item.dataset.agentId);
                item.querySelector('strong').textContent = agent?.name || item.dataset.agentId;
                item.classList.toggle('is-active', item.dataset.agentId === selectedAgentId);
            }
        };

        const renderCanvas = () => {
            graphCanvas.replaceChildren();
            renderGraph(graphCanvas, draft.planTemplate, nodeId => {
                const node = draft.planTemplate.nodes.find(item => item.nodeId === nodeId);
                if (node?.agentId) {
                    renderAgentInspector(node.agentId);
                    updateAgentSelection();
                }
            });
            agentStrip.replaceChildren();
            for (const agent of draft.planTemplate.agents) {
                const item = button(agentStrip, undefined, () => {
                    renderAgentInspector(agent.id);
                    updateAgentSelection();
                });
                item.dataset.agentId = agent.id;
                item.className = 'workspace-agent-card';
                const copy = el('span', undefined, item);
                literal('strong', agent.name || agent.id, copy);
                const nodes = draft.planTemplate.nodes.filter(node => node.agentId === agent.id);
                el('small', nodes.map(node => node.kind).join(' · ') || 'agent', copy);
                const badge = el('span', String(nodes.length), item);
                badge.className = 'workspace-agent-count';
            }
            updateAgentSelection();
        };

        renderCanvas();
        if (inspectorMode === 'preset') renderPresetInspector();
        else if (inspectorMode === 'agent') renderAgentInspector(selectedAgentId || draft.planTemplate.agents[0]?.id);
        else if (inspector) {
            inspector.replaceChildren();
            inspector.hidden = true;
        }

        return () => {
            if (inspector) {
                inspector.replaceChildren();
                inspector.hidden = true;
            }
        };
    };
}

function modeDescription(mode) {
    return {
        loop: 'One owner agent iterates with bounded tools and memory until it can return a result.',
        spec: 'A fixed graph of bounded stages, dependencies and output ownership.',
        agenda: 'A planner dynamically dispatches work across a bounded specialist pool.',
        director: 'An output owner writes the reply while specialists return delegated evidence and analysis.',
    }[mode] || '';
}
