import { randomUUID, createHash } from 'node:crypto';
import { ConflictError } from '../storage/errors.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { assertNoSecretMaterial } from './model-prompt-runtime/contracts.js';
import { cloneNativeDocument, hashNativeDocument } from './repositories/common.js';
import { createNativeId } from './identity.js';

export const RESOURCE_BUNDLE_FORMAT = 'atria-resource-bundle';
export const RESOURCE_BUNDLE_LIMITS = Object.freeze({ bytes: 32 * 1024 * 1024, resources: 512, depth: 64 });
const imports = new Map();
export function bundleRef(value) {
    if (!value || !/^[a-z][a-z0-9]*(?:[.:-][a-z0-9_-]+)+$/.test(value.resourceType) || !['library', 'project', 'package'].includes(value.scope)) throw new TypeError('Invalid Resource Bundle reference');
    const result = {};
    for (const name of ['resourceType', 'resourceId', 'revision', 'scope', ...(value.scope === 'project' ? ['projectId'] : value.scope === 'package' ? ['packageId', 'packageVersionId'] : [])]) {
        if (typeof value[name] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value[name])) throw new TypeError('Invalid Resource Bundle reference field: ' + name);
        result[name] = value[name];
    }
    return result;
}
export const bundleRefKey = ref => hashNativeDocument(bundleRef(ref));
export const bundleLogicalKey = ref => { const value = bundleRef(ref); delete value.revision; return hashNativeDocument(value); };
function portable(value) {
    assertNoSecretMaterial(value, 'Resource Bundle');
    function visit(item, depth = 0) {
        if (depth > 64) throw new TypeError('Resource Bundle value is too deep');
        if (!item || typeof item !== 'object') return;
        for (const [key, child] of Object.entries(item)) {
            if (/^(secretRef|secretId|connectionProfileRef|modelProfileRef|runtimeRouteId|credentials)$/i.test(key)) throw new TypeError('Resource Bundle cannot contain player configuration: ' + key);
            visit(child, depth + 1);
        }
    }
    visit(value); return cloneNativeDocument(value);
}
function limited(value) {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > RESOURCE_BUNDLE_LIMITS.bytes) throw new TypeError('Resource Bundle exceeds size limit');
    return portable(value);
}

// Adapters only compose existing resource authorities. New registered resource types
// use this same format, validation, closure traversal and import review protocol.
export class ResourceBundleService {
    constructor({ registry, adapters = new Map() }) { this.registry = registry; this.adapters = new Map(); for (const [type, adapter] of adapters) this.registerAdapter(type, adapter); }
    registerAdapter(type, adapter) {
        if (!this.registry.has(type) || !['read', 'dependencies', 'validate', 'rewrite', 'inspect', 'write'].every(method => typeof adapter?.[method] === 'function')) throw new TypeError('Resource Bundle adapter requires a registered resource and complete authority methods');
        if (this.adapters.has(type)) throw new TypeError('Resource Bundle adapter already registered'); this.adapters.set(type, adapter);
    }
    adapter(ref) { const adapter = this.adapters.get(ref.resourceType); if (!adapter) throw new TypeError('Resource type cannot be shared as a Resource Bundle: ' + ref.resourceType); return adapter; }
    async export(handle, rootValue) {
        const root = bundleRef(rootValue), resources = new Map(), active = new Set(); let totalBytes = 0;
        const visit = async value => {
            const ref = bundleRef(value), key = bundleRefKey(ref); if (active.has(key)) throw new TypeError('Resource Bundle dependency cycle'); if (resources.has(key)) return;
            if (active.size >= RESOURCE_BUNDLE_LIMITS.depth || resources.size + active.size >= RESOURCE_BUNDLE_LIMITS.resources) throw new TypeError('Resource Bundle closure exceeds limits');
            active.add(key); const adapter = this.adapter(ref), data = portable(await adapter.read(handle, ref)); adapter.validate(ref, data); totalBytes += Buffer.byteLength(JSON.stringify(data)); if (totalBytes > RESOURCE_BUNDLE_LIMITS.bytes) throw new TypeError('Resource Bundle exceeds size limit');
            const dependencies = (await adapter.dependencies(handle, ref, data)).map(bundleRef);
            for (const dependency of dependencies) await visit(dependency);
            resources.set(key, { ref, data, dependencies, integrity: hashNativeDocument(data) }); active.delete(key);
        };
        await visit(root); return limited({ format: RESOURCE_BUNDLE_FORMAT, schemaVersion: 1, createdAt: Date.now(), root, resources: [...resources.values()] });
    }
    async validate(value) {
        const bundle = limited(value);
        if (bundle.format !== RESOURCE_BUNDLE_FORMAT || bundle.schemaVersion !== 1 || !Number.isSafeInteger(bundle.createdAt) || bundle.createdAt < 0 || !Array.isArray(bundle.resources) || !bundle.resources.length || bundle.resources.length > RESOURCE_BUNDLE_LIMITS.resources) throw new TypeError('Invalid Resource Bundle format');
        const nodes = new Map();
        for (const item of bundle.resources) {
            const ref = bundleRef(item.ref), key = bundleRefKey(ref);
            if (nodes.has(key) || item.integrity !== hashNativeDocument(item.data) || !Array.isArray(item.dependencies)) throw new TypeError('Resource Bundle duplicate or corrupted resource');
            this.adapter(ref).validate(ref, item.data); item.ref = ref; item.dependencies = item.dependencies.map(bundleRef); nodes.set(key, item);
        }
        const active = new Set(), done = new Set(), ordered = [];
        const visit = async ref => {
            const key = bundleRefKey(ref); if (active.has(key)) throw new TypeError('Resource Bundle dependency cycle'); if (done.has(key)) return;
            if (active.size >= RESOURCE_BUNDLE_LIMITS.depth) throw new TypeError('Resource Bundle dependency depth exceeded');
            const item = nodes.get(key); if (!item) throw new TypeError('Resource Bundle exact dependency is missing'); active.add(key);
            const resolve = (type, id, revision = null) => {
                const matches = item.dependencies.filter(dep => dep.resourceType === type && dep.resourceId === id && (revision === null || dep.revision === revision));
                if (matches.length !== 1) throw new TypeError('Resource Bundle dependency is missing or ambiguous'); return matches[0];
            };
            const expected = await this.adapter(ref).dependencies(null, ref, item.data, resolve);
            if (hashNativeDocument(expected.map(bundleRefKey).sort()) !== hashNativeDocument(item.dependencies.map(bundleRefKey).sort())) throw new TypeError('Resource Bundle declared closure does not match its content');
            for (const dependency of item.dependencies) await visit(dependency);
            active.delete(key); done.add(key); ordered.push(item);
        };
        await visit(bundleRef(bundle.root)); if (done.size !== nodes.size) throw new TypeError('Resource Bundle contains unreachable resources'); return { bundle, ordered, bundleHash: hashNativeDocument(bundle) };
    }
    async preflight(handle, value, token = null) {
        const { bundle, ordered, bundleHash } = await this.validate(value);
        const seed = token?.seed || randomUUID().replaceAll('-', '');
        if (!/^[a-f0-9]{32}$/.test(seed) || token && token.bundleHash !== bundleHash) throw new TypeError('Resource Bundle review no longer matches its content');
        const mapped = new Map(), prepared = [], conflicts = [], existingOrigins = [];
        const id = (kind, key) => createNativeId(kind, () => createHash('sha256').update(seed + bundleHash + kind + key).digest('hex').slice(0, 32));
        const context = {
            id, createdAt: bundle.createdAt, bundleHash,
            ref: ref => { const found = mapped.get(bundleRefKey(ref)); if (!found) throw new TypeError('Resource Bundle dependency mapping is missing'); return found; },
            logicalId: (type, originalId, owner) => {
                let candidates = ordered.filter(item => item.ref.resourceType === type && item.ref.resourceId === originalId && bundleLogicalKey({ ...item.ref, resourceId: owner.resourceId, resourceType: owner.resourceType }) === bundleLogicalKey(owner));
                if (!candidates.length) candidates = ordered.filter(item => item.ref.resourceType === type && item.ref.resourceId === originalId);
                const ids = [...new Set(candidates.map(item => mapped.get(bundleRefKey(item.ref))?.resourceId).filter(Boolean))];
                if (ids.length !== 1) throw new TypeError('Resource Bundle logical dependency mapping is ambiguous'); return ids[0];
            },
        };
        for (const item of ordered) {
            const adapter = this.adapter(item.ref), result = adapter.rewrite(item, context); result.ref = bundleRef(result.ref); adapter.validate(result.ref, result.data); portable(result.data);
            if (result.ref.scope !== 'library' || result.ref.resourceId === item.ref.resourceId) throw new TypeError('Resource Bundle import must create a new Library identity');
            mapped.set(bundleRefKey(item.ref), result.ref);
            const status = await adapter.inspect(handle, result.ref, result.data, context);
            if (!['new', 'same', 'conflict'].includes(status)) throw new TypeError('Invalid Resource Bundle inspection result');
            if (status === 'conflict') conflicts.push({ source: item.ref, target: result.ref });
            try { await adapter.read(handle, item.ref); existingOrigins.push(item.ref); } catch (error) { if (error?.name !== 'NotFoundError' && error?.status !== 404) throw error; }
            prepared.push({ source: item.ref, ...result, status });
        }
        return { format: RESOURCE_BUNDLE_FORMAT, token: { seed, bundleHash }, root: mapped.get(bundleRefKey(bundle.root)), resources: prepared, conflicts, existingOrigins, canImport: !conflicts.length };
    }
    async import(handle, bundle, token) {
        assertWritable(); if (!token) throw new TypeError('Review Resource Bundle before importing');
        const key = JSON.stringify([handle, token.seed]); const run = (imports.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
            const plan = await this.preflight(handle, bundle, token); if (!plan.canImport) throw new ConflictError('native_resource_bundle_conflict', { conflicts: plan.conflicts });
            const completed = [];
            try {
                for (const item of plan.resources) { if (item.status !== 'same') await this.adapter(item.ref).write(handle, item.ref, item.data, { bundleHash: token.bundleHash }); completed.push(item.ref); }
            } catch (cause) {
                const error = new Error('Resource Bundle import was interrupted. Retry the same reviewed import to resume safely.', { cause }); error.code = 'native_resource_bundle_interrupted'; error.details = { completed, retryable: true }; throw error;
            }
            return { root: plan.root, resources: completed };
        });
        imports.set(key, run); try { return await run; } finally { if (imports.get(key) === run) imports.delete(key); }
    }
}
