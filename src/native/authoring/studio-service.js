import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { createGitClient } from '../../git/client.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import {
    ATRIA_PROJECT_CONFLICT_CODE,
    assertAuthoringChangeSet,
    assertAuthoringOperation,
    assertAuthoringWorkspace,
    assertProjectRevision,
    assertProjectRevisionConflict,
} from '../authoring-contracts.js';
import { buildProjectPackage } from '../package-composition.js';
import { validateAtriaProjectSource } from '../project-source.js';
import { StudioPreviewHost } from '../studio-preview.js';

export const STUDIO_SOURCE_OPERATION_TYPES = Object.freeze({
    write: 'source.write',
    move: 'source.move',
    delete: 'source.delete',
    saveProject: 'project.save',
});

const HISTORY_AUTHOR = Object.freeze({
    name: 'Atria Studio',
    email: 'studio@atria.local',
});

const SOURCE_ENCODINGS = new Set(['utf8', 'base64']);

function opaqueId(prefix, idFactory) {
    return prefix + '_' + String(idFactory()).replaceAll('-', '').toLowerCase();
}

function hashBytes(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function fingerprint(bytes) {
    if (!bytes) return Object.freeze({ exists: false, size: 0, contentHash: null });
    return Object.freeze({
        exists: true,
        size: bytes.length,
        contentHash: hashBytes(bytes),
    });
}

function decodeSourceInput(input) {
    const encoding = input?.encoding == null ? 'utf8' : String(input.encoding);
    if (!SOURCE_ENCODINGS.has(encoding)) {
        throw new TypeError('Source write encoding must be utf8 or base64');
    }
    if (typeof input?.content !== 'string') {
        throw new TypeError('Source write content must be a string');
    }
    if (encoding === 'utf8') return Buffer.from(input.content, 'utf8');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.content)) {
        throw new TypeError('Source write base64 content is invalid');
    }
    return Buffer.from(input.content, 'base64');
}

function normalizeOrigin(value) {
    const origin = value == null ? { kind: 'human' } : value;
    if (!origin || typeof origin !== 'object' || Array.isArray(origin)) {
        throw new TypeError('Authoring origin must be an object');
    }
    return origin;
}

function sameOrigin(left, right) {
    return left?.kind === right?.kind && (left?.id ?? null) === (right?.id ?? null);
}

function normalizeDiagnostic(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Studio validator diagnostics must be objects');
    }
    return {
        severity: value.severity || 'error',
        code: value.code || 'studio.validation',
        message: String(value.message || 'Validation failed'),
        ...(value.resourceType == null ? {} : { resourceType: value.resourceType }),
        ...(value.resourceId == null ? {} : { resourceId: value.resourceId }),
        ...(value.path == null ? {} : { path: value.path }),
    };
}

function revisionTime(entry) {
    const value = Date.parse(entry?.date || '');
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export class StudioService {
    constructor({
        projectStore,
        worldRepo,
        knowledgeRepo,
        assetStore,
        gitClient = createGitClient(),
        previewHost = new StudioPreviewHost(),
        validators = [],
        simulationRunner = null,
        idFactory = randomUUID,
    }) {
        for (const [name, value] of Object.entries({
            projectStore,
            worldRepo,
            knowledgeRepo,
            assetStore,
            gitClient,
            previewHost,
        })) {
            if (!value) throw new TypeError(`StudioService requires ${name}`);
        }
        if (!Array.isArray(validators) || validators.some(item => typeof item !== 'function')) {
            throw new TypeError('StudioService validators must be functions');
        }
        if (simulationRunner != null && typeof simulationRunner !== 'function') {
            throw new TypeError('StudioService simulationRunner must be a function');
        }
        if (typeof idFactory !== 'function') throw new TypeError('StudioService idFactory must be a function');

        this._projects = projectStore;
        this._worlds = worldRepo;
        this._knowledge = knowledgeRepo;
        this._assets = assetStore;
        this._git = gitClient;
        this._previewHost = previewHost;
        this._validators = [...validators];
        this._simulationRunner = simulationRunner;
        this._idFactory = idFactory;
        this._projectQueues = new Map();
        this._previewOwners = new Map();
    }

    _queue(projectId, operation) {
        const previous = this._projectQueues.get(projectId) || Promise.resolve();
        const run = previous.then(operation, operation);
        this._projectQueues.set(projectId, run.catch(() => undefined));
        return run;
    }

    async _project(handle, projectId) {
        const source = await this._projects.get(handle, projectId);
        if (!source) throw new NotFoundError('native studio project', { projectId });
        return source;
    }

    async _ensureHistory(handle, projectId) {
        const source = await this._project(handle, projectId);
        const directory = this._projects.getProjectDirectory(handle, projectId);
        if (!fs.existsSync(path.join(directory, '.git'))) {
            await this._git.init(directory);
            await this._git.setConfig(directory, 'user.name', HISTORY_AUTHOR.name);
            await this._git.setConfig(directory, 'user.email', HISTORY_AUTHOR.email);
        }
        await this._git.commitIfChanged(
            directory,
            'Atria Studio: synchronize project source',
            HISTORY_AUTHOR,
        );
        const history = await this._git.log(directory, 2);
        if (!history.length) throw new Error('Atria Studio failed to initialize project history');
        return { source, directory, history };
    }

    async _revisionUnlocked(handle, projectId) {
        const { history } = await this._ensureHistory(handle, projectId);
        const head = history[0];
        const parent = history[1] || null;
        return assertProjectRevision({
            projectId,
            revision: head.fullHash,
            parentRevision: parent?.fullHash || null,
            ...(revisionTime(head) === undefined ? {} : { createdAt: revisionTime(head) }),
        });
    }

    async getRevision(handle, projectId) {
        return this._queue(projectId, () => this._revisionUnlocked(handle, projectId));
    }

    async _assertBaseRevision(handle, projectId, expectedRevision) {
        if (typeof expectedRevision !== 'string' || !expectedRevision) {
            throw new TypeError('Authoring workspace requires an explicit baseRevision');
        }
        const actual = await this._revisionUnlocked(handle, projectId);
        if (actual.revision !== expectedRevision) {
            const conflict = assertProjectRevisionConflict({
                code: ATRIA_PROJECT_CONFLICT_CODE,
                projectId,
                expectedRevision,
                actualRevision: actual.revision,
            });
            throw new ConflictError(ATRIA_PROJECT_CONFLICT_CODE, conflict);
        }
        return actual;
    }

    async listProjects(handle) {
        const projects = await this._projects.list(handle);
        const output = [];
        for (const project of projects) {
            const revision = await this.getRevision(handle, project.projectId);
            output.push(Object.freeze({ project, revision }));
        }
        return output;
    }

    async getProject(handle, projectId) {
        return this._queue(projectId, async () => {
            const [source, files, revision] = await Promise.all([
                this._project(handle, projectId),
                this._projects.listFiles(handle, projectId),
                this._revisionUnlocked(handle, projectId),
            ]);
            return Object.freeze({ source, files, revision });
        });
    }

    async createProject(handle, source, { files = new Map() } = {}) {
        const projectId = source?.project?.projectId;
        if (typeof projectId !== 'string' || !projectId) {
            throw new TypeError('Native Studio project.projectId is required');
        }
        return this._queue(projectId, async () => {
            await this._projects.create(handle, source, { files });
            try {
                const revision = await this._revisionUnlocked(handle, projectId);
                return Object.freeze({
                    source: await this._project(handle, projectId),
                    files: await this._projects.listFiles(handle, projectId),
                    revision,
                });
            } catch (error) {
                await this._projects.delete(handle, projectId);
                throw error;
            }
        });
    }

    async deleteProject(handle, projectId, expectedRevision) {
        return this._queue(projectId, async () => {
            await this._assertBaseRevision(handle, projectId, expectedRevision);
            return this._projects.delete(handle, projectId);
        });
    }

    async listSources(handle, projectId) {
        await this._project(handle, projectId);
        return this._projects.listFiles(handle, projectId);
    }

    async readSource(handle, projectId, sourcePath) {
        await this._project(handle, projectId);
        const bytes = await this._projects.readFile(handle, projectId, sourcePath);
        if (!bytes) throw new NotFoundError('native studio source', { projectId, path: sourcePath });
        return Object.freeze({
            path: sourcePath,
            size: bytes.length,
            contentHash: hashBytes(bytes),
            encoding: 'base64',
            content: bytes.toString('base64'),
        });
    }

    createWorkspace({ projectId, baseRevision, origin, operations, workspaceId = undefined }) {
        if (!Array.isArray(operations)) throw new TypeError('Authoring workspace operations must be an array');
        const normalizedOrigin = normalizeOrigin(origin);
        const assertedOperations = operations.map(operation => assertAuthoringOperation(operation));
        const workspace = assertAuthoringWorkspace({
            workspaceId: workspaceId || opaqueId('workspace', this._idFactory),
            projectId,
            baseRevision,
            origin: normalizedOrigin,
            operations: assertedOperations,
            createdAt: Date.now(),
        });
        for (const operation of workspace.operations) {
            if (!sameOrigin(operation.origin, workspace.origin)) {
                throw new TypeError('Authoring operation origin must match its Workspace origin');
            }
        }
        return workspace;
    }

    async _snapshot(handle, projectId) {
        const source = await this._project(handle, projectId);
        const files = new Map();
        for (const item of await this._projects.listFiles(handle, projectId)) {
            files.set(item.path, await this._projects.readFile(handle, projectId, item.path));
        }
        return { source, files };
    }

    async _restore(handle, projectId, snapshot) {
        const current = await this._projects.listFiles(handle, projectId);
        for (const item of current) await this._projects.deleteFile(handle, projectId, item.path);
        await this._projects.save(handle, snapshot.source);
        for (const [sourcePath, bytes] of snapshot.files) {
            await this._projects.writeFile(handle, projectId, sourcePath, bytes);
        }
    }

    async _inspectOperation(handle, projectId, operation) {
        if (operation.operationType === STUDIO_SOURCE_OPERATION_TYPES.write) {
            const before = await this._projects.readFile(handle, projectId, operation.target.path);
            const after = decodeSourceInput(operation.input);
            return Object.freeze({
                operationId: operation.operationId,
                kind: 'write',
                path: operation.target.path,
                before: fingerprint(before),
                after: fingerprint(after),
            });
        }
        if (operation.operationType === STUDIO_SOURCE_OPERATION_TYPES.move) {
            const before = await this._projects.readFile(handle, projectId, operation.target.path);
            if (!before) {
                throw new NotFoundError('native studio source', {
                    projectId,
                    path: operation.target.path,
                });
            }
            const toPath = operation.input?.toPath;
            if (typeof toPath !== 'string' || !toPath) throw new TypeError('Source move requires input.toPath');
            const existing = await this._projects.readFile(handle, projectId, toPath);
            if (existing) {
                throw new ConflictError('project_source_target_exists', {
                    projectId,
                    path: toPath,
                });
            }
            return Object.freeze({
                operationId: operation.operationId,
                kind: 'move',
                fromPath: operation.target.path,
                toPath,
                before: fingerprint(before),
                after: fingerprint(before),
            });
        }
        if (operation.operationType === STUDIO_SOURCE_OPERATION_TYPES.delete) {
            const before = await this._projects.readFile(handle, projectId, operation.target.path);
            return Object.freeze({
                operationId: operation.operationId,
                kind: 'delete',
                path: operation.target.path,
                before: fingerprint(before),
                after: fingerprint(null),
            });
        }
        if (operation.operationType === STUDIO_SOURCE_OPERATION_TYPES.saveProject) {
            if (operation.target.resourceId !== projectId) {
                throw new TypeError('project.save target.resourceId must match Workspace projectId');
            }
            const next = validateAtriaProjectSource(operation.input?.source);
            if (!next.ok) throw new TypeError(next.errors.join('; '));
            const current = await this._project(handle, projectId);
            const beforeBytes = Buffer.from(JSON.stringify(current));
            const afterBytes = Buffer.from(JSON.stringify(next.project));
            return Object.freeze({
                operationId: operation.operationId,
                kind: 'project-save',
                resourceType: operation.target.resourceType,
                resourceId: projectId,
                before: fingerprint(beforeBytes),
                after: fingerprint(afterBytes),
            });
        }
        throw new TypeError('Unsupported Native Studio authoring operation: ' + operation.operationType);
    }

    async inspectWorkspace(handle, workspaceValue) {
        const workspace = assertAuthoringWorkspace(workspaceValue);
        if (!workspace.operations.length) throw new TypeError('Authoring workspace must contain at least one operation');
        return this._queue(workspace.projectId, async () => {
            await this._assertBaseRevision(handle, workspace.projectId, workspace.baseRevision);
            const changes = [];
            for (const operation of workspace.operations) {
                changes.push(await this._inspectOperation(handle, workspace.projectId, operation));
            }
            return Object.freeze({ workspace, changes: Object.freeze(changes) });
        });
    }

    async _applyOperation(handle, projectId, operation) {
        if (operation.operationType === STUDIO_SOURCE_OPERATION_TYPES.write) {
            return this._projects.writeFile(
                handle,
                projectId,
                operation.target.path,
                decodeSourceInput(operation.input),
            );
        }
        if (operation.operationType === STUDIO_SOURCE_OPERATION_TYPES.move) {
            const toPath = operation.input?.toPath;
            const existing = await this._projects.readFile(handle, projectId, toPath);
            if (existing) {
                throw new ConflictError('project_source_target_exists', { projectId, path: toPath });
            }
            return this._projects.moveFile(handle, projectId, operation.target.path, toPath);
        }
        if (operation.operationType === STUDIO_SOURCE_OPERATION_TYPES.delete) {
            return this._projects.deleteFile(handle, projectId, operation.target.path);
        }
        if (operation.operationType === STUDIO_SOURCE_OPERATION_TYPES.saveProject) {
            if (operation.target.resourceId !== projectId) {
                throw new TypeError('project.save target.resourceId must match Workspace projectId');
            }
            return this._projects.save(handle, operation.input?.source);
        }
        throw new TypeError('Unsupported Native Studio authoring operation: ' + operation.operationType);
    }

    async _validateUnlocked(handle, projectId) {
        const source = await this._projects.get(handle, projectId);
        const validation = validateAtriaProjectSource(source);
        const diagnostics = [];
        if (!validation.ok) {
            for (const message of validation.errors) {
                diagnostics.push({
                    severity: 'error',
                    code: 'project.source.invalid',
                    message,
                });
            }
        }
        const files = await this._projects.listFiles(handle, projectId);
        for (const validator of this._validators) {
            const value = await validator({
                handle,
                projectId,
                source: validation.project || source,
                files,
                projectStore: this._projects,
                worldRepo: this._worlds,
                knowledgeRepo: this._knowledge,
                assetStore: this._assets,
            });
            const items = Array.isArray(value) ? value : value?.diagnostics || [];
            for (const item of items) diagnostics.push(normalizeDiagnostic(item));
        }
        return Object.freeze({
            status: diagnostics.some(item => item.severity === 'error') ? 'failed' : 'passed',
            diagnostics: Object.freeze(diagnostics),
        });
    }

    async validateProject(handle, projectId) {
        return this._queue(projectId, async () => {
            await this._project(handle, projectId);
            return this._validateUnlocked(handle, projectId);
        });
    }

    async executeWorkspace(handle, workspaceValue) {
        const workspace = assertAuthoringWorkspace(workspaceValue);
        if (!workspace.operations.length) throw new TypeError('Authoring workspace must contain at least one operation');
        for (const operation of workspace.operations) {
            if (!sameOrigin(operation.origin, workspace.origin)) {
                throw new TypeError('Authoring operation origin must match its Workspace origin');
            }
        }

        return this._queue(workspace.projectId, async () => {
            const base = await this._assertBaseRevision(handle, workspace.projectId, workspace.baseRevision);
            const snapshot = await this._snapshot(handle, workspace.projectId);
            const changes = [];
            try {
                for (const operation of workspace.operations) {
                    changes.push(await this._inspectOperation(handle, workspace.projectId, operation));
                    await this._applyOperation(handle, workspace.projectId, operation);
                }

                const validation = await this._validateUnlocked(handle, workspace.projectId);
                const changeSetId = opaqueId('changeset', this._idFactory);
                if (validation.status === 'failed') {
                    await this._restore(handle, workspace.projectId, snapshot);
                    return Object.freeze({
                        changeSet: assertAuthoringChangeSet({
                            changeSetId,
                            workspaceId: workspace.workspaceId,
                            projectId: workspace.projectId,
                            baseRevision: base.revision,
                            operations: workspace.operations,
                            validation,
                            resultingRevision: null,
                        }),
                        changes: Object.freeze(changes),
                    });
                }

                const directory = this._projects.getProjectDirectory(handle, workspace.projectId);
                await this._git.commitIfChanged(
                    directory,
                    `Atria Studio ChangeSet ${changeSetId}`,
                    HISTORY_AUTHOR,
                );
                const resulting = await this._revisionUnlocked(handle, workspace.projectId);
                return Object.freeze({
                    changeSet: assertAuthoringChangeSet({
                        changeSetId,
                        workspaceId: workspace.workspaceId,
                        projectId: workspace.projectId,
                        baseRevision: base.revision,
                        operations: workspace.operations,
                        validation,
                        resultingRevision: resulting.revision,
                    }),
                    changes: Object.freeze(changes),
                });
            } catch (error) {
                await this._restore(handle, workspace.projectId, snapshot);
                throw error;
            }
        });
    }

    _singleOperation({ projectId, baseRevision, origin, operationType, target, input = {} }) {
        const normalizedOrigin = normalizeOrigin(origin);
        return this.createWorkspace({
            projectId,
            baseRevision,
            origin: normalizedOrigin,
            operations: [{
                operationId: opaqueId('operation', this._idFactory),
                operationType,
                target,
                input,
                origin: normalizedOrigin,
            }],
        });
    }

    async writeSource(handle, projectId, { path: sourcePath, content, encoding, baseRevision, origin }) {
        return this.executeWorkspace(handle, this._singleOperation({
            projectId,
            baseRevision,
            origin,
            operationType: STUDIO_SOURCE_OPERATION_TYPES.write,
            target: { path: sourcePath },
            input: { content, ...(encoding == null ? {} : { encoding }) },
        }));
    }

    async moveSource(handle, projectId, { path: sourcePath, toPath, baseRevision, origin }) {
        return this.executeWorkspace(handle, this._singleOperation({
            projectId,
            baseRevision,
            origin,
            operationType: STUDIO_SOURCE_OPERATION_TYPES.move,
            target: { path: sourcePath },
            input: { toPath },
        }));
    }

    async deleteSource(handle, projectId, { path: sourcePath, baseRevision, origin }) {
        return this.executeWorkspace(handle, this._singleOperation({
            projectId,
            baseRevision,
            origin,
            operationType: STUDIO_SOURCE_OPERATION_TYPES.delete,
            target: { path: sourcePath },
        }));
    }

    async saveProjectSource(handle, projectId, { source, baseRevision, origin }) {
        return this.executeWorkspace(handle, this._singleOperation({
            projectId,
            baseRevision,
            origin,
            operationType: STUDIO_SOURCE_OPERATION_TYPES.saveProject,
            target: { resourceType: 'core.project', resourceId: projectId },
            input: { source },
        }));
    }

    async history(handle, projectId, { limit = 50 } = {}) {
        return this._queue(projectId, async () => {
            const { directory } = await this._ensureHistory(handle, projectId);
            const maxCount = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
            return this._git.log(directory, maxCount);
        });
    }

    async diff(handle, projectId, revision) {
        return this._queue(projectId, async () => {
            const { directory } = await this._ensureHistory(handle, projectId);
            const history = await this._git.log(directory, 200);
            if (!history.some(item => item.fullHash === revision)) {
                throw new NotFoundError('native studio project revision', { projectId, revision });
            }
            return Object.freeze({ projectId, revision, diff: await this._git.diff(directory, revision) });
        });
    }

    async _buildUnlocked(handle, projectId, expectedRevision = null) {
        const revision = expectedRevision == null
            ? await this._revisionUnlocked(handle, projectId)
            : await this._assertBaseRevision(handle, projectId, expectedRevision);
        const built = await buildProjectPackage({
            handle,
            projectId,
            projectStore: this._projects,
            worldRepo: this._worlds,
            knowledgeRepo: this._knowledge,
            assetStore: this._assets,
        });
        return { revision, built };
    }

    async buildProject(handle, projectId, { baseRevision = null } = {}) {
        return this._queue(projectId, () => this._buildUnlocked(handle, projectId, baseRevision));
    }

    async preflightProject(handle, projectId, { baseRevision = null } = {}) {
        return this._queue(projectId, async () => {
            const { revision, built } = await this._buildUnlocked(handle, projectId, baseRevision);
            return Object.freeze({
                projectId,
                revision,
                manifest: built.manifest,
                packageVersion: built.packageVersion,
                preflight: built.preflight,
            });
        });
    }

    async previewProject(handle, projectId, { baseRevision = null, entryPointId = undefined } = {}) {
        return this._queue(projectId, async () => {
            const { revision, built } = await this._buildUnlocked(handle, projectId, baseRevision);
            const preview = this._previewHost.create({
                projectId,
                archive: built.archive,
                ...(entryPointId == null ? {} : { entryPointId }),
            });
            this._previewOwners.set(preview.previewId, handle);
            return Object.freeze({
                revision,
                preview: Object.freeze({
                    previewId: preview.previewId,
                    projectId: preview.projectId,
                    packageId: preview.packageId,
                    packageVersionId: preview.packageVersionId,
                    entryPointId: preview.entryPointId,
                    persisted: false,
                    createdAt: preview.createdAt,
                }),
            });
        });
    }

    listPreviews(handle, projectId = null) {
        return this._previewHost.list().filter(item => (
            this._previewOwners.get(item.previewId) === handle
            && (projectId == null || item.projectId === projectId)
        ));
    }

    closePreview(handle, previewId) {
        if (this._previewOwners.get(previewId) !== handle) return false;
        this._previewOwners.delete(previewId);
        return this._previewHost.close(previewId);
    }

    async simulateProject(handle, projectId, options = {}) {
        return this._queue(projectId, async () => {
            const revision = options.baseRevision == null
                ? await this._revisionUnlocked(handle, projectId)
                : await this._assertBaseRevision(handle, projectId, options.baseRevision);
            if (!this._simulationRunner) {
                return Object.freeze({
                    projectId,
                    revision,
                    status: 'unavailable',
                    code: 'native_studio_simulation_unavailable',
                });
            }
            const source = await this._project(handle, projectId);
            const result = await this._simulationRunner({
                handle,
                projectId,
                revision,
                source,
                options,
                projectStore: this._projects,
                worldRepo: this._worlds,
                knowledgeRepo: this._knowledge,
                assetStore: this._assets,
            });
            return Object.freeze({
                projectId,
                revision,
                status: 'completed',
                result,
            });
        });
    }
}
