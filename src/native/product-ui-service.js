import { ConflictError, NotFoundError } from '../storage/errors.js';
import { createNativeId } from './identity.js';

function byUpdatedDesc(left, right) {
    return Number(right?.updatedAt || right?.createdAt || 0) - Number(left?.updatedAt || left?.createdAt || 0);
}

function requireText(value, field) {
    const text = String(value || '').trim();
    if (!text) throw new TypeError(field + ' is required');
    return text;
}

function decodeArchive(value, field) {
    if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
        throw new TypeError(field + ' must be base64');
    }
    return Buffer.from(value, 'base64');
}

function minimalManifest(manifest) {
    if (!manifest) return null;
    return Object.freeze({
        packageId: manifest.packageId,
        packageVersionId: manifest.packageVersionId,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? '',
        author: manifest.author ?? '',
        capabilities: manifest.capabilities ?? [],
        permissions: manifest.permissions ?? [],
        entryPoints: manifest.entryPoints ?? [],
    });
}

/**
 * N9 product-facing orchestration over the N0-N8 Native authorities.
 * This class owns no persistence. It composes the existing repositories,
 * SessionCore, PackageInstaller, NativeSaveSystem, and ProjectStore.
 */
export class NativeProductUiService {
    constructor({
        packageRepo,
        worldRepo,
        knowledgeRepo,
        sessionRepo,
        savePointRepo,
        packageInstaller,
        saveSystem,
        sessionCore,
        projectStore,
    }) {
        for (const [name, value] of Object.entries({
            packageRepo,
            worldRepo,
            knowledgeRepo,
            sessionRepo,
            savePointRepo,
            packageInstaller,
            saveSystem,
            sessionCore,
            projectStore,
        })) {
            if (!value) throw new TypeError('NativeProductUiService requires ' + name);
        }
        this.packages = packageRepo;
        this.worlds = worldRepo;
        this.knowledge = knowledgeRepo;
        this.sessions = sessionRepo;
        this.saves = savePointRepo;
        this.installer = packageInstaller;
        this.saveSystem = saveSystem;
        this.core = sessionCore;
        this.projects = projectStore;
    }

    async _sessionDependency(handle, session) {
        const version = await this.packages.getVersion(handle, session.packageId, session.packageVersionId);
        const required = {
            packageId: session.packageId,
            packageVersionId: session.packageVersionId,
            packageVersion: session.packageVersion,
            packageContentHash: session.packageContentHash,
            entryPointId: session.entryPointId,
        };
        if (!version) {
            return Object.freeze({ status: 'missing', code: 'native_session_package_missing', required });
        }
        let opened;
        try {
            opened = await this.installer.open(handle, session.packageId, session.packageVersionId);
        } catch (error) {
            return Object.freeze({
                status: 'invalid',
                code: error?.code || 'native_session_package_invalid',
                required,
            });
        }
        if (!opened) return Object.freeze({ status: 'missing', code: 'native_session_package_missing', required });
        const exact = (
            opened.packageVersion.version === session.packageVersion
            && opened.packageVersion.packageContentHash === session.packageContentHash
            && opened.manifest.entryPoints.some(item => item.entryPointId === session.entryPointId)
        );
        return Object.freeze({
            status: exact ? 'ready' : 'mismatch',
            code: exact ? null : 'native_session_package_mismatch',
            required,
            installed: exact ? minimalManifest(opened.manifest) : null,
        });
    }

    async _sessionSummary(handle, session) {
        const [savePoints, dependency] = await Promise.all([
            this.saves.list(handle, session.sessionId),
            this._sessionDependency(handle, session),
        ]);
        return Object.freeze({ ...session, saveCount: savePoints.length, dependency });
    }

    async listWorks(handle) {
        const [records, sessions] = await Promise.all([
            this.packages.list(handle),
            this.sessions.list(handle),
        ]);
        return Promise.all(records.map(async record => {
            const versions = await this.packages.listVersions(handle, record.packageId);
            const current = record.currentVersionId
                ? versions.find(item => item.packageVersionId === record.currentVersionId) ?? null
                : null;
            let manifest = null;
            let status = current ? 'ready' : 'empty';
            if (current) {
                try {
                    manifest = minimalManifest((await this.installer.open(
                        handle,
                        record.packageId,
                        current.packageVersionId,
                    ))?.manifest);
                    if (!manifest) status = 'missing';
                } catch {
                    status = 'invalid';
                }
            }
            const workSessions = sessions.filter(item => item.packageId === record.packageId).sort(byUpdatedDesc);
            return Object.freeze({
                package: record,
                currentVersion: current,
                manifest,
                status,
                sessionCount: workSessions.length,
                recentSession: workSessions[0] ?? null,
            });
        }));
    }

    async getWork(handle, packageId) {
        const record = await this.packages.get(handle, requireText(packageId, 'packageId'));
        if (!record) throw new NotFoundError('native package', { packageId });
        const [versions, sessions] = await Promise.all([
            this.packages.listVersions(handle, packageId),
            this.sessions.list(handle),
        ]);
        let current = null;
        if (record.currentVersionId) current = await this.installer.open(handle, packageId, record.currentVersionId);
        return Object.freeze({
            package: record,
            versions,
            current: current ? {
                packageVersion: current.packageVersion,
                manifest: current.manifest,
                preflight: current.preflight,
            } : null,
            sessions: await Promise.all(
                sessions.filter(item => item.packageId === packageId).sort(byUpdatedDesc)
                    .map(item => this._sessionSummary(handle, item)),
            ),
        });
    }

    listWorlds(handle) {
        return this.worlds.list(handle);
    }

    async _projectWorldReferences(handle, worldId, revisionId = null) {
        const references = [];
        for (const project of await this.projects.list(handle)) {
            const source = await this.projects.get(handle, project.projectId);
            for (const dependency of source?.dependencies?.worlds ?? []) {
                if (dependency.worldId === worldId && (revisionId === null || dependency.worldRevisionId === revisionId)) {
                    references.push({
                        kind: 'project',
                        projectId: project.projectId,
                        displayName: project.displayName,
                        worldRevisionId: dependency.worldRevisionId,
                    });
                }
            }
        }
        return references;
    }

    async getWorld(handle, worldId) {
        const world = await this.worlds.get(handle, requireText(worldId, 'worldId'));
        if (!world) throw new NotFoundError('native world', { worldId });
        const revisions = await this.worlds.listRevisions(handle, worldId);
        const detailed = await Promise.all(revisions.map(async revision => ({
            revision,
            references: [
                ...await this.worlds.getRevisionReferences(handle, worldId, revision.worldRevisionId),
                ...await this._projectWorldReferences(handle, worldId, revision.worldRevisionId),
            ],
        })));
        return Object.freeze({
            world,
            currentRevision: world.currentRevisionId
                ? await this.worlds.getRevision(handle, worldId, world.currentRevisionId)
                : null,
            revisions: detailed,
            references: await this._projectWorldReferences(handle, worldId),
        });
    }

    async createWorld(handle, { displayName }) {
        const now = Date.now();
        return this.worlds.create(handle, {
            worldId: createNativeId('world'),
            displayName: requireText(displayName, 'World displayName'),
            currentRevisionId: null,
            createdAt: now,
            updatedAt: now,
        });
    }

    async deleteWorld(handle, worldId) {
        const references = await this._projectWorldReferences(handle, worldId);
        if (references.length) throw new ConflictError('native_world_project_referenced', { worldId, references });
        return this.worlds.delete(handle, requireText(worldId, 'worldId'));
    }

    listKnowledgeBases(handle) {
        return this.knowledge.list(handle);
    }

    async _projectKnowledgeReferences(handle, knowledgeBaseId, revisionId = null) {
        const references = [];
        for (const project of await this.projects.list(handle)) {
            const source = await this.projects.get(handle, project.projectId);
            for (const dependency of source?.dependencies?.knowledge ?? []) {
                if (
                    dependency.knowledgeBaseId === knowledgeBaseId
                    && (revisionId === null || dependency.knowledgeRevisionId === revisionId)
                ) {
                    references.push({
                        kind: 'project',
                        projectId: project.projectId,
                        displayName: project.displayName,
                        knowledgeRevisionId: dependency.knowledgeRevisionId,
                    });
                }
            }
        }
        return references;
    }

    async getKnowledgeBase(handle, knowledgeBaseId) {
        const base = await this.knowledge.get(handle, requireText(knowledgeBaseId, 'knowledgeBaseId'));
        if (!base) throw new NotFoundError('native knowledge base', { knowledgeBaseId });
        const [revisions, allBindings] = await Promise.all([
            this.knowledge.listRevisions(handle, knowledgeBaseId),
            this.knowledge.listBindings(handle),
        ]);
        const detailed = await Promise.all(revisions.map(async revision => ({
            revision,
            entries: await this.knowledge.listEntries(handle, knowledgeBaseId, revision.knowledgeRevisionId),
            references: [
                ...await this.knowledge.getRevisionReferences(handle, knowledgeBaseId, revision.knowledgeRevisionId),
                ...await this._projectKnowledgeReferences(handle, knowledgeBaseId, revision.knowledgeRevisionId),
            ],
        })));
        const bindings = allBindings.filter(item => item.source?.knowledgeBaseId === knowledgeBaseId);
        return Object.freeze({
            knowledgeBase: base,
            currentRevision: detailed.find(item => item.revision.knowledgeRevisionId === base.currentRevisionId) ?? null,
            revisions: detailed,
            bindings: await Promise.all(bindings.map(async binding => ({
                binding,
                references: await this.knowledge.getBindingReferences(handle, binding.knowledgeBindingId),
            }))),
            references: await this._projectKnowledgeReferences(handle, knowledgeBaseId),
        });
    }

    async createKnowledgeBase(handle, { displayName }) {
        const now = Date.now();
        return this.knowledge.create(handle, {
            knowledgeBaseId: createNativeId('knowledgeBase'),
            displayName: requireText(displayName, 'KnowledgeBase displayName'),
            currentRevisionId: null,
            createdAt: now,
            updatedAt: now,
        });
    }

    async deleteKnowledgeBase(handle, knowledgeBaseId) {
        const references = await this._projectKnowledgeReferences(handle, knowledgeBaseId);
        if (references.length) {
            throw new ConflictError('native_knowledge_project_referenced', { knowledgeBaseId, references });
        }
        return this.knowledge.delete(handle, requireText(knowledgeBaseId, 'knowledgeBaseId'));
    }

    async listSessions(handle, { packageId = null } = {}) {
        const sessions = (await this.sessions.list(handle))
            .filter(item => !packageId || item.packageId === packageId)
            .sort(byUpdatedDesc);
        return Promise.all(sessions.map(item => this._sessionSummary(handle, item)));
    }

    async getSession(handle, sessionId) {
        const session = await this.sessions.get(handle, requireText(sessionId, 'sessionId'));
        if (!session) throw new NotFoundError('native session', { sessionId });
        const dependency = await this._sessionDependency(handle, session);
        const [savePoints, branches, revisions] = await Promise.all([
            this.saves.list(handle, sessionId),
            this.sessions.listBranches(handle, sessionId),
            this.sessions.listRevisions(handle, sessionId),
        ]);
        return Object.freeze({
            session,
            dependency,
            savePoints,
            branches,
            revisions,
            snapshot: dependency.status === 'ready' ? await this.core.load(handle, sessionId) : null,
        });
    }

    startSession(handle, options) {
        return this.core.create(handle, options);
    }

    continueSession(handle, sessionId) {
        return this.core.load(handle, requireText(sessionId, 'sessionId'));
    }

    deleteSession(handle, sessionId) {
        return this.sessions.delete(handle, requireText(sessionId, 'sessionId'));
    }

    async saveSession(handle, sessionId, { kind = 'manual', displayName = undefined } = {}) {
        if (kind === 'quick') return this.saveSystem.quickSave(handle, sessionId, { displayName });
        if (kind === 'manual') return this.saveSystem.manualSave(handle, sessionId, { displayName });
        throw new TypeError('Native UI save kind must be manual or quick');
    }

    loadSave(handle, sessionId, saveId, expectedRevisionId) {
        return this.core.restoreSavePoint(handle, sessionId, requireText(saveId, 'saveId'), { expectedRevisionId });
    }

    async exportSave(handle, sessionId, { saveId = null, password = undefined } = {}) {
        const archive = saveId
            ? await this.saveSystem.exportSnapshot(handle, sessionId, saveId, { password })
            : await this.saveSystem.exportSession(handle, sessionId, { password });
        return Object.freeze({ archiveBase64: Buffer.from(archive).toString('base64') });
    }

    preflightSaveImport(handle, archiveBase64) {
        return this.saveSystem.preflightImport(handle, decodeArchive(archiveBase64, 'archiveBase64'));
    }

    importSave(handle, archiveBase64, { password = undefined } = {}) {
        return this.saveSystem.importSave(handle, decodeArchive(archiveBase64, 'archiveBase64'), { password });
    }

    promoteEmbeddedKnowledge(handle, sessionId, options) {
        return this.saveSystem.promoteEmbeddedKnowledge(handle, sessionId, options);
    }

    async preflightPackage(handle, archiveBase64) {
        const archive = decodeArchive(archiveBase64, 'archiveBase64');
        const preflight = this.installer.preflight(archive);
        const existing = await this.packages.get(handle, preflight.packageId);
        const currentVersion = existing?.currentVersionId
            ? await this.packages.getVersion(handle, preflight.packageId, existing.currentVersionId)
            : null;
        return Object.freeze({
            ...preflight,
            action: existing ? 'update' : 'install',
            installed: existing ? { package: existing, currentVersion } : null,
        });
    }

    installPackage(handle, archiveBase64, options = {}) {
        return this.installer.install(
            handle,
            decodeArchive(archiveBase64, 'archiveBase64'),
            { grantedPermissions: options.grantedPermissions ?? [] },
        );
    }

    deletePackage(handle, packageId) {
        return this.packages.delete(handle, requireText(packageId, 'packageId'));
    }

    listProjects(handle) {
        return this.projects.list(handle);
    }

    async _resolveProjectDependencies(handle, source) {
        const worlds = await Promise.all((source.dependencies?.worlds ?? []).map(async dependency => ({
            ...dependency,
            world: await this.worlds.get(handle, dependency.worldId),
            revision: await this.worlds.getRevision(handle, dependency.worldId, dependency.worldRevisionId),
        })));
        const knowledge = await Promise.all((source.dependencies?.knowledge ?? []).map(async dependency => ({
            ...dependency,
            knowledgeBase: await this.knowledge.get(handle, dependency.knowledgeBaseId),
            revision: await this.knowledge.getRevision(
                handle,
                dependency.knowledgeBaseId,
                dependency.knowledgeRevisionId,
            ),
        })));
        const knowledgeBindings = await Promise.all((source.dependencies?.knowledgeBindings ?? []).map(async id => ({
            knowledgeBindingId: id,
            binding: await this.knowledge.getBinding(handle, id),
        })));
        return Object.freeze({ worlds, knowledge, knowledgeBindings });
    }

    async getProject(handle, projectId) {
        const source = await this.projects.get(handle, requireText(projectId, 'projectId'));
        if (!source) throw new NotFoundError('native studio project', { projectId });
        return Object.freeze({
            source,
            dependencies: await this._resolveProjectDependencies(handle, source),
            files: await this.projects.listFiles(handle, projectId),
        });
    }

    async updateProjectDependencies(handle, projectId, dependencies) {
        const source = await this.projects.get(handle, requireText(projectId, 'projectId'));
        if (!source) throw new NotFoundError('native studio project', { projectId });
        const next = {
            ...source,
            project: {
                ...source.project,
                updatedAt: Math.max(Date.now(), Number(source.project.updatedAt || 0)),
            },
            dependencies,
        };
        for (const dependency of dependencies?.worlds ?? []) {
            if (!await this.worlds.getRevision(handle, dependency.worldId, dependency.worldRevisionId)) {
                throw new NotFoundError('native project World dependency', dependency);
            }
        }
        for (const dependency of dependencies?.knowledge ?? []) {
            if (!await this.knowledge.getRevision(handle, dependency.knowledgeBaseId, dependency.knowledgeRevisionId)) {
                throw new NotFoundError('native project Knowledge dependency', dependency);
            }
        }
        for (const knowledgeBindingId of dependencies?.knowledgeBindings ?? []) {
            if (!await this.knowledge.getBinding(handle, knowledgeBindingId)) {
                throw new NotFoundError('native project KnowledgeBinding dependency', { knowledgeBindingId });
            }
        }
        await this.projects.save(handle, next);
        return this.getProject(handle, projectId);
    }

    deleteProject(handle, projectId) {
        return this.projects.delete(handle, requireText(projectId, 'projectId'));
    }

    async librarySnapshot(handle) {
        const [works, worlds, knowledgeBases, projects, sessions] = await Promise.all([
            this.listWorks(handle),
            this.listWorlds(handle),
            this.listKnowledgeBases(handle),
            this.listProjects(handle),
            this.listSessions(handle),
        ]);
        return Object.freeze({ works, worlds, knowledgeBases, projects, sessions });
    }
}
