import { confirmAtriaDraftLeave, observeAtriaDrafts } from '../atria-shell/workspace-leave-guard.js';
import { formatShellText as formatProductText } from '../atria-shell/localization.js';
import { referenceRemediation } from './library-ui.js';
import { mountSourceEditor } from './source-editor.js';
import { mountAssetEditor } from './asset-editor.js';
import { mountProjectDeletion } from './project-lifecycle.js';
import { mountSkillDeclarationsEditor } from './skill-declarations-editor.js';
import { renderResourceReferenceRows } from './resource-reference-rows.js';
import { mountKnowledgeEditor } from './knowledge-editor.js';
import { mountStudioWorldsEditor, patchStudioWorlds } from './studio-worlds-editor.js';
import { validateKnowledgeEditorValue } from './knowledge-contracts.js';
import { mountStudioValueEditor } from './studio-value-editor.js';
import { mountStudioActorsEditor, patchStudioActors } from './studio-actors-editor.js';
import { mountStudioEntryPointsEditor, patchStudioEntryPoints } from './studio-entrypoints-editor.js';
import { createAtriaShellEnvironment } from '../atria-shell/environment.js';
import { mountStudioPromptTools } from './prompt-authoring.js';
import {
    createAtriaStatePanel,
} from '../atria-shell/primitives.js';
import { translateShellText } from '../atria-shell/localization.js';
import { mountStudioPreviewUi } from './studio-preview-ui.js';
import { presentationNegotiation } from './host-capabilities.js';
import {
    createHumanOrigin,
    createAuthoringOperation,
    createStudioNativeId,
    createStudioWorkspace,
    experienceFromProject,
    patchProjectSource,
    projectSaveOperation,
    resourceReferenceForNode,
    sourceWriteOperation,
} from './studio-authoring.js';
import { nativeStudioClient } from './studio-client.js';
import { mountNativeStudioAgent } from './studio-agent.js';
import { mountFrontendEditor } from './studio-frontend-editor.js';
import { assertFrontendExperience, resourcePath } from '../../shared/native-frontend-contract.js';

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
            node.parentElement?.append(alert); alert.focus(); await referenceRemediation(documentRef, node.parentElement, error);
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
    if (view === 'entrypoints') return item.entryPointId;
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
    else if (view === 'worlds') next.worlds[index] = value;
    else if (view === 'knowledge') next.knowledge[index] = value;
    else if (view === 'assets') next.assetFiles[index] = value;
    return next;
}

function projectListCard(documentRef, record, host, onDeleted) {
    const project = record.project || record;
    const row = documentRef.createElement('article'); row.className = 'atri-studio-project-row';
    row.dataset.atriaBuildProjectId = project.projectId;
    const info = documentRef.createElement('div');
    const title = documentRef.createElement('h3'); title.textContent = project.displayName;
    const meta = documentRef.createElement('p'); meta.textContent = t('Updated') + ' ' + formatTime(project.updatedAt || project.createdAt);
    info.append(title, meta);
    row.append(info, button(documentRef, 'Open Project', () => host.openBuild(project.projectId, project.displayName), { primary: true }));
    mountProjectDeletion({ document: documentRef, root: row, project, revision: record.revision?.revision, onDeleted: () => onDeleted(project.projectId) });
    return row;
}

async function renderProjectList(documentRef, root, host) {
    let projects = await nativeStudioClient.listProjects({ summary: true });
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
        for (const record of found) list.append(projectListCard(documentRef, record, host, async projectId => {
            projects = projects.filter(item => (item.project || item).projectId !== projectId); fill();
            try { await host.refreshSearch?.(); } catch { /* Search retries when next opened. */ }
            search.focus();
        }));
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
            const exactEntrySelection = id === 'entrypoints' && !state.entryPointCollection && new Set(items.map(item => item.entryPointId)).size === items.length;
            const exactWorldSelection = id === 'worlds' && !state.worldCollection && new Set(items.map(item => item.world?.worldId)).size === items.length && !items.some(item => state.source.dependencies.worlds.some(ref => ref.worldId === item.world?.worldId));
            items.forEach((item, index) => {
                const name = displayNameFor(item, id);
                if (needle && !sectionMatch && !name.toLowerCase().includes(needle)) return;
                const child = button(documentRef, name || `${label} ${index + 1}`, () => {
                    selectView(id, index);
                }, { active: state.activeView === id && (id === 'entrypoints' ? exactEntrySelection && item.entryPointId === state.entryPointSelection : id === 'worlds' ? exactWorldSelection && item.world?.worldId === state.worldSelection : state.collectionSelection[id] === index) });
                child.textContent = name || `${label} ${index + 1}`;
                child.className = 'atria-studio-resource-tree__item atria-studio-resource-tree__item--child';
                child.dataset.atriaStudioResourceItem = id + ':' + index;
                if (id === 'entrypoints') { child.dataset.atriaStudioEntryPointId = item.entryPointId; child.title = item.entryPointId; }
                if (id === 'worlds') { child.dataset.atriaStudioWorldId = item.world?.worldId; child.title = item.world?.worldId || ''; }
                list.append(child);
            });
        }
        const pluginDescriptors = (state.registry?.descriptors || [])
            .filter(descriptor => descriptor.provider?.kind === 'plugin');
        for (const descriptor of pluginDescriptors) {
            if (needle && !descriptor.displayName.toLowerCase().includes(needle)
                && !descriptor.resourceType.toLowerCase().includes(needle)) continue;
            const row = button(documentRef, formatProductText('Plugin · ${0}', [descriptor.displayName]), () => {
                selectView('plugin-resource', undefined, descriptor.resourceType);
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
            else next[view] = parsed;
            return stageProject(next, formatProductText('Update ${0} collection', [title]));
        } });
        return;
    }

    const chooser = selectInput(documentRef, String(index), items.map((_, itemIndex) => String(itemIndex)), formatProductText('${0} resource', [title]));
    [...chooser.options].forEach((option, optionIndex) => {
        option.textContent = displayNameFor(items[optionIndex], view) || `${title} ${optionIndex + 1}`;
    });
    chooser.addEventListener('change', () => {
        if (!state.confirmEditorLeave()) { chooser.value = String(index); return; }
        state.collectionSelection[view] = Number(chooser.value);
        state.selectedGraphNode = null;
        state.renderEditor();
        void state.renderInspector();
    });
    body.append(field(documentRef, title, chooser));

    const mountEditor = view === 'knowledge' ? mountKnowledgeEditor : mountStudioValueEditor;
    mountEditor({ document: documentRef, root: body, value: items[index], label: title + ' resource JSON',
        projectSource: state.source, library: state.library,
        onReview: parsed => stageProject(normalizeCollectionPatch(state.source, view, index, parsed), formatProductText('Update ${0} resource', [title])),
    });
}

function renderActorsEditor(documentRef, body, state, stageProject) {
    const workspaceRoot = body.closest('[data-atria-studio-workspace]');
    const actors = state.source.package.actors || [];
    const duplicateIds = new Set(actors.map(actor => actor.actorId)).size !== actors.length;
    if (!actors.some(actor => actor.actorId === state.actorSelection)) state.actorSelection = actors[0]?.actorId;
    const collection = state.actorCollection || !actors.length || duplicateIds;
    body.append(heading(documentRef, 'Actors', 'Edit project Actors, then review changes before applying. Existing sessions keep their exact package version.'));
    body.append(actionRow(documentRef,
        button(documentRef, 'Actor fields', () => {
            if (!state.confirmEditorLeave()) return;
            state.actorCollection = false; state.renderEditor();
            workspaceRoot.querySelector('[aria-label="Actors resource"]')?.focus();
        }, { active: !collection, disabled: !actors.length || duplicateIds || !collection }),
        button(documentRef, 'Collection Source', () => {
            if (!state.confirmEditorLeave()) return;
            state.actorCollection = true; state.renderEditor();
            workspaceRoot.querySelector('[aria-label="Actors collection JSON"]')?.focus();
        }, { active: collection, disabled: collection }),
    ));
    if (!actors.length) body.append(panel(documentRef, 'empty', 'No Actors', 'Use collection Source to define project Actors. An empty collection is valid.'));
    if (duplicateIds) body.append(panel(documentRef, 'error', 'Duplicate Actor IDs', 'Actor identity is ambiguous. Repair duplicate IDs in collection Source.'));
    const actor = actors.find(item => item.actorId === state.actorSelection);
    if (!collection) {
        const chooser = selectInput(documentRef, state.actorSelection, actors.map(item => item.actorId), 'Actors resource');
        [...chooser.options].forEach((option, index) => { option.textContent = actors[index].displayName + ' · ' + actors[index].actorId; });
        chooser.addEventListener('change', () => {
            if (!state.confirmEditorLeave()) { chooser.value = state.actorSelection; return; }
            state.actorSelection = chooser.value;
            state.collectionSelection.actors = actors.findIndex(item => item.actorId === chooser.value);
            state.selectedGraphNode = null;
            state.renderEditor(); void state.renderInspector();
            workspaceRoot.querySelector('[aria-label="Actors resource"]')?.focus();
        });
        body.append(field(documentRef, 'Actor', chooser));
        state.collectionSelection.actors = actors.findIndex(item => item.actorId === state.actorSelection);
    }
    state.actorEditor = mountStudioActorsEditor({ document: documentRef, root: body, value: collection ? actors : actor, projectSource: state.source, collection,
        onReview: parsed => stageProject(patchStudioActors(state.source, actor?.actorId, parsed, collection), formatProductText(collection ? 'Update ${0} collection' : 'Update ${0} resource', ['Actors'])),
    });
}

function renderEntryPointsEditor(documentRef, body, state, stageProject) {
    const workspaceRoot = body.closest('[data-atria-studio-workspace]');
    const entries = state.source.package.entryPoints || [];
    const duplicateIds = new Set(entries.map(entry => entry.entryPointId)).size !== entries.length;
    if (!entries.some(entry => entry.entryPointId === state.entryPointSelection)) state.entryPointSelection = entries[0]?.entryPointId;
    const collection = state.entryPointCollection || !entries.length || duplicateIds;
    body.append(heading(documentRef, 'EntryPoints', 'Edit project starting points, then review changes before applying. Existing Sessions and Saves keep their exact package.'));
    appendFirstEntryTarget(documentRef, body, state.source);
    body.append(actionRow(documentRef,
        button(documentRef, 'EntryPoint fields', () => {
            if (!state.confirmEditorLeave()) return;
            state.entryPointCollection = false; state.renderEditor();
            workspaceRoot.querySelector('[aria-label="EntryPoints resource"]')?.focus();
        }, { active: !collection, disabled: !entries.length || duplicateIds || !collection }),
        button(documentRef, 'Collection Source', () => {
            if (!state.confirmEditorLeave()) return;
            state.entryPointCollection = true; state.renderEditor();
            workspaceRoot.querySelector('[aria-label="EntryPoints collection JSON"]')?.focus();
        }, { active: collection, disabled: collection }),
    ));
    if (!entries.length) body.append(panel(documentRef, 'empty', 'No EntryPoints', 'Repair collection Source with at least one EntryPoint before review.'));
    if (duplicateIds) body.append(panel(documentRef, 'error', 'Duplicate EntryPoint IDs', 'EntryPoint identity is ambiguous. Repair duplicate IDs in collection Source.'));
    const entry = entries.find(item => item.entryPointId === state.entryPointSelection);
    if (!collection) {
        const chooser = selectInput(documentRef, state.entryPointSelection, entries.map(item => item.entryPointId), 'EntryPoints resource');
        [...chooser.options].forEach((option, index) => { option.textContent = entries[index].displayName + ' · ' + entries[index].entryPointId; });
        chooser.addEventListener('change', () => {
            if (!state.confirmEditorLeave()) { chooser.value = state.entryPointSelection; return; }
            state.entryPointSelection = chooser.value;
            state.collectionSelection.entrypoints = entries.findIndex(item => item.entryPointId === chooser.value);
            state.selectedGraphNode = null;
            state.renderEditor(); void state.renderInspector();
            workspaceRoot.querySelector('[aria-label="EntryPoints resource"]')?.focus();
        });
        body.append(field(documentRef, 'EntryPoint', chooser));
        state.collectionSelection.entrypoints = entries.findIndex(item => item.entryPointId === state.entryPointSelection);
    }
    state.entryPointEditor = mountStudioEntryPointsEditor({ document: documentRef, root: body, value: collection ? entries : entry, projectSource: state.source, collection,
        onReview: async parsed => {
            const accepted = await stageProject(patchStudioEntryPoints(state.source, entry?.entryPointId, parsed, collection), formatProductText(collection ? 'Update ${0} collection' : 'Update ${0} resource', ['EntryPoints']));
            if (accepted) state.pending.entryPointSelection = collection ? state.entryPointSelection : parsed.entryPointId;
        },
    });
}

function renderWorldsEditor(documentRef, body, state, stageProject) {
    const workspaceRoot = body.closest('[data-atria-studio-workspace]');
    const worlds = state.source.worlds || [];
    const ambiguous = new Set(worlds.map(item => item.world?.worldId)).size !== worlds.length || worlds.some(item => state.source.dependencies.worlds.some(ref => ref.worldId === item.world?.worldId));
    if (!worlds.some(item => item.world?.worldId === state.worldSelection)) state.worldSelection = worlds[0]?.world?.worldId;
    const collection = state.worldCollection || !worlds.length || ambiguous;
    body.append(heading(documentRef, 'Worlds', 'Edit project Worlds, then review changes before applying. Library revisions and existing Sessions keep their versions.'));
    body.append(actionRow(documentRef,
        button(documentRef, 'World fields', () => {
            if (!state.confirmEditorLeave()) return;
            state.worldCollection = false; state.renderEditor();
            workspaceRoot.querySelector('[aria-label="Worlds resource"]')?.focus();
        }, { active: !collection, disabled: !worlds.length || ambiguous || !collection }),
        button(documentRef, 'Collection Source', () => {
            if (!state.confirmEditorLeave()) return;
            state.worldCollection = true; state.renderEditor();
            workspaceRoot.querySelector('[aria-label="Worlds collection JSON"]')?.focus();
        }, { active: collection, disabled: collection }),
    ));
    if (!worlds.length) body.append(panel(documentRef, 'empty', 'No project-owned resources', 'Use Source below to define this collection, or attach an available Library resource.'));
    if (ambiguous) body.append(panel(documentRef, 'error', 'Ambiguous World IDs', 'Duplicate or attached World ID. Repair collection Source before review.'));
    const world = worlds.find(item => item.world?.worldId === state.worldSelection);
    if (!collection) {
        const chooser = selectInput(documentRef, state.worldSelection, worlds.map(item => item.world.worldId), 'Worlds resource');
        [...chooser.options].forEach((option, index) => { option.textContent = worlds[index].world.displayName + ' · ' + worlds[index].world.worldId; });
        chooser.addEventListener('change', () => {
            if (!state.confirmEditorLeave()) { chooser.value = state.worldSelection; return; }
            state.worldSelection = chooser.value; state.selectedGraphNode = null;
            state.renderEditor(); void state.renderInspector();
            workspaceRoot.querySelector('[aria-label="Worlds resource"]')?.focus();
        });
        body.append(field(documentRef, 'World', chooser));
        state.collectionSelection.worlds = worlds.findIndex(item => item.world.worldId === state.worldSelection);
    }
    const sequence = state.editorSequence;
    state.worldEditor = mountStudioWorldsEditor({ document: documentRef, root: body, value: collection ? worlds : world, projectSource: state.source, collection, library: state.supportFailures.some(item => item.source === 'library') ? null : state.library,
        isCurrent: () => !state.disposed && state.editorSequence === sequence,
        onReview: async parsed => {
            const accepted = await stageProject(patchStudioWorlds(state.source, world?.world.worldId, parsed, collection), formatProductText(collection ? 'Update ${0} collection' : 'Update ${0} resource', ['Worlds']));
            if (accepted) state.pending.worldSelection = collection ? state.worldSelection : parsed.world.worldId;
        },
    });
}

function appendFirstEntryTarget(doc, parent, source) {
    const entry = entryPoint(source);
    const note = doc.createElement('p'); note.className = 'atri-studio-action-target';
    note.textContent = formatProductText('Preview / Experience / UI use the first committed EntryPoint: ${0}. Reordering the collection changes this default; selecting an editor does not.', [entry ? entry.displayName + ' · ' + entry.entryPointId : t('Not specified')]);
    parent.append(note);
}

async function loadProjectSupport(projectId) {
    const keys = ['registry', 'graph', 'resources', 'library', 'history'];
    const results = await Promise.allSettled([
        nativeStudioClient.getResourceRegistry(), nativeStudioClient.getResourceGraph(),
        nativeStudioClient.queryResources({ projectId }), nativeStudioClient.listLibraryResources(), nativeStudioClient.history(projectId, 40),
    ]);
    const support = { registry: { descriptors: [] }, graph: { nodes: [], edges: [] }, resources: [], library: [], history: [], failures: [] };
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') support[keys[index]] = result.value;
        else support.failures.push({ source: keys[index], message: result.reason.message });
    });
    return support;
}
async function loadProjectState(projectId) {
    const [detail, support] = await Promise.all([nativeStudioClient.getProject(projectId), loadProjectSupport(projectId)]);
    return { detail, ...support };
}

async function mountProjectStudio(documentRef, root, projectId, host) {
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
        history: loaded.history || [], supportFailures: loaded.failures,
        activeView: 'overview',
        lastEditorView: 'overview',
        mobileView: loaded.failures.length ? 'more' : 'editor',
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
        renderEditor: () => {}, editorSequence: 0, refreshRequired: null,
        aiOpen: false, inspectorOpen: false, activityOpen: Boolean(loaded.failures.length), inspecting: false, applying: false,
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
    revision.textContent = formatProductText('Revision ${0}', [state.revision.revision.slice(0, 12)]);
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

    const drafts = observeAtriaDrafts({ document: documentRef, root: shell });
    state.confirmEditorLeave = () => !state.applying && !state.inspecting && confirmAtriaDraftLeave(documentRef, center);
    function resourceTreeSelect(view, index, pluginType) {
        if (!state.confirmEditorLeave()) return false;
        if (index !== undefined) state.collectionSelection[view] = index;
        if (view === 'actors' && index !== undefined) { state.actorSelection = state.source.package.actors[index]?.actorId; state.actorCollection = false; }
        if (view === 'entrypoints' && index !== undefined) { state.entryPointSelection = state.source.package.entryPoints[index]?.entryPointId; state.entryPointCollection = false; }
        if (view === 'worlds' && index !== undefined) { state.worldSelection = state.source.worlds[index]?.world?.worldId; state.worldCollection = false; }
        if (pluginType) state.selectedPluginResourceType = pluginType;
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
        state.supportFailures = state.supportFailures.filter(failure => ['registry', 'library'].includes(failure.source));
        state.refreshRequired = null;
        title.textContent = state.source.project.displayName;
        revision.textContent = formatProductText('Revision ${0}', [state.revision.revision.slice(0, 12)]);
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
            if (state.disposed) return;
            state.agentReview = task?.status === 'review' ? task : null;
            if (!task) { renderActivity(); return; }
            if (task.validation) state.validation = task.validation;
            if (task.preview) state.preview = task.preview;
            if (task.simulation) state.simulation = task.simulation;
            if (task.status === 'review') state.activityTab = 'changes';
            else if (task.validation?.status === 'failed') state.activityTab = 'problems';
            renderActivity();
            // Task evidence must not replace a human editing surface.
        },
        beforeCommit: () => !state.pending && state.confirmEditorLeave(),
        onProjectCommitted: async task => {
            if (state.disposed) return;
            state.pending = null;
            state.agentReview = null;
            state.refreshRequired = task;
            center.dispatchEvent(new documentRef.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
            try { await refreshProject(); } catch (error) {
                center.inert = true;
                log('error', t('Saved, but the list could not refresh. Reload to see the saved version.'), error.message);
                return;
            }
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
        if (state.disposed || state.refreshRequired || state.inspecting || state.applying) return false;
        state.inspecting = true; renderActivity(); updateMobile();
        const workspace = workspaceFor(operations);
        let accepted = false;
        try {
            const inspected = await nativeStudioClient.inspectWorkspace(projectId, workspace);
            if (state.disposed) return false;
            state.pending = { label, workspace, inspected };
            state.activityOpen = true; if (environment.get().mode === 'compact') state.mobileView = 'more';
            accepted = true;
            state.activityTab = 'changes';
            log('review', formatProductText('ChangeSet review ready: ${0}', [label]), inspected.changes);
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
        renderActivity(); updateMobile();
        try {
            const result = await nativeStudioClient.executeWorkspace(projectId, state.pending.workspace);
            state.validation = result.changeSet?.validation || null;
            const applied = result.changeSet?.resultingRevision;
            if (applied) {
                log('success', formatProductText('ChangeSet ${0} committed at ${1}', [result.changeSet.changeSetId, applied.slice(0, 12)]), result.changes);
                state.activityOpen = false;
                if (environment.get().mode === 'compact') state.mobileView = 'editor';
            } else {
                log('error', formatProductText('ChangeSet ${0} failed validation and was rolled back.', [result.changeSet?.changeSetId || '']), state.validation);
                return;
            }
            const forked = state.pending.workspace.operations.find(operation => operation.operationType === 'resource.fork');
            if (state.pending.entryPointSelection) state.entryPointSelection = state.pending.entryPointSelection;
            if (state.pending.worldSelection) state.worldSelection = state.pending.worldSelection;
            state.pending = null;
            state.refreshRequired = result.changeSet;
            center.dispatchEvent(new documentRef.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
            await refreshProject();
            if (forked) {
                const id = forked.input.derivativeResourceId;
                state.activeView = ({ 'core.world': 'worlds', 'core.knowledge': 'knowledge', 'core.asset': 'assets' })[forked.target.resourceType] || state.activeView;
                const items = sourceSection(state.source, state.activeView) || [];
                const index = items.findIndex(item => viewResourceId(item, state.activeView) === id);
                if (index >= 0) state.collectionSelection[state.activeView] = index;
                if (state.activeView === 'worlds' && index >= 0) { state.worldSelection = id; state.worldCollection = false; }
            }
            renderEditor();
            renderInspector();
            const heading = center.querySelector('h3'); if (heading) { heading.tabIndex = -1; heading.focus(); }
        } catch (error) {
            if (state.refreshRequired) {
                log('error', t('Saved, but the list could not refresh. Reload to see the saved version.'), error.message);
            } else if (error.status === 409) {
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
            log(state.validation.status === 'passed' ? 'success' : 'error', formatProductText('Validation ${0}.', [t(state.validation.status)]), state.validation.diagnostics);
        } catch (error) {
            log('error', error?.message || String(error));
        }
    }

    async function runPreview() {
        if (!state.confirmEditorLeave() || state.refreshRequired) return;
        const editorToken = state.editorSequence, baseRevision = state.revision.revision;
        try {
            const ep = entryPoint(state.source);
            const result = await nativeStudioClient.preview(projectId, {
                baseRevision: state.revision.revision,
                ...(ep?.entryPointId ? { entryPointId: ep.entryPointId } : {}),
            });
            if (state.disposed) { void nativeStudioClient.closePreview(result.preview.previewId).catch(() => {}); return; }
            if (state.preview) void nativeStudioClient.closePreview(state.preview.previewId).catch(() => {});
            state.preview = result.preview;
            if (editorToken !== state.editorSequence || baseRevision !== state.revision.revision) return;
            state.activeView = 'preview';
            state.mobileView = 'preview';
            log('success', formatProductText('Native Preview ${0} created without Session/Branch persistence.', [result.preview.previewId]), result.preview.descriptor);
            renderEditor();
            updateMobile();
        } catch (error) {
            log('error', error?.message || String(error));
        }
    }

    async function runSimulation() {
        if (!state.confirmEditorLeave() || state.refreshRequired) return;
        const editorToken = state.editorSequence, baseRevision = state.revision.revision;
        try {
            const result = await nativeStudioClient.simulate(projectId, {
                baseRevision,
                scenario: JSON.parse(state.scenarioDraft ?? '{"schemaVersion":1,"steps":[]}'),
            });
            if (state.disposed || editorToken !== state.editorSequence || baseRevision !== state.revision.revision) return;
            state.simulation = result;
            state.activeView = 'simulation'; state.mobileView = 'editor'; updateMobile();
            log(state.simulation.status === 'completed' ? 'success' : 'info', formatProductText('Simulation ${0}.', [t(state.simulation.status)]), state.simulation);
            renderEditor();
        } catch (error) {
            log('error', error?.message || String(error));
        }
    }

    async function runBuild({ download = false } = {}) {
        if (!state.confirmEditorLeave() || state.refreshRequired) return;
        const editorToken = state.editorSequence, baseRevision = state.revision.revision;
        try {
            const report = await nativeStudioClient.preflight(projectId, baseRevision);
            if (state.disposed || editorToken !== state.editorSequence || baseRevision !== state.revision.revision) return;
            state.buildReport = report;
            log('success', 'Build preflight completed.', report.preflight);
            if (download) {
                const built = await nativeStudioClient.build(projectId, baseRevision);
                if (state.disposed || editorToken !== state.editorSequence || baseRevision !== state.revision.revision) return;
                const bytes = Uint8Array.from(globalThis.atob(built.data), char => char.charCodeAt(0));
                const url = URL.createObjectURL(new Blob([bytes], { type: built.mediaType || 'application/octet-stream' }));
                const link = documentRef.createElement('a');
                link.href = url;
                link.download = built.fileName || (projectId + '.atria');
                link.click();
                URL.revokeObjectURL(url);
                log('success', formatProductText('Built ${0} from exact revision ${1}.', [link.download, state.revision.revision.slice(0, 12)]));
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
        if (state.activeView === 'entrypoints') {
            const note = documentRef.createElement('p'); note.textContent = t('EntryPoints belong to project source and its revision. Inspector shows limited project references; there is no independent EntryPoint resource or complete Used By graph.'); inspector.append(note);
        }
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
            const openNode = item => {
                const owner = item.projectId || (String(item.scope).startsWith('project/') ? item.scope.split('/')[1] : null);
                if (owner && owner !== projectId) return false;
                if (!state.confirmEditorLeave()) return true;
                const view = ({ 'core.project': 'overview', 'core.actor': 'actors', 'core.world': 'worlds', 'core.knowledge': 'knowledge', 'core.knowledge-entry': 'knowledge', 'core.knowledge-binding': 'knowledge', 'core.asset': 'assets' })[item.resourceType] || 'prompt-authoring';
                state.activeView = view; state.selectedGraphNode = item; state.mobileView = 'editor';
                const items = sourceSection(state.source, view) || [];
                const index = items.findIndex(value => viewResourceId(value, view) === (item.metadata?.knowledgeBaseId || item.resourceId));
                if (index >= 0) state.collectionSelection[view] = index;
                if (view === 'actors' && index >= 0) { state.actorSelection = items[index].actorId; state.actorCollection = false; }
                if (view === 'worlds' && index >= 0) { state.worldSelection = items[index].world.worldId; state.worldCollection = false; }
                renderEditor(); updateMobile(); return true;
            };
            const manageNode = item => { if (!state.confirmEditorLeave()) return; state.highlightLibraryReference = resourceReferenceForNode(item); state.activeView = item.resourceType === 'core.world' ? 'worlds' : item.resourceType === 'core.asset' ? 'assets' : 'knowledge'; state.mobileView = 'editor'; renderEditor(); updateMobile(); };
            renderResourceReferenceRows({ document: documentRef, root: refs, references, host, onOpen: openNode, onManage: manageNode });
            const used = documentRef.createElement('div');
            used.className = 'atria-studio-reference-list';
            const usedTitle = documentRef.createElement('h4');
            usedTitle.textContent = t('Used By');
            used.append(usedTitle);
            renderResourceReferenceRows({ document: documentRef, root: used, references: usedBy, host, onOpen: openNode });
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
        mountProjectDeletion({ document: documentRef, root: body, project: state.source.project, revision: state.revision.revision,
            onDeleted: async () => {
                try { await host.refreshSearch?.(); } catch { /* Search retries when next opened. */ }
                host.openBuild();
            },
        });
    }

    function renderExperience(body) {
        const current = experienceFromProject(state.source);
        body.append(heading(documentRef, 'Experience', 'Choose how readers experience this work. Component, hybrid and full modes use your project interface.'));
        appendFirstEntryTarget(documentRef, body, state.source);
        const mode = selectInput(documentRef, current.mode || 'text', ['text', 'component', 'hybrid', 'full'], 'Experience mode');
        const frontend = textInput(documentRef, current.frontend?.source || 'frontend/index.json', 'Frontend source index');
        const features = documentRef.createElement('textarea'); features.className = 'text_pole'; features.value = JSON.stringify(current.features || [], null, 2); features.setAttribute('aria-label', translateShellText('Runtime features'));
        body.append(
            field(documentRef, 'Mode', mode),
            field(documentRef, 'Frontend source index', frontend),
            field(documentRef, 'Runtime features', features),
            actionRow(documentRef, button(documentRef, 'Review Changes', async () => {
                const experience = assertFrontendExperience(mode.value === 'text' ? { mode: 'text' } : {
                    mode: mode.value, frontend: { kind: 'native', version: 3, source: frontend.value }, features: JSON.parse(features.value),
                }, { authoring: true });
                const next = patchProjectSource(state.source, source => {
                    const target = source.package.entryPoints[0];
                    target.runtime = { ...(target.runtime || {}) };
                    target.runtime.experience = experience;
                });
                const operations = [projectSaveOperation(projectId, next)];
                if (mode.value !== 'text') {
                    const files = await nativeStudioClient.listSources(projectId);
                    if (!files.some(file => file.path === frontend.value)) {
                        const base = frontend.value.includes('/') ? frontend.value.slice(0, frontend.value.lastIndexOf('/') + 1) : '';
                        const componentPath = resourcePath(base + 'Main.aui');
                        if (files.some(file => file.path === componentPath)) throw new Error('Main.aui already exists. Create a source index for it in Source before changing Experience.');
                        operations.push(sourceWriteOperation(frontend.value, JSON.stringify({ format: 'atria-frontend-source', version: 3, primaryView: 'main',
                            views: [{ id: 'main', root: 'Main', surface: mode.value === 'component' ? 'chat.footer' : 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] }, null, 2)));
                        operations.push(sourceWriteOperation(componentPath, '<template>\n  <main node-id="root"><h1 node-id="title">New Experience</h1></main>\n</template>\n'));
                    }
                }
                return stageOperations(operations, 'Update Native Experience');
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
                return stageProject(next, formatProductText('Update ${0}', [title]));
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
                return stageProject(next, formatProductText('Update ${0}', [title]));
            },
        });
    }

    async function renderUi(body) {
        appendFirstEntryTarget(documentRef, body, state.source);
        const experience = experienceFromProject(state.source);
        if (experience.frontend?.version === 3) {
            body.append(heading(documentRef, 'Native Frontend', 'Browse source identities, edit native components and inspect compiler diagnostics before Build.'));
            state.structuredEditor?.dispose();
            const entry = state.source.package.entryPoints?.[0];
            const mounted = await mountFrontendEditor({ document: documentRef, root: body, projectId,
                ownerId: entry?.runtime?.experience?.frontend ? entry.entryPointId : 'package', baseRevision: state.revision.revision, stageOperations });
            if (state.disposed || !body.isConnected) mounted.dispose();
            else state.structuredEditor = mounted;
            return;
        }
        body.append(panel(documentRef, 'empty', 'Text Experience', 'Switch Experience to Component, Hybrid or Full before authoring Structured UI.'));
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
            if (item.resourceType !== viewResourceType(state.activeView)) continue;
            const row = documentRef.createElement('div');
            row.className = 'atria-studio-library-relations__row';
            const info = documentRef.createElement('div');
            info.textContent = `${item.displayName} · ${item.resourceType} · ${item.currentRevision}`;
            const selected = state.highlightLibraryReference?.resourceType === item.resourceType && state.highlightLibraryReference?.resourceId === item.resourceId ? state.highlightLibraryReference.revision : item.currentRevision;
            const revisionSelect = selectInput(documentRef, selected, item.revisions || [], 'Exact Library revision');
            if (selected && !item.revisions?.includes(selected)) { const missing = documentRef.createElement('option'); missing.value = selected; missing.textContent = selected; revisionSelect.append(missing); revisionSelect.value = selected; }
            if (selected && !item.revisions?.includes(selected)) { const note = documentRef.createElement('p'); note.textContent = t('The requested exact revision is unavailable. References never follow latest.'); row.append(note); }
            const prepare = async (operationType, input, label) => {
                if (!item.revisions?.includes(revisionSelect.value)) throw new Error(t('The requested exact revision is unavailable. References never follow latest.'));
                const operation = createAuthoringOperation({ operationType, target: { resourceType: item.resourceType, resourceId: item.resourceId }, input });
                const prepared = await nativeStudioClient.prepareOperation(projectId, operation);
                return stageOperations([prepared], label);
            };
            const attach = button(documentRef, 'Attach', () => prepare('resource.attach', { revision: revisionSelect.value }, formatProductText('Attach ${0}', [item.displayName])));
            const fork = button(documentRef, 'Fork', () => prepare('resource.fork', { revision: revisionSelect.value }, formatProductText('Fork ${0}', [item.displayName])));
            const fromRevision = attachedRevision(item);
            const update = ['core.world', 'core.knowledge'].includes(item.resourceType)
                ? button(documentRef, 'Update', () => prepare('resource.update', { fromRevision, toRevision: revisionSelect.value }, formatProductText('Update ${0}', [item.displayName])), { disabled: !fromRevision }) : null;
            const detach = button(documentRef, 'Review detach', async () => {
                const references = await nativeStudioClient.getResourceReferences({ scope: 'library', resourceType: item.resourceType, resourceId: item.resourceId, revision: fromRevision }, { reverse: true });
                if (state.disposed || !row.isConnected) return;
                const consumers = references.filter(({ node }) => node?.scope === 'project/' + projectId && node.resourceType !== 'core.project');
                const direct = item.resourceType === 'core.world'
                    ? state.source.package.entryPoints.filter(entry => entry.worldIds.includes(item.resourceId)).map(entry => ({ node: { scope: 'project/' + projectId, projectId, resourceType: 'core.entrypoint', resourceId: entry.entryPointId, displayName: entry.displayName }, owner: state.source.project.displayName }))
                    : item.resourceType === 'core.asset' ? state.source.worlds.filter(world => world.revision.assetIds.includes(item.resourceId)).map(world => ({ node: { scope: 'project/' + projectId, projectId, resourceType: 'core.world', resourceId: world.world.worldId, revision: world.revision.worldRevisionId, displayName: world.world.displayName }, owner: state.source.project.displayName })) : [];
                for (const reference of direct) if (!consumers.some(item => item.node.resourceType === reference.node.resourceType && item.node.resourceId === reference.node.resourceId)) consumers.push(reference);
                if (consumers.length) {
                    row.querySelector('[data-atria-detach-blockers]')?.remove();
                    const blockers = documentRef.createElement('div'); blockers.dataset.atriaDetachBlockers = 'true'; row.append(blockers);
                    renderResourceReferenceRows({ document: documentRef, root: blockers, references: consumers, host, onOpen: node => {
                        if (!state.confirmEditorLeave()) return true;
                        state.activeView = ({ 'core.entrypoint': 'entrypoints', 'core.world': 'worlds', 'core.knowledge': 'knowledge', 'core.knowledge-binding': 'knowledge', 'core.asset': 'assets' })[node.resourceType] || 'source';
                        state.collectionSelection[state.activeView] = (sourceSection(state.source, state.activeView) || []).findIndex(value => viewResourceId(value, state.activeView) === node.resourceId);
                        if (state.activeView === 'entrypoints') { state.entryPointSelection = node.resourceId; state.entryPointCollection = false; }
                        if (state.activeView === 'worlds') { state.worldSelection = node.resourceId; state.worldCollection = false; }
                        state.mobileView = 'editor'; renderEditor(); updateMobile(); return true;
                    } });
                    return;
                }
                const next = clone(state.source);
                const [collection, identity] = item.resourceType === 'core.world' ? ['worlds', 'worldId'] : item.resourceType === 'core.knowledge' ? ['knowledge', 'knowledgeBaseId'] : ['assets', 'assetId'];
                next.dependencies[collection] = next.dependencies[collection].filter(ref => ref[identity] !== item.resourceId);
                await stageProject(next, formatProductText('Detach ${0}', [item.displayName]));
            }, { disabled: !fromRevision });
            const references = button(documentRef, 'Used By', async () => {
                const rows = documentRef.createElement('div'); row.querySelector('[data-atria-used-by]')?.remove(); rows.dataset.atriaUsedBy = 'true'; row.append(rows);
                const refs = await nativeStudioClient.getResourceReferences({ scope: 'library', resourceType: item.resourceType, resourceId: item.resourceId, revision: revisionSelect.value }, { reverse: true });
                renderResourceReferenceRows({ document: documentRef, root: rows, references: refs, host });
            });
            if (fromRevision) info.textContent += formatProductText(' · attached ${0}', [fromRevision]);
            row.append(info, revisionSelect, attach, fork, ...(update ? [update] : []), detach, references);
            list.append(row);
        }
        if (!list.childElementCount) list.append(panel(documentRef, 'empty', 'No matching results.', 'No resources are available in this category.'));
        body.append(list);
    }

    function renderAssets(body) {
        body.append(heading(documentRef, 'Assets', 'Project-owned media files are written through one Workspace/ChangeSet with the manifest update.'));
        mountAssetEditor({ document: documentRef, root: body, source: state.source, projectId, stageOperations, host });
    }

    async function renderSource(body) {
        body.append(heading(documentRef, 'Source', 'Edit project files directly, then review the proposed changes before applying.'));
        await mountSourceEditor({ document: documentRef, root: body, projectId, stageOperations,
        });
    }

    async function renderPreview(body) {
        body.append(heading(documentRef, 'Native Preview', 'Explore the committed project interface without creating a play session.'));
        appendFirstEntryTarget(documentRef, body, state.source);
        if (!state.preview) {
            body.append(panel(documentRef, 'empty', 'No active preview', 'Run Preview from the Studio toolbar.'));
            return;
        }
        const meta = documentRef.createElement('pre');
        meta.textContent = JSON.stringify({
            previewId: state.preview.previewId,
            entryPointId: state.preview.entryPointId,
            experience: state.preview.experience,
            packageVersionId: state.preview.packageVersionId,
            persisted: state.preview.persisted,
        }, null, 2);
        body.append(technicalDetails(documentRef, meta.textContent, 'Preview details'));
        for (const item of presentationNegotiation(state.preview.descriptor?.experienceContract?.presentationRuntime, documentRef, documentRef.defaultView)) {
            const row = documentRef.createElement('p'); row.textContent = `${item.id} · ${t(item.status)}`; body.append(row);
        }

        const previewId = state.preview.previewId;
        if (state.preview.experience?.mode !== 'text') {
            try {
                const exact = await nativeStudioClient.getPreviewUi(previewId);
                if (state.disposed || state.preview?.previewId !== previewId || !body.isConnected) return;
                if (!exact.model) return;
                const canvas = documentRef.createElement('div');
                canvas.className = 'atria-studio-preview-canvas';
                body.append(canvas);
                state.previewMount?.dispose();
                const mounted = await mountStudioPreviewUi(documentRef, canvas, exact.model, exact.experience.mode, undefined,
                    { entry: exact.experience.frontend?.entry, files: exact.compiledFiles, bridgeProjections: exact.bridgeProjections });
                if (state.disposed || state.preview?.previewId !== previewId || !canvas.isConnected) { mounted.dispose(); return; }
                state.previewMount = mounted;
            } catch (error) {
                body.append(panel(documentRef, 'error', 'Preview render failed', error?.message || String(error)));
            }
        } else {
            body.append(panel(documentRef, 'empty', 'Text Preview', 'This project uses the conversation interface during Play.'));
        }
    }

    function renderSimulation(body) {
        body.append(heading(documentRef, 'Test / Simulation', 'Check the committed project without changing your play sessions.'));
        const label = documentRef.createElement('label'); label.textContent = t('Scenario fixture');
        const fixture = documentRef.createElement('textarea'); fixture.className = 'text_pole atria-studio-editor__textarea';
        fixture.value = state.scenarioDraft ?? '{\n  "schemaVersion": 1,\n  "steps": []\n}';
        fixture.addEventListener('input', () => { state.scenarioDraft = fixture.value; }); label.append(fixture); body.append(label);
        const target = documentRef.createElement('p'); target.className = 'atri-studio-action-target'; body.append(target);
        const updateTarget = () => {
            try {
                const scenario = JSON.parse(fixture.value);
                target.textContent = formatProductText('Simulation uses scenario.entryPointId when specified, otherwise the first committed EntryPoint. Current target: ${0}', [scenario.entryPointId ?? entryPoint(state.source)?.entryPointId ?? t('Not specified')]);
            } catch { target.textContent = t('Invalid scenario JSON. Repair it before running Simulation.'); }
        };
        fixture.addEventListener('input', updateTarget); updateTarget();
        body.append(actionRow(documentRef, button(documentRef, 'Load scenario fixture', async () => {
            const file = await nativeStudioClient.readSource(projectId, 'scenarios/main.json');
            if (state.disposed) return;
            state.scenarioDraft = decodeUtf8(file.content); renderEditor();
        }), button(documentRef, 'Stage scenario fixture', () => {
            const value = JSON.parse(fixture.value);
            return stageOperations([sourceWriteOperation('scenarios/main.json', JSON.stringify(value, null, 2))], 'Update scenario fixture');
        })));
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
        state.actorEditor = null;
        state.entryPointEditor = null;
        state.worldEditor?.dispose?.(); state.worldEditor = null;
        state.structuredEditor?.dispose(); state.structuredEditor = null;
        state.previewMount?.dispose(); state.previewMount = null;
        if (state.disposed) return;
        state.editorSequence++;
        center.inert = Boolean(state.refreshRequired);
        center.replaceChildren();
        const body = documentRef.createElement('section');
        body.className = 'atria-studio-editor-surface';
        body.dataset.atriaStudioView = state.activeView;
        center.append(body);
        if (['worlds', 'knowledge', 'assets'].includes(state.activeView)) {
            const tabs = documentRef.createElement('nav'); tabs.className = 'atria-domain-workspace__tabs';
            tabs.setAttribute('aria-label', t('Resource editor'));
            const relations = documentRef.createElement('section'); relations.dataset.atriaStudioReferences = 'true';
            renderLibraryRelations(relations); center.prepend(tabs); center.append(relations);
            const show = reference => {
                body.hidden = reference; relations.hidden = !reference;
                for (const [index, control] of [...tabs.children].entries()) { control.setAttribute('aria-current', reference === Boolean(index) ? 'page' : 'false'); control.classList.toggle('is-selected', reference === Boolean(index)); }
            };
            tabs.append(button(documentRef, 'Editor', () => show(false)), button(documentRef, 'Library references', () => show(true)));
            show(Boolean(state.highlightLibraryReference)); state.highlightLibraryReference = null;
        }

        if (state.activeView === 'overview') renderOverview(body);
        else if (['prompt-authoring', 'runtime-design'].includes(state.activeView)) void mountStudioPromptTools({ document: documentRef, body, state, stageProject, host, runtimeDesign: state.activeView === 'runtime-design' });
        else if (state.activeView === 'experience') renderExperience(body);
        else if (state.activeView === 'actors') renderActorsEditor(documentRef, body, state, stageProject);
        else if (state.activeView === 'entrypoints') { renderEntryPointsEditor(documentRef, body, state, stageProject); tree.render(); } else if (state.activeView === 'worlds') { renderWorldsEditor(documentRef, body, state, stageProject); tree.render(); } else if (state.activeView === 'knowledge') {
            renderCollectionEditor(documentRef, body, state, state.activeView, stageProject);
        } else if (state.activeView === 'logic') renderPackageJson(body, 'Game Logic', 'processors', 'Structured logic/processors remain part of project source.');
        else if (state.activeView === 'ui') void renderUi(body);
        else if (state.activeView === 'assets') renderAssets(body);
        else if (state.activeView === 'memory') renderPackageJson(body, 'Memory', 'memory', 'Project memory configuration is structured package source.');
        else if (state.activeView === 'agents') renderPackageJson(body, 'Agents / Orchestration', 'orchestration', 'Configure orchestration for this project. These settings do not run the Project Agent.');
        else if (state.activeView === 'skills') {
            body.append(heading(documentRef, 'Skills', 'Manage the Skills declared by this project.'));
            mountSkillDeclarationsEditor({ document: documentRef, root: body, value: state.source.package.skills ?? [], projectId,
                onReview: declarations => stageProject(patchProjectSource(state.source, source => { source.package.skills = declarations; }), 'Update Skills'),
            });
        } else if (state.activeView === 'plugins') renderNestedRuntimeJson(body, 'Plugins', 'plugins', 'Package-runtime plugins remain declarative and capability-defined.');
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
        shell.dataset.atriaDraftDirty = String(Boolean(state.pending || state.agentReview || state.inspecting || state.applying));
        center.inert = Boolean(state.refreshRequired || state.applying || state.inspecting);
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
        if (state.supportFailures.length) {
            for (const failure of state.supportFailures) body.append(panel(documentRef, 'error', 'Some project resources could not load.', failure.source + ': ' + failure.message));
            body.append(button(documentRef, 'Retry loading', async () => {
                const support = await loadProjectSupport(projectId); if (state.disposed) return;
                for (const key of ['registry', 'graph', 'resources', 'library', 'history']) {
                    if (!support.failures.some(item => item.source === key)) state[key] = support[key];
                }
                state.supportFailures = support.failures; tree.render(); renderActivity(); void renderInspector();
                const relations = center.querySelector('[data-atria-studio-references]');
                if (relations) { relations.replaceChildren(); renderLibraryRelations(relations); }
            }));
        }
        if (state.refreshRequired) {
            body.append(panel(documentRef, 'info', 'Saved', 'Saved, but the list could not refresh. Reload to see the saved version.'));
            body.append(button(documentRef, 'Reload Latest', async () => {
                await refreshProject(); renderEditor(); renderActivity(); void renderInspector(); updateMobile();
            }));
        }

        if (state.activityTab === 'problems') {
            const diagnostics = state.validation?.diagnostics || [];
            if (!diagnostics.length) body.append(panel(documentRef, 'empty', 'No diagnostics', 'Run Validate or apply a ChangeSet to refresh diagnostics.'));
            for (const diagnostic of diagnostics) {
                const row = documentRef.createElement('div');
                row.className = 'atria-studio-diagnostic';
                row.dataset.severity = diagnostic.severity;
                row.textContent = `${t(diagnostic.severity)} · ${diagnostic.code} · ${t(diagnostic.message)}`;
                body.append(row);
            }
        } else if (state.activityTab === 'output') {
            if (!state.output.length) body.append(panel(documentRef, 'empty', 'No output', 'Studio actions and build/preview results appear here.'));
            for (const item of state.output.slice(0, 100)) {
                const row = documentRef.createElement('details');
                const summary = documentRef.createElement('summary');
                summary.textContent = `${formatTime(item.at)} · ${t(item.kind)} · ${t(item.message)}`;
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
                        log('diff', formatProductText('Diff for ${0}', [item.fullHash.slice(0, 12)]), diff.diff);
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
                const draftEditor = state.activeView === 'actors' ? state.actorEditor : state.activeView === 'entrypoints' ? state.entryPointEditor : state.activeView === 'worlds' ? state.worldEditor : null;
                if (draftEditor) {
                    const entryPoints = state.activeView === 'entrypoints';
                    const worlds = state.activeView === 'worlds';
                    body.append(button(documentRef, worlds ? 'Copy Worlds draft' : entryPoints ? 'Copy EntryPoints draft' : 'Copy Actors draft', async () => {
                        let source = body.querySelector('[data-atria-studio-draft-copy]');
                        if (!source) {
                            source = documentRef.createElement('textarea'); source.readOnly = true; source.className = 'atria-studio-editor__textarea';
                            source.dataset.atriaStudioDraftCopy = 'true';
                            if (worlds) source.dataset.atriaWorldsDraftCopy = 'true'; else if (entryPoints) source.dataset.atriaEntryPointsDraftCopy = 'true'; else source.dataset.atriaActorsDraftCopy = 'true';
                            source.setAttribute('aria-label', t(worlds ? 'World draft Source' : entryPoints ? 'EntryPoint draft Source' : 'Actor draft Source'));
                            const hint = documentRef.createElement('p'); hint.textContent = t('Copy this Source before discarding the draft and reloading.');
                            body.append(hint, source);
                        }
                        source.value = draftEditor.getSource(); source.focus(); source.select();
                        try { await documentRef.defaultView.navigator.clipboard?.writeText(source.value); } catch { /* The selected Source remains available for manual copy. */ }
                    }));
                }
                body.append(actionRow(documentRef, button(documentRef, 'Reload Latest', async () => {
                    if (['actors', 'entrypoints', 'worlds'].includes(state.activeView) && !state.confirmEditorLeave()) return;
                    await refreshProject();
                    state.pending = null;
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
            title.textContent = t('Project Agent Review');
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
        center.inert = Boolean(state.refreshRequired || state.applying || state.inspecting || environment.get().mode === 'medium' && (state.inspectorOpen || state.aiOpen));
        for (const item of topActions.children) { if (item.textContent === t('Inspector')) item.setAttribute('aria-expanded', String(state.inspectorOpen)); if (item.textContent === t('AI')) item.setAttribute('aria-expanded', String(state.aiOpen)); }
        shell.dataset.activityOpen = String(state.activityOpen); shell.dataset.inspectorOpen = String(state.inspectorOpen); shell.dataset.aiOpen = String(state.aiOpen);
        for (const [index, control] of [...mobileNav.querySelectorAll('button')].entries()) { control.dataset.active = String(MOBILE_VIEWS[index][0] === state.mobileView); control.setAttribute('aria-current', MOBILE_VIEWS[index][0] === state.mobileView ? 'page' : 'false'); }
        shell.dataset.atriaStudioMobileView = state.mobileView;
        if (state.mobileView === 'preview' && state.activeView !== 'preview') {
            if (!state.confirmEditorLeave()) { state.mobileView = 'editor'; shell.dataset.atriaStudioMobileView = 'editor'; return; }
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
            drafts.dispose();
            state.structuredEditor?.dispose();
            state.previewMount?.dispose();
            if (state.preview) void nativeStudioClient.closePreview(state.preview.previewId).catch(() => {});
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
                const mounted = await mountProjectStudio(documentRef, root, projectId, host);
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
