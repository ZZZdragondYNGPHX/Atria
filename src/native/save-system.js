import {
    ATRIA_SAVE_FORMAT,
    ATRIA_SAVE_SCHEMA_VERSION,
    NATIVE_SCHEMA_VERSION,
    assertAtriaSave,
} from './contracts.js';
import { NativeDependencyError } from './dependency-closure.js';
import { assertNativeId, createNativeId } from './identity.js';
import { ConflictError } from '../storage/errors.js';
import {
    buildAtriaSaveContainer,
    inspectAtriaSaveContainer,
    preflightAtriaSaveContainer,
} from './save-container.js';
import {
    KNOWLEDGE_NAMESPACE,
    SESSION_CORE_NAMESPACE,
    TIMELINE_NAMESPACE,
} from './session-snapshot.js';
import { validateKnowledgeBindingSet } from './session-knowledge.js';
import { hashNativeDocument } from './repositories/common.js';

const NON_PORTABLE_STATE_PATTERNS = Object.freeze([
    /^atri_embeddings(?:_|$)/,
    /^atri_rerank(?:_|$)/,
    /^atri_search_index(?:_|$)/,
    /^atri_context_plan_cache(?:_|$)/,
    /^atri_token_cache(?:_|$)/,
    /^atri_render_cache(?:_|$)/,
    /^atri_recent_index(?:_|$)/,
    /^atri_thumbnail_cache(?:_|$)/,
    /^atri_compiled_cache(?:_|$)/,
]);

function clone(value) {
    return structuredClone(value);
}

function byIdentity(values, selector) {
    return [...values].sort((a, b) => selector(a).localeCompare(selector(b)));
}

function portableNamespace(namespace) {
    return !NON_PORTABLE_STATE_PATTERNS.some(pattern => pattern.test(namespace));
}

function attachmentKey(item) {
    return [item.assetId, item.messageId || '', item.variantId || ''].join('\0');
}

function savePackage(session) {
    return {
        packageId: session.packageId,
        packageVersionId: session.packageVersionId,
        packageVersion: session.packageVersion,
        packageContentHash: session.packageContentHash,
        entryPointId: session.entryPointId,
    };
}

function importedKnowledgeAsSessionBound(value, manifest, entryPoint) {
    const next = clone(value);
    for (const binding of next.bindings || []) {
        if (binding.source?.kind === 'library') binding.source.kind = 'session';
    }
    for (const item of next.snapshots || []) {
        if (item.kind === 'library') item.kind = 'session';
    }
    return validateKnowledgeBindingSet(next, manifest, entryPoint);
}

export class NativeSaveSystem {
    constructor({
        sessionCore,
        sessionRepo,
        savePointRepo,
        packageInstaller,
        assetStore,
        knowledgeRepo,
    }) {
        if (!sessionCore || !sessionRepo || !savePointRepo || !packageInstaller || !assetStore || !knowledgeRepo) {
            throw new TypeError('NativeSaveSystem requires SessionCore, SessionRepo, SavePointRepo, PackageInstaller, AssetStore and KnowledgeRepo');
        }
        this._core = sessionCore;
        this._sessions = sessionRepo;
        this._saves = savePointRepo;
        this._packages = packageInstaller;
        this._assets = assetStore;
        this._knowledge = knowledgeRepo;
    }

    autoSave(handle, sessionId, options = {}) {
        return this._core.createSavePoint(handle, sessionId, { ...options, kind: 'auto' });
    }

    quickSave(handle, sessionId, options = {}) {
        return this._core.createSavePoint(handle, sessionId, { ...options, kind: 'quick' });
    }

    manualSave(handle, sessionId, options = {}) {
        return this._core.createSavePoint(handle, sessionId, { ...options, kind: 'manual' });
    }

    async _collectClosure(handle, sessionId, rootRevisionIds) {
        const revisions = new Map();
        const branches = new Map();
        const entries = new Map();
        const variants = new Map();
        const states = new Map();
        const assetRefs = new Map();
        const assetPayloads = new Map();
        const attachments = new Map();
        const pending = [...new Set(rootRevisionIds)];

        while (pending.length) {
            const revisionId = pending.pop();
            if (revisions.has(revisionId)) continue;
            const revision = await this._sessions.getRevision(handle, sessionId, revisionId);
            if (!revision) throw new NativeDependencyError('native_save_revision_missing', { sessionId, revisionId });
            revisions.set(revisionId, clone(revision));

            const statePairs = [
                ...Object.entries(revision.stateHeads),
                [KNOWLEDGE_NAMESPACE, revision.knowledgeHead],
            ];
            for (const [namespace, head] of statePairs) {
                if (!portableNamespace(namespace)) continue;
                const stateKey = namespace + '\0' + head;
                if (!states.has(stateKey)) {
                    const data = await this._sessions.getState(handle, sessionId, namespace, head);
                    if (data === null || data === undefined) {
                        throw new NativeDependencyError('native_save_state_missing', {
                            sessionId, revisionId, namespace, head,
                        });
                    }
                    states.set(stateKey, { namespace, head, data: clone(data) });
                    if (namespace === 'atri_world_selection') for (const world of data.worlds || []) for (const assetId of world.revision.assetIds || []) {
                        const attachment = { assetId }; attachments.set(attachmentKey(attachment), attachment);
                    }
                }
            }

            const coreHead = revision.stateHeads[SESSION_CORE_NAMESPACE];
            const core = coreHead
                ? states.get(SESSION_CORE_NAMESPACE + '\0' + coreHead)?.data
                : null;
            if (!core || !Array.isArray(core.branches)) {
                throw new NativeDependencyError('native_save_core_missing', { sessionId, revisionId });
            }
            if (core.parentRevisionId) pending.push(core.parentRevisionId);
            for (const node of core.branches) {
                pending.push(node.headRevisionId);
                if (node.forkRevisionId) pending.push(node.forkRevisionId);
                if (!branches.has(node.branchId)) {
                    const branch = await this._sessions.getBranch(handle, sessionId, node.branchId);
                    if (!branch) throw new NativeDependencyError('native_save_branch_missing', {
                        sessionId, branchId: node.branchId,
                    });
                    branches.set(node.branchId, clone(branch));
                }
            }

            const timelineHead = revision.stateHeads[TIMELINE_NAMESPACE];
            const timeline = timelineHead
                ? states.get(TIMELINE_NAMESPACE + '\0' + timelineHead)?.data
                : null;
            if (!Array.isArray(timeline)) {
                throw new NativeDependencyError('native_save_timeline_missing', { sessionId, revisionId });
            }
            for (const selection of timeline) {
                if (!entries.has(selection.messageId)) {
                    const entry = await this._sessions.getTimelineEntry(
                        handle,
                        sessionId,
                        selection.branchId,
                        selection.messageId,
                    );
                    if (!entry) throw new NativeDependencyError('native_save_timeline_entry_missing', {
                        sessionId,
                        messageId: selection.messageId,
                    });
                    entries.set(selection.messageId, clone(entry));
                }
                for (const variantId of selection.variantIds || []) {
                    if (variants.has(variantId)) continue;
                    const variant = await this._sessions.getVariant(handle, sessionId, selection.messageId, variantId);
                    if (!variant) throw new NativeDependencyError('native_save_variant_missing', {
                        sessionId,
                        messageId: selection.messageId,
                        variantId,
                    });
                    variants.set(variantId, clone(variant));
                    for (const item of variant.metadata?.attachments || []) {
                        if (!item?.assetId) continue;
                        const attachment = {
                            assetId: item.assetId,
                            messageId: selection.messageId,
                            variantId,
                        };
                        attachments.set(attachmentKey(attachment), attachment);
                    }
                }
            }
        }

        for (const attachment of attachments.values()) {
            if (assetRefs.has(attachment.assetId)) continue;
            const asset = await this._assets.read(handle, attachment.assetId);
            if (!asset) throw new NativeDependencyError('native_save_asset_missing', {
                assetId: attachment.assetId,
            });
            assetRefs.set(attachment.assetId, clone(asset.ref));
            assetPayloads.set(attachment.assetId, Buffer.from(asset.bytes));
        }

        const revisionDocs = [...revisions.values()].map(revision => {
            const stateHeads = Object.fromEntries(
                Object.entries(revision.stateHeads).filter(([namespace]) => portableNamespace(namespace)),
            );
            return { ...revision, stateHeads };
        });

        return {
            revisions: byIdentity(revisionDocs, item => item.revisionId),
            branches: byIdentity(branches.values(), item => item.branchId),
            timelineEntries: byIdentity(entries.values(), item => item.messageId),
            variants: byIdentity(variants.values(), item => item.variantId),
            stateRecords: byIdentity(states.values(), item => item.namespace + '\0' + item.head),
            assetRefs: byIdentity(assetRefs.values(), item => item.assetId),
            attachments: byIdentity(attachments.values(), attachmentKey),
            assetPayloads,
        };
    }

    async _buildSave(handle, sessionId, { scope, saveId = null }) {
        const current = await this._sessions.get(handle, sessionId);
        if (!current) throw new NativeDependencyError('native_save_session_missing', { sessionId });

        let rootRevisionId;
        let rootSave = null;
        let savePoints;
        if (scope === 'snapshot') {
            if (!saveId) throw new TypeError('Snapshot .atriasave export requires saveId');
            rootSave = await this._saves.get(handle, sessionId, saveId);
            if (!rootSave) throw new NativeDependencyError('native_save_point_missing', { sessionId, saveId });
            rootRevisionId = rootSave.revisionId;
            savePoints = [rootSave];
        } else if (scope === 'session') {
            rootRevisionId = current.headRevisionId;
            if (!rootRevisionId) throw new NativeDependencyError('native_save_session_head_missing', { sessionId });
            savePoints = await this._saves.list(handle, sessionId);
        } else {
            throw new TypeError('Unsupported .atriasave scope');
        }

        const roots = scope === 'session'
            ? [rootRevisionId, ...savePoints.map(save => save.revisionId)]
            : [rootRevisionId];
        const closure = await this._collectClosure(handle, sessionId, roots);
        const rootRevision = closure.revisions.find(item => item.revisionId === rootRevisionId);
        if (!rootRevision) throw new NativeDependencyError('native_save_root_revision_missing', { rootRevisionId });

        const logicalSession = scope === 'snapshot'
            ? {
                ...clone(current),
                activeBranchId: rootRevision.branchId,
                headRevisionId: rootRevision.revisionId,
                updatedAt: Math.max(Number(current.createdAt || 0), Number(rootRevision.createdAt || 0)),
            }
            : clone(current);

        const save = assertAtriaSave({
            format: ATRIA_SAVE_FORMAT,
            schemaVersion: ATRIA_SAVE_SCHEMA_VERSION,
            nativeSchemaVersion: NATIVE_SCHEMA_VERSION,
            scope,
            exportedAt: Date.now(),
            package: savePackage(current),
            root: {
                sessionId,
                revisionId: rootRevisionId,
                saveId: rootSave?.saveId ?? null,
            },
            closure: {
                session: logicalSession,
                branches: closure.branches,
                timelineEntries: closure.timelineEntries,
                variants: closure.variants,
                stateRecords: closure.stateRecords,
                revisions: closure.revisions,
                savePoints: byIdentity(savePoints, item => item.saveId),
                assetRefs: closure.assetRefs,
                attachments: closure.attachments,
            },
        });
        return { save, assetPayloads: closure.assetPayloads };
    }

    async exportSnapshot(handle, sessionId, saveId, { password = undefined } = {}) {
        const built = await this._buildSave(handle, sessionId, { scope: 'snapshot', saveId });
        return buildAtriaSaveContainer({ ...built, password });
    }

    async exportSession(handle, sessionId, { password = undefined } = {}) {
        const built = await this._buildSave(handle, sessionId, { scope: 'session' });
        return buildAtriaSaveContainer({ ...built, password });
    }

    async preflightImport(handle, archive) {
        const preflight = preflightAtriaSaveContainer(archive);
        let installed;
        try {
            installed = await this._packages.open(
                handle,
                preflight.package.packageId,
                preflight.package.packageVersionId,
            );
        } catch (error) {
            return Object.freeze({
                ...preflight,
                dependency: Object.freeze({
                    status: 'invalid_local_dependency',
                    code: error?.code || 'native_save_package_invalid',
                    required: preflight.package,
                }),
            });
        }
        if (!installed) {
            return Object.freeze({
                ...preflight,
                dependency: Object.freeze({
                    status: 'missing',
                    code: 'native_save_package_missing',
                    required: preflight.package,
                }),
            });
        }
        const exact = installed.packageVersion.version === preflight.package.packageVersion
            && installed.packageVersion.packageContentHash === preflight.package.packageContentHash
            && installed.manifest.entryPoints.some(item => item.entryPointId === preflight.package.entryPointId);
        return Object.freeze({
            ...preflight,
            dependency: Object.freeze({
                status: exact ? 'ready' : 'mismatch',
                code: exact ? null : 'native_save_package_mismatch',
                required: preflight.package,
            }),
        });
    }

    async _requirePackage(handle, packageDependency) {
        const installed = await this._packages.open(
            handle,
            packageDependency.packageId,
            packageDependency.packageVersionId,
        );
        if (!installed) {
            throw new NativeDependencyError('native_save_package_missing', {
                required: packageDependency,
            });
        }
        if (
            installed.packageVersion.version !== packageDependency.packageVersion
            || installed.packageVersion.packageContentHash !== packageDependency.packageContentHash
        ) {
            throw new NativeDependencyError('native_save_package_mismatch', {
                required: packageDependency,
                installed: installed.packageVersion,
            });
        }
        const entryPoint = installed.manifest.entryPoints.find(
            item => item.entryPointId === packageDependency.entryPointId,
        );
        if (!entryPoint) {
            throw new NativeDependencyError('native_save_entry_point_missing', {
                entryPointId: packageDependency.entryPointId,
            });
        }
        return { ...installed, entryPoint };
    }

    _embedImportedLibraryKnowledge(saveInput, manifest, entryPoint) {
        const save = clone(saveInput);
        const headMap = new Map();
        for (const record of save.closure.stateRecords) {
            if (record.namespace !== KNOWLEDGE_NAMESPACE) continue;
            const previousHead = record.head;
            record.data = importedKnowledgeAsSessionBound(record.data, manifest, entryPoint);
            record.head = hashNativeDocument(record.data);
            headMap.set(previousHead, record.head);
        }
        for (const revision of save.closure.revisions) {
            const next = headMap.get(revision.knowledgeHead);
            if (!next) throw new NativeDependencyError('native_save_knowledge_state_missing', {
                revisionId: revision.revisionId,
                knowledgeHead: revision.knowledgeHead,
            });
            revision.knowledgeHead = next;
        }
        return assertAtriaSave(save);
    }

    async importSave(handle, archive, { password = undefined } = {}) {
        const inspected = inspectAtriaSaveContainer(archive, { password });
        const installed = await this._requirePackage(handle, inspected.save.package);
        const save = this._embedImportedLibraryKnowledge(
            inspected.save,
            installed.manifest,
            installed.entryPoint,
        );

        const newlyAdded = [];
        try {
            for (const ref of save.closure.assetRefs) {
                const existing = await this._assets.getRef(handle, ref.assetId);
                const bytes = inspected.assets.get(ref.assetId);
                if (!existing) newlyAdded.push(ref.assetId);
                await this._assets.put(handle, ref, bytes);
            }
            await this._sessions.importClosure(handle, save.closure);
        } catch (error) {
            for (const assetId of newlyAdded) {
                try { await this._assets.deleteRef(handle, assetId); } catch { /* orphan blob is GC-safe */ }
            }
            throw error;
        }

        return this._core.load(handle, save.root.sessionId);
    }

    async promoteEmbeddedKnowledge(handle, sessionId, {
        revisionId = undefined,
        knowledgeBindingId,
        displayName = undefined,
        expectedLibraryRevisionId = undefined,
        targetBindingId = undefined,
    }) {
        const view = await this._core.load(handle, sessionId, { revisionId });
        const binding = view.knowledge.bindings.find(item => item.knowledgeBindingId === knowledgeBindingId);
        if (!binding || binding.source.kind !== 'session') {
            throw new NativeDependencyError('native_save_embedded_knowledge_missing', { knowledgeBindingId });
        }
        const wrapped = view.knowledge.snapshots.find(item => (
            item.kind === 'session'
            && item.snapshot.knowledgeBase.knowledgeBaseId === binding.source.knowledgeBaseId
            && item.snapshot.revision.knowledgeRevisionId === binding.source.knowledgeRevisionId
        ));
        if (!wrapped) {
            throw new NativeDependencyError('native_save_embedded_knowledge_missing', { knowledgeBindingId });
        }
        const snapshot = clone(wrapped.snapshot);
        const promoted = {
            ...clone(binding),
            knowledgeBindingId: targetBindingId === undefined ? createNativeId('knowledgeBinding') : assertNativeId(targetBindingId, 'knowledgeBinding'),
            source: { ...clone(binding.source), kind: 'library' },
        };
        const existingBinding = await this._knowledge.getBinding(handle, promoted.knowledgeBindingId);
        if (existingBinding && hashNativeDocument(existingBinding) !== hashNativeDocument(promoted)) throw new ConflictError('native_write_conflict');
        const existing = await this._knowledge.get(handle, snapshot.knowledgeBase.knowledgeBaseId);
        if (!existingBinding && expectedLibraryRevisionId !== undefined && (existing?.currentRevisionId ?? null) !== expectedLibraryRevisionId) throw new ConflictError('native_write_conflict');
        const name = displayName === undefined ? snapshot.knowledgeBase.displayName : String(displayName).trim();
        if (!name) throw new TypeError('Knowledge Base displayName is required');
        const exact = await this._knowledge.getRevision(
            handle,
            snapshot.knowledgeBase.knowledgeBaseId,
            snapshot.revision.knowledgeRevisionId,
        );
        if (!exact) {
            await this._knowledge.commitRevision(handle, snapshot.revision, snapshot.entries, {
                expectedCurrentRevisionId: existing?.currentRevisionId ?? null,
                ...(!existing ? { createRoot: { ...snapshot.knowledgeBase, displayName: name, currentRevisionId: null } } : {}),
            });
        } else if (hashNativeDocument(exact) !== hashNativeDocument(snapshot.revision)
            || hashNativeDocument(await this._knowledge.listEntries(handle, snapshot.knowledgeBase.knowledgeBaseId, snapshot.revision.knowledgeRevisionId)) !== hashNativeDocument(snapshot.entries)) {
            throw new NativeDependencyError('native_save_library_revision_conflict', {
                knowledgeBaseId: snapshot.knowledgeBase.knowledgeBaseId,
                knowledgeRevisionId: snapshot.revision.knowledgeRevisionId,
            });
        }
        if (!existingBinding) await this._knowledge.saveBinding(handle, promoted, { expectedIntegrity: null });
        return Object.freeze({
            knowledgeBase: await this._knowledge.get(handle, snapshot.knowledgeBase.knowledgeBaseId),
            revision: await this._knowledge.getRevision(
                handle,
                snapshot.knowledgeBase.knowledgeBaseId,
                snapshot.revision.knowledgeRevisionId,
            ),
            entries: await this._knowledge.listEntries(
                handle,
                snapshot.knowledgeBase.knowledgeBaseId,
                snapshot.revision.knowledgeRevisionId,
            ),
            binding: promoted,
        });
    }
}
