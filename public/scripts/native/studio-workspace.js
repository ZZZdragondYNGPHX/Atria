import {
    createAtriaRuntimeCard,
    createAtriaStatePanel,
} from '../atria-shell/primitives.js';
import { translateShellText } from '../atria-shell/localization.js';
import { nativeProductClient } from './product-client.js';

function panel(documentRef, kind, title, message) {
    return createAtriaStatePanel(documentRef, kind, {
        title: translateShellText(title),
        message: translateShellText(message),
    });
}

function actions(documentRef) {
    const node = documentRef.createElement('div');
    node.className = 'atria-domain-workspace__actions';
    return node;
}

function button(documentRef, label, handler, options = {}) {
    const node = documentRef.createElement('button');
    node.type = 'button';
    node.textContent = translateShellText(label);
    node.disabled = Boolean(options.disabled);
    node.addEventListener('click', handler);
    return node;
}

function formatTime(value) {
    const timestamp = Number(value || 0);
    return timestamp ? new Date(timestamp).toLocaleString() : '—';
}

function dependencyKey(item, idField, revisionField) {
    return `${item[idField]}@${item[revisionField]}`;
}

function createDependencyRow(documentRef, {
    kind,
    id,
    displayName,
    revisions,
    selected,
}) {
    const row = documentRef.createElement('div');
    row.className = 'atria-native-project-dependency';
    row.dataset.atriaDependencyKind = kind;
    row.dataset.atriaDependencyId = id;

    const enabled = documentRef.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = Boolean(selected);

    const label = documentRef.createElement('label');
    label.textContent = displayName;
    label.prepend(enabled);

    const revision = documentRef.createElement('select');
    revision.className = 'text_pole';
    for (const item of revisions) {
        const option = documentRef.createElement('option');
        option.value = item.id;
        option.textContent = `${item.id} · ${formatTime(item.createdAt)}`;
        option.selected = selected?.revisionId === item.id;
        revision.append(option);
    }
    revision.disabled = !enabled.checked;
    enabled.addEventListener('change', () => {
        revision.disabled = !enabled.checked;
    });

    row.append(label, revision);
    return {
        row,
        read() {
            if (!enabled.checked || !revision.value) return null;
            return { id, revisionId: revision.value };
        },
    };
}

async function loadDependencyCatalog() {
    const [worldItems, knowledgeItems] = await Promise.all([
        nativeProductClient.listWorlds(),
        nativeProductClient.listKnowledge(),
    ]);
    const worlds = await Promise.all(worldItems.map(async item => {
        const detail = await nativeProductClient.getWorld(item.world.worldId);
        return {
            world: item.world,
            revisions: detail.revisions,
        };
    }));
    const knowledge = await Promise.all(knowledgeItems.map(async item => {
        const detail = await nativeProductClient.getKnowledge(item.knowledgeBase.knowledgeBaseId);
        return {
            knowledgeBase: item.knowledgeBase,
            revisions: detail.revisions,
            bindings: detail.bindings.map(binding => binding.binding),
        };
    }));
    return { worlds, knowledge };
}

async function renderProjectDetail(documentRef, root, route, host) {
    const projectId = String(route?.child?.id || '').slice('project:'.length);
    const [{ source, files }, catalog] = await Promise.all([
        nativeProductClient.getProject(projectId),
        loadDependencyCatalog(),
    ]);
    const hero = createAtriaRuntimeCard(documentRef, {
        title: source.project.displayName,
        description: source.package.description || source.package.name,
        status: `Package ${source.package.version} · ${files.length} source file(s)`,
        tone: 'success',
    });
    hero.dataset.atriaStudioProjectDetail = projectId;

    const heroActions = actions(documentRef);
    heroActions.append(button(documentRef, 'Delete Project', async () => {
        if (typeof globalThis.confirm === 'function' && !globalThis.confirm('Delete this Native Studio Project source tree?')) return;
        await nativeProductClient.deleteProject(projectId);
        host.openStudio();
    }));
    hero.append(heroActions);
    root.append(hero);

    const dependencySection = documentRef.createElement('section');
    dependencySection.className = 'atria-native-project-dependencies';
    dependencySection.dataset.atriaProjectDependencies = 'true';

    const title = documentRef.createElement('h3');
    title.textContent = translateShellText('World / Knowledge dependencies');
    const note = documentRef.createElement('p');
    note.textContent = translateShellText('Dependencies pin exact immutable Library revisions. Building never follows Library latest implicitly.');
    dependencySection.append(title, note);

    const selectedWorlds = new Map((source.dependencies.worlds || []).map(item => [
        item.worldId,
        { revisionId: item.worldRevisionId },
    ]));
    const worldRows = [];
    const worldsTitle = documentRef.createElement('h4');
    worldsTitle.textContent = translateShellText('Worlds');
    dependencySection.append(worldsTitle);
    for (const item of catalog.worlds) {
        const control = createDependencyRow(documentRef, {
            kind: 'world',
            id: item.world.worldId,
            displayName: item.world.displayName,
            revisions: item.revisions.map(revision => ({
                id: revision.worldRevisionId,
                createdAt: revision.createdAt,
            })),
            selected: selectedWorlds.get(item.world.worldId) || null,
        });
        worldRows.push(control);
        dependencySection.append(control.row);
    }
    if (!worldRows.length) dependencySection.append(panel(documentRef, 'empty', 'No Library Worlds', 'Create or import a Native World first.'));

    const selectedKnowledge = new Map((source.dependencies.knowledge || []).map(item => [
        item.knowledgeBaseId,
        { revisionId: item.knowledgeRevisionId },
    ]));
    const knowledgeRows = [];
    const knowledgeTitle = documentRef.createElement('h4');
    knowledgeTitle.textContent = translateShellText('Knowledge Bases');
    dependencySection.append(knowledgeTitle);
    for (const item of catalog.knowledge) {
        const control = createDependencyRow(documentRef, {
            kind: 'knowledge',
            id: item.knowledgeBase.knowledgeBaseId,
            displayName: item.knowledgeBase.displayName,
            revisions: item.revisions.map(revision => ({
                id: revision.knowledgeRevisionId,
                createdAt: revision.createdAt,
            })),
            selected: selectedKnowledge.get(item.knowledgeBase.knowledgeBaseId) || null,
        });
        knowledgeRows.push(control);
        dependencySection.append(control.row);
    }
    if (!knowledgeRows.length) dependencySection.append(panel(documentRef, 'empty', 'No Library Knowledge', 'Create or import a Native Knowledge Base first.'));

    const bindingTitle = documentRef.createElement('h4');
    bindingTitle.textContent = translateShellText('Knowledge Bindings');
    dependencySection.append(bindingTitle);
    const selectedBindings = new Set(source.dependencies.knowledgeBindings || []);
    const bindingRows = [];
    for (const item of catalog.knowledge) {
        for (const binding of item.bindings) {
            const row = documentRef.createElement('label');
            row.className = 'atria-native-project-binding';
            row.dataset.atriaKnowledgeBindingId = binding.knowledgeBindingId;
            const checkbox = documentRef.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = selectedBindings.has(binding.knowledgeBindingId);
            row.append(
                checkbox,
                documentRef.createTextNode(
                    ` ${item.knowledgeBase.displayName} · ${binding.mode} · ${binding.knowledgeBindingId}`,
                ),
            );
            bindingRows.push({ binding, checkbox });
            dependencySection.append(row);
        }
    }
    if (!bindingRows.length) dependencySection.append(panel(documentRef, 'empty', 'No Library Bindings', 'Bindings can be authored independently from Knowledge entries.'));

    const status = documentRef.createElement('div');
    status.className = 'atria-native-project-dependencies__status';
    const save = button(documentRef, 'Save Dependencies', async () => {
        save.disabled = true;
        status.textContent = '';
        try {
            const worlds = worldRows.map(item => item.read()).filter(Boolean).map(item => ({
                worldId: item.id,
                worldRevisionId: item.revisionId,
            }));
            const knowledge = knowledgeRows.map(item => item.read()).filter(Boolean).map(item => ({
                knowledgeBaseId: item.id,
                knowledgeRevisionId: item.revisionId,
            }));
            const knowledgeBindings = bindingRows
                .filter(item => item.checkbox.checked)
                .map(item => item.binding.knowledgeBindingId);
            await nativeProductClient.updateProjectDependencies(projectId, {
                worlds,
                knowledge,
                knowledgeBindings,
            });
            status.textContent = translateShellText('Dependencies saved.');
        } catch (error) {
            status.textContent = error?.message || String(error);
        } finally {
            save.disabled = false;
        }
    });
    const saveActions = actions(documentRef);
    saveActions.append(save);
    dependencySection.append(saveActions, status);
    root.append(dependencySection);

    const sourceInfo = documentRef.createElement('details');
    sourceInfo.className = 'atria-native-project-source';
    const summary = documentRef.createElement('summary');
    summary.textContent = translateShellText('Project source manifest');
    const pre = documentRef.createElement('pre');
    pre.textContent = JSON.stringify({
        project: source.project,
        package: {
            name: source.package.name,
            version: source.package.version,
            capabilities: source.package.capabilities || [],
            permissions: source.package.permissions || [],
        },
        localWorlds: source.worlds.map(item => dependencyKey(
            item.revision,
            'worldId',
            'worldRevisionId',
        )),
        localKnowledge: source.knowledge.map(item => dependencyKey(
            item.revision,
            'knowledgeBaseId',
            'knowledgeRevisionId',
        )),
        files,
    }, null, 2);
    sourceInfo.append(summary, pre);
    root.append(sourceInfo);
}

async function renderProjectList(documentRef, root, host) {
    const projects = await nativeProductClient.listProjects();
    root.dataset.atriaStudioProjects = 'true';
    if (!projects.length) {
        root.append(panel(
            documentRef,
            'empty',
            'No Native Studio Projects',
            'Native authoring projects are stored by opaque projectId under ProjectStore.',
        ));
        return;
    }
    const grid = documentRef.createElement('div');
    grid.className = 'atria-library-games__grid';
    for (const project of projects) {
        const card = createAtriaRuntimeCard(documentRef, {
            title: project.displayName,
            description: `Package source ${project.packageId}`,
            status: `Updated ${formatTime(project.updatedAt || project.createdAt)}`,
        });
        card.dataset.atriaStudioProjectId = project.projectId;
        const cardActions = actions(documentRef);
        cardActions.append(button(documentRef, 'Open Project', () => (
            host.openStudio(project.projectId, project.displayName)
        )));
        card.append(cardActions);
        grid.append(card);
    }
    root.append(grid);
}

export function mountNativeStudioWorkspace({
    document: documentRef,
    slot,
    route,
    host,
}) {
    let disposed = false;
    let sequence = 0;

    async function render(nextRoute = route) {
        const token = ++sequence;
        slot.replaceChildren(panel(documentRef, 'loading', 'Studio Projects', 'Loading ProjectStore…'));
        const root = documentRef.createElement('section');
        root.className = 'atria-native-studio';
        root.dataset.atriaNativeStudio = 'true';
        try {
            if (String(nextRoute?.child?.id || '').startsWith('project:')) {
                await renderProjectDetail(documentRef, root, nextRoute, host);
            } else {
                await renderProjectList(documentRef, root, host);
            }
            if (!disposed && token === sequence) slot.replaceChildren(root);
        } catch (error) {
            if (!disposed && token === sequence) {
                slot.replaceChildren(panel(documentRef, 'error', 'Studio Projects', error?.message || String(error)));
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
        },
    };
}
