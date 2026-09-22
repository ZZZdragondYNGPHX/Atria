import { ConflictError, NotFoundError } from '../storage/errors.js';
import { createNativeId } from './identity.js';

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
            sessions: await Promise.all(
                byUpdatedAt(sessions.filter(item => item.packageId === packageId))
                    .map(item => this._sessionSummary(handle, item)),
            ),
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

    async createWorld(handle, { displayName }) {
        const name = String(displayName || '').trim();
        if (!name) throw new TypeError('Native World displayName is required');
        const now = Date.now();
        return this._worlds.create(handle, {
            worldId: createNativeId('world'),
            displayName: name,
            currentRevisionId: null,
            createdAt: now,
            updatedAt: now,
        });
    }

    async updateWorld(handle, worldId, { displayName }) {
        const world = await this._worlds.get(handle, worldId);
        if (!world) throw new NotFoundError('native world', { worldId });
        const name = String(displayName || '').trim();
        if (!name) throw new TypeError('Native World displayName is required');
        return this._worlds.save(handle, {
            ...world,
            displayName: name,
            updatedAt: Math.max(Date.now(), Number(world.updatedAt || 0)),
        });
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

    async createKnowledgeBase(handle, { displayName }) {
        const name = String(displayName || '').trim();
        if (!name) throw new TypeError('Native KnowledgeBase displayName is required');
        const now = Date.now();
        return this._knowledge.create(handle, {
            knowledgeBaseId: createNativeId('knowledgeBase'),
            displayName: name,
            currentRevisionId: null,
            createdAt: now,
            updatedAt: now,
        });
    }

    async updateKnowledgeBase(handle, knowledgeBaseId, { displayName }) {
        const knowledgeBase = await this._knowledge.get(handle, knowledgeBaseId);
        if (!knowledgeBase) throw new NotFoundError('native knowledge base', { knowledgeBaseId });
        const name = String(displayName || '').trim();
        if (!name) throw new TypeError('Native KnowledgeBase displayName is required');
        return this._knowledge.save(handle, {
            ...knowledgeBase,
            displayName: name,
            updatedAt: Math.max(Date.now(), Number(knowledgeBase.updatedAt || 0)),
        });
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

    async _sessionDependency(handle, session) {
        const required = {
            packageId: session.packageId,
            packageVersionId: session.packageVersionId,
            packageVersion: session.packageVersion,
            packageContentHash: session.packageContentHash,
            entryPointId: session.entryPointId,
        };
        let opened;
        try {
            opened = await this._installer.open(handle, session.packageId, session.packageVersionId);
        } catch (error) {
            return {
                status: 'invalid',
                code: error?.code || 'native_session_package_invalid',
                required,
            };
        }
        if (!opened) {
            return { status: 'missing', code: 'native_session_package_missing', required };
        }
        const exact = (
            opened.packageVersion.version === session.packageVersion
            && opened.packageVersion.packageContentHash === session.packageContentHash
            && opened.manifest.entryPoints.some(item => item.entryPointId === session.entryPointId)
        );
        return {
            status: exact ? 'ready' : 'mismatch',
            code: exact ? null : 'native_session_package_mismatch',
            required,
            installed: {
                packageVersion: opened.packageVersion,
                ...(exact ? { name: opened.manifest.name, version: opened.manifest.version } : {}),
            },
        };
    }

    async _sessionSummary(handle, session) {
        const [dependency, saves] = await Promise.all([
            this._sessionDependency(handle, session),
            this._saves.list(handle, session.sessionId),
        ]);
        return { ...session, dependency, saveCount: saves.length };
    }

    async listSessions(handle, { packageId = null } = {}) {
        const sessions = await this._sessions.list(handle);
        return Promise.all(
            byUpdatedAt(packageId ? sessions.filter(item => item.packageId === packageId) : sessions)
                .map(item => this._sessionSummary(handle, item)),
        );
    }

    async getSession(handle, sessionId) {
        const session = await this._sessions.get(handle, sessionId);
        if (!session) throw new NotFoundError('native session', { sessionId });
        const [dependency, saves, branches, revisions] = await Promise.all([
            this._sessionDependency(handle, session),
            this._saves.list(handle, sessionId),
            this._sessions.listBranches(handle, sessionId),
            this._sessions.listRevisions(handle, sessionId),
        ]);
        return {
            session,
            dependency,
            snapshot: dependency.status === 'ready' ? await this._core.load(handle, sessionId) : null,
            saves: [...saves].sort((left, right) => Number(right.createdAt) - Number(left.createdAt)),
            branches,
            revisions,
        };
    }

    async exportSession(handle, sessionId, options = {}) {
        return this._saveSystem.exportSession(handle, sessionId, options);
    }

    async exportSnapshot(handle, sessionId, saveId, options = {}) {
        return this._saveSystem.exportSnapshot(handle, sessionId, saveId, options);
    }

    async preflightSaveImport(handle, archive) {
        return this._saveSystem.preflightImport(handle, archive);
    }

    async importSave(handle, archive, options = {}) {
        return this._saveSystem.importSave(handle, archive, options);
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
        const nextDependencies = clone(dependencies || {
            worlds: [],
            knowledge: [],
            knowledgeBindings: [],
        });
        for (const dependency of nextDependencies.worlds || []) {
            if (!await this._worlds.getRevision(handle, dependency.worldId, dependency.worldRevisionId)) {
                throw new NotFoundError('native project World dependency', dependency);
            }
        }
        for (const dependency of nextDependencies.knowledge || []) {
            if (!await this._knowledge.getRevision(
                handle,
                dependency.knowledgeBaseId,
                dependency.knowledgeRevisionId,
            )) {
                throw new NotFoundError('native project Knowledge dependency', dependency);
            }
        }
        for (const knowledgeBindingId of nextDependencies.knowledgeBindings || []) {
            if (!await this._knowledge.getBinding(handle, knowledgeBindingId)) {
                throw new NotFoundError('native project KnowledgeBinding dependency', { knowledgeBindingId });
            }
        }
        const next = {
            ...clone(source),
            project: {
                ...clone(source.project),
                updatedAt: Math.max(Date.now(), Number(source.project.updatedAt || 0)),
            },
            dependencies: nextDependencies,
        };
        return this._projects.save(handle, next);
    }

    async deleteProject(handle, projectId) {
        return this._projects.delete(handle, projectId);
    }
}
