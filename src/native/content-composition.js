import { createHash } from 'node:crypto';
import { assertCommunityPayload, exactBaseRef, exactContentRef } from '../../public/shared/native-content-contract.js';
import { assertAtriaPackageManifest } from './contracts.js';
import { inspectAtriaPackageContainer } from './package-container.js';
import { hashNativeDocument } from './repositories/common.js';

export const contentDigest = bytes => createHash('sha256').update(bytes).digest('hex');
const contentAsset = (bytes, mediaType = 'application/json') => ({ assetId: 'asset_' + contentDigest(bytes).slice(0, 32), contentHash: contentDigest(bytes), size: bytes.length, mediaType });
export function readCommunity(bytes, base, runtime) {
    if (!Buffer.isBuffer(bytes) || bytes.length > 1024 * 1024) throw new TypeError('Community payload byte limit');
    // Parse, validate, and copy only the closed JSON contract. Never trust a
    // registry's validation flag, advertised type, HTML description or code.
    try { return assertCommunityPayload(JSON.parse(bytes.toString('utf8')), base, runtime); } catch (error) { throw new TypeError(error.message); }
}

export function composeContent(baseBytes, resources, packageVersionId) {
    const opened = inspectAtriaPackageContainer(baseBytes);
    const original = opened.manifest;
    const runtime = original.runtime?.experienceContract?.contentRuntime;
    if (!runtime || runtime.composition) throw new TypeError('Composition requires an uncomposed Base with extension points');
    const base = exactBaseRef({ packageId: original.packageId, packageVersionId: original.packageVersionId, packageContentHash: contentDigest(baseBytes) });
    if (!Array.isArray(resources) || resources.length > 32) throw new TypeError('Composition resource limit');
    const items = resources.map(({ ref, bytes }) => {
        exactContentRef(ref);
        if (contentDigest(bytes) !== ref.contentHash) throw new TypeError('Community content hash mismatch');
        return { ref, bytes, value: readCommunity(bytes, base, runtime) };
    }).sort((a, b) => a.value.id.localeCompare(b.value.id, 'en'));
    if (new Set(items.map(item => item.value.id)).size !== items.length || new Set(items.map(item => item.ref.assetId)).size !== items.length) throw new TypeError('Duplicate Add-on/resource');
    const visiting = new Set(), visited = new Set(), ordered = [];
    const visit = item => {
        if (visiting.has(item)) throw new TypeError('Add-on dependency cycle');
        if (visited.has(item)) return;
        visiting.add(item);
        for (const required of item.value.requires) {
            const dependency = items.find(candidate => candidate.ref.assetId === required.assetId && candidate.ref.contentHash === required.contentHash);
            if (!dependency) throw new TypeError('Missing exact Add-on dependency');
            visit(dependency);
        }
        if (item.value.conflicts.some(id => items.some(candidate => candidate.value.id === id))) throw new TypeError('Add-on conflict');
        visiting.delete(item); visited.add(item); ordered.push(item);
    };
    items.forEach(visit);
    const manifest = structuredClone(original);
    manifest.packageVersionId = packageVersionId;
    // Existing packaged Prompt refs retain their exact resource revisions, but
    // the containing resolved PackageVersion owns the closure.
    const remap = value => {
        if (!value || typeof value !== 'object') return;
        if (value.packageId === base.packageId && value.packageVersionId === base.packageVersionId) value.packageVersionId = packageVersionId;
        Object.values(value).forEach(remap);
    };
    remap(manifest.resources); remap(manifest.runtime?.modelPrompt);
    const contract = manifest.runtime.experienceContract;
    const assets = new Map(opened.assets);
    const add = (ref, bytes) => {
        if (manifest.assets.some(asset => asset.assetId === ref.assetId)) throw new TypeError('Content Asset identity collision');
        manifest.assets.push(ref); assets.set(ref.assetId, bytes);
    };
    add(contentAsset(baseBytes, 'application/vnd.atria.package'), baseBytes);
    for (const item of ordered) add({ ...item.ref, mediaType: 'application/json', size: item.bytes.length }, item.bytes);
    for (const point of runtime.extensionPoints) {
        if (contract.dataResources.some(ref => ref.resourceId === point.resourceId || ref.resourceId.startsWith(point.resourceId + '.') || point.resourceId.startsWith(ref.resourceId + '.'))) throw new TypeError('Extension cannot override Base Package Data');
        const values = ordered.flatMap(item => (item.value.contributions ?? [item.value.contribution])
            .filter(contribution => contribution.pointId === point.id)
            .map(contribution => ({ id: item.value.id + ':' + contribution.id, kind: contribution.kind, value: contribution.value })));
        if (values.length > point.maxItems) throw new TypeError('Extension point capacity exceeded');
        const bytes = Buffer.from(JSON.stringify(values)); const ref = contentAsset(bytes);
        // Empty points may share the exact immutable bytes.
        const present = manifest.assets.find(asset => asset.assetId === ref.assetId);
        if (!present) add(ref, bytes);
        else if (present.contentHash !== ref.contentHash) throw new TypeError('Content Asset identity collision');
        contract.dataResources.push({ resourceId: point.resourceId, assetId: ref.assetId, contentHash: ref.contentHash });
    }
    contract.contentRuntime.composition = { base, resources: ordered.map(item => item.ref) };
    return { manifest: assertAtriaPackageManifest(manifest), sourceFiles: opened.sourceFiles, assets };
}

// A composed archive is self-contained. Recompute from its embedded exact Base
// and Community bytes on every install: an imported resolved manifest is untrusted.
export function validateContentComposition(inspected) {
    const composition = inspected.manifest.runtime?.experienceContract?.contentRuntime?.composition;
    if (!composition) return;
    const baseBytes = inspected.assets.get('asset_' + composition.base.packageContentHash.slice(0, 32));
    if (!baseBytes || contentDigest(baseBytes) !== composition.base.packageContentHash) throw new TypeError('Missing exact composition Base');
    const expected = composeContent(baseBytes, composition.resources.map(ref => ({ ref, bytes: inspected.assets.get(ref.assetId) })), inspected.manifest.packageVersionId);
    if (hashNativeDocument(expected.manifest) !== hashNativeDocument(inspected.manifest)
        || expected.sourceFiles.size !== inspected.sourceFiles.size || expected.assets.size !== inspected.assets.size
        || [...expected.sourceFiles].some(([path, bytes]) => !bytes.equals(inspected.sourceFiles.get(path) ?? Buffer.alloc(0)))
        || [...expected.assets].some(([id, bytes]) => !bytes.equals(inspected.assets.get(id) ?? Buffer.alloc(0)))) throw new TypeError('Resolved composition differs from exact Base and contributions');
}
