import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';
import { registerMediaBinaryActions } from './media-binary.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const nullableHash = digest.nullable(), session = { sessionId: id, branchId: id }, pinned = { ...session, expectedRevisionId: id };
const image = { ...pinned, imageVersionId: id }, generation = '/api/native/generation', product = '/api/native/product';
const targetPins = { imageTargetId: id, expectedTargetFingerprint: digest, expectedConnectionFingerprint: digest };
const strings = z.array(id).max(64), operationKinds = z.enum(['regenerate', 'img2img', 'inpaint', 'upscale']);
const approval = z.strictObject({ targetFingerprint: digest, requestHash: digest, maxCost: z.number().finite().min(0),
    currency: z.string().max(16), allowUnknownCost: z.boolean(), externalAssetIds: strings, omittedPreferred: z.array(z.string().min(1).max(128)).max(64) });
const point = z.strictObject({ x: z.number().int().min(0).max(32767), y: z.number().int().min(0).max(32767) });
const maskCommand = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('fill'), value: z.number().int().min(0).max(255) }),
    z.strictObject({ kind: z.literal('rect'), value: z.number().int().min(0).max(255), x: point.shape.x, y: point.shape.y,
        width: z.number().int().min(1).max(32768), height: z.number().int().min(1).max(32768) }),
    z.strictObject({ kind: z.literal('stroke'), value: z.number().int().min(0).max(255), radius: z.number().int().min(1).max(256), points: z.array(point).min(1).max(2048) }),
]);
const commands = z.array(maskCommand).max(100).refine(items => items.reduce((n, command) => n + (command.points?.length ?? 0), 0) <= 8192, 'Mask point budget exceeded');
const constraints = z.array(z.strictObject({ capability: z.string().min(1).max(128), tier: z.enum(['required', 'preferred', 'optional']) })).max(64);
const targetResource = z.strictObject({ schemaVersion: z.literal(2), imageTargetId: id, revision: id, displayName: z.string().min(1).max(256),
    connectionProfileId: id, model: z.string().max(512), serviceVersion: z.string().max(256), nativeParameters: z.record(z.string(), z.json()),
    workflow: z.strictObject({ id, graph: z.json(), bindings: z.array(z.strictObject({ nodeId: id, input: id,
        semantic: z.enum(['prompt', 'negativePrompt', 'seed', 'width', 'height', 'base', 'mask', 'identity', 'outfit', 'style', 'structure', 'vibe']), type: z.enum(['string', 'number', 'image']) })).max(256),
        outputNodes: z.array(z.json()).max(256), nodeTypes: z.array(z.json()).max(256) }).nullable(), capabilities: z.null() });
const renderingResource = z.strictObject({ schemaVersion: z.literal(2), imageRenderingId: id, revision: id, displayName: z.string().min(1).max(256),
    style: z.string().max(65536), quality: z.string().max(65536), negativePrompt: z.string().max(65536), defaultTargetId: id.nullable(), constraints });
const budget = z.strictObject({ schemaVersion: z.literal(2), imageHour: z.number().int().min(0), imageDay: z.number().int().min(0), autoConcurrency: z.number().int().min(0),
    plannerHour: z.number().int().min(0), plannerDay: z.number().int().min(0), plannerTokensDay: z.number().int().min(0), currency: z.string().regex(/^[A-Z]{3}$/),
    moneyDay: z.number().finite().min(0), autoMoneyDay: z.number().finite().min(0) });
const payload = input => Object.fromEntries(Object.entries(input).filter(([key]) => !['expectedRevisionId', 'expectedShotRevision', 'expectedJobRevision', 'expectedPreparationRevision', 'expectedContentHash', 'allowAutomatic'].includes(key)));
const sourceIds = source => Object.fromEntries(['sessionId', 'branchId', 'revisionId', 'annotationId'].filter(key => source?.[key] !== undefined).map(key => [key, source[key]]));
const equalSets = (a, b) => a.length === new Set(a).size && fingerprint([...a].sort()) === fingerprint([...b].sort());

/** Fixed Native adapters. Binary raster/checkpoint transport is a separate lane. */
export function registerMediaActions(registry, browser, { request = requestAuthority } = {}) {
    const call = async (method, path, input = {}, guards = {}) => {
        const response = await request(browser, method, path, input, guards);
        if (!response.ok || !response.serverBootId) throw new Error('Native media authority unavailable: ' + response.status);
        return response;
    };
    const sessionIdentity = async input => {
        const response = await call('GET', `${product}/sessions/${input.sessionId}/observe`, { identity: '1' });
        const value = response.data, branchId = value.branchId ?? value.snapshot?.revision?.branchId;
        if (!value.session || value.session.sessionId !== input.sessionId || value.session.headRevisionId !== (input.expectedRevisionId ?? input.revisionId)
            || input.branchId && branchId !== input.branchId) throw new Error('Media Session revision or branch conflict.');
        return { target: { sessionId: input.sessionId, ...(branchId ? { branchId } : {}) }, serverBootId: response.serverBootId,
            revisionId: value.session.headRevisionId, packageVersionId: value.session.packageVersionId };
    };
    const configGuard = async () => {
        const response = await call('GET', generation + '/visual/configuration');
        return { target: { visualConfiguration: 'owned-account' }, serverBootId: response.serverBootId, configurationHash: fingerprint(response.data) };
    };
    const networkGuard = async input => {
        const visual = await call('GET', generation + '/visual/configuration'), configuration = await call('GET', generation + '/configuration');
        if (visual.serverBootId !== configuration.serverBootId) throw new Error('Media server boot changed.');
        const target = visual.data.targets.find(row => row.imageTargetId === input.imageTargetId);
        const connection = configuration.data.connections.find(row => row.connectionProfileId === target?.connectionProfileId);
        if (!target || !connection || fingerprint(target) !== input.expectedTargetFingerprint || fingerprint(connection) !== input.expectedConnectionFingerprint) throw new Error('Media Target or Connection fingerprint conflict.');
        return { target: { imageTargetId: input.imageTargetId, connectionProfileId: connection.connectionProfileId }, serverBootId: visual.serverBootId,
            targetFingerprint: input.expectedTargetFingerprint, connectionFingerprint: input.expectedConnectionFingerprint,
            endpoint: connection.baseUrl ?? connection.endpoint ?? null, secretRef: connection.secretRef ?? null, providerAdapter: connection.providerAdapter,
            budgetHash: fingerprint(visual.data.budget) };
    };
    const pinnedNetwork = async input => {
        const scope = await sessionIdentity(input), target = await networkGuard(input);
        if (scope.serverBootId !== target.serverBootId) throw new Error('Media server boot changed.');
        return { ...scope, network: target };
    };
    const imageJobGuard = async input => {
        const response = await call('GET', generation + `/illustration-images/${input.operationId}/observation`);
        if (response.data.revision !== input.expectedJobRevision) throw new Error('Image Job revision conflict.');
        return { target: { operationId: input.operationId, ...sourceIds(response.data.operation?.anchor) },
            serverBootId: response.serverBootId, jobRevision: response.data.revision, status: response.data.operation.status };
    };
    const preparedGuard = async input => {
        const response = await call('POST', generation + '/illustration-images/prepared/observe', { prepareId: input.prepareId }), prepared = response.data;
        if (prepared.expired || prepared.revision !== input.expectedPreparationRevision || prepared.targetFingerprint !== input.approval.targetFingerprint
            || prepared.requestHash !== input.approval.requestHash || !equalSets(input.approval.externalAssetIds, prepared.externalAssetIds)
            || !equalSets(input.approval.omittedPreferred, prepared.omittedPreferred)) throw new Error('Image preparation or explicit asset approval conflict.');
        const scope = await sessionIdentity({ ...sourceIds(prepared.source), expectedRevisionId: input.expectedRevisionId });
        if (scope.serverBootId !== response.serverBootId) throw new Error('Media server boot changed.');
        return { ...scope, target: { ...scope.target, prepareId: input.prepareId }, preparationRevision: prepared.revision,
            expectedHead: prepared.expectedHead, connection: prepared.connection, targetFingerprint: prepared.targetFingerprint,
            requestHash: prepared.requestHash, cost: prepared.cost, externalAssetIds: prepared.externalAssetIds };
    };
    const shotGuard = async input => {
        const scope = await sessionIdentity(input), response = await call('POST', generation + '/visual/director/list', { sessionId: input.sessionId, branchId: input.branchId });
        const shot = response.data.find(row => row.shotId === input.shotId);
        if (scope.serverBootId !== response.serverBootId || !shot || shot.source.sessionId !== input.sessionId || shot.source.branchId !== input.branchId
            || fingerprint(shot) !== input.expectedShotRevision) throw new Error('Director Shot scope or revision conflict.');
        return { ...scope, target: { ...scope.target, shotId: input.shotId }, shotRevision: input.expectedShotRevision, prepareId: shot.prepareId ?? null, status: shot.status };
    };
    const assetGuard = async input => {
        let offset = 0, response, found;
        do {
            response = await call('POST', generation + '/visual/gc/preview', { offset, limit: 128 });
            found = response.data.items.find(row => row.assetId === input.assetId);
            if (found || response.data.nextOffset === null) break;
            if (!Number.isSafeInteger(response.data.nextOffset) || response.data.nextOffset <= offset) throw new Error('Invalid native GC pagination.');
            offset = response.data.nextOffset;
        } while (offset <= 100000);
        if (!found || found.contentHash !== input.expectedContentHash || found.references.length) throw new Error('Media Asset changed or still referenced.');
        return { target: { assetId: input.assetId }, serverBootId: response.serverBootId, contentHash: found.contentHash, references: [] };
    };
    const speechGuard = async input => {
        const response = await call('POST', generation + '/speech/observe', { operationId: input.operationId });
        if (!response.data.anchor?.sessionId) throw new Error('Speech source identity unavailable.');
        const scope = await sessionIdentity({ ...response.data.anchor, expectedRevisionId: input.expectedRevisionId });
        if (scope.serverBootId !== response.serverBootId) throw new Error('Media server boot changed.');
        return { ...scope, target: { ...scope.target, operationId: input.operationId }, status: response.data.status };
    };
    const add = (action, risk, shape, suffix, { method = 'POST', guard = sessionIdentity, body = payload, effects = [] } = {}) => {
        registry.register({ version: 1, id: action, domain: action.split('.')[0], title: action, risk,
            authority: 'Native VisualStore / MediaStudio / SpeechService', adapter: 'fixed-http', externalEffects: effects,
            guards: risk === 'READ' ? [] : ['exact-native-owner', 'current-server-boot', 'double-check', 'native-source-cas-budget'],
            approval: risk === 'READ' ? 'none' : 'trusted-approval-required',
            availability: { available: true, reason: 'Fixed Native authority; no raw provider, DOM, filesystem or blind retry access' } },
        z.strictObject(shape).refine(input => Buffer.byteLength(JSON.stringify(input)) <= 128 * 1024, 'Media input exceeds bound'), z.json(), async (input, context) => {
            const response = await call(method, generation + (typeof suffix === 'function' ? suffix(input) : suffix), body(input), context.before ?? {});
            let data = redact(response.data);
            if (Buffer.byteLength(JSON.stringify(data)) > 64000) {
                if (risk === 'READ') throw new Error('Media response exceeds bound; use narrower native pagination.');
                const resultHash = fingerprint(data);
                data = { format: 'native-result-metadata', resultHash,
                    ...Object.fromEntries(['prepareId', 'operationId', 'targetFingerprint', 'requestHash', 'expiresAt', 'revision', 'head', 'cost', 'externalAssetIds']
                        .filter(key => data?.[key] !== undefined && Buffer.byteLength(JSON.stringify(data[key])) < 8000).map(key => [key, data[key]])),
                    ...(data?.source ? { source: sourceIds(data.source) } : {}),
                    note: 'Large native payload omitted after confirmed success; inspect the exact owning resource to read content.' };
            }
            return risk === 'READ' ? { ok: true, serverBootId: response.serverBootId, data }
                : { ok: true, status: response.status, data, receiptEvidence: { after: { resultHash: fingerprint(data) }, recovery: 'Native owning authority only; unknown external results must not be resubmitted' } };
        }, risk === 'READ' ? null : guard);
    };
    add('media.configuration.read', 'READ', {}, '/visual/configuration', { method: 'GET' });
    add('media.target.describe', 'INTERACT', targetPins, '/visual/targets/describe', { guard: networkGuard, effects: ['provider-network', 'secret-ref-use', 'mayIncurCost'] });
    add('media.image.prepare', 'MUTATE', { ...pinned, annotationId: id, expectedHead: nullableHash, ...targetPins, imageRenderingId: id.optional(), operation: z.enum(['txt2img', 'regenerate']).default('txt2img'), omittedPreferred: z.array(z.string().max(128)).max(64).default([]) }, '/illustration-images/prepare', { guard: pinnedNetwork, effects: ['native-prepared-intent', 'provider-capability-network', 'secret-ref-use'] });
    add('media.image.prepared', 'READ', { prepareId: id }, '/illustration-images/prepared/observe');
    add('media.image.start', 'MUTATE', { prepareId: id, expectedRevisionId: id, expectedPreparationRevision: digest, approval }, '/illustration-images', { guard: preparedGuard, effects: ['provider-network', 'mayIncurCost', 'external-asset-transfer', 'native-image-job'] });
    add('media.image.status', 'READ', { operationId: id }, i => `/illustration-images/${i.operationId}/observation`, { method: 'GET', body: () => ({}) });
    add('media.image.list', 'READ', session, '/illustration-image-observations', { method: 'GET' });
    add('media.image.reconcile', 'MUTATE', { operationId: id, expectedJobRevision: digest }, '/illustration-images/reconcile', { guard: imageJobGuard, effects: ['native-worker-recovery', 'provider-network', 'mayIncurCost', 'may-publish-existing-result'] });
    add('media.image.cancel', 'MUTATE', { operationId: id, expectedJobRevision: digest }, i => `/illustration-images/${i.operationId}`, { method: 'DELETE', guard: imageJobGuard, body: () => ({}), effects: ['provider-network', 'refund-unknown'] });
    add('media.edit.prepare', 'MUTATE', { ...image, ...targetPins, operation: operationKinds, prompt: z.string().max(65536).optional(), imageRenderingId: id.optional(), maskArtifactId: id.optional(), referenceIds: z.array(id).max(16).default([]), omittedPreferred: z.array(z.string().max(128)).max(64).default([]), preserveOutsideMask: z.boolean().default(false) }, '/visual/media/prepare', { guard: pinnedNetwork, effects: ['native-prepared-intent', 'provider-capability-network', 'secret-ref-use'] });
    add('media.mask.create', 'MUTATE', image, '/visual/mask/create', { effects: ['native-mask-draft', 'asset-write'] });
    add('media.mask.find', 'MUTATE', image, '/visual/mask/find', { effects: ['native-source-load-may-reconcile'] });
    add('media.mask.read', 'MUTATE', { ...pinned, draftId: id }, '/visual/mask/read', { effects: ['native-source-load-may-reconcile'] });
    add('media.mask.save', 'MUTATE', { ...pinned, draftId: id, expectedRevision: digest, commands, cursor: z.number().int().min(0).max(100) }, '/visual/mask/save', { effects: ['native-mask-cas', 'may-checkpoint-asset'] });
    add('media.mask.freeze', 'MUTATE', { ...image, draftId: id, expectedRevision: digest }, '/visual/mask/freeze', { effects: ['native-mask-artifact', 'asset-write'] });
    add('media.gallery.query', 'MUTATE', { ...pinned, offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(24), annotationId: id.optional(), provider: id.optional(), operation: z.string().max(128).optional(), includeHidden: z.boolean().default(false), includeDeleted: z.boolean().default(false) }, '/visual/gallery/query', { effects: ['native-source-load-may-reconcile'] });
    add('media.gallery.history', 'MUTATE', image, '/visual/gallery/history', { effects: ['native-source-load-may-reconcile'] });
    add('media.gallery.select', 'MUTATE', { ...image, expectedHead: nullableHash }, '/visual/gallery/select');
    add('media.gallery.mark', 'MUTATE', { ...image, expectedRevision: nullableHash, action: z.enum(['hide', 'show', 'remove', 'restore', 'soft-delete']) }, '/visual/gallery/mark');
    add('media.reference.promote', 'MUTATE', { ...image, purpose: z.enum(['identity', 'outfit', 'style', 'structure', 'vibe']), identity: z.string().max(512).optional(), standard: z.boolean(), allowedBranches: z.array(id).min(1).max(64), externalConnectionIds: z.array(id).max(64) }, '/visual/reference/promote', { effects: ['native-reference-binding', 'grants-explicit-external-targets'] });
    add('media.reference.revoke', 'MUTATE', { ...pinned, referenceId: id, expectedHead: nullableHash }, '/visual/reference/revoke');
    add('media.gc.preview', 'READ', { offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(128).default(32) }, '/visual/gc/preview');
    add('media.gc.mark', 'MUTATE', { assetId: id, expectedContentHash: digest, graceDays: z.number().finite().min(7).default(7), category: z.enum(['temporary', 'soft-deleted']).default('temporary') }, '/visual/gc/mark', { guard: assetGuard });
    add('media.gc.sweep', 'DESTRUCTIVE', { assetId: id, expectedContentHash: digest }, '/visual/gc/sweep', { guard: assetGuard, effects: ['native-reference-delete', 'native-quarantine-and-second-reference-check'] });
    add('media.director.list', 'READ', session, '/visual/director/list');
    add('media.director.scan', 'MUTATE', { ...pinned, allowAutomatic: z.boolean().default(false) }, '/visual/director/scan', { guard: async input => {
        const scope = await sessionIdentity(input), settings = await call('GET', '/api/native/extensions/official/illustration');
        if (settings.serverBootId !== scope.serverBootId || settings.data.value.director.mode === 'automatic' && !input.allowAutomatic) throw new Error('Director automatic image policy requires explicit approval.');
        return { ...scope, automaticPolicy: settings.data.value.director, settingsRevision: settings.data.revision };
    }, effects: ['native-scene-shot-writes', 'may-trigger-approved-automatic-image-cost'] });
    const shot = { ...pinned, shotId: id, expectedShotRevision: digest };
    add('media.director.prepare', 'MUTATE', shot, '/visual/director/prepare', { guard: shotGuard, effects: ['native-annotation-and-prepared-intent', 'provider-capability-network'] });
    add('media.director.analyze', 'MUTATE', shot, '/visual/director/analyze', { guard: shotGuard, effects: ['native-model-provider-network', 'mayIncurCost', 'native-visual-learning-writes'] });
    add('media.director.skip', 'MUTATE', shot, '/visual/director/skip', { guard: shotGuard, body: input => ({ shotId: input.shotId, expectedRevision: input.expectedShotRevision }) });
    add('media.director.submit', 'MUTATE', { ...shot, approval }, '/visual/director/submit', { guard: shotGuard, effects: ['provider-network', 'mayIncurCost', 'external-asset-transfer'] });
    add('media.budget.update', 'MUTATE', { value: budget, expectedRevision: nullableHash }, '/visual/budget', { method: 'PUT', guard: configGuard });
    add('media.resource.update', 'MUTATE', { resourceType: z.enum(['core.image-target', 'core.image-rendering']), value: z.union([targetResource, renderingResource]), expectedRevision: nullableHash }, '/visual/resources', { method: 'PUT', guard: configGuard });
    add('speech.voices', 'INTERACT', {}, '/speech/voices', { guard: async () => { const runtime = await browser.runtimeIdentity(); if (!runtime?.serverBootId) throw new Error('Speech runtime unavailable.'); return { target: { nativeSpeechProvider: 'owned-host' }, serverBootId: runtime.serverBootId }; }, effects: ['native-local-provider-discovery'] });
    add('speech.describe', 'READ', { sessionId: id, revisionId: id }, '/speech/describe-observation');
    add('speech.start', 'MUTATE', { sessionId: id, revisionId: id, itemId: z.string().min(1).max(256), voiceId: z.string().min(1).max(1024), rate: z.number().int().min(-10).max(10).default(0), volume: z.number().int().min(0).max(100).default(100), routeRef: z.strictObject({ scope: z.literal('player'), runtimeRouteId: id }).optional() }, '/speech/start', { effects: ['native-local-work-budget', 'native-audio-asset', 'host-transient-task'] });
    add('speech.status', 'READ', { operationId: id }, '/speech/observe');
    add('speech.cancel', 'MUTATE', { operationId: id, expectedRevisionId: id }, '/speech/cancel', { guard: speechGuard });
    registerMediaBinaryActions(registry, browser, { call, sessionIdentity });
    return registry;
}
