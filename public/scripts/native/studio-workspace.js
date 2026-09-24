import { knowledgeEditorFieldOptions, validateKnowledgeEditorValue } from './knowledge-contracts.js';
import { mountStudioValueEditor } from './studio-value-editor.js';
import { createAtriaShellEnvironment } from '../atria-shell/environment.js';
import { mountStudioPromptTools } from './prompt-authoring.js';
import {
    createAtriaStatePanel,
} from '../atria-shell/primitives.js';
import { translateShellText } from '../atria-shell/localization.js';
import {
    compileExperienceComponentModel,
    renderExperienceComponentModel,
} from '../extensions/game-runtime/ui/component-model.js';
import {
    createHumanOrigin,
    createStudioNativeId,
    createStudioWorkspace,
    experienceComponentPath,
    experienceFromProject,
    patchProjectSource,
    projectSaveOperation,
    resourceReferenceForNode,
    sourceDeleteOperation,
    sourceWriteOperation,
} from './studio-authoring.js';
import { nativeStudioClient } from './studio-client.js';
import { mountNativeStudioAgent } from './studio-agent.js';
import { mountStructuredUiEditor } from './studio-ui-editor.js';

const STUDIO_VIEWS = Object.freeze([
    ['overview', 'Overview'],
    ['experience', 'Experience'],
    ['prompt-authoring', 'Prompt Authoring'],
    ['runtime-design', 'Runtime Design'],
    ['actors', 'Actors'],
    ['entrypoints', 'EntryPoints'],
    ['worlds', 'Worlds'],
    ['knowledge', 'Knowledge'],
    ['logic', 'Game Logic'],
    ['ui', 'UI'],
    ['assets', 'Assets'],
    ['memory', 'Memory'],
    ['agents', 'Agents'],
    ['skills', 'Skills'],
    ['plugins', 'Plugins'],
    ['metadata', 'Package Metadata'],
    ['simulation', 'Test / Simulation'],
    ['preview', 'Preview'],
    ['build', 'Build'],
    ['source', 'Source'],
]);

const MOBILE_VIEWS = Object.freeze([
    ['project', 'Project'],
    ['editor', 'Editor'],
    ['preview', 'Preview'],
    ['ai', 'AI'],
    ['more', 'More'],
]);

function t(value) {
    // The compact AI destination names Project Agent, not the legacy chat surface.
    if (value === 'AI') return 'AI';
    return translateShellText(value);
}

function panel(documentRef, kind, title, message) {
    return createAtriaStatePanel(documentRef, kind, {
        title: t(title),
        message: t(message),
    });
}

function button(documentRef, label, handler, options = {}) {
    const node = documentRef.createElement('button');
    node.type = 'button';
    node.textContent = t(label);
    node.disabled = Boolean(options.disabled);
    if (options.primary) node.dataset.variant = 'primary';
    if (options.active) node.dataset.active = 'true';
    node.addEventListener('click', async event => {
        if (node.disabled) return;
        let pending;
        try {
            pending = handler(event);
            if (pending?.then) { node.disabled = true; node.setAttribute('aria-busy', 'true'); await pending; }
        } catch (error) {
            const alert = documentRef.createElement('p'); alert.className = 'atri-studio-inline-error'; alert.setAttribute('role', 'alert'); alert.tabIndex = -1;
            alert.textContent = t('The action could not complete. Your edits are still here.') + ' ' + (error.message || error);
            node.parentElement?.append(alert); alert.focus();
        } finally { if (pending?.then) { node.disabled = false; node.removeAttribute('aria-busy'); } }
    });
    return node;
}

function actionRow(documentRef, ...nodes) {
    const row = documentRef.createElement('div');
    row.className = 'atria-domain-workspace__actions atria-studio-actions';
    row.append(...nodes.filter(Boolean));
    return row;
}

function heading(documentRef, title, description = '') {
    const node = documentRef.createElement('header');
    node.className = 'atria-studio-section-heading';
    const h = documentRef.createElement('h3');
    h.textContent = t(title);
    node.append(h);
    if (description) {
        const p = documentRef.createElement('p');
        p.textContent = t(description);
        node.append(p);
    }
    return node;
}

function field(documentRef, label, control) {
    const wrapper = documentRef.createElement('label');
    wrapper.className = 'atria-studio-field';
    const caption = documentRef.createElement('span');
    caption.textContent = t(label);
    wrapper.append(caption, control);
    return wrapper;
}

function textInput(documentRef, value, label) {
    const input = documentRef.createElement('input');
    input.className = 'text_pole';
    input.value = value ?? '';
    input.setAttribute('aria-label', t(label)); input.name = label; input.autocomplete = 'off';
    return input;
}

function textArea(documentRef, value, label) {
    const input = documentRef.createElement('textarea');
    input.className = 'text_pole atria-studio-editor__textarea';
    input.value = value ?? '';
    input.setAttribute('aria-label', t(label)); input.name = label; input.autocomplete = 'off';
    return input;
}

function selectInput(documentRef, value, values, label) {
    const select = documentRef.createElement('select');
    select.className = 'text_pole';
    select.setAttribute('aria-label', t(label));
    for (const item of values) {
        const option = documentRef.createElement('option');
        option.value = item;
        option.textContent = item;
        option.selected = item === value;
        select.append(option);
    }
    return select;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function formatTime(value) {
    const timestamp = Number(value || 0);
    return timestamp ? new Date(timestamp).toLocaleString() : '—';
}

function decodeUtf8(base64) {
    const binary = globalThis.atob(base64 || '');
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function encodeBase64(bytes) {
    let binary = '';
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const chunkSize = 0x8000;
    for (let offset = 0; offset < view.length; offset += chunkSize) {
        binary += String.fromCharCode(...view.subarray(offset, offset + chunkSize));
    }
    return globalThis.btoa(binary);
}

function safePathSegment(value) {
    const normalized = String(value || 'asset')
        .replaceAll('\\', '-')
        .replaceAll('/', '-')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || 'asset';
}

function entryPoint(source) {
    return source?.package?.entryPoints?.[0] || null;
}

function sourceSection(source, view) {
    if (view === 'actors') return source.package.actors || [];
    if (view === 'entrypoints') return source.package.entryPoints || [];
    if (view === 'worlds') return source.worlds || [];
    if (view === 'knowledge') return source.knowledge || [];
    if (view === 'assets') return source.assetFiles || [];
    return null;
}

function viewResourceType(view) {
    return {
        overview: 'core.project',
        actors: 'core.actor',
        worlds: 'core.world',
        knowledge: 'core.knowledge',
        assets: 'core.asset',
    }[view] || null;
}

function viewResourceId(item, view) {
    if (!item) return null;
    if (view === 'actors') return item.actorId;
    if (view === 'worlds') return item.world?.worldId;
    if (view === 'knowledge') return item.knowledgeBase?.knowledgeBaseId;
    if (view === 'assets') return item.assetId;
    return null;
}

function displayNameFor(item, view) {
    if (!item) return '';
    if (view === 'actors') return item.displayName || item.actorId;
    if (view === 'entrypoints') return item.displayName || item.entryPointId;
    if (view === 'worlds') return item.world?.displayName || item.world?.worldId;
    if (view === 'knowledge') return item.knowledgeBase?.displayName || item.knowledgeBase?.knowledgeBaseId;
    if (view === 'assets') return item.logicalName || item.path || item.assetId;
    return '';
}

function normalizeCollectionPatch(source, view, index, value) {
    const next = clone(source);
    if (view === 'actors') next.package.actors[index] = value;
    else if (view === 'entrypoints') next.package.entryPoints[index] = value;
    else if (view === 'worlds') next.worlds[index] = value;
    else if (view === 'knowledge') next.knowledge[index] = value;
    else if (view === 'assets') next.assetFiles[index] = value;
    return next;
}

function projectListCard(documentRef, record, host) {
    const project = record.project || record;
    const row = documentRef.createElement('article'); row.className = 'atri-studio-project-row';
    row.dataset.atriaBuildProjectId = project.projectId;
    const info = documentRef.createElement('div');
    const title = documentRef.createElement('h3'); title.textContent = project.displayName;
    const meta = documentRef.createElement('p'); meta.textContent = t('Updated') + ' ' + formatTime(project.updatedAt || project.createdAt);
    info.append(title, meta);
    row.append(info, button(documentRef, 'Open Project', () => host.openBuild(project.projectId, project.displayName), { primary: true }));
    return row;
}

async function renderProjectList(documentRef, root, host) {
    const projects = await nativeStudioClient.listProjects();
    root.dataset.atriaBuildProjects = 'true';
    root.append(heading(documentRef, 'Build Projects', 'Create and refine your interactive works.'));
    const creation = documentRef.createElement('details'); creation.className = 'atri-studio-details';
    const newProject = documentRef.createElement('summary'); newProject.textContent = t('New Project');
    const name = textInput(documentRef, '', 'Project name'); name.required = true; name.maxLength = 160;
    creation.append(newProject, field(documentRef, 'Project name', name), button(documentRef, 'Create Project', async () => {
        if (!name.value.trim()) { name.focus(); name.reportValidity(); return; }
        const projectId = createStudioNativeId('project');
        const source = {
            format: 'atria-project-source', schemaVersion: 1,
            project: { projectId, packageId: createStudioNativeId('pkg'), displayName: name.value.trim(), createdAt: Date.now(), updatedAt: Date.now() },
            package: { name: name.value.trim(), version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [], entryPoints: [{ entryPointId: createStudioNativeId('entry'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
            resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] },
        };
        await nativeStudioClient.createProject(source);
        host.openBuild(projectId, source.project.displayName);
    }, { primary: true }));
    root.append(creation);
    const search = textInput(documentRef, '', 'Search projects'); search.type = 'search';
    root.append(field(documentRef, 'Search projects', search));
    const list = documentRef.createElement('div'); list.className = 'atri-studio-project-list'; root.append(list);
    const fill = () => {
        list.replaceChildren();
        const found = projects.filter(record => (record.project || record).displayName.toLowerCase().includes(search.value.trim().toLowerCase()));
        for (const record of found) list.append(projectListCard(documentRef, record, host));
        if (!found.length) list.append(panel(documentRef, 'empty', projects.length ? 'No matching projects' : 'Your first project starts here', projects.length ? 'Try a different project name.' : 'Choose New Project to begin. Your edits are reviewed before they become a project revision.'));
    };
    search.addEventListener('input', fill); fill();
}

function technicalDetails(documentRef, value, label = 'Details') {
    const details = documentRef.createElement('details'); details.className = 'atri-studio-details';
    const summary = documentRef.createElement('summary'); summary.textContent = t(label);
    const pre = documentRef.createElement('pre'); pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    details.append(summary, pre); return details;
}

function createResourceTree(documentRef, state, selectView) {
    const aside = documentRef.createElement('aside');
    aside.className = 'atria-studio-resource-tree';
    aside.dataset.atriaStudioResourceTree = 'true'; aside.setAttribute('aria-label', t('Project resources'));

    const filter = textInput(documentRef, '', 'Filter project resources');
    filter.placeholder = t('Filter resources…'); filter.type = 'search';
    aside.append(filter);

    const list = documentRef.createElement('div');
    list.className = 'atria-studio-resource-tree__list';
    aside.append(list);

    function render(filterValue = '') {
        list.replaceChildren();
        const needle = filterValue.trim().toLowerCase();
        for (const [id, label] of STUDIO_VIEWS) {
            const items = sourceSection(state.source, id);
            const sectionMatch = t(label).toLowerCase().includes(needle);
            if (needle && !sectionMatch && !(items || []).some(item => displayNameFor(item, id).toLowerCase().includes(needle))) continue;
            const row = button(documentRef, label, () => selectView(id), { active: state.activeView === id });
            row.className = 'atria-studio-resource-tree__item';
            row.dataset.atriaStudioResource = id;
            list.append(row);

            row.setAttribute('aria-current', state.activeView === id ? 'page' : 'false');
            if (!Array.isArray(items)) continue;
            items.forEach((item, index) => {
                const name = displayNameFor(item, id);
                if (needle && !sectionMatch && !name.toLowerCase().includes(needle)) return;
                const child = button(documentRef, name || `${label} ${index + 1}`, () => {
                    state.collectionSelection[id] = index;
                    selectView(id);
                }, { active: state.activeView === id && state.collectionSelection[id] === index });
                child.textContent = name || `${label} ${index + 1}`;
                child.className = 'atria-studio-resource-tree__item atria-studio-resource-tree__item--child';
                child.dataset.atriaStudioResourceItem = id + ':' + index;
                list.append(child);
            });
        }
        const pluginDescriptors = (state.registry?.descriptors || [])
            .filter(descriptor => descriptor.provider?.kind === 'plugin');
        for (const descriptor of pluginDescriptors) {
            if (needle && !descriptor.displayName.toLowerCase().includes(needle)
                && !descriptor.resourceType.toLowerCase().includes(needle)) continue;
            const row = button(documentRef, `Plugin · ${descriptor.displayName}`, () => {
                state.selectedPluginResourceType = descriptor.resourceType;
                selectView('plugin-resource');
            }, { active: state.activeView === 'plugin-resource' && state.selectedPluginResourceType === descriptor.resourceType });
            row.className = 'atria-studio-resource-tree__item';
            row.dataset.atriaStudioPluginResource = descriptor.resourceType;
            list.append(row);
        }
        if (!list.childElementCount) list.append(panel(documentRef, 'empty', 'No matching resources', 'Try another name.'));
    }

    filter.addEventListener('input', () => render(filter.value));
    render();
    return { root: aside, render: () => render(filter.value) };
}

function createMobileNav(documentRef, state, onChange) {
    const nav = documentRef.createElement('nav');
    nav.className = 'atria-studio-mobile-nav';
    nav.dataset.atriaStudioMobileNav = 'true';
    for (const [id, label] of MOBILE_VIEWS) {
        nav.append(button(documentRef, label, () => {
            state.mobileView = id;
            state.inspectorOpen = false; state.aiOpen = id === 'ai';
            onChange();
        }, { active: state.mobileView === id }));
    }
    return nav;
}

function renderJsonSection(documentRef, body, {
    title,
    description,
    value,
    onStage,
}) {
    body.append(heading(documentRef, title, description));
    mountStudioValueEditor({ document: documentRef, root: body, value, label: title + ' JSON', onReview: onStage });
}

function renderCollectionEditor(documentRef, body, state, view, stageProject) {
    const items = sourceSection(state.source, view) || [];
    const index = Math.min(state.collectionSelection[view] || 0, Math.max(0, items.length - 1));
    state.collectionSelection[view] = index;
    const title = STUDIO_VIEWS.find(item => item[0] === view)?.[1] || view;
    body.append(heading(documentRef, title, 'Edit the selected resource, then review your changes before applying.'));
    if (!items.length) {
        body.append(panel(documentRef, 'empty', 'No project-owned resources', 'Use Source below to define this collection, or attach an available Library resource.'));
        mountStudioValueEditor({ document: documentRef, root: body, value: [], label: title + ' collection JSON', onReview: parsed => {
            if (!Array.isArray(parsed)) throw new TypeError('A resource collection must be an array.');
            if (view === 'knowledge') parsed.forEach(validateKnowledgeEditorValue);
            const next = clone(state.source);
            if (view === 'actors') next.package.actors = parsed;
            else if (view === 'entrypoints') next.package.entryPoints = parsed;
            else next[view] = parsed;
            return stageProject(next, `Update ${title} collection`);
        } });
        return;
    }

    const chooser = selectInput(documentRef, String(index), items.map((_, itemIndex) => String(itemIndex)), title + ' resource');
    [...chooser.options].forEach((option, optionIndex) => {
        option.textContent = displayNameFor(items[optionIndex], view) || `${title} ${optionIndex + 1}`;
    });
    chooser.addEventListener('change', () => {
        state.collectionSelection[view] = Number(chooser.value);
        state.selectedGraphNode = null;
        state.renderEditor();
        void state.renderInspector();
    });
    body.append(field(documentRef, title, chooser));

    mountStudioValueEditor({ document: documentRef, root: body, value: items[index], label: title + ' resource JSON',
        ...(view === 'knowledge' ? { fieldOptions: knowledgeEditorFieldOptions, validate: validateKnowledgeEditorValue } : {}),
        onReview: parsed => stageProject(normalizeCollectionPatch(state.source, view, index, parsed), `Update ${title} resource`),
    });
}

async function loadProjectState(projectId) {
    const [detail, registry, graph, resources, library, history] = await Promise.all([
        nativeStudioClient.getProject(projectId),
        nativeStudioClient.getResourceRegistry(),
        nativeStudioClient.getResourceGraph(),
        nativeStudioClient.queryResources({ projectId }),
        nativeStudioClient.listLibraryResources(),
        nativeStudioClient.history(projectId, 40),
    ]);
    return { detail, registry, graph, resources, library, history };
}

async function mountProjectStudio(documentRef, root, projectId) {
    const loaded = await loadProjectState(projectId);
    const state = {
        projectId,
        source: clone(loaded.detail.source),
        files: loaded.detail.files || [],
        revision: loaded.detail.revision,
        registry: loaded.registry,
        graph: loaded.graph,
        resources: loaded.resources || [],
        library: loaded.library || [],
        history: loaded.history || [],
        activeView: 'overview',
        lastEditorView: 'overview',
        mobileView: 'editor',
        collectionSelection: {},
        selectedGraphNode: null,
        pending: null,
        agentReview: null,
        validation: null,
        output: [],
        preview: null,
        simulation: null,
        buildReport: null,
        activityTab: 'problems',
        disposed: false,
        renderEditor: () => {},
        aiOpen: false, inspectorOpen: false, activityOpen: false, inspecting: false, applying: false,
    };

    const shell = documentRef.createElement('section');
    shell.className = 'atria-studio-workspace';
    shell.dataset.atriaStudioWorkspace = projectId;
    root.replaceChildren(shell);
    const environment = createAtriaShellEnvironment(shell);
    let inspectorSequence = 0;

    const topbar = documentRef.createElement('header');
    topbar.className = 'atria-studio-topbar';
    const identity = documentRef.createElement('div');
    const title = documentRef.createElement('h2');
    title.textContent = state.source.project.displayName;
    const revision = documentRef.createElement('span');
    revision.className = 'atria-studio-topbar__revision';
    revision.textContent = `Revision ${state.revision.revision.slice(0, 12)}`;
    identity.append(title, revision);

    const topActions = actionRow(documentRef);
    topbar.append(identity, topActions);
    shell.append(topbar);

    const main = documentRef.createElement('div');
    main.className = 'atria-studio-layout';
    const center = documentRef.createElement('section');
    center.className = 'atria-studio-center';
    center.dataset.atriaStudioEditor = 'true';
    const inspector = documentRef.createElement('aside');
    inspector.className = 'atria-studio-inspector';
    inspector.dataset.atriaStudioInspector = 'true'; inspector.id = 'atri-studio-inspector';
    const activity = documentRef.createElement('section');
    activity.className = 'atria-studio-activity';
    activity.dataset.atriaStudioActivity = 'true';
    const ai = documentRef.createElement('aside');
    ai.className = 'atria-studio-ai-placeholder';
    ai.dataset.atriaStudioAi = 'agent';

    function resourceTreeSelect(view) {
        state.selectedGraphNode = null;
        state.activeView = view;
        if (view !== 'preview') state.lastEditorView = view;
        state.mobileView = view === 'preview' ? 'preview' : 'editor';
        tree.render();
        renderEditor();
        void renderInspector();
        updateMobile();
        const h = center.querySelector('h3'); if (h) { h.tabIndex = -1; h.focus(); }
    }
    const tree = createResourceTree(documentRef, state, resourceTreeSelect);
    main.append(tree.root, center, inspector, ai);
    shell.append(main, activity);

    const mobileNav = createMobileNav(documentRef, state, updateMobile);
    shell.append(mobileNav);

    function log(kind, message, detail = null) {
        if (state.disposed) return;
        if (['error', 'conflict'].includes(kind)) { state.activityTab = kind === 'conflict' && state.pending ? 'changes' : 'output'; state.activityOpen = true; if (environment.get().mode === 'compact') state.mobileView = 'more'; }
        state.output.unshift({
            kind,
            message,
            detail,
            at: Date.now(),
        });
        renderActivity(); updateMobile();
    }

    async function refreshProject() {
        const [detail, resources, graph, history] = await Promise.all([
            nativeStudioClient.getProject(projectId),
            nativeStudioClient.queryResources({ projectId }),
            nativeStudioClient.getResourceGraph(),
            nativeStudioClient.history(projectId, 40),
        ]);
        if (state.disposed) return;
        state.source = clone(detail.source);
        state.files = detail.files || [];
        state.revision = detail.revision;
        state.resources = resources || [];
        state.graph = graph;
        state.history = history || [];
        title.textContent = state.source.project.displayName;
        revision.textContent = `Revision ${state.revision.revision.slice(0, 12)}`;
        tree.render();
    }

    const aiController = mountNativeStudioAgent({
        document: documentRef,
        slot: ai,
        projectId,
        getRevision: () => state.revision,
        onReviewRequested: () => {
            state.activityTab = 'changes'; state.activityOpen = true;
            if (environment.get().mode === 'compact') state.mobileView = 'more';
            renderActivity(); updateMobile();
            const title = activity.querySelector('h4'); if (title) { title.tabIndex = -1; title.focus(); }
        },
        onLog: log,
        onTaskState: task => {
            state.agentReview = task.status === 'review' ? task : null;
            if (task.validation) state.validation = task.validation;
            if (task.preview) state.preview = task.preview;
            if (task.simulation) state.simulation = task.simulation;
            if (task.status === 'review') state.activityTab = 'changes';
            else if (task.validation?.status === 'failed') state.activityTab = 'problems';
            renderActivity();
            if (state.activeView === 'preview' || state.activeView === 'simulation') renderEditor();
        },
        onProjectCommitted: async () => {
            await refreshProject();
            state.pending = null;
            state.agentReview = null;
            renderEditor();
            renderActivity();
            void renderInspector();
        },
    });

    function workspaceFor(operations) {
        return createStudioWorkspace({
            projectId,
            baseRevision: state.revision.revision,
            origin: createHumanOrigin(),
            operations,
        });
    }

    async function stageOperations(operations, label) {
        if (state.inspecting || state.applying) return false;
        state.inspecting = true;
        const workspace = workspaceFor(operations);
        let accepted = false;
        try {
            const inspected = await nativeStudioClient.inspectWorkspace(projectId, workspace);
            if (state.disposed) return false;
            state.pending = { label, workspace, inspected };
            state.activityOpen = true; if (environment.get().mode === 'compact') state.mobileView = 'more';
            accepted = true;
            state.activityTab = 'changes';
            log('review', `ChangeSet review ready: ${label}`, inspected.changes);
        } catch (error) {
            if (error.status === 409) {
                state.pending = { label, workspace, conflict: error };
                state.activityTab = 'changes';
                log('conflict', 'Project revision changed. Reload before applying this ChangeSet.', error.details);
            } else {
                log('error', error?.message || String(error));
            }
        }
        state.inspecting = false; renderActivity(); updateMobile();
        const focus = activity.querySelector('h4, [role=alert]'); if (focus) { focus.tabIndex = -1; focus.focus(); }
        return accepted;
    }

    function stageProject(nextSource, label) {
        return stageOperations([
            projectSaveOperation(projectId, nextSource),
        ], label);
    }

    async function applyPending() {
        if (!state.pending?.workspace || state.pending.conflict || state.applying) return;
        state.applying = true;
        try {
            const result = await nativeStudioClient.executeWorkspace(projectId, state.pending.workspace);
            state.validation = result.changeSet?.validation || null;
            const applied = result.changeSet?.resultingRevision;
            if (applied) {
                log('success', `ChangeSet ${result.changeSet.changeSetId} committed at ${applied.slice(0, 12)}`, result.changes);
                state.activityOpen = false;
                if (environment.get().mode === 'compact') state.mobileView = 'editor';
            } else {
                log('error', `ChangeSet ${result.changeSet?.changeSetId || ''} failed validation and was rolled back.`, state.validation);
                return;
            }
            state.pending = null;
            await refreshProject();
            renderEditor();
            renderInspector();
            const heading = center.querySelector('h3'); if (heading) { heading.tabIndex = -1; heading.focus(); }
        } catch (error) {
            if (error.status === 409) {
                state.pending = { ...state.pending, conflict: error };
                log('conflict', 'ChangeSet conflict: the project advanced. Reload latest before retrying.', error.details);
            } else {
                log('error', error?.message || String(error));
            }
        } finally { state.applying = false; renderActivity(); updateMobile(); }
    }

    async function runValidation() {
        try {
            state.validation = await nativeStudioClient.validateProject(projectId);
            state.activityTab = 'problems'; state.activityOpen = true;
            if (environment.get().mode === 'compact') state.mobileView = 'more';
            log(state.validation.status === 'passed' ? 'success' : 'error', `Validation ${state.validation.status}.`, state.validation.diagnostics);
        } catch (error) {
            log('error', error?.message || String(error));
        }
    }

    async function runPreview() {
        try {
            const ep = entryPoint(state.source);
            const result = await nativeStudioClient.preview(projectId, {
                baseRevision: state.revision.revision,
                ...(ep?.entryPointId ? { entryPointId: ep.entryPointId } : {}),
            });
            state.preview = result.preview;
            state.activeView = 'preview';
            state.mobileView = 'preview';
            log('success', `Native Preview ${result.preview.previewId} created without Session/Branch persistence.`, result.preview.descriptor);
            renderEditor();
            updateMobile();
        } catch (error) {
            log('error', error?.message || String(error));
        }
    }

    async function runSimulation() {
        try {
            state.simulation = await nativeStudioClient.simulate(projectId, {
                baseRevision: state.revision.revision,
            });
            state.activeView = 'simulation'; state.mobileView = 'editor'; updateMobile();
            log(state.simulation.status === 'completed' ? 'success' : 'info', `Simulation ${state.simulation.status}.`, state.simulation);
            renderEditor();
        } catch (error) {
            log('error', error?.message || String(error));
        }
    }

    async function runBuild({ download = false } = {}) {
        try {
            const report = await nativeStudioClient.preflight(projectId, state.revision.revision);
            state.buildReport = report;
            log('success', 'Build preflight completed.', report.preflight);
            if (download) {
                const built = await nativeStudioClient.build(projectId, state.revision.revision);
                const bytes = Uint8Array.from(globalThis.atob(built.data), char => char.charCodeAt(0));
                const url = URL.createObjectURL(new Blob([bytes], { type: built.mediaType || 'application/octet-stream' }));
                const link = documentRef.createElement('a');
                link.href = url;
                link.download = built.fileName || (projectId + '.atria');
                link.click();
                URL.revokeObjectURL(url);
                log('success', `Built ${link.download} from exact revision ${state.revision.revision.slice(0, 12)}.`);
            }
            state.activeView = 'build'; state.mobileView = 'editor'; updateMobile();
            renderEditor();
        } catch (error) {
            log('error', error?.message || String(error));
        }
    }

    async function renderInspector() {
        const inspectorToken = ++inspectorSequence;
        inspector.replaceChildren(heading(documentRef, 'Inspector', 'Explore references and the resources that use this item.'));
        inspector.append(button(documentRef, 'Close Inspector', () => { state.inspectorOpen = false; updateMobile(); topActions.querySelector('[aria-controls="atri-studio-inspector"]')?.focus(); }));
        let node = state.selectedGraphNode;
        if (!node) {
            const type = state.activeView === 'plugin-resource' ? state.selectedPluginResourceType : (viewResourceType(state.activeView) || 'core.project');
            const items = sourceSection(state.source, state.activeView);
            const index = state.collectionSelection[state.activeView] || 0;
            const resourceId = viewResourceId(items?.[index], state.activeView);
            node = state.resources.find(item => (
                (!type || item.resourceType === type)
                && (!resourceId || item.resourceId === resourceId)
            )) || state.resources.find(item => item.resourceType === type) || null;
        }
        if (!node) {
            inspector.append(panel(documentRef, 'empty', 'No resource selected', 'Select a project resource to inspect references and Used By.'));
            return;
        }
        state.selectedGraphNode = node;
        const pre = documentRef.createElement('pre');
        pre.textContent = JSON.stringify({
            resourceType: node.resourceType,
            resourceId: node.resourceId,
            revision: node.revision,
            ownership: node.ownership,
            authority: node.authority,
            metadata: node.metadata,
        }, null, 2);
        inspector.append(technicalDetails(documentRef, pre.textContent, 'Resource identity'));

        const ref = resourceReferenceForNode(node);
        if (!ref) return;
        try {
            const [references, usedBy] = await Promise.all([
                nativeStudioClient.getResourceReferences(ref),
                nativeStudioClient.getResourceReferences(ref, { reverse: true }),
            ]);
            if (state.disposed || inspectorToken !== inspectorSequence) return;
            const refs = documentRef.createElement('div');
            refs.className = 'atria-studio-reference-list';
            const refsTitle = documentRef.createElement('h4');
            refsTitle.textContent = t('References');
            refs.append(refsTitle);
            if (!references?.length) { const note = documentRef.createElement('p'); note.textContent = t('No references'); refs.append(note); }
            for (const item of references || []) {
                const row = documentRef.createElement('div');
                row.textContent = item.node?.displayName || item.node?.resourceId || item.to || item.resourceId || item.edge?.to || t('Resource');
                refs.append(row);
            }
            const used = documentRef.createElement('div');
            used.className = 'atria-studio-reference-list';
            const usedTitle = documentRef.createElement('h4');
            usedTitle.textContent = t('Used By');
            used.append(usedTitle);
            if (!usedBy?.length) { const note = documentRef.createElement('p'); note.textContent = t('No resources use this item'); used.append(note); }
            for (const item of usedBy || []) {
                const row = documentRef.createElement('div');
                row.textContent = item.node?.displayName || item.node?.resourceId || item.from || item.resourceId || item.edge?.from || t('Resource');
                used.append(row);
            }
            inspector.append(refs, used);
        } catch (error) {
            if (state.disposed || inspectorToken !== inspectorSequence) return;
            const note = documentRef.createElement('p');
            note.textContent = error?.message || String(error);
            inspector.append(note);
        }
    }
    state.renderInspector = renderInspector;

    function renderOverview(body) {
        body.append(heading(documentRef, 'Project Overview', 'Give the project a name and set the identity of the work you will publish.'));
        const projectName = textInput(documentRef, state.source.project.displayName, 'Project display name');
        const packageName = textInput(documentRef, state.source.package.name, 'Package name');
        const versionInput = textInput(documentRef, state.source.package.version, 'Package version');
        body.append(
            field(documentRef, 'Project name', projectName),
            field(documentRef, 'Package name', packageName),
            field(documentRef, 'Package version', versionInput),
            actionRow(documentRef, button(documentRef, 'Review Changes', () => {
                const next = patchProjectSource(state.source, source => {
                    source.project.displayName = projectName.value;
                    source.package.name = packageName.value;
                    source.package.version = versionInput.value;
                });
                return stageProject(next, 'Update project overview');
            }, { primary: true })),
        );
    }

    function renderExperience(body) {
        const current = experienceFromProject(state.source);
        body.append(heading(documentRef, 'Experience', 'Choose how readers experience this work. Component, hybrid and full modes use your project interface.'));
        const mode = selectInput(documentRef, current.mode || 'text', ['text', 'component', 'hybrid', 'full'], 'Experience mode');
        const component = textInput(documentRef, current.component || 'ui/main.json', 'Component source path');
        const selectors = textInput(documentRef, current.selectors || 'ui/selectors.json', 'Selector source path');
        const surface = textInput(documentRef, current.surface || 'app.root', 'Experience surface');
        body.append(
            field(documentRef, 'Mode', mode),
            field(documentRef, 'Component', component),
            field(documentRef, 'Selectors', selectors),
            field(documentRef, 'Surface', surface),
            actionRow(documentRef, button(documentRef, 'Review Changes', () => {
                const next = patchProjectSource(state.source, source => {
                    const target = source.package.entryPoints[0];
                    target.runtime = { ...(target.runtime || {}) };
                    target.runtime.experience = mode.value === 'text'
                        ? { mode: 'text' }
                        : {
                            mode: mode.value,
                            componentModelVersion: 1,
                            component: component.value,
                            selectors: selectors.value,
                            surface: surface.value,
                        };
                });
                return stageProject(next, 'Update Native Experience');
            }, { primary: true })),
        );
    }

    function renderPackageJson(body, title, key, description) {
        const current = state.source.package[key] ?? (key === 'permissions' ? [] : {});
        renderJsonSection(documentRef, body, {
            title,
            description,
            value: current,
            onStage: parsed => {
                const next = patchProjectSource(state.source, source => {
                    source.package[key] = parsed;
                });
                return stageProject(next, `Update ${title}`);
            },
        });
    }

    function renderNestedRuntimeJson(body, title, key, description) {
        const current = state.source.package.runtime?.[key] ?? [];
        renderJsonSection(documentRef, body, {
            title,
            description,
            value: current,
            onStage: parsed => {
                const next = patchProjectSource(state.source, source => {
                    source.package.runtime = { ...(source.package.runtime || {}), [key]: parsed };
                });
                return stageProject(next, `Update ${title}`);
            },
        });
    }

    async function renderUi(body) {
        const experience = experienceFromProject(state.source);
        const componentPath = experienceComponentPath(state.source);
        body.append(heading(documentRef, 'UI Components', 'Compose the interface, adjust its structure and bindings, then review your changes.'));
        if (experience.mode === 'text' || !componentPath) {
            body.append(panel(documentRef, 'empty', 'Text Experience', 'Switch Experience to Component, Hybrid or Full before authoring Structured UI.'));
            return;
        }
        try {
            const file = await nativeStudioClient.readSource(projectId, componentPath);
            const model = JSON.parse(decodeUtf8(file.content));
            compileExperienceComponentModel(model, { mode: experience.mode });
            const hostNode = documentRef.createElement('div');
            body.append(hostNode);
            mountStructuredUiEditor({
                document: documentRef,
                root: hostNode,
                initialModel: model,
                mode: experience.mode,
                onStage: nextModel => stageOperations([
                    sourceWriteOperation(componentPath, JSON.stringify(nextModel, null, 2)),
                ], 'Update Atria Structured UI'),
            });
        } catch (error) {
            body.append(panel(documentRef, 'error', 'Structured UI unavailable', error?.message || String(error)));
        }
    }

    function attachedRevision(item) {
        if (item.resourceType === 'core.world') {
            return state.source.dependencies.worlds
                .find(value => value.worldId === item.resourceId)?.worldRevisionId || null;
        }
        if (item.resourceType === 'core.knowledge') {
            return state.source.dependencies.knowledge
                .find(value => value.knowledgeBaseId === item.resourceId)?.knowledgeRevisionId || null;
        }
        if (item.resourceType === 'core.asset') {
            return state.source.dependencies.assets
                .find(value => value.assetId === item.resourceId)?.contentHash || null;
        }
        return null;
    }

    function renderLibraryRelations(body) {
        body.append(heading(documentRef, 'Library Attach / Fork / Update', 'Attach pins an exact immutable revision. Updates are explicit; Library latest is never followed implicitly.'));
        const list = documentRef.createElement('div');
        list.className = 'atria-studio-library-relations';
        for (const item of state.library) {
            if (!['core.world', 'core.knowledge', 'core.asset'].includes(item.resourceType)) continue;
            const row = documentRef.createElement('div');
            row.className = 'atria-studio-library-relations__row';
            const info = documentRef.createElement('div');
            info.textContent = `${item.displayName} · ${item.resourceType} · ${item.currentRevision}`;
            const revisionSelect = selectInput(documentRef, item.currentRevision, item.revisions || [], 'Exact Library revision');
            const attach = button(documentRef, 'Attach', async () => {
                try {
                    const result = await nativeStudioClient.attachResource(projectId, {
                        resourceType: item.resourceType,
                        resourceId: item.resourceId,
                        revision: revisionSelect.value,
                        baseRevision: state.revision.revision,
                        origin: createHumanOrigin(),
                    });
                    log('success', `Attached exact ${item.resourceId}@${revisionSelect.value}.`, result.changeSet);
                    await refreshProject();
                    renderEditor();
                } catch (error) {
                    log(error.status === 409 ? 'conflict' : 'error', error?.message || String(error), error.details);
                }
            });
            const fork = button(documentRef, 'Fork', async () => {
                try {
                    const result = await nativeStudioClient.forkResource(projectId, {
                        resourceType: item.resourceType,
                        resourceId: item.resourceId,
                        revision: revisionSelect.value,
                        baseRevision: state.revision.revision,
                        origin: createHumanOrigin(),
                    });
                    log('success', `Forked ${item.resourceId}@${revisionSelect.value} into project ownership.`, result.changeSet);
                    await refreshProject();
                    renderEditor();
                } catch (error) {
                    log(error.status === 409 ? 'conflict' : 'error', error?.message || String(error), error.details);
                }
            });
            const fromRevision = attachedRevision(item);
            const update = ['core.world', 'core.knowledge'].includes(item.resourceType)
                ? button(documentRef, 'Update', async () => {
                    const current = attachedRevision(item);
                    if (!current || current === revisionSelect.value) {
                        log('info', current ? 'Selected revision is already attached.' : 'Attach this resource before updating it.');
                        return;
                    }
                    try {
                        const result = await nativeStudioClient.updateResource(projectId, {
                            resourceType: item.resourceType,
                            resourceId: item.resourceId,
                            fromRevision: current,
                            toRevision: revisionSelect.value,
                            baseRevision: state.revision.revision,
                            origin: createHumanOrigin(),
                        });
                        log('success', `Updated ${item.resourceId} from ${current} to ${revisionSelect.value}.`, result.changeSet);
                        await refreshProject();
                        renderEditor();
                    } catch (error) {
                        log(error.status === 409 ? 'conflict' : 'error', error?.message || String(error), error.details);
                    }
                }, { disabled: !fromRevision })
                : null;
            if (fromRevision) info.textContent += ` · attached ${fromRevision}`;
            row.append(info, revisionSelect, attach, fork, update);
            list.append(row);
        }
        body.append(list);
    }

    function renderAssets(body) {
        body.append(heading(documentRef, 'Assets', 'Project-owned media files are written through one Workspace/ChangeSet with the manifest update.'));
        const files = state.source.assetFiles || [];
        const list = documentRef.createElement('div');
        list.className = 'atria-studio-asset-list';
        for (const asset of files) {
            const row = documentRef.createElement('div');
            row.className = 'atria-studio-asset-list__row';
            row.textContent = `${asset.logicalName || asset.assetId} · ${asset.path}`;
            const remove = button(documentRef, 'Remove', () => {
                const next = patchProjectSource(state.source, source => {
                    source.assetFiles = source.assetFiles.filter(item => item.assetId !== asset.assetId);
                });
                stageOperations([
                    sourceDeleteOperation(asset.path),
                    projectSaveOperation(projectId, next),
                ], `Remove asset ${asset.logicalName || asset.assetId}`);
            });
            row.append(remove);
            list.append(row);
        }
        body.append(list);

        const picker = documentRef.createElement('input');
        picker.type = 'file';
        picker.setAttribute('aria-label', t('Import project asset'));
        picker.addEventListener('change', async () => {
            const file = picker.files?.[0];
            if (!file) return;
            const assetId = createStudioNativeId('asset');
            const path = 'assets/' + safePathSegment(file.name);
            const content = encodeBase64(await file.arrayBuffer());
            const next = patchProjectSource(state.source, source => {
                source.assetFiles = [...(source.assetFiles || []), {
                    assetId,
                    path,
                    logicalName: file.name,
                    ...(file.type ? { mediaType: file.type } : {}),
                }];
            });
            await stageOperations([
                sourceWriteOperation(path, content, { encoding: 'base64' }),
                projectSaveOperation(projectId, next),
            ], `Import asset ${file.name}`);
        });
        body.append(field(documentRef, 'Import asset', picker));
        renderLibraryRelations(body);
    }

    async function renderSource(body) {
        body.append(heading(documentRef, 'Source', 'Edit project files directly, then review the proposed changes before applying.'));
        const loading = panel(documentRef, 'loading', 'Loading files', 'Reading project sources…'); body.append(loading);
        try {
            const sources = await nativeStudioClient.listSources(projectId);
            loading.remove();
            if (!sources.length) { body.append(panel(documentRef, 'empty', 'No project sources', 'This project currently contains only structured manifest resources.')); return; }
            const chooser = selectInput(documentRef, sources[0].path, sources.map(item => item.path), 'Source file');
            const editor = textArea(documentRef, '', 'Source editor');
            const errorPanel = documentRef.createElement('p'); errorPanel.hidden = true; errorPanel.setAttribute('role', 'alert');
            let sequence = 0;
            let loadedPath = '';
            const review = button(documentRef, 'Review Source Change', () => stageOperations([
                sourceWriteOperation(loadedPath, editor.value),
            ], `Write ${loadedPath}`), { primary: true, disabled: true });
            async function load() {
                const token = ++sequence; const path = chooser.value;
                editor.disabled = true; review.disabled = true; errorPanel.hidden = true;
                try {
                    const file = await nativeStudioClient.readSource(projectId, path);
                    if (state.disposed || token !== sequence) return;
                    editor.value = decodeUtf8(file.content); loadedPath = path; editor.disabled = false; review.disabled = false;
                } catch (error) {
                    if (state.disposed || token !== sequence) return;
                    errorPanel.hidden = false; errorPanel.textContent = error.message;
                }
            }
            chooser.addEventListener('change', () => void load());
            body.append(field(documentRef, 'File', chooser), editor, errorPanel, actionRow(documentRef, review, button(documentRef, 'Reload file', load)));
            await load();
        } catch (error) {
            loading.remove(); body.append(panel(documentRef, 'error', 'Could not load sources', error.message), button(documentRef, 'Retry', () => { renderEditor(); }));
        }
    }

    async function renderPreview(body) {
        body.append(heading(documentRef, 'Native Preview', 'Explore the committed project interface without creating a play session.'));
        if (!state.preview) {
            body.append(panel(documentRef, 'empty', 'No active preview', 'Run Preview from the Studio toolbar.'));
            return;
        }
        const meta = documentRef.createElement('pre');
        meta.textContent = JSON.stringify({
            previewId: state.preview.previewId,
            experience: state.preview.experience,
            packageVersionId: state.preview.packageVersionId,
            persisted: state.preview.persisted,
        }, null, 2);
        body.append(technicalDetails(documentRef, meta.textContent, 'Preview details'));

        const experience = experienceFromProject(state.source);
        const componentPath = experienceComponentPath(state.source);
        if (experience.mode !== 'text' && componentPath) {
            try {
                const file = await nativeStudioClient.readSource(projectId, componentPath);
                const model = JSON.parse(decodeUtf8(file.content));
                const compiled = compileExperienceComponentModel(model, { mode: experience.mode });
                const canvas = documentRef.createElement('div');
                canvas.className = 'atria-studio-preview-canvas';
                canvas.append(renderExperienceComponentModel(documentRef, compiled));
                body.append(canvas);
            } catch (error) {
                body.append(panel(documentRef, 'error', 'Preview render failed', error?.message || String(error)));
            }
        } else {
            body.append(panel(documentRef, 'empty', 'Text Preview', 'This project uses the conversation interface during Play.'));
        }
    }

    function renderSimulation(body) {
        body.append(heading(documentRef, 'Test / Simulation', 'Check the committed project without changing your play sessions.'));
        body.append(actionRow(documentRef, button(documentRef, 'Run Simulation', runSimulation, { primary: true })));
        if (state.simulation) {
            const pre = documentRef.createElement('pre');
            pre.textContent = JSON.stringify(state.simulation, null, 2);
            const status = documentRef.createElement('p'); status.setAttribute('role', 'status'); status.textContent = t('Simulation') + ': ' + state.simulation.status;
            body.append(status, technicalDetails(documentRef, pre.textContent, 'Simulation details'));
        }
    }

    function renderBuild(body) {
        body.append(heading(documentRef, 'Build', 'Build resolves the exact dependency closure into a self-contained immutable .atria package.'));
        body.append(actionRow(
            documentRef,
            button(documentRef, 'Run Preflight', () => runBuild({ download: false })),
            button(documentRef, 'Build .atria', () => runBuild({ download: true }), { primary: true }),
        ));
        if (state.buildReport) {
            const pre = documentRef.createElement('pre');
            pre.textContent = JSON.stringify({
                revision: state.buildReport.revision,
                manifest: state.buildReport.manifest,
                preflight: state.buildReport.preflight,
            }, null, 2);
            const status = documentRef.createElement('p'); status.setAttribute('role', 'status'); status.textContent = t('Preflight complete. The package is ready to build from this exact revision.');
            body.append(status, technicalDetails(documentRef, pre.textContent, 'Build details'));
        }
    }

    function renderEditor() {
        if (state.disposed) return;
        center.replaceChildren();
        const body = documentRef.createElement('section');
        body.className = 'atria-studio-editor-surface';
        body.dataset.atriaStudioView = state.activeView;
        center.append(body);

        if (state.activeView === 'overview') renderOverview(body);
        else if (['prompt-authoring', 'runtime-design'].includes(state.activeView)) void mountStudioPromptTools({ document: documentRef, body, state, stageProject, runtimeDesign: state.activeView === 'runtime-design' });
        else if (state.activeView === 'experience') renderExperience(body);
        else if (['actors', 'entrypoints', 'worlds', 'knowledge'].includes(state.activeView)) {
            renderCollectionEditor(documentRef, body, state, state.activeView, stageProject);
            if (['worlds', 'knowledge'].includes(state.activeView)) renderLibraryRelations(body);
        } else if (state.activeView === 'logic') renderPackageJson(body, 'Game Logic', 'processors', 'Structured logic/processors remain part of project source.');
        else if (state.activeView === 'ui') void renderUi(body);
        else if (state.activeView === 'assets') renderAssets(body);
        else if (state.activeView === 'memory') renderPackageJson(body, 'Memory', 'memory', 'Project memory configuration is structured package source.');
        else if (state.activeView === 'agents') renderPackageJson(body, 'Agents / Orchestration', 'orchestration', 'Configure orchestration for this project. These settings do not run the Project Agent.');
        else if (state.activeView === 'skills') renderPackageJson(body, 'Skills', 'skills', 'Manage the Skills declared by this project.');
        else if (state.activeView === 'plugins') renderNestedRuntimeJson(body, 'Plugins', 'plugins', 'Package-runtime plugins remain declarative and capability-defined.');
        else if (state.activeView === 'metadata') {
            renderJsonSection(documentRef, body, {
                title: 'Processors / Localization / Permissions',
                description: 'Edit processors, localization and permissions, then review the proposed changes.',
                value: {
                    processors: state.source.package.processors || {},
                    localization: state.source.package.localization || {},
                    permissions: state.source.package.permissions || [],
                },
                onStage: parsed => {
                    const next = patchProjectSource(state.source, source => {
                        source.package.processors = parsed.processors || {};
                        source.package.localization = parsed.localization || {};
                        source.package.permissions = parsed.permissions || [];
                    });
                    return stageProject(next, 'Update package advanced settings');
                },
            });
        } else if (state.activeView === 'simulation') renderSimulation(body);
        else if (state.activeView === 'preview') void renderPreview(body);
        else if (state.activeView === 'build') renderBuild(body);
        else if (state.activeView === 'source') void renderSource(body);
        else if (state.activeView === 'plugin-resource') {
            const descriptor = (state.registry?.descriptors || [])
                .find(item => item.resourceType === state.selectedPluginResourceType);
            body.append(heading(
                documentRef,
                descriptor?.displayName || 'Plugin Resource',
                'Inspect resources provided by this plugin and their exact identity.',
            ));
            const matching = state.resources.filter(item => item.resourceType === state.selectedPluginResourceType);
            const pre = documentRef.createElement('pre');
            pre.textContent = JSON.stringify({
                descriptor,
                resources: matching,
            }, null, 2);
            body.append(technicalDetails(documentRef, pre.textContent));
        }
    }
    state.renderEditor = renderEditor;

    function renderActivity() {
        if (state.disposed) return;
        activity.replaceChildren();
        const tabs = documentRef.createElement('nav');
        tabs.className = 'atria-studio-activity-tabs';
        for (const [id, label] of [
            ['problems', 'Problems'],
            ['output', 'Output'],
            ['history', 'History'],
            ['changes', 'Changes'],
        ]) {
            tabs.append(button(documentRef, label, () => {
                state.activityTab = id; state.activityOpen = true;
                renderActivity(); updateMobile();
                [...activity.querySelectorAll('button')].find(node => node.textContent === t(label))?.focus();
            }, { active: state.activityTab === id }));
        }
        tabs.append(button(documentRef, state.activityOpen ? 'Hide activity' : 'Show activity', () => { state.activityOpen = !state.activityOpen; renderActivity(); updateMobile(); }));
        activity.append(tabs);

        const body = documentRef.createElement('div');
        body.className = 'atria-studio-activity__body';
        body.dataset.atriaStudioActivityTab = state.activityTab;
        activity.append(body);

        if (state.activityTab === 'problems') {
            const diagnostics = state.validation?.diagnostics || [];
            if (!diagnostics.length) body.append(panel(documentRef, 'empty', 'No diagnostics', 'Run Validate or apply a ChangeSet to refresh diagnostics.'));
            for (const diagnostic of diagnostics) {
                const row = documentRef.createElement('div');
                row.className = 'atria-studio-diagnostic';
                row.dataset.severity = diagnostic.severity;
                row.textContent = `${diagnostic.severity} · ${diagnostic.code} · ${diagnostic.message}`;
                body.append(row);
            }
        } else if (state.activityTab === 'output') {
            if (!state.output.length) body.append(panel(documentRef, 'empty', 'No output', 'Studio actions and build/preview results appear here.'));
            for (const item of state.output.slice(0, 100)) {
                const row = documentRef.createElement('details');
                const summary = documentRef.createElement('summary');
                summary.textContent = `${formatTime(item.at)} · ${item.kind} · ${item.message}`;
                row.append(summary);
                if (item.detail != null) {
                    const pre = documentRef.createElement('pre');
                    pre.textContent = JSON.stringify(item.detail, null, 2);
                    row.append(pre);
                }
                body.append(row);
            }
        } else if (state.activityTab === 'history') {
            if (!state.history.length) body.append(panel(documentRef, 'empty', 'No history', 'Project Git history appears after the first authoring commit.'));
            for (const item of state.history) {
                const row = documentRef.createElement('button');
                row.type = 'button';
                row.className = 'atria-studio-history-row';
                row.textContent = `${item.shortHash || item.fullHash?.slice(0, 10)} · ${item.message}`;
                row.addEventListener('click', async () => {
                    try {
                        const diff = await nativeStudioClient.diff(projectId, item.fullHash);
                        log('diff', `Diff for ${item.fullHash.slice(0, 12)}`, diff.diff);
                        state.activityTab = 'output';
                        renderActivity();
                    } catch (error) {
                        log('error', error?.message || String(error));
                    }
                });
                body.append(row);
            }
        } else if (state.pending) {
            const title = documentRef.createElement('h4');
            title.textContent = state.pending.label;
            body.append(title);
            if (state.pending.conflict) {
                body.append(panel(documentRef, 'error', 'Revision conflict', 'The project advanced. Studio never silently rebases authoring changes. Reload the latest revision and review your edits again.'));
                body.append(actionRow(documentRef, button(documentRef, 'Reload Latest', async () => {
                    state.pending = null;
                    await refreshProject();
                    renderEditor();
                    renderActivity();
                }, { primary: true })));
            } else {
                const pre = documentRef.createElement('pre');
                pre.textContent = JSON.stringify({
                    workspaceId: state.pending.workspace.workspaceId,
                    baseRevision: state.pending.workspace.baseRevision,
                    operations: state.pending.workspace.operations,
                    changes: state.pending.inspected?.changes || [],
                }, null, 2);
                const summary = documentRef.createElement('p'); summary.textContent = t('Review the proposed operations before applying.') + ' ' + state.pending.workspace.operations.length;
                const changes = documentRef.createElement('ul'); changes.className = 'atri-studio-change-summary';
                for (const operation of state.pending.workspace.operations) {
                    const item = documentRef.createElement('li');
                    const label = { 'project.save': 'Update project resources', 'source.write': 'Write file', 'source.delete': 'Remove file', 'source.move': 'Move file' }[operation.operationType] || operation.operationType;
                    item.textContent = t(label) + (operation.target?.path ? ' · ' + operation.target.path : ''); changes.append(item);
                }
                body.append(summary, changes, technicalDetails(documentRef, pre.textContent, 'ChangeSet details'), actionRow(
                    documentRef,
                    button(documentRef, 'Cancel', () => {
                        state.pending = null;
                        renderActivity();
                    }),
                    button(documentRef, 'Apply ChangeSet', applyPending, { primary: true, disabled: state.applying }),
                ));
            }
        } else if (state.agentReview) {
            const title = documentRef.createElement('h4');
            title.textContent = 'Project Agent Review';
            const pre = documentRef.createElement('pre');
            pre.textContent = JSON.stringify({
                taskId: state.agentReview.taskId,
                baseRevision: state.agentReview.baseRevision,
                workspaceId: state.agentReview.workspace?.workspaceId,
                operations: state.agentReview.operations || [],
                changes: state.agentReview.inspection?.changes || [],
                validation: state.agentReview.validation,
                preview: state.agentReview.preview,
                simulation: state.agentReview.simulation,
                highImpact: state.agentReview.review?.highImpact === true,
            }, null, 2);
            body.append(
                title,
                panel(
                    documentRef,
                    'info',
                    'Review required',
                    'Inspect the Agent ChangeSet here; Commit remains an explicit action in the Project Agent panel.',
                ),
                technicalDetails(documentRef, pre.textContent, 'Agent ChangeSet details'),
            );
        } else {
            body.append(panel(documentRef, 'empty', 'No pending ChangeSet', 'Structured edits first enter review; applying runs validation and commits only on success.'));
        }
    }

    function updateMobile() {
        center.inert = environment.get().mode === 'medium' && (state.inspectorOpen || state.aiOpen);
        for (const item of topActions.children) { if (item.textContent === t('Inspector')) item.setAttribute('aria-expanded', String(state.inspectorOpen)); if (item.textContent === t('AI')) item.setAttribute('aria-expanded', String(state.aiOpen)); }
        shell.dataset.activityOpen = String(state.activityOpen); shell.dataset.inspectorOpen = String(state.inspectorOpen); shell.dataset.aiOpen = String(state.aiOpen);
        for (const [index, control] of [...mobileNav.querySelectorAll('button')].entries()) { control.dataset.active = String(MOBILE_VIEWS[index][0] === state.mobileView); control.setAttribute('aria-current', MOBILE_VIEWS[index][0] === state.mobileView ? 'page' : 'false'); }
        shell.dataset.atriaStudioMobileView = state.mobileView;
        if (state.mobileView === 'preview' && state.activeView !== 'preview') {
            state.lastEditorView = state.activeView;
            state.activeView = 'preview';
            tree.render();
            renderEditor();
            void renderInspector();
        } else if (state.mobileView === 'editor' && state.activeView === 'preview') {
            state.activeView = state.lastEditorView || 'overview';
            tree.render();
            renderEditor();
            void renderInspector();
        }
    }

    topActions.append(
        button(documentRef, 'Validate', runValidation),
        button(documentRef, 'Preview', runPreview),
        button(documentRef, 'Simulate', runSimulation),
        button(documentRef, 'Inspector', () => { state.inspectorOpen = !state.inspectorOpen; state.aiOpen = false; if (environment.get().mode === 'compact') state.mobileView = 'editor'; updateMobile(); if (state.inspectorOpen) inspector.querySelector('button')?.focus(); }),
        button(documentRef, 'Build', () => runBuild({ download: false })),
        button(documentRef, 'AI', () => {
            state.aiOpen = !state.aiOpen;
            state.inspectorOpen = false; state.mobileView = state.aiOpen ? 'ai' : 'editor'; updateMobile(); if (state.aiOpen) ai.querySelector('select,textarea')?.focus();
        }, { active: state.aiOpen }),
    );

    const inspectorToggle = [...topActions.children].find(item => item.textContent === t('Inspector'));
    inspectorToggle.setAttribute('aria-controls', inspector.id);
    environment.subscribe(() => { updateMobile(); });
    function dismissTransient() {
        if (!state.aiOpen && !state.inspectorOpen && state.mobileView !== 'ai') return false;
        const label = state.inspectorOpen ? 'Inspector' : 'AI';
        state.aiOpen = false; state.inspectorOpen = false;
        if (state.mobileView === 'ai') state.mobileView = 'editor';
        updateMobile(); [...topActions.children].find(item => item.textContent === t(label))?.focus();
        return true;
    }
    renderEditor();
    renderActivity();
    void renderInspector();
    updateMobile();

    return {
        updateRoute() {},
        dismissTransient,
        dispose() {
            state.disposed = true;
            environment.dispose(); aiController.dispose();
        },
    };
}

export function mountNativeStudioWorkspace({
    document: documentRef,
    slot,
    route,
    host,
}) {
    let disposed = false;
    let sequence = 0;
    let projectController = null;

    async function render(nextRoute = route) {
        const token = ++sequence;
        slot.replaceChildren(panel(documentRef, 'loading', 'Build Projects', 'Loading Atria Studio…'));
        const root = documentRef.createElement('section');
        root.className = 'atria-native-studio';
        root.dataset.atriaNativeBuild = 'true';
        try {
            await Promise.resolve(projectController?.dispose?.());
            projectController = null;
            const childId = String(nextRoute?.child?.id || '');
            if (childId.startsWith('project:')) {
                const projectId = childId.slice('project:'.length);
                const mounted = await mountProjectStudio(documentRef, root, projectId);
                if (disposed || token !== sequence) { mounted.dispose(); return; }
                projectController = mounted;
            } else {
                await renderProjectList(documentRef, root, host);
            }
            if (!disposed && token === sequence) slot.replaceChildren(root);
        } catch (error) {
            if (!disposed && token === sequence) {
                const errorPanel = panel(documentRef, 'error', 'Build Projects', error?.message || String(error));
                errorPanel.append(button(documentRef, 'Try again', () => render(nextRoute)));
                root.dataset.atriaBuildError = 'true'; root.replaceChildren(errorPanel); slot.replaceChildren(root);
            }
        }
    }

    void render(route);
    return {
        dismissTransient: () => projectController?.dismissTransient?.() === true,
        updateRoute(nextRoute) {
            void render(nextRoute);
        },
        dispose() {
            disposed = true;
            sequence += 1;
            void Promise.resolve(projectController?.dispose?.());
        },
    };
}
