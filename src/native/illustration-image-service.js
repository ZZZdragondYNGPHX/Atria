import { randomInt, createHash } from 'node:crypto';
import { assertNativeId, createNativeId } from './identity.js';
import { hashNativeDocument } from './repositories/common.js';
import { IllustrationService } from './illustration-service.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { immutable } from './model-prompt-runtime/execution-utils.js';
import { createNovelaiImageProvider } from './adapters/novelai-image-provider.js';
import { novelaiConnectionCapabilities, renderNovelaiIllustration } from '../../public/shared/novelai-illustration.js';
import { assertIllustrationImage } from '../../public/shared/native-illustration-contract.js';
import { assertWritable } from '../storage/read-only-mode.js';

const terminal = new Set(['completed', 'failed', 'cancelled', 'stale']);
const fail = code => { throw Object.assign(new Error(code), { code }); };

// Images share the Host's scheduler, exact Secrets and AssetStore. No narrative lane.
export class IllustrationImageService {
    constructor({ host, scheduler = nativeTaskScheduler, provider = createNovelaiImageProvider() }) {
        Object.assign(this, { host, scheduler, provider });
        this.illustrations = new IllustrationService({ sessionRepo: host.sessionCore._sessions });
        this.assets = host.packageInstaller._assetStore;
    }
    async start(handle, input) {
        if (!input || Object.keys(input).some(key => !['sessionId', 'branchId', 'annotationId', 'expectedHead'].includes(key))) fail('native_illustration_request_invalid');
        assertWritable();
        const { sessionId, branchId, annotationId } = input;
        assertNativeId(sessionId, 'session'); assertNativeId(branchId, 'branch'); assertNativeId(annotationId, 'annotation');
        const sessions = this.host.sessionCore._sessions;
        const presentation = await sessions.getIllustrations(handle, sessionId, { branchId });
        const annotation = presentation.state.annotations.find(item => item.annotationId === annotationId);
        if (!annotation || annotation.deletedAt !== undefined) fail('native_illustration_deleted');
        const key = sessionId + ':' + branchId + ':' + annotationId + ':illustration_image';
        const active = [...this.scheduler.operations.values()].find(entry => entry.owner === handle && entry.key === key && !terminal.has(entry.view.status));
        if (active) return { operationId: active.view.operationId, head: presentation.head };
        if (input.expectedHead !== presentation.head) fail('native_illustration_head_conflict');
        await this.host.sessionCore.runs.assert(handle, sessionId, 'generate');
        if (!annotation.draft) fail('native_illustration_prompt_empty');
        const session = await sessions.get(handle, sessionId);
        const settings = await this.host.extensions.illustrationSettings(handle);
        const connectionId = settings.value.works[session.packageId]?.imageConnectionId || settings.value.imageConnectionId;
        if (!connectionId) fail('native_illustration_connection_missing');
        const connection = immutable(await this.host.persistence.getConnectionProfile(handle, connectionId));
        const capabilities = novelaiConnectionCapabilities(connection);
        const draft = immutable(annotation.draft);
        const rendered = immutable({ endpoint: connection.endpoint, ...renderNovelaiIllustration(draft, capabilities, randomInt(4294967296)) });
        // Resolve once on submission. Queueing/config edits never change the request.
        const secret = await this.host.secretPort.resolveSecret(connection.secretRef, { handle });
        if (!secret) fail('generation_secret_unavailable');
        const imageVersionId = createNativeId('imageVersion');
        const requestSnapshot = { schemaVersion: 1, requestId: imageVersionId,
            source: { kind: 'session', sessionId, branchId, revisionId: annotation.anchor.revisionId, annotationId },
            connection: { connectionProfileId: connectionId, displayName: connection.displayName, providerAdapter: connection.providerAdapter,
                fingerprint: hashNativeDocument(connection) },
            capabilities, promptMode: rendered.promptMode, request: rendered.body, draft };
        // Validate evidence before spending a request or entering AssetStore.
        assertIllustrationImage({ imageVersionId, annotationId, assetId: createNativeId('asset'), width: 1, height: 1, alt: '', prompt: draft.prompt,
            negativePrompt: draft.preset.negativePrompt, parameters: rendered.body.parameters, requestSnapshot, createdAt: Date.now() });
        const operation = this.scheduler.submit({ owner: handle, kind: 'auxiliary_task', executionClass: 'interactive', retry: false,
            resources: ['connection:' + handle + ':' + connectionId, 'provider:' + connection.providerAdapter], key, fingerprint: annotationId,
            anchor: { sessionId, branchId, revisionId: annotation.anchor.revisionId, annotationId, illustrationStep: 'image' },
            // A deleted mark can receive history, but addImageVersion cannot revive it.
            fresh: async () => {
                assertWritable();
                await this.host.sessionCore.runs.assert(handle, sessionId, 'generate');
                return (await sessions.getIllustrations(handle, sessionId, { branchId })).state.annotations.some(item => item.annotationId === annotationId);
            },
            run: ({ signal }) => this.provider.generate(rendered, { secret, signal }),
            finalize: async ({ bytes, width, height }) => {
                const ref = { assetId: createNativeId('asset'), contentHash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, mediaType: 'image/png' };
                await this.assets.put(handle, ref, bytes);
                try {
                    return await this.illustrations.addImageVersion(handle, sessionId, { annotationId, branchId, imageVersionId, assetId: ref.assetId, width, height,
                        alt: annotation.anchor.quote.slice(0, 2048), prompt: draft.prompt, negativePrompt: draft.preset.negativePrompt, parameters: rendered.body.parameters, requestSnapshot });
                } catch (error) {
                    try { await this.assets.deleteRef(handle, ref.assetId); } catch { /* Existing reference protection remains authoritative. */ }
                    throw error;
                }
            },
        });
        operation.result.catch(() => {});
        return { operationId: operation.operationId, head: presentation.head };
    }
    async status(handle, { operationId }) {
        const operation = this.scheduler.project(handle, operationId);
        if (operation.anchor.illustrationStep !== 'image') fail('native_illustration_operation_invalid');
        return { operation, ...(terminal.has(operation.status) ? await this.host.sessionCore._sessions.getIllustrations(handle, operation.anchor.sessionId, { branchId: operation.anchor.branchId }) : {}) };
    }
    list(handle, { sessionId, branchId }) {
        assertNativeId(sessionId, 'session'); assertNativeId(branchId, 'branch');
        return [...this.scheduler.operations.values()].filter(entry => entry.owner === handle && entry.view.anchor.sessionId === sessionId
            && entry.view.anchor.branchId === branchId && entry.view.anchor.illustrationStep === 'image').map(entry => this.scheduler.project(handle, entry.view.operationId));
    }
}
