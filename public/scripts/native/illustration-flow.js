import { translateShellText as t } from '../atria-shell/localization.js';

// Client orchestration over the existing prompt/image task authorities.
// The server still owns drafts, approval checks, budget reservations and versions.
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'stale', 'uncertain_submission']);
const POLL_MS = 900;

const ERRORS = {
    native_generation_route_missing: 'Choose a model for Image descriptions in Model roles.',
    native_generation_role_unassigned: 'Choose a model for Image descriptions in Model roles.',
    generation_secret_unavailable: 'The model’s API key is unavailable. Check the service in Runtime.',
    native_illustration_source_unavailable: 'This older save lacks the surrounding story. Write the description yourself.',
    generation_context_budget_exceeded: 'The passage is too long for the description model. Select a shorter passage or choose a larger model.',
    native_illustration_prompt_invalid: 'The model returned an unreadable description. Try again.',
    native_illustration_prompt_empty: 'Add an image description first.',
    native_visual_prompt_empty: 'Add an image description first.',
    native_visual_target_missing: 'Choose an image service and model in Illustration settings.',
    native_visual_rendering_missing: 'The selected art style no longer exists. Choose another style.',
    native_visual_budget_exceeded: 'Today’s spending limit is reached. Raise it in Illustration settings or try tomorrow.',
    native_visual_cost_unauthorized: 'This image needs your cost confirmation.',
    native_visual_negative_prompt_unsupported: 'This service cannot use “avoid” words. Clear them in the art style.',
    native_visual_model_unknown: 'This service does not offer the selected model. Choose another model.',
    native_visual_model_unsupported: 'This service does not offer the selected model. Choose another model.',
    native_visual_model_unavailable: 'The model is not installed on this server. Choose another model.',
    native_visual_parameters_unsupported: 'The image size is not supported by this model. Choose another shape.',
    native_visual_geometry_unsupported: 'The image size is not supported by this model. Choose another shape.',
    native_visual_state_conflict: 'Character details conflict with the story. Review the characters in this illustration.',
    native_visual_head_conflict: 'The illustration changed in another window. Try again.',
    native_visual_authentication_failed: 'The image service rejected the API key. Check the service in Runtime.',
    native_visual_rate_limited: 'The image service is busy. Try again in a moment.',
    native_visual_unreachable: 'Cannot reach the image service. Check that it is running, then try again.',
    native_visual_response_invalid: 'The image service returned something Atria could not read.',
    generation_provider_failed: 'The model that writes descriptions did not answer. Try again, or write the description yourself.',
    generation_provider_unavailable: 'The model that writes descriptions did not answer. Try again, or write the description yourself.',
    generation_fallback_exhausted: 'The model that writes descriptions did not answer. Try again, or write the description yourself.',
    generation_provider_endpoint_not_found: 'The model that writes descriptions did not answer. Try again, or write the description yourself.',
    generation_provider_timeout: 'The model that writes descriptions took too long. Try again, or write the description yourself.',
    generation_provider_authentication_failed: 'The description model rejected its API key. Check the service in Runtime.',
    generation_provider_request_rejected: 'The description model refused the request. Check the model in Runtime, or write the description yourself.',
    generation_provider_content_blocked: 'The description model declined this passage. Write the description yourself.',
    native_visual_request_rate_limited: 'This model’s per-minute request limit is reached. Try again in a minute.',
    native_visual_request_quota_exceeded: 'Today’s requests for this model are used up. Try again tomorrow, or change the count in Illustration settings.',
    generation_illustration_budget_exceeded: 'The limit for writing image descriptions is reached for now. Try again later, write this one yourself, or raise the limit in Advanced settings.',
    native_visual_request_rejected: 'The image service refused this request. Check the model and image shape, then try again.',
    native_illustration_image_request_rejected: 'The image service refused this request. Check the model and image shape, then try again.',
    native_visual_insecure_target: 'This service uses a plain http:// address. Allow it for this service in Runtime, or use https.',
    native_visual_request_failed: 'The image service failed on its side. Try again later.',
    native_visual_remote_failed: 'The image service failed on its side. Try again later.',
    native_visual_operation_unsupported: 'This service cannot do that kind of edit. Choose another service.',
    native_illustration_image_insecure_target: 'This service uses a plain http:// address. Allow it for this relay in Runtime, or use https.',
    native_illustration_image_authentication_failed: 'The image service rejected the API key. Check the service in Runtime.',
    native_illustration_image_rate_limited: 'The image service is busy. Try again in a moment.',
    native_illustration_image_unreachable: 'Cannot reach the image service. Check that it is running, then try again.',
    native_illustration_image_response_invalid: 'The image service returned something Atria could not read.',
};
export function illustrationErrorText(error) {
    const code = error?.code ?? error?.errorCode ?? error?.message;
    if (ERRORS[code]) return t(ERRORS[code]);
    if (error?.status === 409) return t('The illustration changed in another window. Try again.');
    if (typeof code === 'string' && /^native_visual_.*(unreachable|timeout|network)/.test(code)) return t(ERRORS.native_visual_unreachable);
    return t('Something went wrong. Try again, or check the image service in Runtime.');
}
export const isSettingsError = code => /route_missing|role_unassigned|target_missing|rendering_missing|budget_exceeded|quota_exceeded|model_|negative_prompt|parameters_unsupported|geometry/.test(code ?? '');

/**
 * Task phases per annotation: writing → drawing → done | failed | cancelled, plus `confirm`
 * while a cost confirmation is pending. `onChange` fires on every transition.
 */
export function createIllustrationFlow({ sdk, onChange, readSettings, saveConsent }) {
    const tasks = new Map(), timers = new Set();
    let disposed = false;
    const set = (annotationId, patch) => {
        if (disposed) return;
        const next = patch === null ? undefined : { ...(tasks.get(annotationId) ?? {}), ...patch, updatedAt: Date.now() };
        if (next) tasks.set(annotationId, next); else tasks.delete(annotationId);
        onChange(annotationId, next);
    };
    const wait = ms => new Promise(resolve => { const id = setTimeout(() => { timers.delete(id); resolve(); }, ms); timers.add(id); });
    async function follow(step, operationId) {
        for (;;) {
            if (disposed) throw Object.assign(new Error('disposed'), { code: 'disposed' });
            const result = await sdk.illustrations[step]('status', { operationId });
            if (TERMINAL.has(result.operation.status)) return result.operation;
            await wait(POLL_MS);
        }
    }
    const annotationOf = id => sdk.illustrations.snapshot().state.annotations.find(item => item.annotationId === id);
    async function decideApproval(annotationId, preview) {
        const settings = await readSettings();
        const cost = preview.cost;
        const base = { targetFingerprint: preview.targetFingerprint, requestHash: preview.requestHash, externalAssetIds: preview.externalAssetIds ?? [],
            omittedPreferred: (preview.constraints?.omitted ?? []).filter(item => item.tier === 'preferred').map(item => item.capability) };
        if (cost.kind === 'free') return { ...base, maxCost: 0, currency: cost.currency || 'USD', allowUnknownCost: false };
        const consent = (settings.costConsents ?? []).find(item => item.targetFingerprint === preview.targetFingerprint);
        const known = cost.kind !== 'unknown' && cost.upperBound !== null;
        // A request quota set by the reader bounds unknown-price services; only image uploads still ask.
        if (!known && preview.quotas?.some(quota => quota.perDay) && !(preview.externalAssetIds ?? []).length) return { ...base, maxCost: 0, currency: cost.currency || settings.costConsents?.[0]?.currency || 'USD', allowUnknownCost: true };
        if (consent && !(preview.externalAssetIds ?? []).length && (known ? cost.upperBound <= consent.maxCost && (!cost.currency || cost.currency === consent.currency) : consent.maxCost > 0))
            return { ...base, maxCost: known ? cost.upperBound : consent.maxCost, currency: cost.currency || consent.currency, allowUnknownCost: !known };
        // Ask once in the panel; the UI resolves with { maxCost, currency, remember } or null.
        const answer = await new Promise(resolve => set(annotationId, { phase: 'confirm', preview, resolve }));
        if (!answer) return null;
        if (answer.remember) await saveConsent({ targetFingerprint: preview.targetFingerprint, maxCost: answer.maxCost, currency: answer.currency });
        return { ...base, maxCost: known ? Math.max(cost.upperBound, answer.maxCost) : answer.maxCost, currency: cost.currency || answer.currency, allowUnknownCost: !known };
    }
    async function draw(annotationId, extra = {}) {
        set(annotationId, { phase: 'drawing', step: 'preparing', error: null, resolve: undefined });
        const preview = await sdk.illustrations.image('prepare', { annotationId, expectedHead: sdk.illustrations.snapshot().head, ...extra });
        const approval = await decideApproval(annotationId, preview);
        if (!approval) { set(annotationId, { phase: 'cancelled', step: null, resolve: undefined }); return; }
        set(annotationId, { phase: 'drawing', step: 'submitting', resolve: undefined, preview: undefined });
        const before = new Set(sdk.illustrations.snapshot().state.images.map(image => image.imageVersionId));
        let started;
        try { started = await sdk.illustrations.image('start', { prepareId: preview.prepareId, approval }); } catch (error) {
            // The story changed, or the preparation expired, while this one waited for confirmation:
            // prepare again. The reader's answer still holds when the target and price are unchanged.
            if (!['native_visual_head_conflict', 'native_visual_prepare_expired'].includes(error?.code) && error?.status !== 409) throw error;
            const fresh = await sdk.illustrations.image('prepare', { annotationId, expectedHead: sdk.illustrations.snapshot().head, ...extra });
            const same = fresh.targetFingerprint === preview.targetFingerprint && JSON.stringify(fresh.cost) === JSON.stringify(preview.cost);
            const again = same ? { ...approval, requestHash: fresh.requestHash, externalAssetIds: fresh.externalAssetIds ?? [] } : await decideApproval(annotationId, fresh);
            if (!again) { set(annotationId, { phase: 'cancelled', step: null, resolve: undefined }); return; }
            set(annotationId, { phase: 'drawing', step: 'submitting', resolve: undefined, preview: undefined });
            started = await sdk.illustrations.image('start', { prepareId: fresh.prepareId, approval: again });
        }
        set(annotationId, { operationId: started.operationId, step: 'drawing' });
        const operation = await follow('image', started.operationId);
        await finishImage(annotationId, operation, before);
    }
    async function finishImage(annotationId, operation, before = null) {
        if (operation.status !== 'completed') {
            set(annotationId, { phase: operation.status === 'cancelled' ? 'cancelled' : 'failed', step: null, operationId: null,
                error: operation.status === 'uncertain_submission' ? t('The image service may still be working on this. Atria will not resend it automatically.') : illustrationErrorText({ code: operation.errorCode }), errorCode: operation.errorCode ?? null });
            return;
        }
        const annotation = annotationOf(annotationId);
        const images = sdk.illustrations.snapshot().state.images.filter(image => image.annotationId === annotationId);
        const fresh = images.filter(image => !before || !before.has(image.imageVersionId)).at(-1) ?? images.at(-1);
        // The first result goes straight into the story; later versions wait for the reader's choice.
        if (annotation && !annotation.selectedImageVersionId && fresh) {
            await sdk.illustrations.command('selectImageVersion', { annotationId, imageVersionId: fresh.imageVersionId, expectedHead: sdk.illustrations.snapshot().head });
        }
        set(annotationId, { phase: 'done', step: null, operationId: null, newVersionId: fresh?.imageVersionId ?? null, error: null });
    }
    async function write(annotationId) {
        set(annotationId, { phase: 'writing', step: 'writing', error: null });
        const started = await sdk.illustrations.prompt('start', { annotationId });
        set(annotationId, { operationId: started.operationId });
        const operation = await follow('prompt', started.operationId);
        if (operation.status !== 'completed') {
            set(annotationId, { phase: operation.status === 'cancelled' ? 'cancelled' : 'failed', step: null, operationId: null, error: illustrationErrorText({ code: operation.errorCode }), errorCode: operation.errorCode ?? null });
            return false;
        }
        return true;
    }
    const guard = (annotationId, job) => job().catch(error => {
        if (error?.code === 'disposed' || disposed) return;
        set(annotationId, { phase: 'failed', step: null, operationId: null, resolve: undefined, error: illustrationErrorText(error), errorCode: error?.code ?? null });
    });
    return {
        tasks,
        get: annotationId => tasks.get(annotationId),
        isActive: annotationId => ['writing', 'drawing', 'confirm'].includes(tasks.get(annotationId)?.phase),
        activeCount: () => [...tasks.values()].filter(task => ['writing', 'drawing', 'confirm'].includes(task.phase)).length,
        /** Write a description (when a model is available) and draw it. */
        illustrate(annotationId, { rewrite = true } = {}) {
            if (this.isActive(annotationId)) return Promise.resolve();
            return guard(annotationId, async () => {
                set(annotationId, { withWriting: rewrite, newVersionId: null });
                if (rewrite && !(await write(annotationId))) return;
                await draw(annotationId);
            });
        },
        /** Draw again with the current description. */
        redraw(annotationId) { if (this.isActive(annotationId)) return Promise.resolve(); set(annotationId, { withWriting: false, newVersionId: null }); return guard(annotationId, () => draw(annotationId)); },
        /** Drawing from an already prepared editing preview (Media Studio). */
        submitPrepared(annotationId, preview) {
            return guard(annotationId, async () => {
                const approval = await decideApproval(annotationId, preview);
                if (!approval) { set(annotationId, { phase: 'cancelled', step: null, resolve: undefined }); return; }
                const before = new Set(sdk.illustrations.snapshot().state.images.map(image => image.imageVersionId));
                set(annotationId, { phase: 'drawing', step: 'submitting', resolve: undefined, preview: undefined, withWriting: false });
                const started = await sdk.illustrations.image('start', { prepareId: preview.prepareId, approval });
                set(annotationId, { operationId: started.operationId, step: 'drawing' });
                await finishImage(annotationId, await follow('image', started.operationId), before);
            });
        },
        answer(annotationId, value) { const task = tasks.get(annotationId); task?.resolve?.(value); },
        async cancel(annotationId) {
            const task = tasks.get(annotationId);
            if (!task) return;
            if (task.phase === 'confirm') { task.resolve?.(null); return; }
            if (!task.operationId) return;
            await sdk.illustrations[task.phase === 'writing' ? 'prompt' : 'image']('cancel', { operationId: task.operationId });
            set(annotationId, { step: 'cancelling' });
        },
        dismiss(annotationId) { if (!this.isActive(annotationId)) set(annotationId, null); },
        /** Re-attach to server-owned tasks after a reload. */
        async resume() {
            for (const step of ['prompt', 'image']) {
                let operations = [];
                try { operations = await sdk.illustrations[step]('list'); } catch { continue; }
                for (const operation of operations) {
                    const annotationId = operation.anchor?.annotationId;
                    if (!annotationId || TERMINAL.has(operation.status) || tasks.has(annotationId)) continue;
                    set(annotationId, { phase: step === 'prompt' ? 'writing' : 'drawing', step: step === 'prompt' ? 'writing' : 'drawing', operationId: operation.operationId, withWriting: step === 'prompt' });
                    void guard(annotationId, async () => {
                        const done = await follow(step, operation.operationId);
                        if (step === 'image') await finishImage(annotationId, done);
                        else if (done.status === 'completed') set(annotationId, null); // The description is ready; drawing waits for the reader.
                        else set(annotationId, { phase: 'failed', step: null, operationId: null, error: illustrationErrorText({ code: done.errorCode }) });
                    });
                }
            }
        },
        dispose() { disposed = true; for (const id of timers) clearTimeout(id); timers.clear(); for (const task of tasks.values()) task.resolve?.(null); },
    };
}
