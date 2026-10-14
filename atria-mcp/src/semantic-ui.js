import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,256}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const address = { surfaceId: id, instanceId: id, componentId: id, controlId: id, actionId: id };
export const screenshotTargetSchema = z.strictObject({ surfaceId: id, expectedIdentityHash: hash });
export async function observeSemanticUi(browser) {
    if (!browser.page || browser.page.isClosed()) return [];
    return browser.page.evaluate(async () => {
        const module = await import('/scripts/native/frontend/mcp-surface.js');
        return module.observeMcpSurfaces();
    });
}
async function owningIdentity(browser, surface) {
    const identity = surface?.identity, source = identity?.source;
    if (!source || identity.disposed) return null;
    if (source.kind === 'session' && identity.epoch) {
        const r = await requestAuthority(browser, 'POST', '/api/native/session/frontend/observe', { epoch: identity.epoch });
        if (!r.ok || !r.data?.ok || r.data.epoch !== identity.epoch || r.data.revision !== source.revisionId || r.data.data?.sessionId !== source.sessionId
            || r.data.data.branchId !== source.branchId || r.data.data.packageVersionId !== source.packageVersionId || r.data.data.descriptorDigest !== identity.descriptorDigest) return null;
        return { serverBootId: r.serverBootId, epoch: r.data.epoch, revisionId: r.data.revision, ...r.data.data };
    }
    if (source.kind === 'preview' && id.safeParse(source.previewId).success) {
        const r = await requestAuthority(browser, 'GET', '/api/native/studio/previews/' + source.previewId + '/identity');
        if (!r.ok || r.data.previewId !== source.previewId || r.data.projectId !== source.projectId || r.data.packageVersionId !== source.packageVersionId
            || r.data.descriptorDigest !== identity.descriptorDigest || r.data.packageContentHash !== source.packageContentHash
            || fingerprint(r.data.baseRevision) !== fingerprint(source.baseRevision) || r.data.workspaceId !== source.workspaceId
            || r.data.operationsFingerprint !== source.operationsFingerprint) return null;
        return { serverBootId: r.serverBootId, ...r.data };
    }
    return null;
}
async function checkedSurface(browser, target) {
    const surfaces = await observeSemanticUi(browser), surface = surfaces.find(row => row.surfaceId === target.surfaceId);
    if (!surface || fingerprint(surface.identity) !== target.expectedIdentityHash) throw Error('Semantic UI identity changed');
    const native = await owningIdentity(browser, surface);
    if (!native?.serverBootId || native.serverBootId !== browser.loadedIdentity?.serverBootId) throw Error('Current owning UI identity unverifiable');
    return { surface, native };
}

export class ScreenshotProofs {
    constructor({ now = Date.now, maxEntries = 100, ttlMs = 600000 } = {}) { this.now = now; this.maxEntries = maxEntries; this.ttlMs = ttlMs; this.proofs = new Map(); }
    put(proof) {
        const row = { ...structuredClone(proof), proofId: randomUUID(), expiresAt: this.now() + this.ttlMs };
        for (const [id, old] of this.proofs) if (old.expiresAt <= this.now()) this.proofs.delete(id);
        this.proofs.set(row.proofId, row); while (this.proofs.size > this.maxEntries) this.proofs.delete(this.proofs.keys().next().value);
        return row;
    }
    get(id) { const row = this.proofs.get(id); if (!row || row.expiresAt <= this.now()) throw Error('Screenshot proof unavailable or expired'); return structuredClone(row); }
    clear() { this.proofs.clear(); }
}
export function registerSemanticUi(registry, browser, proofs = new ScreenshotProofs()) {
    const descriptor = (action, risk) => ({ version: 1, id: action, domain: 'browser', title: action, risk, authority: 'Compiled Native Frontend local interaction manifest + current owning identity', adapter: 'fixed-browser', externalEffects: [],
        guards: risk === 'READ' ? [] : ['current-document', 'owning-epoch-or-preview', 'compiled-local-interaction'], approval: risk === 'READ' ? 'none' : 'trusted-approval-required',
        availability: { available: true, reason: 'Only compiled local set/toggle interactions without scripts, bridge bindings or remote media; no arbitrary DOM/JS' } });
    registry.register(descriptor('browser.proof.get', 'READ'), z.strictObject({ proofId: z.string().uuid() }), z.json(), i => ({ proof: proofs.get(i.proofId), currentness: 'Capture-window evidence; revalidate for a new operation' }));
    registry.register(descriptor('browser.ui.surfaces', 'READ'), z.strictObject({}), z.json(), async () => ({ surfaces: await observeSemanticUi(browser), evidence: 'Rendered first-party declarations; recheck Native identity before interaction' }));
    registry.register(descriptor('browser.ui.interact', 'INTERACT'), z.strictObject({ ...address, expectedIdentityHash: hash,
        event: z.strictObject({ value: z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]).optional(), checked: z.boolean().optional() }).default({}) }), z.json(),
    async (i, { before }) => {
        const result = await browser.page.evaluate(async input => {
            const module = await import('/scripts/native/frontend/mcp-surface.js');
            return module.interactMcpSurface(input);
        }, { ...Object.fromEntries(Object.keys(address).map(key => [key, i[key]])), expectedIdentity: before.identity, event: i.event });
        const surface = (await observeSemanticUi(browser)).find(row => row.surfaceId === i.surfaceId);
        const native = await owningIdentity(browser, surface);
        if (browser.documentGeneration !== before.documentGeneration || !native || fingerprint(native) !== fingerprint(before.native)
            || fingerprint(surface.identity.source) !== fingerprint(before.identity.source)) throw Error('UI context changed during interaction; local result unconfirmed');
        return { ok: true, data: result, receiptEvidence: { after: { identityHash: fingerprint(result.identity) }, recovery: 'Only local presentation state changed; no business commit implied.' } };
    }, async i => {
        const { surface, native } = await checkedSurface(browser, i);
        if (!surface.controls.some(c => Object.keys(address).filter(key => key !== 'surfaceId').every(key => c[key] === i[key]))) throw Error('UI control/action is not in the compiled local manifest');
        return { target: { surfaceId: i.surfaceId, ...surface.identity.source }, serverBootId: native.serverBootId,
            documentGeneration: browser.documentGeneration, identity: surface.identity, native };
    });
    return registry;
}

function jpegSize(bytes) {
    let cursor = 2;
    while (cursor + 8 < bytes.length) {
        if (bytes[cursor++] !== 0xff) break;
        let marker = bytes[cursor++]; while (marker === 0xff) marker = bytes[cursor++];
        if (marker === 0xda || marker === 0xd9) break;
        const size = bytes.readUInt16BE(cursor); if (size < 2 || cursor + size > bytes.length) break;
        if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) return { pixelHeight: bytes.readUInt16BE(cursor + 3), pixelWidth: bytes.readUInt16BE(cursor + 5) };
        cursor += size;
    }
    return { pixelWidth: null, pixelHeight: null };
}
export async function screenshotWithProof(browser, provenance, args, proofs = null) {
    await browser.readyPage();
    if (args.target && ((args.frame ?? 0) !== 0 || args.selector || args.fullPage)) throw Error('Semantic screenshot target requires its registered visible region');
    const capture = async () => {
        const identity = await provenance.snapshot();
        const surface = args.target ? await checkedSurface(browser, args.target).catch(() => null) : null;
        return { documentGeneration: browser.documentGeneration, loadedIdentity: browser.loadedIdentity,
            viewport: browser.page.viewportSize(), identity, surface };
    };
    const before = await capture();
    const clip = before.surface?.surface?.region;
    const image = await browser.screenshot({ ...args, ...(clip ? { clip } : {}) }), after = await capture();
    const sourceKey = snapshot => ({ documentGeneration: snapshot.documentGeneration, loadedIdentity: snapshot.loadedIdentity,
        viewport: snapshot.viewport, source: snapshot.identity.source, server: snapshot.identity.server, surface: snapshot.surface });
    const stable = fingerprint(sourceKey(before)) === fingerprint(sourceKey(after));
    const exact = stable && before.surface && clip && before.identity.runtimeSourceMatch === 'EXACT' && before.identity.browserFreshness === 'CURRENT';
    const proof = { version: 1, screenshotHash: createHash('sha256').update(image.bytes).digest('hex'), mimeType: image.mimeType,
        capturedAt: new Date().toISOString(), state: !stable ? 'CONTEXT_CHANGED_DURING_CAPTURE' : exact ? 'EXACT_CURRENT' : 'UNVERIFIABLE',
        ...jpegSize(image.bytes), documentGeneration: before.documentGeneration, viewport: before.viewport, deviceScaleFactor: 1, frame: args.frame ?? 0,
        target: args.target ?? null, native: before.surface?.native ?? null,
        targetRegion: clip ?? null, surfaceIdentity: before.surface?.surface?.identity ?? null, evidenceObservedAt: after.identity.observedAt ?? null,
        source: { revision: before.identity.source?.revision, fingerprint: before.identity.source?.fingerprint },
        limitation: 'Visual/source identity during capture only; separate Native validation, commit and human approval evidence is required.' };
    return { image, proof: proofs ? proofs.put(proof) : proof };
}
