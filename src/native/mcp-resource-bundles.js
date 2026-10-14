import express from 'express';
import { createHash } from 'node:crypto';
import { NativeMcpArtifacts } from './mcp-artifacts.js';
import { bundleRef, RESOURCE_BUNDLE_LIMITS } from './resource-bundle.js';
import { hashNativeDocument } from './repositories/common.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const keys = ['artifactId', 'contentHash', 'totalBytes', 'sourceRevision', 'clientInstanceId', 'serverBootId', 'purpose', 'bundleHash'];
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...names].sort().join(',');
const invalid = () => { throw new TypeError('Invalid Resource Bundle staging request'); };
const summary = (plan, offset, limit) => {
    const resources = plan.resources.map(item => ({ source: item.source, ref: item.ref, status: item.status, contentHash: hashNativeDocument(item.data) }));
    return { format: plan.format, token: plan.token, root: plan.root, canImport: plan.canImport,
        resourceCount: resources.length, conflictCount: plan.conflicts.length, existingOriginCount: plan.existingOrigins.length,
        mappingHash: hashNativeDocument(resources.map(({ source, ref, contentHash }) => ({ source, ref, contentHash }))),
        conflictsHash: hashNativeDocument(plan.conflicts), existingOriginsHash: hashNativeDocument(plan.existingOrigins),
        resources: resources.slice(offset, offset + limit), conflicts: plan.conflicts.slice(offset, offset + limit), existingOrigins: plan.existingOrigins.slice(offset, offset + limit),
        page: { offset, limit, nextOffset: offset + limit < Math.max(resources.length, plan.conflicts.length, plan.existingOrigins.length) ? offset + limit : null } };
};
const reviewHash = plan => hashNativeDocument({ token: plan.token, root: plan.root,
    resources: plan.resources.map(item => ({ source: item.source, ref: item.ref, contentHash: hashNativeDocument(item.data) })) });

// A separate purpose-specific transfer cache. All resource validation, identity
// rewriting, conflict detection and resumable writes remain in ResourceBundleService.
export class NativeMcpResourceBundles {
    #store;
    #items = new Map();
    constructor(options = {}) {
        this.#store = new NativeMcpArtifacts({ maxArtifactBytes: RESOURCE_BUNDLE_LIMITS.bytes, maxTotalBytes: 64 * 1024 * 1024,
            maxEntries: 4, maxOwnerEntries: 2, ...options });
    }
    get bootId() { return this.#store.bootId; }
    #cleanup() {
        this.#store.cleanup();
        for (const [id, item] of this.#items) {
            try { this.#store.inspect(item.owner, item.ref); } catch { this.#items.delete(id); }
        }
    }
    #unwrap(owner, ref) {
        this.#cleanup();
        if (!exact(ref, keys) || ref.purpose !== 'resource-bundle') invalid();
        const item = this.#items.get(ref.artifactId);
        if (!item || item.owner !== owner) throw new NotFoundError('Resource Bundle staging');
        if (hashNativeDocument(ref) !== hashNativeDocument(this.#wrap(item))) throw new ConflictError('native_bundle_binding_conflict');
        this.#store.inspect(owner, item.ref); return item;
    }
    #wrap(item) { return { ...item.ref, purpose: 'resource-bundle', bundleHash: item.bundleHash }; }
    #metadata(item) {
        const native = this.#store.inspect(item.owner, item.ref);
        return { bundleRef: this.#wrap(item), owner: item.owner, mediaType: 'application/json', expiresAt: native.expiresAt,
            receivedBytes: native.receivedBytes, state: native.state, maxChunkBytes: native.maxChunkBytes,
            root: item.root ?? null, resourceCount: item.resourceCount ?? null };
    }
    async capture(owner, clientInstanceId, value) {
        this.#cleanup();
        const bundleHash = hashNativeDocument(value), bytes = Buffer.from(JSON.stringify(value));
        const native = this.#store.captureBuild(owner, clientInstanceId, 'resource-bundle', bundleHash, bytes);
        const item = { owner, ref: native.artifactRef, bundleHash, root: bundleRef(value.root), resourceCount: value.resources.length, review: null };
        this.#items.set(item.ref.artifactId, item); return this.#metadata(item);
    }
    begin(owner, input) {
        this.#cleanup();
        if (!exact(input, ['clientInstanceId', 'contentHash', 'totalBytes', 'bundleHash']) || !/^[a-f0-9]{64}$/.test(input.bundleHash)) invalid();
        const { bundleHash, ...upload } = input, native = this.#store.begin(owner, upload);
        const item = { owner, ref: native.artifactRef, bundleHash, review: null };
        this.#items.set(item.ref.artifactId, item); return this.#metadata(item);
    }
    write(owner, ref, offset, bytes, chunkHash) {
        const item = this.#unwrap(owner, ref); this.#store.write(owner, item.ref, offset, bytes, chunkHash); return this.#metadata(item);
    }
    async #bundle(owner, ref, consume) {
        const item = this.#unwrap(owner, ref);
        return this.#store.withBytes(owner, item.ref, async bytes => {
            const bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
            if (hashNativeDocument(bundle) !== item.bundleHash) throw new ConflictError('native_bundle_integrity_conflict');
            return consume(bundle, item);
        });
    }
    async finalize(owner, ref, studio) {
        const item = this.#unwrap(owner, ref); this.#store.finalize(owner, item.ref);
        try {
            await this.#bundle(owner, ref, async bundle => {
                // Validate through the real registered resource adapters before publication.
                const plan = await studio.preflightResourceBundle(owner, bundle);
                item.root = bundleRef(bundle.root); item.resourceCount = bundle.resources.length;
                item.review = { token: plan.token, reviewHash: reviewHash(plan) };
            });
            return this.#metadata(item);
        } catch (error) { this.cancel(owner, ref); throw error; }
    }
    inspect(owner, ref) { return this.#metadata(this.#unwrap(owner, ref)); }
    readChunk(owner, ref, offset, length) { return this.#store.readChunk(owner, this.#unwrap(owner, ref).ref, offset, length); }
    content(owner, ref, offset = 0, limit = 12000) {
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 24000) invalid();
        return this.#bundle(owner, ref, bundle => {
            const text = JSON.stringify(bundle); if (offset > text.length) invalid();
            return { bundleHash: ref.bundleHash, offset, totalChars: text.length, text: text.slice(offset, offset + limit),
                nextOffset: offset + limit < text.length ? offset + limit : null, trust: 'untrusted resource data' };
        });
    }
    preflight(owner, ref, studio, token = null, { offset = 0, limit = 20 } = {}) {
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > RESOURCE_BUNDLE_LIMITS.resources || !Number.isSafeInteger(limit) || limit < 1 || limit > 64) invalid();
        return this.#bundle(owner, ref, async (bundle, item) => {
            if (token && (!item.review || hashNativeDocument(token) !== hashNativeDocument(item.review.token))) throw new ConflictError('native_bundle_review_conflict');
            const plan = await studio.preflightResourceBundle(owner, bundle, item.review?.token ?? null), fingerprint = reviewHash(plan);
            if (item.review && item.review.reviewHash !== fingerprint) throw new ConflictError('native_bundle_review_conflict');
            item.review = { token: plan.token, reviewHash: fingerprint };
            return { ...summary(plan, offset, limit), bundleHash: item.bundleHash, reviewHash: fingerprint };
        });
    }
    import(owner, ref, studio, token, expectedReviewHash) {
        return this.#bundle(owner, ref, async (bundle, item) => {
            if (!item.review || expectedReviewHash !== item.review.reviewHash || hashNativeDocument(token) !== hashNativeDocument(item.review.token)) throw new ConflictError('native_bundle_review_conflict');
            const plan = await studio.preflightResourceBundle(owner, bundle, token);
            if (!plan.canImport || reviewHash(plan) !== expectedReviewHash) throw new ConflictError('native_bundle_review_conflict');
            return studio.importResourceBundle(owner, bundle, token);
        });
    }
    cancel(owner, ref) {
        const item = this.#unwrap(owner, ref), result = this.#store.cancel(owner, item.ref); this.#items.delete(ref.artifactId); return result;
    }
    clear() { this.#store.clear(); this.#items.clear(); }
}

export const nativeMcpResourceBundles = new NativeMcpResourceBundles();

export function mountMcpResourceBundles(router, { getServices, store = nativeMcpResourceBundles }) {
    const route = run => async (req, res) => {
        try {
            const owner = req.user?.profile?.handle; if (!owner) return res.sendStatus(401);
            if (req.get('x-atria-expected-server-boot-id') && req.get('x-atria-expected-server-boot-id') !== store.bootId) throw new ConflictError('native_bundle_boot_conflict');
            res.set('Cache-Control', 'no-store'); res.set('x-atria-server-boot-id', store.bootId);
            await run(req, res, owner, getServices().studio);
        } catch (error) {
            const status = error?.name === 'NotFoundError' ? 404 : error?.name === 'ConflictError' ? 409 : error instanceof TypeError || error instanceof SyntaxError ? 400 : 500;
            res.status(status).json({ error: error.code ?? 'native_bundle_failed', ...(error.details ? { details: error.details } : {}) });
        }
    };
    const body = (req, names) => { if (!exact(req.body, names)) invalid(); return req.body; };
    const path = '/resources/bundle-staging';
    router.post(path + '/export', route(async (req, res, owner, studio) => {
        const input = body(req, ['ref', 'clientInstanceId']);
        res.json(await store.capture(owner, input.clientInstanceId, await studio.exportResourceBundle(owner, bundleRef(input.ref))));
    }));
    router.post(path + '/begin', route(async (req, res, owner) => res.json(store.begin(owner, body(req, ['clientInstanceId', 'contentHash', 'totalBytes', 'bundleHash'])))));
    router.put(path + '/:artifactId/chunk', express.raw({ type: 'application/octet-stream', limit: '1mb' }), route(async (req, res, owner) => {
        const ref = refFromQuery(req); res.json(store.write(owner, ref, Number(req.query.offset), req.body, req.get('x-atria-chunk-sha256')));
    }));
    router.get(path + '/:artifactId/chunk', route(async (req, res, owner) => {
        const ref = refFromQuery(req), chunk = store.readChunk(owner, ref, Number(req.query.offset), Number(req.query.length));
        res.status(206).set({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(chunk.bytes.length), ETag: '"' + ref.contentHash + '"',
            'Content-Range': `bytes ${chunk.offset}-${chunk.offset + chunk.bytes.length - 1}/${chunk.totalBytes}`, 'x-atria-chunk-sha256': hash(chunk.bytes) }).send(chunk.bytes);
    }));
    for (const action of ['inspect', 'finalize', 'cancel', 'content', 'preflight', 'import']) router.post(path + '/' + action, route(async (req, res, owner, studio) => {
        const names = ['bundleRef', ...(action === 'content' ? ['offset', 'limit'] : action === 'preflight' ? ['token'] : action === 'import' ? ['token', 'expectedReviewHash'] : [])];
        const input = action === 'preflight' && exact(req.body, [...names, 'offset', 'limit']) ? req.body : body(req, names);
        const ref = input.bundleRef;
        res.json(await (action === 'content' ? store.content(owner, ref, input.offset, input.limit)
            : action === 'preflight' ? store.preflight(owner, ref, studio, input.token, { offset: input.offset, limit: input.limit })
                : action === 'import' ? store.import(owner, ref, studio, input.token, input.expectedReviewHash)
                    : action === 'finalize' ? store.finalize(owner, ref, studio) : store[action](owner, ref)));
    }));
    return router;
}

function refFromQuery(req) {
    return Object.fromEntries(keys.map(key => [key, key === 'artifactId' ? req.params.artifactId : key === 'totalBytes' ? Number(req.query[key]) : req.query[key]]));
}
