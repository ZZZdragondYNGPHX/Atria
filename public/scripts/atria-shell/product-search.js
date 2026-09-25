import { translateShellText as tl } from './localization.js';
import { runtimeRequest } from '../native/runtime-client.js';
import { nativeProductClient } from '../native/product-client.js';

function clean(value) {
    return String(value || '').trim();
}

function safeId(value) {
    return clean(value).replace(/[^a-zA-Z0-9._:-]+/g, '-');
}

export const PRODUCT_SEARCH_DOMAINS = Object.freeze(['Works', 'Worlds', 'Knowledge Bases', 'Projects', 'Runtime', 'Prompt resources', 'Sessions', 'SavePoints', 'Knowledge entries', 'Skills', 'Orchestration']);

function fulfilled(result) {
    return result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [];
}

/**
 * Search is a transient projection of Native authorities. It never owns,
 * caches persistently, or renders foreign-domain content. Every result runs
 * the WorkspaceHost route that owns the selected entity.
 */
export function createProductSearchIndex({ registry, host, productClient = nativeProductClient, loadRuntime = runtimeRequest, loadResources = () => runtimeRequest('/resources'),
    loadSkills = () => globalThis.Atria.getContext().skills.list({ scope: 'all' }),
    loadOrchestration = () => {
        const settings = globalThis.Atria.getContext().capabilitySettings.orchestrator;
        if (!settings?.agentWorkspace) throw new Error('Orchestration is not ready');
        return settings.agentWorkspace.presets;
    },
}  = {}) {
    if (!registry?.register || !host) throw new Error('Product Search requires registry and WorkspaceHost');

    let disposed = false;
    let revision = 0;
    let resultDisposers = [];

    function clearResults() {
        for (const dispose of resultDisposers.splice(0)) dispose();
    }

    function add(command) {
        resultDisposers.push(registry.register({ ...command, literalTitle: true }));
    }

    async function refresh() {
        const token = ++revision;
        const failures = [];
        registry.setSearchStatus?.({ loading: true, domains: PRODUCT_SEARCH_DOMAINS, failures: [], retry: refresh });
        const sessions = Promise.resolve().then(() => productClient.listSessions());
        const knowledge = Promise.resolve().then(() => productClient.listKnowledge());
        async function children(items, load, domain) {
            const results = await Promise.allSettled(items.map(item => Promise.resolve().then(() => load(item))));
            return results.flatMap((entry, index) => {
                if (entry.status === 'fulfilled') return entry.value;
                failures.push({ domain, owner: items[index].sessionId || items[index].knowledgeBase?.knowledgeBaseId, message: String(entry.reason?.message || entry.reason) });
                return [];
            });
        }
        const sources = [
            () => productClient.listWorks(), () => productClient.listWorlds(), () => knowledge,
            () => productClient.listProjects(), loadRuntime, loadResources, () => sessions,
            async () => children(await sessions, async session => {
                const detail = await productClient.getSession(session.sessionId);
                return (detail.saves || []).map(save => ({ ...save, sessionTitle: session.displayTitle, sessionId: session.sessionId }));
            }, 'SavePoints'),
            async () => children(await knowledge, async item => {
                const base = item.knowledgeBase;
                if (!base.currentRevisionId) return [];
                const detail = await productClient.getKnowledge(base.knowledgeBaseId, base.currentRevisionId);
                return (detail.entries || []).map(entry => ({ ...entry, knowledgeBaseId: base.knowledgeBaseId, revisionId: base.currentRevisionId }));
            }, 'Knowledge entries'),
            loadSkills, loadOrchestration,
        ];
        const result = await Promise.allSettled(sources.map(load => Promise.resolve().then(load)));
        if (disposed || token !== revision) return false;

        clearResults();
        const [works, worlds, knowledgeBases, projects] = result.map(fulfilled);

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
        for (const item of knowledgeBases) {
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
        for (const [section, key] of Object.entries({ routes: 'runtimeRouteId', models: 'modelProfileId', connections: 'connectionProfileId', retrieval: 'retrievalProfileId' })) {
            for (const item of runtime[section] || []) {
                const id = item[key];
                add({ id: 'runtime.' + section + '.' + safeId(id), title: item.displayName,
                    description: tl({ routes: 'Routes', models: 'Models', connections: 'Connections', retrieval: 'Retrieval' }[section]) + ' · ' + tl('Runtime'), group: 'Runtime', keywords: ['runtime', section, id, item.displayName],
                    run: () => host.openRuntimeSection(section, id) });
            }
        }
        for (const entry of fulfilled(result[5])) {
            const { ref, resource } = entry;
            if (!ref?.revision || !ref.resourceId || !['core.prompt-program', 'core.prompt-module', 'core.generation-profile'].includes(ref.resourceType)) continue;
            const title = clean(resource.displayName || ref.resourceId);
            const key = JSON.stringify(ref, Object.keys(ref).sort());
            add({ id: 'resource.prompt.' + encodeURIComponent(key), title,
                description: tl({ 'core.prompt-program': 'Prompt Program', 'core.prompt-module': 'Prompt Module', 'core.generation-profile': 'Generation Profile' }[ref.resourceType]) + ' · ' + tl({ library: 'Library', project: 'Project', package: 'Package' }[ref.scope] || ref.scope) + ' · ' + ref.revision,
                group: 'Library', keywords: ['prompt', 'generation', ref.resourceId, ref.revision, ref.scope, title],
                run: () => host.openLibraryResource(ref, title) });
        }
        for (const item of fulfilled(result[6])) {
            const title = clean(item.displayTitle || item.sessionId);
            add({ id: 'session.' + encodeURIComponent(item.sessionId), title, description: 'Session · Play', group: 'Play', keywords: ['session', item.sessionId],
                run: () => host.openSession(item.sessionId) });
        }
        for (const item of fulfilled(result[7])) {
            const title = clean(item.displayName || item.kind || item.saveId);
            add({ id: 'save.' + encodeURIComponent(JSON.stringify([item.sessionId, item.saveId])), title, description: item.sessionTitle, literalDescription: true, group: 'Play', keywords: ['save', 'savepoint', item.saveId, item.sessionId],
                run: () => host.openSession(item.sessionId, { revisionId: item.revisionId }) });
        }
        for (const item of fulfilled(result[8])) {
            const title = clean(item.metadata?.title || item.knowledgeEntryId);
            add({ id: 'entry.' + encodeURIComponent(JSON.stringify([item.knowledgeBaseId, item.revisionId, item.knowledgeEntryId])), title, description: 'Knowledge entry', group: 'Library', keywords: ['knowledge', item.knowledgeEntryId, item.content],
                run: () => host.openKnowledgeEntry(item.knowledgeBaseId, item.revisionId, item.knowledgeEntryId, title) });
        }
        for (const item of fulfilled(result[9])) {
            add({ id: 'skill.' + encodeURIComponent(JSON.stringify([item.scope, item.name])), title: item.name, description: item.description, literalDescription: true, group: 'Library', keywords: ['skill', item.name],
                run: () => host.openSkill(item.scope, item.name) });
        }
        for (const item of fulfilled(result[10])) {
            add({ id: 'orchestration.' + encodeURIComponent(item.id), title: item.name, description: 'Orchestration', group: 'Agents', keywords: ['orchestration', item.mode, item.id],
                run: () => host.openOrchestration(item.id, item.name) });
        }
        result.forEach((entry, index) => {
            if (entry.status === 'rejected') failures.push({ domain: PRODUCT_SEARCH_DOMAINS[index], message: String(entry.reason?.message || entry.reason) });
        });
        registry.setSearchStatus?.({ loading: false, domains: PRODUCT_SEARCH_DOMAINS, failures, retry: refresh });
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
            registry.setSearchStatus?.(null);
        },
    });
}
