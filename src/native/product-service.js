import { ConflictError, NotFoundError } from '../storage/errors.js';

function clone(value) {
    return value == null ? value : structuredClone(value);
}

function byUpdatedAt(items) {
    return [...items].sort((left, right) => (
        Number(right?.updatedAt || right?.createdAt || 0)
        - Number(left?.updatedAt || left?.createdAt || 0)
    ));
}

export class NativeProductService {
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
            if (!value) throw new TypeError(`NativeProductService requires ${name}`);
        }
        this._packages = packageRepo;
        this._worlds = worldRepo;
        this._knowledge = knowledgeRepo;
        this._sessions = sessionRepo;
        this._saves = savePointRepo;
        this._installer = packageInstaller;
        this._saveSystem = saveSystem;
        this._core = sessionCore;
        this._projects = projectStore;
    }

    async _openCurrentPackage(handle, record) {
        if (!record?.currentVersionId) {
            return { status: 'missing-version', packageVersion: null, manifest: null, preflight: null };
        }
        try {
            const opened = await this._installer.open(handle, record.packageId, record.currentVersionId);
            if (!opened) {
                return { status: 'missing-version', packageVersion: null, manifest: null, preflight: null };
            }
            return { status: 'ready', ...opened };
        } catch (error) {
            return {
                status: 'invalid',
                packageVersion: await this._packages.getVersion(handle, record.packageId, record.currentVersionId),
                manifest: null,
                preflight: null,
                error: error?.code || error?.message || String(error),
            };
        }
    }

    async listWorks(handle) {
        const [packages, sessions] = await Promise.all([
            this._packages.list(handle),
            this._sessions.list(handle),
        ]);
        const counts = new Map();
        for (const session of sessions) {
            counts.set(session.packageId, (counts.get(session.packageId) || 0) + 1);
        }
        return Promise.all(packages.map(async record => {
            const opened = await this._openCurrentPackage(handle, record);
            return {
                package: record,
                status: opened.status,
                packageVersion: opened.packageVersion,
                manifest: opened.manifest,
                preflight: opened.preflight,
                sessionCount: counts.get(record.packageId) || 0,
                ...(opened.error ? { error: opened.error } : {}),
            };
        }));
    }

    async getWork(handle, packageId) {
        const record = await this._packages.get(handle, packageId);
        if (!record) throw new NotFoundError('native package', { packageId });
        const [opened, versions, sessions] = await Promise.all([
            this._openCurrentPackage(handle, record),
            this._packages.listVersions(handle, packageId),
            this._sessions.list(handle),
        ]);
        return {
            package: record,
            status: opened.status,
            packageVersion: opened.packageVersion,
            manifest: opened.manifest,
            preflight: opened.preflight,
            versions,
            sessions: byUpdatedAt(sessions.filter(item => item.packageId === packageId)),
            ...(opened.error ? { error: opened.error } : {}),
        };
    }

    async startWork(handle, packageId, options = {}) {
        const record = await this._packages.get(handle, packageId);
        if (!record) throw new NotFoundError('native package', { packageId });
        const packageVersionId = options.packageVersionId || record.currentVersionId;
        if (!packageVersionId) throw new NotFoundError('native package version', { packageId });
        const opened = await this._installer.open(handle, packageId, packageVersionId);
        if (!opened) throw new NotFoundError('native package version', { packageId, packageVersionId });
        const entryPointId = options.entryPointId || opened.manifest.entryPoints[0]?.entryPointId;
        if (!entryPointId) throw new TypeError('Work has no EntryPoint');
        return this._core.create(handle, {
            packageId,
            packageVersionId,
            entryPointId,
            ...(options.displayTitle === undefined ? {} : { displayTitle: options.displayTitle }),
            libraryBindingIds: options.libraryBindingIds || [],
            sessionBindings: options.sessionBindings || [],
            sessionKnowledge: options.sessionKnowledge || [],
        });
    }

    async deleteWork(handle, packageId) {
        return this._packages.delete(handle, packageId);
    }

    preflightPackage(archive) {
        return this._installer.preflight(archive);
    }

    async installPackage(handle, archive, options = {}) {
        return this._installer.install(handle, archive, {
            grantedPermissions: options.grantedPermissions || [],
        });
    }

    async listWorlds(handle) {
        const worlds = await this._worlds.list(handle);
        return Promise.all(worlds.map(async world => ({
            world,
            currentRevision: world.currentRevisionId
                ? await this._worlds.getRevision(handle, world.worldId, world.currentRevisionId)
                : null,
        })));
    }

    async getWorld(handle, worldId) {
        const world = await this._worlds.get(handle, worldId);
        if (!world) throw new NotFoundError('native world', { worldId });
        const revisions = await this._worlds.listRevisions(handle, worldId);
        return {
            world,
            revisions,
            currentRevision: world.currentRevisionId
                ? revisions.find(item => item.worldRevisionId === world.currentRevisionId) || null
                : null,
        };
    }

    async _projectSources(handle) {
        const projects = await this._projects.list(handle);
        const result = [];
        for (const project of projects) {
            const source = await this._projects.get(handle, project.projectId);
            if (source) result.push(source);
        }
        return result;
    }

    async deleteWorld(handle, worldId) {
        const refs = [];
        for (const source of await this._projectSources(handle)) {
            const exact = source.dependencies.worlds.filter(item => item.worldId === worldId);
            if (exact.length) {
                refs.push({
                    kind: 'studio-project',
                    projectId: source.project.projectId,
                    revisions: exact.map(item => item.worldRevisionId),
                });
            }
        }
        if (refs.length) throw new ConflictError('native_world_project_referenced', { worldId, references: refs });
        return this._worlds.delete(handle, worldId);
    }

    async listKnowledgeBases(handle) {
        const [bases, bindings] = await Promise.all([
            this._knowledge.list(handle),
            this._knowledge.listBindings(handle),
        ]);
        return Promise.all(bases.map(async knowledgeBase => {
            const currentRevision = knowledgeBase.currentRevisionId
                ? await this._knowledge.getRevision(
                    handle,
                    knowledgeBase.knowledgeBaseId,
                    knowledgeBase.currentRevisionId,
                )
                : null;
            return {
                knowledgeBase,
                currentRevision,
                bindingCount: bindings.filter(binding => (
                    binding.source.kind === 'library'
                    && binding.source.knowledgeBaseId === knowledgeBase.knowledgeBaseId
                )).length,
            };
        }));
    }

    async getKnowledgeBase(handle, knowledgeBaseId, { revisionId = null } = {}) {
        const knowledgeBase = await this._knowledge.get(handle, knowledgeBaseId);
        if (!knowledgeBase) throw new NotFoundError('native knowledge base', { knowledgeBaseId });
        const [revisions, bindings] = await Promise.all([
            this._knowledge.listRevisions(handle, knowledgeBaseId),
            this._knowledge.listBindings(handle),
        ]);
        const selectedRevisionId = revisionId || knowledgeBase.currentRevisionId;
        const selectedRevision = selectedRevisionId
            ? revisions.find(item => item.knowledgeRevisionId === selectedRevisionId)
                || await this._knowledge.getRevision(handle, knowledgeBaseId, selectedRevisionId)
            : null;
        const entries = selectedRevision
            ? await this._knowledge.listEntries(handle, knowledgeBaseId, selectedRevision.knowledgeRevisionId)
            : [];
        const ownBindings = bindings.filter(binding => (
            binding.source.kind === 'library'
            && binding.source.knowledgeBaseId === knowledgeBaseId
        ));
        const withReferences = [];
        for (const binding of ownBindings) {
            withReferences.push({
                binding,
                references: await this._knowledge.getBindingReferences(handle, binding.knowledgeBindingId),
            });
        }
        return {
            knowledgeBase,
            revisions,
            selectedRevision,
            entries,
            bindings: withReferences,
        };
    }

    async deleteKnowledgeBase(handle, knowledgeBaseId) {
        const refs = [];
        for (const source of await this._projectSources(handle)) {
            const exact = source.dependencies.knowledge.filter(item => item.knowledgeBaseId === knowledgeBaseId);
            const bindingIds = new Set(source.dependencies.knowledgeBindings || []);
            const localBindingRefs = (source.knowledgeBindings || []).filter(item => (
                item.source?.knowledgeBaseId === knowledgeBaseId
            )).map(item => item.knowledgeBindingId);
            if (exact.length || localBindingRefs.some(id => bindingIds.has(id))) {
                refs.push({
                    kind: 'studio-project',
                    projectId: source.project.projectId,
                    revisions: exact.map(item => item.knowledgeRevisionId),
                });
            }
        }
        if (refs.length) {
            throw new ConflictError('native_knowledge_project_referenced', {
                knowledgeBaseId,
                references: refs,
            });
        }
        return this._knowledge.delete(handle, knowledgeBaseId);
    }

    async listSessions(handle, { packageId = null } = {}) {
        const sessions = await this._sessions.list(handle);
        return byUpdatedAt(packageId ? sessions.filter(item => item.packageId === packageId) : sessions);
    }

    async getSession(handle, sessionId) {
        const [snapshot, saves, branches, revisions] = await Promise.all([
            this._core.load(handle, sessionId),
            this._saves.list(handle, sessionId),
            this._sessions.listBranches(handle, sessionId),
            this._sessions.listRevisions(handle, sessionId),
        ]);
        return {
            snapshot,
            saves: [...saves].sort((left, right) => Number(right.createdAt) - Number(left.createdAt)),
            branches,
            revisions,
        };
    }

    async createSave(handle, sessionId, { kind = 'manual', displayName = undefined } = {}) {
        if (kind === 'quick') return this._saveSystem.quickSave(handle, sessionId, { displayName });
        if (kind === 'manual') return this._saveSystem.manualSave(handle, sessionId, { displayName });
        if (kind === 'auto') return this._saveSystem.autoSave(handle, sessionId, { displayName });
        throw new TypeError('Native Product save kind must be auto, quick, or manual');
    }

    async restoreSave(handle, sessionId, saveId, expectedRevisionId) {
        return this._core.restoreSavePoint(handle, sessionId, saveId, { expectedRevisionId });
    }

    async deleteSession(handle, sessionId) {
        return this._sessions.delete(handle, sessionId);
    }

    async promoteEmbeddedKnowledge(handle, sessionId, options) {
        return this._saveSystem.promoteEmbeddedKnowledge(handle, sessionId, options);
    }

    async listProjects(handle) {
        return this._projects.list(handle);
    }

    async getProject(handle, projectId) {
        const source = await this._projects.get(handle, projectId);
        if (!source) throw new NotFoundError('native studio project', { projectId });
        return {
            source,
            files: await this._projects.listFiles(handle, projectId),
        };
    }

    async createProject(handle, source) {
        return this._projects.create(handle, source);
    }

    async updateProjectDependencies(handle, projectId, dependencies) {
        const source = await this._projects.get(handle, projectId);
        if (!source) throw new NotFoundError('native studio project', { projectId });
        const next = {
            ...clone(source),
            project: {
                ...clone(source.project),
                updatedAt: Math.max(Date.now(), Number(source.project.updatedAt || 0)),
            },
            dependencies: clone(dependencies),
        };
        return this._projects.save(handle, next);
    }

    async deleteProject(handle, projectId) {
        return this._projects.delete(handle, projectId);
    }
}
