import { hashNativeDocument, withNativeResourceWrite } from './repositories/common.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';
import { assertNativeId, createNativeId } from './identity.js';

function clone(value) {
    return value == null ? value : structuredClone(value);
}

function invalidField(field) {
    return Object.assign(new TypeError('Invalid product field'), { code: 'native_product_invalid_request', details: { field } });
}


function revisionInput(input, kind, allowed) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['baseRevisionId', 'content'].includes(key))) throw invalidField('revision');
    if (input.baseRevisionId !== null) assertNativeId(input.baseRevisionId, kind, 'baseRevisionId');
    if (!input.content || typeof input.content !== 'object' || Array.isArray(input.content)
        || Object.keys(input.content).some(key => !allowed.includes(key))) throw invalidField('content');
    return input;
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
        if (!name) throw invalidField('displayName');
        const now = Date.now();
        return this._worlds.create(handle, {
            worldId: createNativeId('world'),
            displayName: name,
            currentRevisionId: null,
            createdAt: now,
            updatedAt: now,
        });
    }

    async commitWorldRevision(handle, worldId, input) {
        const { baseRevisionId, content } = revisionInput(input, 'worldRevision', ['schema', 'baseline', 'knowledgeBindingIds', 'assetIds', 'metadata']);
        return this._worlds.commitRevision(handle, { ...content, worldId, worldRevisionId: createNativeId('worldRevision'), createdAt: Date.now() }, { expectedCurrentRevisionId: baseRevisionId });
    }

    async updateWorld(handle, worldId, { displayName }) {
        const world = await this._worlds.get(handle, worldId);
        if (!world) throw new NotFoundError('native world', { worldId });
        const name = String(displayName || '').trim();
        if (!name) throw invalidField('displayName');
        return this._worlds.save(handle, {
            ...world,
            displayName: name,
            updatedAt: Math.max(Date.now(), Number(world.updatedAt || 0)),
        }, { expectedIntegrity: hashNativeDocument(world) });
    }

    async promoteLibraryRevision(handle, kind, resourceId, input) {
        if (!['world', 'knowledge'].includes(kind)) throw invalidField('kind');
        const repo = kind === 'world' ? this._worlds : this._knowledge;
        assertNativeId(input?.revisionId, kind === 'world' ? 'worldRevision' : 'knowledgeRevision');
        const resource = await repo.get(handle, resourceId);
        if (!resource) throw new NotFoundError('native Library resource', { resourceId });
        if (input?.baseRevisionId !== resource.currentRevisionId) throw new ConflictError('native_write_conflict');
        return repo.save(handle, { ...resource, currentRevisionId: input.revisionId, updatedAt: Math.max(Date.now(), resource.updatedAt || 0) }, { expectedIntegrity: hashNativeDocument(resource) });
    }

    async forkLibraryRevision(handle, kind, resourceId, input) {
        if (!['world', 'knowledge'].includes(kind)) throw invalidField('kind');
        const name = typeof input?.displayName === 'string' ? input.displayName.trim() : '';
        if (!name) throw invalidField('displayName');
        assertNativeId(input.revisionId, kind === 'world' ? 'worldRevision' : 'knowledgeRevision');
        assertNativeId(input.forkResourceId, kind === 'world' ? 'world' : 'knowledgeBase', 'forkResourceId');
        const repo = kind === 'world' ? this._worlds : this._knowledge;
        const existing = await repo.get(handle, input.forkResourceId);
        if (existing) {
            const prior = existing.currentRevisionId && await repo.getRevision(handle, input.forkResourceId, existing.currentRevisionId);
            const origin = prior?.metadata?.atriaLibraryOrigin;
            if (existing.displayName === name && origin?.operation === 'fork' && origin.resourceId === resourceId && origin.revision === input.revisionId) return prior;
            throw new ConflictError('native_write_conflict');
        }
        const { revision, entries: sourceEntries } = await withNativeResourceWrite(handle, resourceId, async () => {
            const revision = await repo.getRevision(handle, resourceId, input.revisionId);
            if (!revision) throw new NotFoundError('native Library revision', { resourceId, revisionId: input.revisionId });
            const entries = kind === 'knowledge' ? await repo.listEntries(handle, resourceId, input.revisionId) : [];
            if (kind === 'knowledge' && entries.length !== revision.entryIds.length) throw new ConflictError('native_knowledge_revision_incomplete');
            return { revision, entries };
        });
        const now = Date.now();
        const metadata = { ...clone(revision.metadata), atriaLibraryOrigin: { resourceType: kind === 'world' ? 'core.world' : 'core.knowledge', resourceId, revision: input.revisionId, operation: 'fork' } };
        if (kind === 'world') {
            const worldId = input.forkResourceId;
            const createRoot = { worldId, displayName: name, currentRevisionId: null, createdAt: now, updatedAt: now };
            return repo.commitRevision(handle, { ...clone(revision), worldId, worldRevisionId: createNativeId('worldRevision'), createdAt: now, metadata }, { createRoot, expectedCurrentRevisionId: null });
        }
        const entries = clone(sourceEntries);
        const ids = new Map(entries.map(entry => [entry.knowledgeEntryId, createNativeId('knowledgeEntry')]));
        for (const entry of entries) {
            entry.knowledgeEntryId = ids.get(entry.knowledgeEntryId);
            for (const key of ['requiredEntryIds', 'relatedEntryIds']) if (entry.relations?.[key]) entry.relations[key] = entry.relations[key].map(id => ids.get(id));
        }
        const knowledgeBaseId = input.forkResourceId;
        const createRoot = { knowledgeBaseId, displayName: name, currentRevisionId: null, createdAt: now, updatedAt: now };
        return repo.commitRevision(handle, { knowledgeBaseId, knowledgeRevisionId: createNativeId('knowledgeRevision'), entryIds: entries.map(entry => entry.knowledgeEntryId), createdAt: now, metadata }, entries, { createRoot, expectedCurrentRevisionId: null });
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
        if (revisionId && !selectedRevision) throw new NotFoundError('native knowledge revision', { knowledgeBaseId, knowledgeRevisionId: revisionId });
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
        if (!name) throw invalidField('displayName');
        const now = Date.now();
        return this._knowledge.create(handle, {
            knowledgeBaseId: createNativeId('knowledgeBase'),
            displayName: name,
            currentRevisionId: null,
            createdAt: now,
            updatedAt: now,
        });
    }

    async getKnowledgeBinding(handle, knowledgeBindingId) {
        const binding = await this._knowledge.getBinding(handle, knowledgeBindingId);
        if (!binding) throw new NotFoundError('native knowledge binding', { knowledgeBindingId });
        const references = await this._knowledge.getBindingReferences(handle, knowledgeBindingId);
        for (const reference of references) {
            const world = await this._worlds.get(handle, reference.worldId);
            reference.displayName = world?.displayName || reference.worldId;
            reference.current = world?.currentRevisionId === reference.worldRevisionId;
        }
        for (const source of await this._projectSources(handle)) {
            if (source.dependencies.knowledgeBindings?.includes(knowledgeBindingId)) references.push({ kind: 'studio-project', projectId: source.project.projectId, displayName: source.project.displayName });
        }
        return { binding, integrity: hashNativeDocument(binding), references };
    }

    async saveKnowledgeBinding(handle, knowledgeBindingId, input) {
        assertNativeId(knowledgeBindingId, 'knowledgeBinding');
        if (!input || !Object.hasOwn(input, 'expectedIntegrity') || (input.expectedIntegrity !== null && (typeof input.expectedIntegrity !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedIntegrity)))) throw invalidField('expectedIntegrity');
        if (!input.binding || input.binding.knowledgeBindingId !== knowledgeBindingId) throw invalidField('knowledgeBindingId');
        await this._knowledge.saveBinding(handle, input.binding, { expectedIntegrity: input.expectedIntegrity });
        return this.getKnowledgeBinding(handle, knowledgeBindingId);
    }

    async deleteKnowledgeBinding(handle, knowledgeBindingId, input) {
        if (typeof input?.expectedIntegrity !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedIntegrity)) throw invalidField('expectedIntegrity');
        const detail = await this.getKnowledgeBinding(handle, knowledgeBindingId);
        if (detail.references.length) throw new ConflictError('native_knowledge_binding_referenced', { knowledgeBindingId, references: detail.references });
        return this._knowledge.deleteBinding(handle, knowledgeBindingId, { expectedIntegrity: input.expectedIntegrity });
    }

    async attachKnowledgeBinding(handle, knowledgeBindingId, worldId, input) {
        if (typeof input?.attached !== 'boolean') throw invalidField('attached');
        await this.getKnowledgeBinding(handle, knowledgeBindingId);
        const { world, currentRevision } = await this.getWorld(handle, worldId);
        if (world.currentRevisionId !== input.baseRevisionId) throw new ConflictError('native_write_conflict');
        const content = {};
        for (const key of ['schema', 'baseline', 'knowledgeBindingIds', 'assetIds', 'metadata']) if (currentRevision?.[key] !== undefined) content[key] = clone(currentRevision[key]);
        const bindings = new Set(content.knowledgeBindingIds || []);
        if (input.attached) bindings.add(knowledgeBindingId); else bindings.delete(knowledgeBindingId);
        content.knowledgeBindingIds = [...bindings];
        return this.commitWorldRevision(handle, worldId, { baseRevisionId: input.baseRevisionId, content });
    }

    async commitKnowledgeRevision(handle, knowledgeBaseId, input) {
        const { baseRevisionId, content } = revisionInput(input, 'knowledgeRevision', ['entries', 'metadata']);
        if (!Array.isArray(content.entries)) throw invalidField('content.entries');
        return this._knowledge.commitRevision(handle, { knowledgeBaseId, knowledgeRevisionId: createNativeId('knowledgeRevision'),
            entryIds: content.entries.map(entry => entry?.knowledgeEntryId), metadata: content.metadata || {}, createdAt: Date.now() }, content.entries, { expectedCurrentRevisionId: baseRevisionId });
    }

    async updateKnowledgeBase(handle, knowledgeBaseId, { displayName }) {
        const knowledgeBase = await this._knowledge.get(handle, knowledgeBaseId);
        if (!knowledgeBase) throw new NotFoundError('native knowledge base', { knowledgeBaseId });
        const name = String(displayName || '').trim();
        if (!name) throw invalidField('displayName');
        return this._knowledge.save(handle, {
            ...knowledgeBase,
            displayName: name,
            updatedAt: Math.max(Date.now(), Number(knowledgeBase.updatedAt || 0)),
        }, { expectedIntegrity: hashNativeDocument(knowledgeBase) });
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
        const container = await this._saveSystem.exportSession(handle, sessionId, options);
        return container.archive;
    }

    async exportSnapshot(handle, sessionId, saveId, options = {}) {
        const container = await this._saveSystem.exportSnapshot(handle, sessionId, saveId, options);
        return container.archive;
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
