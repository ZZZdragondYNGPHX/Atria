import {
    createAtriaRuntimeCard,
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
    ['presets', 'Presets / Processors'],
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
    node.addEventListener('click', handler);
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
    input.setAttribute('aria-label', t(label));
    return input;
}

function textArea(documentRef, value, label) {
    const input = documentRef.createElement('textarea');
    input.className = 'text_pole atria-studio-editor__textarea';
    input.value = value ?? '';
    input.setAttribute('aria-label', t(label));
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
    const card = createAtriaRuntimeCard(documentRef, {
        title: project.displayName,
        description: `Package source ${project.packageId}`,
        status: record.revision?.revision
            ? `Revision ${record.revision.revision.slice(0, 10)}`
            : `Updated ${formatTime(project.updatedAt || project.createdAt)}`,
    });
    card.dataset.atriaBuildProjectId = project.projectId;
    card.append(actionRow(
        documentRef,
        button(documentRef, 'Open Project', () => host.openBuild(project.projectId, project.displayName), { primary: true }),
    ));
    return card;
}

async function renderProjectList(documentRef, root, host) {
    const projects = await nativeStudioClient.listProjects();
    root.dataset.atriaBuildProjects = 'true';
    root.append(heading(documentRef, 'Build Projects', 'Open a Native ProjectStore project in Atria Studio.'));
    if (!projects.length) {
        root.append(panel(documentRef, 'empty', 'No Native Build Projects', 'Create a Native project to enter Atria Studio.'));
        return;
    }
    const grid = documentRef.createElement('div');
    grid.className = 'atria-library-games__grid';
    for (const record of projects) grid.append(projectListCard(documentRef, record, host));
    root.append(grid);
}

function createResourceTree(documentRef, state, selectView) {
    const aside = documentRef.createElement('aside');
    aside.className = 'atria-studio-resource-tree';
    aside.dataset.atriaStudioResourceTree = 'true';

    const filter = textInput(documentRef, '', 'Filter project resources');
    filter.placeholder = t('Filter resources');
    aside.append(filter);

    const list = documentRef.createElement('div');
    list.className = 'atria-studio-resource-tree__list';
    aside.append(list);

    function render(filterValue = '') {
        list.replaceChildren();
        const needle = filterValue.trim().toLowerCase();
        for (const [id, label] of STUDIO_VIEWS) {
            if (needle && !label.toLowerCase().includes(needle)) continue;
            const row = button(documentRef, label, () => selectView(id), { active: state.activeView === id });
            row.className = 'atria-studio-resource-tree__item';
            row.dataset.atriaStudioResource = id;
            list.append(row);

            const items = sourceSection(state.source, id);
            if (!Array.isArray(items)) continue;
            items.forEach((item, index) => {
                const name = displayNameFor(item, id);
                if (needle && !name.toLowerCase().includes(needle)) return;
                const child = button(documentRef, name || `${label} ${index + 1}`, () => {
                    state.collectionSelection[id] = index;
                    selectView(id);
                }, { active: state.activeView === id && state.collectionSelection[id] === index });
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
    }

    filter.addEventListener('input', () => render(filter.value));
    render();
    return { root: aside, render };
}

function createMobileNav(documentRef, state, onChange) {
    const nav = documentRef.createElement('nav');
    nav.className = 'atria-studio-mobile-nav';
    nav.dataset.atriaStudioMobileNav = 'true';
    for (const [id, label] of MOBILE_VIEWS) {
        nav.append(button(documentRef, label, () => {
            state.mobileView = id;
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
    const editor = textArea(documentRef, JSON.stringify(value, null, 2), title + ' JSON');
    body.append(editor, actionRow(
        documentRef,
        button(documentRef, 'Review Changes', () => {
            const parsed = JSON.parse(editor.value);
            onStage(parsed);
        }, { primary: true }),
    ));
}

function renderCollectionEditor(documentRef, body, state, view, stageProject) {
    const items = sourceSection(state.source, view) || [];
    const index = Math.min(state.collectionSelection[view] || 0, Math.max(0, items.length - 1));
    state.collectionSelection[view] = index;
    const title = STUDIO_VIEWS.find(item => item[0] === view)?.[1] || view;
    body.append(heading(documentRef, title, 'Structured project resources are edited through project.save Authoring Operations.'));
    if (!items.length) {
        body.append(panel(documentRef, 'empty', 'No project-owned resources', 'Attach from Library, fork an exact revision, or edit project source to create one.'));
        return;
    }

    const chooser = selectInput(documentRef, String(index), items.map((_, itemIndex) => String(itemIndex)), title + ' resource');
    [...chooser.options].forEach((option, optionIndex) => {
        option.textContent = displayNameFor(items[optionIndex], view) || `${title} ${optionIndex + 1}`;
    });
    chooser.addEventListener('change', () => {
        state.collectionSelection[view] = Number(chooser.value);
        state.renderEditor();
    });
    body.append(field(documentRef, title, chooser));

    const editor = textArea(documentRef, JSON.stringify(items[index], null, 2), title + ' resource JSON');
    body.append(editor, actionRow(documentRef, button(documentRef, 'Review Changes', () => {
        const parsed = JSON.parse(editor.value);
        const next = normalizeCollectionPatch(state.source, view, index, parsed);
        stageProject(next, `Update ${title} resource`);
    }, { primary: true })));
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
        validation: null,
        output: [],
        preview: null,
        simulation: null,
        buildReport: null,
        activityTab: 'problems',
        disposed: false,
        renderEditor: () => {},
        aiOpen: false,
    };

    const shell = documentRef.createElement('section');
    shell.className = 'atria-studio-workspace';
    shell.dataset.atriaStudioWorkspace = projectId;
    root.replaceChildren(shell);

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
    const center = documentRef.createElement('main');
    center.className = 'atria-studio-center';
    center.dataset.atriaStudioEditor = 'true';
    const inspector = documentRef.createElement('aside');
    inspector.className = 'atria-studio-inspector';
    inspector.dataset.atriaStudioInspector = 'true';
    const activity = documentRef.createElement('section');
    activity.className = 'atria-studio-activity';
    activity.dataset.atriaStudioActivity = 'true';
    const ai = documentRef.createElement('aside');
    ai.className = 'atria-studio-ai-placeholder';
    ai.dataset.atriaStudioAi = 'placeholder';
    ai.append(
        heading(documentRef, 'AI', 'Project Agent arrives in A8. A7 reserves this product position without creating an AI write path.'),
        panel(documentRef, 'empty', 'Project Agent not active', 'Human Studio authoring remains fully functional without AI.'),
    );

    function resourceTreeSelect(view) {
        state.activeView = view;
        if (view !== 'preview') state.lastEditorView = view;
        state.mobileView = view === 'preview' ? 'preview' : 'editor';
        tree.render();
        renderEditor();
        void renderInspector();
        updateMobile();
    }
    const tree = createResourceTree(documentRef, state, resourceTreeSelect);
    main.append(tree.root, center, inspector);
    shell.append(main, activity, ai);

    const mobileNav = createMobileNav(documentRef, state, updateMobile);
    shell.append(mobileNav);

    function log(kind, message, detail = null) {
        state.output.unshift({
            kind,
            message,
            detail,
            at: Date.now(),
        });
        renderActivity();
    }

    async function refreshProject() {
        const [detail, resources, graph, history] = await Promise.all([
            nativeStudioClient.getProject(projectId),
            nativeStudioClient.queryResources({ projectId }),
            nativeStudioClient.getResourceGraph(),
            nativeStudioClient.history(projectId, 40),
        ]);
        state.source = clone(detail.source);
        state.files = detail.files || [];
        state.revision = detail.revision;
        state.resources = resources || [];
        state.graph = graph;
        state.history = history || [];
        revision.textContent = `Revision ${state.revision.revision.slice(0, 12)}`;
        tree.render();
    }

    const aiController = mountNativeStudioAgent({
        document: documentRef,
        slot: ai,
        projectId,
        getRevision: () => state.revision,
        onLog: log,
        onProjectCommitted: async () => {
            await refreshProject();
            state.pending = null;
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
        const workspace = workspaceFor(operations);
        try {
            const inspected = await nativeStudioClient.inspectWorkspace(projectId, workspace);
            state.pending = { label, workspace, inspected };
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
        renderActivity();
    }

    function stageProject(nextSource, label) {
        return stageOperations([
            projectSaveOperation(projectId, nextSource),
        ], label);
    }

    async function applyPending() {
        if (!state.pending?.workspace || state.pending.conflict) return;
        try {
            const result = await nativeStudioClient.executeWorkspace(projectId, state.pending.workspace);
            state.validation = result.changeSet?.validation || null;
            const applied = result.changeSet?.resultingRevision;
            if (applied) {
                log('success', `ChangeSet ${result.changeSet.changeSetId} committed at ${applied.slice(0, 12)}`, result.changes);
            } else {
                log('error', `ChangeSet ${result.changeSet?.changeSetId || ''} failed validation and was rolled back.`, state.validation);
            }
            state.pending = null;
            await refreshProject();
            renderEditor();
            renderInspector();
        } catch (error) {
            if (error.status === 409) {
                state.pending = { ...state.pending, conflict: error };
                log('conflict', 'ChangeSet conflict: the project advanced. Reload latest before retrying.', error.details);
            } else {
                log('error', error?.message || String(error));
            }
        }
        renderActivity();
    }

    async function runValidation() {
        try {
            state.validation = await nativeStudioClient.validateProject(projectId);
            state.activityTab = 'problems';
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
            state.activeView = 'simulation';
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
            state.activeView = 'build';
            renderEditor();
        } catch (error) {
            log('error', error?.message || String(error));
        }
    }

    async function renderInspector() {
        inspector.replaceChildren(heading(documentRef, 'Inspector', 'Derived Resource Graph references are read-only projections.'));
        let node = state.selectedGraphNode;
        if (!node) {
            const type = viewResourceType(state.activeView);
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
        inspector.append(pre);

        const ref = resourceReferenceForNode(node);
        if (!ref) return;
        try {
            const [references, usedBy] = await Promise.all([
                nativeStudioClient.getResourceReferences(ref),
                nativeStudioClient.getResourceReferences(ref, { reverse: true }),
            ]);
            const refs = documentRef.createElement('div');
            refs.className = 'atria-studio-reference-list';
            const refsTitle = documentRef.createElement('h4');
            refsTitle.textContent = t('References');
            refs.append(refsTitle);
            for (const item of references || []) {
                const row = documentRef.createElement('div');
                row.textContent = item.kind
                    ? `${item.kind} · ${item.to || item.resourceId || ''}`
                    : JSON.stringify(item);
                refs.append(row);
            }
            const used = documentRef.createElement('div');
            used.className = 'atria-studio-reference-list';
            const usedTitle = documentRef.createElement('h4');
            usedTitle.textContent = t('Used By');
            used.append(usedTitle);
            for (const item of usedBy || []) {
                const row = documentRef.createElement('div');
                row.textContent = item.kind
                    ? `${item.kind} · ${item.from || item.resourceId || ''}`
                    : JSON.stringify(item);
                used.append(row);
            }
            inspector.append(refs, used);
        } catch (error) {
            const note = documentRef.createElement('p');
            note.textContent = error?.message || String(error);
            inspector.append(note);
        }
    }

    function renderOverview(body) {
        body.append(heading(documentRef, 'Project Overview', 'Project metadata and package identity remain ProjectStore authority.'));
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
                stageProject(next, 'Update project overview');
            }, { primary: true })),
        );
    }

    function renderExperience(body) {
        const current = experienceFromProject(state.source);
        body.append(heading(documentRef, 'Experience', 'Text / Component / Hybrid / Full is explicit Native project state.'));
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
                stageProject(next, 'Update Native Experience');
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
                stageProject(next, `Update ${title}`);
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
                stageProject(next, `Update ${title}`);
            },
        });
    }

    async function renderUi(body) {
        const experience = experienceFromProject(state.source);
        const componentPath = experienceComponentPath(state.source);
        body.append(heading(documentRef, 'UI Components', 'Design / Structure / Bindings / Source share the A4 Component Model.'));
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
        body.append(heading(documentRef, 'Source', 'Low-level source editing is a fallback Authoring Operation, not a second project authority.'));
        const sources = await nativeStudioClient.listSources(projectId);
        if (!sources.length) {
            body.append(panel(documentRef, 'empty', 'No project sources', 'This project currently contains only structured manifest resources.'));
            return;
        }
        const chooser = selectInput(documentRef, sources[0].path, sources.map(item => item.path), 'Source file');
        const editor = textArea(documentRef, '', 'Source editor');
        async function load() {
            const file = await nativeStudioClient.readSource(projectId, chooser.value);
            editor.value = decodeUtf8(file.content);
        }
        chooser.addEventListener('change', () => void load());
        await load();
        body.append(
            field(documentRef, 'File', chooser),
            editor,
            actionRow(documentRef, button(documentRef, 'Review Source Change', () => (
                stageOperations([
                    sourceWriteOperation(chooser.value, editor.value),
                ], `Write ${chooser.value}`)
            ), { primary: true })),
        );
    }

    async function renderPreview(body) {
        body.append(heading(documentRef, 'Native Preview', 'Preview derives the A4 Runtime Descriptor and never creates Session or Branch persistence.'));
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
        body.append(meta);

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
            body.append(panel(documentRef, 'empty', 'Text Preview', 'Text Experience reuses the Atria-native Conversation / Composer at runtime.'));
        }
    }

    function renderSimulation(body) {
        body.append(heading(documentRef, 'Test / Simulation', 'Simulation uses the existing A1 seam and remains separate from persistent runtime authority.'));
        body.append(actionRow(documentRef, button(documentRef, 'Run Simulation', runSimulation, { primary: true })));
        if (state.simulation) {
            const pre = documentRef.createElement('pre');
            pre.textContent = JSON.stringify(state.simulation, null, 2);
            body.append(pre);
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
            body.append(pre);
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
        else if (state.activeView === 'experience') renderExperience(body);
        else if (['actors', 'entrypoints', 'worlds', 'knowledge'].includes(state.activeView)) {
            renderCollectionEditor(documentRef, body, state, state.activeView, stageProject);
            if (['worlds', 'knowledge'].includes(state.activeView)) renderLibraryRelations(body);
        } else if (state.activeView === 'logic') renderPackageJson(body, 'Game Logic', 'processors', 'Structured logic/processors remain part of project source.');
        else if (state.activeView === 'ui') void renderUi(body);
        else if (state.activeView === 'assets') renderAssets(body);
        else if (state.activeView === 'memory') renderPackageJson(body, 'Memory', 'memory', 'Project memory configuration is structured package source.');
        else if (state.activeView === 'agents') renderPackageJson(body, 'Agents / Orchestration', 'orchestration', 'Project orchestration configuration is edited without invoking A8 Project Agent.');
        else if (state.activeView === 'skills') renderPackageJson(body, 'Skills', 'skills', 'Native project/package Skill declarations use the A5 scope authority.');
        else if (state.activeView === 'plugins') renderNestedRuntimeJson(body, 'Plugins', 'plugins', 'Package-runtime plugins remain declarative and capability-defined.');
        else if (state.activeView === 'presets') {
            renderJsonSection(documentRef, body, {
                title: 'Presets / Processors / Localization / Permissions',
                description: 'Advanced structured project metadata remains inside the same Project source authority.',
                value: {
                    presets: state.source.package.presets || {},
                    processors: state.source.package.processors || {},
                    localization: state.source.package.localization || {},
                    permissions: state.source.package.permissions || [],
                },
                onStage: parsed => {
                    const next = patchProjectSource(state.source, source => {
                        source.package.presets = parsed.presets || {};
                        source.package.processors = parsed.processors || {};
                        source.package.localization = parsed.localization || {};
                        source.package.permissions = parsed.permissions || [];
                    });
                    stageProject(next, 'Update package advanced settings');
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
                'Plugin-defined authoring resource types reuse the A2 Resource Registry and A5 contribution authority.',
            ));
            const matching = state.resources.filter(item => item.resourceType === state.selectedPluginResourceType);
            const pre = documentRef.createElement('pre');
            pre.textContent = JSON.stringify({
                descriptor,
                resources: matching,
            }, null, 2);
            body.append(pre);
        }
    }
    state.renderEditor = renderEditor;

    function renderActivity() {
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
                state.activityTab = id;
                renderActivity();
            }, { active: state.activityTab === id }));
        }
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
                body.append(panel(documentRef, 'error', 'Revision conflict', 'The project advanced. A7 never silently rebases authoring changes.'));
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
                body.append(pre, actionRow(
                    documentRef,
                    button(documentRef, 'Cancel', () => {
                        state.pending = null;
                        renderActivity();
                    }),
                    button(documentRef, 'Apply ChangeSet', applyPending, { primary: true }),
                ));
            }
        } else {
            body.append(panel(documentRef, 'empty', 'No pending ChangeSet', 'Structured edits first enter review; applying runs validation and commits only on success.'));
        }
    }

    function updateMobile() {
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
        button(documentRef, 'Build', () => runBuild({ download: false })),
        button(documentRef, 'AI', () => {
            state.aiOpen = !state.aiOpen;
            ai.classList.toggle('atria-studio-ai-placeholder--open', state.aiOpen);
        }, { active: state.aiOpen }),
    );

    renderEditor();
    renderActivity();
    void renderInspector();
    updateMobile();

    return {
        updateRoute() {},
        dispose() {
            state.disposed = true;
            aiController.dispose();
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
                projectController = await mountProjectStudio(documentRef, root, projectId);
            } else {
                await renderProjectList(documentRef, root, host);
            }
            if (!disposed && token === sequence) slot.replaceChildren(root);
        } catch (error) {
            if (!disposed && token === sequence) {
                slot.replaceChildren(panel(documentRef, 'error', 'Build Projects', error?.message || String(error)));
            }
        }
    }

    void render(route);
    return {
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
