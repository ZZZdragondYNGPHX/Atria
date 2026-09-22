import {
    NATIVE_RESOURCE_KINDS,
    assertPackageRecord,
    assertPackageVersion,
} from '../contracts.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import {
    cloneNativeDocument,
    getNativeDocument,
    listNativeDocuments,
    putImmutable,
    putMutable,
} from './common.js';

export class PackageRepo {
    constructor({ engine }) {
        if (!engine) throw new TypeError('PackageRepo requires { engine }');
        this._engine = engine;
    }

    _packageKey(handle, packageId) {
        return { kind: NATIVE_RESOURCE_KINDS.package, handle, packageId };
    }

    _versionKey(handle, packageId, packageVersionId) {
        return { kind: NATIVE_RESOURCE_KINDS.packageVersion, handle, packageId, packageVersionId };
    }

    _stateKey(handle, packageId, namespace) {
        return { kind: NATIVE_RESOURCE_KINDS.packageState, handle, packageId, namespace };
    }

    async get(handle, packageId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(tx, this._packageKey(handle, packageId)));
    }

    async list(handle) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.package,
            handle,
            orderBy: 'updatedAt',
        }));
    }

    async create(handle, value) {
        assertWritable();
        const record = assertPackageRecord(value);
        return this._engine.withTransaction(handle, tx => putMutable(
            tx,
            this._packageKey(handle, record.packageId),
            record,
            { expectedIntegrity: null },
        ));
    }

    async save(handle, value, options = {}) {
        assertWritable();
        const record = assertPackageRecord(value);
        return this._engine.withTransaction(handle, async (tx) => {
            if (record.currentVersionId) {
                const version = await getNativeDocument(
                    tx,
                    this._versionKey(handle, record.packageId, record.currentVersionId),
                );
                if (!version) throw new NotFoundError('native package version', {
                    packageId: record.packageId,
                    packageVersionId: record.currentVersionId,
                });
            }
            return putMutable(tx, this._packageKey(handle, record.packageId), record, options);
        });
    }

    async getVersion(handle, packageId, packageVersionId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._versionKey(handle, packageId, packageVersionId),
        ));
    }

    async listVersions(handle, packageId) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.packageVersion,
            handle,
            packageId,
            orderBy: 'createdAt',
        }));
    }

    async commitVersion(handle, value, { setCurrent = true } = {}) {
        assertWritable();
        const version = assertPackageVersion(value);
        return this._engine.withTransaction(handle, async (tx) => {
            const packageKey = this._packageKey(handle, version.packageId);
            const current = await getNativeDocument(tx, packageKey);
            if (!current) throw new NotFoundError('native package', { packageId: version.packageId });

            // Immutable child first. On FsEngine a later pointer failure may leave
            // this version orphaned, but it cannot become current accidentally.
            await putImmutable(
                tx,
                this._versionKey(handle, version.packageId, version.packageVersionId),
                version,
            );

            if (!setCurrent) return version;
            const next = assertPackageRecord({
                ...current,
                currentVersionId: version.packageVersionId,
                updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0)),
            });
            // Commit/publish pointer last.
            await putMutable(tx, packageKey, next);
            return version;
        });
    }

    async getState(handle, packageId, namespace) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._stateKey(handle, packageId, namespace),
        ));
    }

    async setState(handle, packageId, namespace, value, options = {}) {
        assertWritable();
        const doc = cloneNativeDocument(value, 'PackageUserState');
        return this._engine.withTransaction(handle, async (tx) => {
            const parent = await getNativeDocument(tx, this._packageKey(handle, packageId));
            if (!parent) throw new NotFoundError('native package', { packageId });
            return putMutable(tx, this._stateKey(handle, packageId, namespace), doc, options);
        });
    }

    async listStates(handle, packageId) {
        return this._engine.withTransaction(handle, tx => tx.listResources({
            kind: NATIVE_RESOURCE_KINDS.packageState,
            handle,
            packageId,
        }));
    }

    async deleteState(handle, packageId, namespace) {
        assertWritable();
        return this._engine.withTransaction(handle, tx => tx.deleteResource(
            this._stateKey(handle, packageId, namespace),
        ));
    }

    async _versionReferences(tx, handle, packageId, packageVersionId) {
        const references = [];
        const root = await getNativeDocument(tx, this._packageKey(handle, packageId));
        if (root?.currentVersionId === packageVersionId) {
            references.push({ kind: 'package-current', packageId });
        }
        const sessions = await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.session, handle });
        for (const record of sessions) {
            if (record.doc?.packageId === packageId && record.doc?.packageVersionId === packageVersionId) {
                references.push({ kind: 'session', sessionId: record.doc.sessionId });
            }
        }
        return references;
    }

    async getVersionReferences(handle, packageId, packageVersionId) {
        return this._engine.withTransaction(handle, tx => this._versionReferences(
            tx,
            handle,
            packageId,
            packageVersionId,
        ));
    }

    async deleteVersion(handle, packageId, packageVersionId) {
        assertWritable();
        return this._engine.withTransaction(handle, async (tx) => {
            const references = await this._versionReferences(tx, handle, packageId, packageVersionId);
            if (references.length) {
                throw new ConflictError('native_package_version_referenced', {
                    packageId,
                    packageVersionId,
                    references,
                });
            }
            return tx.deleteResource(this._versionKey(handle, packageId, packageVersionId));
        });
    }

    async gcVersions(handle, packageId, { retainVersionIds = [] } = {}) {
        assertWritable();
        const retained = new Set(retainVersionIds);
        return this._engine.withTransaction(handle, async (tx) => {
            const root = await getNativeDocument(tx, this._packageKey(handle, packageId));
            if (root?.currentVersionId) retained.add(root.currentVersionId);

            for (const session of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.session,
                handle,
            })) {
                if (session.doc?.packageId === packageId && session.doc?.packageVersionId) {
                    retained.add(session.doc.packageVersionId);
                }
            }

            const deleted = [];
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.packageVersion,
                handle,
                packageId,
            })) {
                const packageVersionId = record.key.packageVersionId;
                if (retained.has(packageVersionId)) continue;
                if (await tx.deleteResource(record.key)) deleted.push(packageVersionId);
            }
            return deleted;
        });
    }

    async delete(handle, packageId) {
        assertWritable();
        return this._engine.withTransaction(handle, async (tx) => {
            const sessions = await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.session, handle });
            const references = sessions
                .filter(record => record.doc?.packageId === packageId)
                .map(record => ({ kind: 'session', sessionId: record.doc.sessionId }));
            if (references.length) {
                throw new ConflictError('native_package_referenced', { packageId, references });
            }
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.packageState,
                handle,
                packageId,
            })) {
                await tx.deleteResource(record.key);
            }
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.packageVersion,
                handle,
                packageId,
            })) {
                await tx.deleteResource(record.key);
            }
            return tx.deleteResource(this._packageKey(handle, packageId));
        });
    }
}
