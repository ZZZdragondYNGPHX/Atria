import { captureIllustrationContext, createIllustrationContext } from './illustration-context.js';
import { createNativeId, assertNativeId } from './identity.js';
import { hashNativeDocument } from './repositories/common.js';
import { IllustrationService } from './illustration-service.js';
import { selectNativeRuntimeRoute } from './adapters/generation-host.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { assertIllustrationDraft, composeIllustrationPrompt, createIllustrationDraft } from '../../public/shared/illustration-plugin-contract.js';
import { immutable } from './model-prompt-runtime/execution-utils.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const completed = new Set(['completed', 'failed', 'cancelled', 'stale']);

export function parseIllustrationPrompt(text, draft) {
    let value;
    try { value = JSON.parse(text); } catch { fail('native_illustration_prompt_invalid'); }
    if (!value || Object.keys(value).some(key => !['scene', 'characters'].includes(key)) || typeof value.scene !== 'string'
        || !Array.isArray(value.characters) || value.characters.length !== draft.characters.length) fail('native_illustration_prompt_invalid');
    const ids = new Set();
    const characters = draft.characters.map(item => {
        const generated = value.characters.find(character => character?.id === item.character.id);
        if (!generated || Object.keys(generated).some(key => !['id', 'dynamicPrompt', 'clothing'].includes(key))
            || typeof generated.dynamicPrompt !== 'string' || !(generated.clothing === null || typeof generated.clothing === 'string')
            || ids.has(generated.id)) fail('native_illustration_prompt_invalid');
        ids.add(generated.id);
        return { ...item, dynamicPrompt: generated.dynamicPrompt, clothing: generated.clothing ?? item.clothing };
    });
    const result = assertIllustrationDraft({ ...draft, characters, scene: value.scene, prompt: '' });
    result.prompt = composeIllustrationPrompt(result);
    return assertIllustrationDraft(result);
}

// Composition over the existing route host, scheduler and presentation authority.
export class IllustrationPromptService {
    constructor({ host, scheduler = nativeTaskScheduler }) { this.host = host; this.scheduler = scheduler; this.illustrations = new IllustrationService({ sessionRepo: host.sessionCore._sessions }); }
    async start(handle, input) {
        if (!input || Object.keys(input).some(key => !['sessionId', 'branchId', 'annotationId'].includes(key))) fail('native_illustration_request_invalid');
        const { sessionId, branchId, annotationId } = input;
        assertNativeId(sessionId, 'session'); assertNativeId(branchId, 'branch'); assertNativeId(annotationId, 'annotation');
        const sessions = this.host.sessionCore._sessions;
        const current = await sessions.get(handle, sessionId);
        const head = current.activeBranchId === branchId ? current.illustrationHead : current.illustrationHeads?.[branchId];
        const state = await sessions.loadSnapshot(handle, sessionId);
        // Historical branch presentation is read through the repo, without moving HEAD.
        const annotation = (current.activeBranchId === branchId ? state.illustrations : (await sessions.getIllustrations(handle, sessionId, { branchId })).state).annotations.find(entry => entry.annotationId === annotationId);
        if (!annotation || annotation.deletedAt !== undefined) fail('native_illustration_deleted');
        if (!annotation.promptContext && state.states.atri_run?.mode === 'ironman' && !state.core.parentRevisionId) fail('native_illustration_source_unavailable');
        const key = sessionId + ':' + branchId + ':' + annotationId + ':illustration_prompt';
        const active = [...this.scheduler.operations.values()].find(entry => entry.owner === handle && entry.key === key && !completed.has(entry.view.status));
        if (active) return { operationId: active.view.operationId, head: head ?? null };
        const settings = await this.host.extensions.illustrationSettings(handle);
        const routeId = settings.value.works[state.session.packageId]?.promptRouteId || settings.value.promptRouteId;
        const route = selectNativeRuntimeRoute(await this.host.persistence.listRuntimeRoutes(handle), 'role.illustration_prompt', routeId ? { runtimeRouteId: routeId } : undefined);
        const draft = immutable(annotation.draft ?? createIllustrationDraft(annotation.anchor.quote, settings.value, state.session.packageId).draft);
        const context = immutable(annotation.promptContext ?? await captureIllustrationContext(this.host.sessionCore, handle, sessionId, annotation.anchor));
        // The historical context packet can survive a head-only resume export;
        // current Session state is used only for access/budget checks, never input.
        const snapshot = await this.host.sessionCore.load(handle, sessionId);
        const lanePlan = { budgetContext: { snapshot, anchor: { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId } } };
        const resources = await this.host.executionResources(handle, route, sessionId, lanePlan);
        const versionId = createNativeId('promptVersion');
        const operation = this.scheduler.submit({ owner: handle, kind: 'auxiliary_task', executionClass: 'interactive', resources,
            key, fingerprint: annotationId, retry: false,
            timeoutMs: Math.min(2147483647, Math.max(this.scheduler.timeoutMs, ...Object.values(lanePlan.routes).map(lane => lane.policy.timeoutMs * (1 + lane.policy.maxRetries) + 30000))),
            anchor: { sessionId, branchId, revisionId: annotation.anchor.revisionId, annotationId },
            fresh: async () => {
                const current = await sessions.getIllustrations(handle, sessionId, { branchId });
                return current.state.annotations.some(entry => entry.annotationId === annotationId && entry.deletedAt === undefined);
            },
            run: async ({ signal }) => {
                const result = await this.host.execute(handle, { sessionId, revisionId: snapshot.revision.revisionId,
                    role: 'illustration_prompt', requestId: versionId, routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId } }, signal, undefined,
                { scheduled: true, lanePlan, illustrationPlan: { snapshot, source: context.source, buildContext: createIllustrationContext({ context, anchor: annotation.anchor, draft, template: settings.value.template }) } });
                return { promptVersionId: versionId, createdAt: Date.now(), draft: parseIllustrationPrompt(result.response.text, draft),
                    requestSnapshot: result.snapshot, template: settings.value.template, settingsRevision: settings.revision };
            },
            finalize: version => this.illustrations.addPromptVersion(handle, sessionId, { annotationId, branchId, version, baseDraftHash: hashNativeDocument(annotation.draft ?? null) }),
        });
        operation.result.catch(() => {});
        return { operationId: operation.operationId, head: head ?? null };
    }
    async status(handle, input) {
        const operation = this.scheduler.project(handle, input.operationId);
        if (!operation.anchor.annotationId) fail('native_illustration_operation_invalid');
        const presentation = await this.host.sessionCore._sessions.getIllustrations(handle, operation.anchor.sessionId, { branchId: operation.anchor.branchId });
        return { operation, ...(completed.has(operation.status) ? presentation : {}) };
    }
    list(handle, { sessionId, branchId }) {
        assertNativeId(sessionId, 'session'); assertNativeId(branchId, 'branch');
        return [...this.scheduler.operations.values()].filter(entry => entry.owner === handle
            && entry.view.anchor.sessionId === sessionId && entry.view.anchor.branchId === branchId && entry.view.anchor.annotationId)
            .map(entry => this.scheduler.project(handle, entry.view.operationId));
    }
}
