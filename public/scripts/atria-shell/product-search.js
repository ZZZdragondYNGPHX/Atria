import { runtimeRequest } from '../native/runtime-client.js';
import { nativeProductClient } from '../native/product-client.js';

function clean(value) {
    return String(value || '').trim();
}

function safeId(value) {
    return clean(value).replace(/[^a-zA-Z0-9._:-]+/g, '-');
}

function fulfilled(result) {
    return result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [];
}

/**
 * Search is a transient projection of Native authorities. It never owns,
 * caches persistently, or renders foreign-domain content. Every result runs
 * the WorkspaceHost route that owns the selected entity.
 */
export function createProductSearchIndex({ registry, host, productClient = nativeProductClient, loadRuntime = runtimeRequest, loadResources = () => runtimeRequest('/resources') } = {}) {
    if (!registry?.register || !host) throw new Error('Product Search requires registry and WorkspaceHost');

    let disposed = false;
    let revision = 0;
    let resultDisposers = [];

    function clearResults() {
        for (const dispose of resultDisposers.splice(0)) dispose();
    }

    function add(command) {
        resultDisposers.push(registry.register(command));
    }

    async function refresh() {
        const token = ++revision;
        const result = await Promise.allSettled([
            productClient.listWorks(),
            productClient.listWorlds(),
            productClient.listKnowledge(),
            productClient.listProjects(),
            loadRuntime(),
            loadResources(),
        ]);
        if (disposed || token !== revision) return false;

        clearResults();
        const [works, worlds, knowledge, projects] = result.map(fulfilled);

        for (const item of works) {
            const packageId = clean(item?.package?.packageId);
            if (!packageId) continue;
            const title = clean(item?.package?.displayName || item?.manifest?.name || packageId);
            add({
                id: 'resource.work.' + safeId(packageId),
                title,
                description: 'Work · Library',
                group: 'Library',
                keywords: ['work', 'game', 'package', packageId, title],
                run: () => host.openLibraryWork(packageId, title),
            });
        }
        for (const item of worlds) {
            const worldId = clean(item?.world?.worldId);
            if (!worldId) continue;
            const title = clean(item?.world?.displayName || worldId);
            add({
                id: 'resource.world.' + safeId(worldId),
                title,
                description: 'World · Library',
                group: 'Library',
                keywords: ['world', worldId, title],
                run: () => host.openLibraryWorld(worldId, title),
            });
        }
        for (const item of knowledge) {
            const knowledgeBaseId = clean(item?.knowledgeBase?.knowledgeBaseId);
            if (!knowledgeBaseId) continue;
            const title = clean(item?.knowledgeBase?.displayName || knowledgeBaseId);
            add({
                id: 'resource.knowledge.' + safeId(knowledgeBaseId),
                title,
                description: 'Knowledge Base · Library',
                group: 'Library',
                keywords: ['knowledge', 'lore', knowledgeBaseId, title],
                run: () => host.openLibraryKnowledge(knowledgeBaseId, title),
            });
        }
        for (const item of projects) {
            const projectId = clean(item?.projectId || item?.project?.projectId);
            if (!projectId) continue;
            const title = clean(item?.displayName || item?.project?.displayName || projectId);
            add({
                id: 'resource.project.' + safeId(projectId),
                title,
                description: 'Project · Build',
                group: 'Build',
                keywords: ['build', 'project', packageIdForProject(item), projectId, title].filter(Boolean),
                run: () => host.openBuild(projectId, title),
            });
        }
        const runtime = result[4].status === 'fulfilled' ? result[4].value : {};
        for (const [section, key] of Object.entries({ routes: 'runtimeRouteId', models: 'modelProfileId', connections: 'connectionProfileId' })) {
            for (const item of runtime[section] || []) {
                const id = item[key];
                add({ id: 'runtime.' + section + '.' + safeId(id), title: item.displayName,
                    description: section + ' · Runtime', group: 'Runtime', keywords: ['runtime', section, id, item.displayName],
                    run: () => host.openRuntimeSection(section, id) });
            }
        }
        for (const entry of fulfilled(result[5])) {
            const { ref, resource } = entry;
            if (!ref?.revision || !ref.resourceId || !['core.prompt-program', 'core.prompt-module', 'core.generation-profile'].includes(ref.resourceType)) continue;
            const title = clean(resource.displayName || ref.resourceId);
            const key = JSON.stringify(ref, Object.keys(ref).sort());
            add({ id: 'resource.prompt.' + encodeURIComponent(key), title,
                description: ref.resourceType + ' · ' + ref.scope + ' · ' + ref.revision,
                group: 'Library', keywords: ['prompt', 'generation', ref.resourceId, ref.revision, ref.scope, title],
                run: () => host.openLibraryResource(ref, title) });
        }
        return true;
    }

    function packageIdForProject(item) {
        return clean(item?.packageId || item?.project?.packageId);
    }

    void refresh().catch(error => console.warn('[atria-shell] Product Search refresh failed', error));

    return Object.freeze({
        refresh,
        dispose() {
            if (disposed) return;
            disposed = true;
            revision += 1;
            clearResults();
        },
    });
}
