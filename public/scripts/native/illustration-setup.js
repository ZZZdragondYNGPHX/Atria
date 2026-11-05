import { translateShellText as t, formatShellText as f } from '../atria-shell/localization.js';
import { runtimeRequest } from './runtime-client.js';
import { illustrationSettingsClient } from './illustration-client.js';
import { assertIllustrationSettings } from '../../shared/illustration-plugin-contract.js';
import { isImageAdapter, imageModelChoices, defaultImageModel, needsWorkflow, supportsNegativePrompt, imageAspectParameters, imageAspectOf, imageSizeRule,
    imageSizeProblem, imageSizeOf, imageSizeParameters, imageOrientation, imageModelTiers, imageQuotaModelFor } from '../../shared/image-service-catalog.js';
import { el, icon, action, field, input, select, segmented, check, section } from './illustration-kit.js';

const hex = doc => doc.defaultView.crypto.randomUUID().replaceAll('-', '');
const ADAPTER_LABELS = { 'provider.novelai-image': 'NovelAI', 'provider.novelai-image-compatible': 'NovelAI-compatible relay', 'provider.openai-images': 'OpenAI Images',
    'provider.gemini-image': 'Gemini images', 'provider.comfyui-image': 'ComfyUI workflow', 'provider.sd-webui-image': 'Stable Diffusion WebUI', 'provider.forge-image': 'Forge', 'provider.runninghub-image': 'RunningHub workflow' };
// Original style starters. Wording is plain English tags that every service understands.
const TIER_LABELS = { high: 'High', medium: 'Medium' };
export const STYLE_PRESETS = [
    { id: 'anime', name: 'Anime', hint: 'Clean lines, bright color', style: 'anime style, cel shading, clean lineart, vibrant colors', quality: 'masterpiece, best quality, highly detailed', negative: 'lowres, bad anatomy, bad hands, text, watermark, blurry' },
    { id: 'painterly', name: 'Painted illustration', hint: 'Soft brushwork, dramatic light', style: 'digital painting, painterly, soft brush strokes, dramatic lighting', quality: 'highly detailed, rich colors', negative: 'lowres, text, watermark, blurry' },
    { id: 'watercolor', name: 'Watercolor', hint: 'Gentle, storybook feel', style: 'watercolor illustration, soft edges, paper texture, pastel palette', quality: 'delicate, detailed', negative: 'lowres, text, watermark' },
    { id: 'cinematic', name: 'Cinematic', hint: 'Realistic, film lighting', style: 'photorealistic, cinematic lighting, 35mm film still, shallow depth of field', quality: 'high detail, sharp focus', negative: 'cartoon, lowres, text, watermark' },
    { id: 'ink', name: 'Chinese ink', hint: 'Ink wash, rice paper', style: 'traditional Chinese ink wash painting, xieyi, rice paper texture, muted colors', quality: 'elegant composition', negative: 'lowres, text, watermark' },
    { id: 'manga', name: 'Black-and-white manga', hint: 'Screentone, bold ink', style: 'manga style, monochrome, screentone, bold ink lines', quality: 'clean, detailed', negative: 'color, lowres, text, watermark' },
];

export async function loadIllustrationConfig(request = runtimeRequest) {
    const [settings, runtime, visual] = await Promise.all([illustrationSettingsClient.read(), request('/configuration'), request('/visual/configuration')]);
    return { record: settings, settings: settings.value, connections: runtime.connections ?? [], routes: runtime.routes ?? [], targets: visual.targets ?? [], renderings: visual.renderings ?? [], budget: visual.budget };
}
/** What the reader still has to do; overrides of the current work are honoured. */
export function illustrationReadiness(config, packageId) {
    const work = config.settings.works[packageId] ?? {};
    const targetId = work.imageTargetId || config.settings.imageTargetId;
    const target = config.targets.find(item => item.imageTargetId === targetId);
    const connection = target && config.connections.find(item => item.connectionProfileId === target.connectionProfileId);
    const writers = config.routes.filter(route => route.role === 'role.illustration_prompt');
    const routeId = work.promptRouteId || config.settings.promptRouteId;
    const writer = config.settings.promptMode === 'manual' ? null : routeId ? writers.find(route => route.runtimeRouteId === routeId) ?? null : writers.length === 1 ? writers[0] : null;
    const renderingId = work.imageRenderingId || config.settings.imageRenderingId;
    return { target, connection, service: Boolean(target && connection && target.model && (!needsWorkflow(connection.providerAdapter) || target.workflow)),
        writer, writes: Boolean(writer), manual: config.settings.promptMode === 'manual', rendering: config.renderings.find(item => item.imageRenderingId === renderingId) ?? null,
        workOverrides: ['imageTargetId', 'imageRenderingId', 'promptRouteId'].filter(key => work[key]) };
}
export async function updateIllustrationSettings(mutate) {
    for (let attempt = 0; ; attempt++) {
        const record = await illustrationSettingsClient.read();
        const value = structuredClone(record.value);
        mutate(value);
        try { return await illustrationSettingsClient.save(assertIllustrationSettings(value), record.revision); } catch (error) { if (error.status !== 409 || attempt) throw error; }
    }
}

export function mountIllustrationSetup({ document: doc, parent, packageId = '', onChanged = () => {}, openAdvanced = null, request = runtimeRequest }) {
    const root = el(doc, 'div', { className: 'atri-ill-setup' });
    const status = el(doc, 'p', { className: 'atri-ill-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    parent.append(status, root);
    let config = null, capability = null, disposed = false, sequence = 0, customSize = false, quotaMode = false;
    const say = (text, kind = 'info') => { status.textContent = text; status.dataset.kind = kind; status.setAttribute('role', kind === 'error' ? 'alert' : 'status'); };
    const guard = job => async (...args) => { try { await job(...args); } catch (error) { if (!disposed) say(error.status === 409 ? t('Settings changed in another window. Reloaded the latest version.') : t('Could not save. ') + (error.message || ''), 'error'); await reload(); } };
    async function reload() {
        const current = ++sequence;
        config = await loadIllustrationConfig(request);
        if (disposed || current !== sequence) return;
        render();
        void describe(current);
    }
    async function describe(current) {
        const ready = illustrationReadiness(config, packageId);
        capability = null;
        if (!ready.target) return;
        try { capability = await request('/visual/targets/describe', { method: 'POST', body: { imageTargetId: ready.target.imageTargetId } }); } catch (error) { capability = { error: error.code || error.message }; }
        if (!disposed && current === sequence) { render(); onChanged(config); }
    }
    const saved = async message => { say(message); await reload(); onChanged(config); };

    async function saveTarget(patch) {
        const ready = illustrationReadiness(config, packageId);
        const previous = ready.target;
        const connection = config.connections.find(item => item.connectionProfileId === (patch.connectionProfileId ?? previous?.connectionProfileId));
        const adapterChanged = previous && connection && config.connections.find(item => item.connectionProfileId === previous.connectionProfileId)?.providerAdapter !== connection.providerAdapter;
        const adapter = connection.providerAdapter;
        const model = patch.model ?? (adapterChanged || !previous ? defaultImageModel(connection) : previous.model);
        const base = previous && !adapterChanged ? previous.nativeParameters : {};
        let parameters = base;
        if (needsWorkflow(adapter) && !adapterChanged) parameters = base;
        else if (patch.size) parameters = imageSizeParameters(adapter, patch.size, base);
        else if (patch.aspect || !previous || adapterChanged) {
            const previousAspect = previous ? imageAspectOf(adapter, previous.nativeParameters) : 'portrait';
            parameters = imageAspectParameters(adapter, patch.aspect ?? (previousAspect === 'custom' ? 'portrait' : previousAspect), base);
        } else {
            // Keep the reader's size unless the new model cannot draw it.
            const rule = imageSizeRule(connection, model), size = imageSizeOf(adapter, base);
            if (rule.kind === 'ratio') { if (size.imageSize && !rule.imageSizes.includes(size.imageSize)) { parameters = { ...base }; delete parameters.imageSize; } } else if (imageSizeProblem(rule, size.width, size.height)) parameters = imageAspectParameters(adapter, imageOrientation(size), base);
        }
        // A quality tier only exists on models that declare tiers (NovelAI V5 Full).
        if (patch.tier) parameters = { ...parameters, tier: patch.tier };
        else if (!imageModelTiers(connection, model).length && 'tier' in parameters) { parameters = { ...parameters }; delete parameters.tier; }
        const value = { schemaVersion: 2, imageTargetId: previous?.imageTargetId ?? 'imgtarget_' + hex(doc), revision: 'r_' + hex(doc), displayName: previous?.displayName || t('Illustrations'),
            connectionProfileId: connection.connectionProfileId, model, serviceVersion: previous?.serviceVersion ?? '',
            nativeParameters: parameters, workflow: adapterChanged ? null : previous?.workflow ?? null, capabilities: null };
        await request('/visual/resources', { method: 'PUT', body: { resourceType: 'core.image-target', expectedRevision: previous?.revision ?? null, value } });
        if (!previous) await updateIllustrationSettings(settings => { settings.imageTargetId = value.imageTargetId; });
        // Negative words fail on services that cannot use them; keep the style valid.
        if (ready.rendering?.negativePrompt && !supportsNegativePrompt(connection.providerAdapter)) await saveRendering({ negativePrompt: '' });
        await saved(t('Image service saved.'));
    }
    async function saveRendering(patch) {
        const previous = illustrationReadiness(config, packageId).rendering;
        const value = { schemaVersion: 2, imageRenderingId: previous?.imageRenderingId ?? 'imgrender_' + hex(doc), revision: 'r_' + hex(doc), displayName: patch.displayName ?? previous?.displayName ?? t('Art style'),
            style: patch.style ?? previous?.style ?? '', quality: patch.quality ?? previous?.quality ?? '', negativePrompt: patch.negativePrompt ?? previous?.negativePrompt ?? '', defaultTargetId: previous?.defaultTargetId ?? null, constraints: previous?.constraints ?? [] };
        await request('/visual/resources', { method: 'PUT', body: { resourceType: 'core.image-rendering', expectedRevision: previous?.revision ?? null, value } });
        if (!previous) await updateIllustrationSettings(settings => { settings.imageRenderingId = value.imageRenderingId; });
    }
    async function chooseWriter(routeId) {
        if (routeId === 'manual') { await updateIllustrationSettings(settings => { settings.promptMode = 'manual'; }); return saved(t('You will write image descriptions yourself.')); }
        let route = config.routes.find(item => item.runtimeRouteId === routeId);
        if (route.role !== 'role.illustration_prompt') {
            // Reuse the chat model's connection, parameters and context program under the illustration role.
            const copy = { ...structuredClone(route), runtimeRouteId: 'route_' + hex(doc), displayName: f('${0} · illustrations', [route.displayName]), role: 'role.illustration_prompt', fallbackRouteRefs: [] };
            await request('/configuration/routes', { method: 'PUT', body: copy });
            route = copy;
        }
        await updateIllustrationSettings(settings => { delete settings.promptMode; settings.promptRouteId = route.runtimeRouteId; });
        await saved(f('“${0}” will write image descriptions.', [route.displayName]));
    }
    async function saveBudget(patch) {
        await request('/visual/budget', { method: 'PUT', body: { value: { ...config.budget.value, ...patch }, expectedRevision: config.budget.revision } });
        await saved(t('Spending limit saved.'));
    }
    async function saveConsent(maxCost, enabled) {
        const fingerprint = capability?.targetFingerprint;
        await updateIllustrationSettings(settings => {
            settings.costConsents = (settings.costConsents ?? []).filter(item => item.targetFingerprint !== fingerprint);
            if (enabled) settings.costConsents.push({ targetFingerprint: fingerprint, maxCost, currency: config.budget.value.currency });
            if (!settings.costConsents.length) delete settings.costConsents;
        });
        await saved(enabled ? t('Atria will generate without asking, within your limits.') : t('Atria will ask before each paid image.'));
    }
    async function saveDirector(mode, density = config.settings.director.density) {
        const ready = illustrationReadiness(config, packageId);
        let autoApproval = config.settings.director.autoApproval;
        if (mode === 'automatic') {
            if (!ready.target) throw new Error(t('Choose an image service first.'));
            const described = await request('/visual/targets/describe', { method: 'POST', body: { imageTargetId: ready.target.imageTargetId } });
            if (described.capabilities.cost.kind === 'unknown' || ready.connection.providerAdapter.startsWith('provider.novelai-image')) {
                say(t('This service cannot run unattended: its price is unknown or it requires a person to start each image. Use “Suggest passages” instead.'), 'error');
                render(); return;
            }
            autoApproval = { targetFingerprint: described.targetFingerprint, maxCost: described.capabilities.cost.upperBound ?? 0, currency: described.capabilities.cost.currency || config.budget.value.currency, externalAssetIds: [], omittedPreferred: [] };
        }
        await updateIllustrationSettings(settings => { settings.director = { ...settings.director, mode, density, autoApproval: mode === 'automatic' ? autoApproval : settings.director.autoApproval }; });
        await saved(t('Automatic illustration updated.'));
    }

    function render() {
        const ready = illustrationReadiness(config, packageId);
        root.replaceChildren();
        if (ready.workOverrides.length) root.append(el(doc, 'div', { className: 'atri-ill-hint' }, [icon(doc, 'info'), el(doc, 'div', { className: 'atri-ill-stack' }, [
            el(doc, 'p', { text: t('This work has its own illustration settings. Changes here apply to your other works.') }),
            el(doc, 'div', {}, [action(doc, t('Use the shared settings for this work'), guard(async () => { await updateIllustrationSettings(settings => { for (const key of ['imageTargetId', 'imageRenderingId', 'promptRouteId']) delete settings.works[packageId]?.[key]; }); await saved(t('This work now follows the shared settings.')); }), { size: 'sm' })])])]));
        root.append(serviceSection(ready), styleSection(ready), writerSection(ready), spendingSection(ready), autoSection(ready));
        if (openAdvanced) root.append(el(doc, 'div', { className: 'atri-ill-section' }, [el(doc, 'p', { className: 'atri-ill-muted', text: t('Prompt template, workflow mapping, per-work overrides and raw parameters are in Advanced settings.') }),
            el(doc, 'div', {}, [action(doc, t('Advanced settings'), openAdvanced, { variant: 'plain', icon: 'tune', size: 'sm' })])]));
    }
    function serviceSection(ready) {
        const services = config.connections.filter(item => isImageAdapter(item.providerAdapter));
        const add = () => action(doc, t('Add an image service'), () => globalThis.Atria?.shell?.getNavigation?.()?.navigate('runtime', { child: { id: 'connections:new-image', label: t('Services'), kind: 'workspace' }, reason: 'illustration-setup', history: 'push' }),
            { variant: services.length ? 'plain' : 'primary', icon: 'plus', size: services.length ? 'sm' : 'md' });
        if (!services.length) return section(doc, t('Image service'), { step: 1 }, [
            el(doc, 'p', { className: 'atri-ill-muted', text: t('Connect NovelAI, OpenAI, Gemini, a local Stable Diffusion/Forge or ComfyUI server. API keys stay in Runtime.') }), el(doc, 'div', {}, [add()])]);
        const connection = ready.connection ?? null;
        const children = [field(doc, t('Service'), select(doc, connection?.connectionProfileId ?? '', [...(connection ? [] : [['', t('Choose a service…')]]),
            ...services.map(item => [item.connectionProfileId, item.displayName + ' · ' + t(ADAPTER_LABELS[item.providerAdapter] ?? item.providerAdapter)])], guard(id => id && saveTarget({ connectionProfileId: id }))))];
        if (connection) {
            const models = imageModelChoices(connection);
            const current = ready.target?.model ?? '';
            children.push(field(doc, t('Model'), models.length ? select(doc, current, [...(models.includes(current) ? [] : [[current, current || t('Choose a model…')]]), ...models.map(id => [id, id])], guard(model => saveTarget({ model })))
                : input(doc, current, guard(model => model.trim() && saveTarget({ model: model.trim() })), { placeholder: t('Model name as shown by the server') }),
            models.length ? '' : t('Use the exact model or checkpoint name from your server.')));
            if (needsWorkflow(connection.providerAdapter)) children.push(el(doc, 'p', { className: 'atri-ill-muted', text: ready.target?.workflow ? t('Workflow imported.') : t('This service draws with a workflow. Import its API workflow in Advanced settings.') }));
            else children.push(sizeField(connection, ready.target));
            const tiers = imageModelTiers(connection, current);
            if (tiers.length) children.push(field(doc, t('Quality'), segmented(doc, t('Quality'), ready.target?.nativeParameters?.tier ?? tiers[0],
                tiers.map(id => [id, t(TIER_LABELS[id] ?? id)]), guard(tier => saveTarget({ tier }))), t('High uses the full model (23 steps). Medium uses a faster distilled model (14 steps). Some relays count them separately.')));
            if (capability?.error) children.push(el(doc, 'p', { className: 'atri-ill-state', text: t('Atria could not check this model. Generation may fail until the service and model are correct.'), attrs: { 'data-kind': 'error' } }));
            else if (capability) children.push(el(doc, 'p', { className: 'atri-ill-state', text: t('Ready to draw.'), attrs: { 'data-kind': 'done' } }));
        }
        children.push(el(doc, 'div', {}, [add()]));
        return section(doc, t('Image service'), { step: 1, done: ready.service }, children);
    }
    function sizeField(connection, target) {
        const adapter = connection.providerAdapter, rule = imageSizeRule(connection, target?.model ?? ''), parameters = target?.nativeParameters ?? {};
        const aspect = imageAspectOf(adapter, parameters), size = imageSizeOf(adapter, parameters), custom = customSize || aspect === 'custom';
        const presets = [['portrait', t('Portrait')], ['landscape', t('Landscape')], ['square', t('Square')], ...(rule.kind === 'fixed' ? [] : [['custom', t('Custom')]])];
        const children = [segmented(doc, t('Shape'), custom ? 'custom' : aspect, presets, guard(next => { customSize = next === 'custom'; if (customSize) { render(); return; } return saveTarget({ aspect: next }); })),
            el(doc, 'p', { className: 'atri-ill-muted', text: f('Current size: ${0}', [size.ratio ? size.ratio + (size.imageSize ? ' · ' + size.imageSize : '') : size.width + ' × ' + size.height]) })];
        if (rule.kind === 'fixed') children.push(el(doc, 'p', { className: 'atri-ill-muted', text: t('This model offers these three sizes only.') }));
        else if (custom && rule.kind === 'ratio') {
            let ratio = size.ratio, imageSize = size.imageSize;
            children.push(el(doc, 'div', { className: 'atri-ill-row atri-ill-wrap' }, [
                field(doc, t('Aspect ratio'), select(doc, ratio, rule.ratios.map(item => [item, item]), value => { ratio = value; })),
                rule.imageSizes.length ? field(doc, t('Resolution'), select(doc, imageSize, [['', t('Default')], ...rule.imageSizes.map(item => [item, item])], value => { imageSize = value; })) : null,
                action(doc, t('Apply size'), guard(async () => { customSize = false; await saveTarget({ size: { ratio, imageSize } }); }), { size: 'sm' })]));
        } else if (custom) {
            let width = size.width, height = size.height;
            const number = (value, set) => { const node = input(doc, String(value), text => set(Number(text)), { type: 'number' }); node.step = String(rule.step); node.min = String(rule.min); node.inputMode = 'numeric'; return node; };
            children.push(el(doc, 'div', { className: 'atri-ill-row atri-ill-wrap atri-ill-size' }, [
                field(doc, t('Width'), number(width, value => { width = value; })), field(doc, t('Height'), number(height, value => { height = value; })),
                action(doc, t('Apply size'), guard(async () => {
                    root.querySelectorAll('.atri-ill-size input').forEach(node => node.dispatchEvent(new Event('change')));
                    const problem = imageSizeProblem(rule, width, height);
                    if (problem) { say(sizeProblemText(rule, problem), 'error'); return; }
                    customSize = false; await saveTarget({ size: { width, height } });
                }), { size: 'sm' })]),
            el(doc, 'p', { className: 'atri-ill-muted', text: f('Multiples of ${0} px, at most ${1} pixels in total.', [rule.step, rule.maxPixels.toLocaleString()]) + (rule.minRatio ? ' ' + t('The long side can be at most three times the short side.') : '') }));
        }
        return field(doc, t('Size'), el(doc, 'div', { className: 'atri-ill-stack' }, children));
    }
    function sizeProblemText(rule, problem) {
        return { step: f('Width and height must be multiples of ${0}.', [rule.step]), small: f('Width and height must be at least ${0}.', [rule.min]),
            large: f('Width can be at most ${0} and height at most ${1}.', [rule.maxWidth, rule.maxHeight]), pixels: f('Too large for this model: at most ${0} pixels in total.', [rule.maxPixels.toLocaleString()]),
            ratio: t('The long side can be at most three times the short side.') }[problem] ?? t('Enter whole numbers for width and height.');
    }
    function styleSection(ready) {
        const current = ready.rendering;
        const negative = !ready.connection || supportsNegativePrompt(ready.connection.providerAdapter);
        const active = STYLE_PRESETS.find(preset => current?.style === preset.style)?.id ?? (current?.style ? 'custom' : '');
        const cards = el(doc, 'div', { className: 'atri-ill-styles', attrs: { role: 'group', 'aria-label': t('Art style') } }, [...STYLE_PRESETS.map(preset => el(doc, 'button', { className: 'atri-ill-style', attrs: { type: 'button', 'aria-pressed': String(active === preset.id) },
            on: { click: guard(async () => { await saveRendering({ displayName: t(preset.name), style: preset.style, quality: preset.quality, negativePrompt: negative ? preset.negative : '' }); await saved(f('Art style set to ${0}.', [t(preset.name)])); }) } },
        [el(doc, 'strong', { text: t(preset.name) }), el(doc, 'span', { text: t(preset.hint) })]))]);
        const custom = el(doc, 'details', { className: 'atri-ill-details', attrs: { open: active === 'custom' } }, [el(doc, 'summary', { text: t('Describe your own style') }), el(doc, 'div', { className: 'atri-ill-stack' }, [
            field(doc, t('Style'), input(doc, current?.style ?? '', guard(async style => { await saveRendering({ displayName: t('Custom style'), style }); await saved(t('Art style saved.')); }), { multiline: true, placeholder: t('e.g. soft pastel anime, warm evening light') })),
            negative ? field(doc, t('Avoid'), input(doc, current?.negativePrompt ?? '', guard(async negativePrompt => { await saveRendering({ negativePrompt }); await saved(t('Art style saved.')); }), { placeholder: t('e.g. text, watermark, extra fingers') }), t('Things the image should not contain.')) : null])]);
        return section(doc, t('Art style'), { step: 2, done: Boolean(current?.style) }, [cards, custom]);
    }
    function writerSection(ready) {
        const chat = config.routes.filter(route => route.role !== 'role.illustration_prompt' && !['role.embedding', 'role.reranker'].includes(route.role));
        const writers = config.routes.filter(route => route.role === 'role.illustration_prompt');
        const value = ready.manual ? 'manual' : ready.writer?.runtimeRouteId ?? '';
        const choices = [...(value ? [] : [['', t('Choose…')]]), ...writers.map(route => [route.runtimeRouteId, route.displayName]),
            ...chat.filter(route => !writers.some(writer => writer.displayName === f('${0} · illustrations', [route.displayName]))).map(route => [route.runtimeRouteId, f('Use ${0}', [route.displayName])]), ['manual', t('I will write descriptions myself')]];
        return section(doc, t('Image descriptions'), { step: 3, done: ready.writes || ready.manual }, [
            el(doc, 'p', { className: 'atri-ill-muted', text: t('A chat model reads the passage and its surroundings, then writes what to draw. Each description is one extra short request to that model.') }),
            field(doc, t('Written by'), select(doc, value, choices, guard(id => id && chooseWriter(id)))),
            chat.length || writers.length ? null : el(doc, 'p', { className: 'atri-ill-muted', text: t('Connect a chat model in Runtime first, or write descriptions yourself.') })]);
    }
    function spendingSection(ready) {
        const cost = capability?.capabilities?.cost;
        const budget = config.budget.value;
        if (!ready.target || !capability) return section(doc, t('Spending'), { step: 4 }, [el(doc, 'p', { className: 'atri-ill-muted', text: ready.target ? t('Checking the service…') : t('Choose an image service first.') })]);
        if (cost?.kind === 'free') return section(doc, t('Spending'), { step: 4, done: true }, [el(doc, 'p', { className: 'atri-ill-muted', text: t('This service runs on your own computer. Images are free.') })]);
        const consent = (config.settings.costConsents ?? []).find(item => item.targetFingerprint === capability?.targetFingerprint);
        const known = cost && cost.kind !== 'unknown' && cost.upperBound !== null;
        // Services that sell a number of requests per model (per day or minute) are limited by those counts
        // instead of money. Each service + model has its own counts; '*' is a limit shared by all its models.
        const quotaModel = imageQuotaModelFor(ready.connection, ready.target), connectionId = ready.connection.connectionProfileId;
        const quotas = budget.requestQuotas ?? [];
        const own = quotas.find(item => item.connectionProfileId === connectionId && item.model === quotaModel);
        const shared = quotas.find(item => item.connectionProfileId === connectionId && item.model === '*');
        const byCount = !known && (own?.perDay || shared?.perDay || quotaMode);
        const saveQuota = (model, patch) => {
            const current = quotas.find(item => item.connectionProfileId === connectionId && item.model === model) ?? { connectionProfileId: connectionId, model };
            const next = { ...current, ...patch };
            for (const key of ['perDay', 'perMinute']) if (!(next[key] > 0)) delete next[key];
            const rest = quotas.filter(item => item !== current);
            return saveBudget({ requestQuotas: next.perDay || next.perMinute ? [...rest, next] : rest });
        };
        const count = (value, onCommit, placeholder = '') => input(doc, value ? String(value) : '', guard(text => onCommit(Math.max(0, Math.floor(Number(text) || 0)))), { type: 'number', placeholder });
        const modeSwitch = known ? null : segmented(doc, t('Limit by'), byCount ? 'quota' : 'money', [['money', t('Amount')], ['quota', t('Request count')]], guard(async mode => {
            quotaMode = mode === 'quota';
            if (mode === 'money' && (own || shared)) { await saveBudget({ requestQuotas: quotas.filter(item => item !== own && item !== shared) }); return; }
            render();
        }));
        if (byCount) {
            const done = Boolean(own?.perDay || shared?.perDay);
            return section(doc, t('Spending'), { step: 4, done, aside: done ? null : el(doc, 'span', { className: 'atri-ill-state', text: t('Needed'), attrs: { 'data-kind': 'error' } }) }, [
                modeSwitch, el(doc, 'p', { className: 'atri-ill-muted', text: t('For services that allow a number of requests per model. Atria stops when a count is used up and does not ask about money. Each service and model is counted on its own.') }),
                field(doc, f('Requests per day for ${0}', [quotaModel]), count(own?.perDay, value => saveQuota(quotaModel, { perDay: value }), '20'), t('Switching models or quality uses that model’s own count.')),
                el(doc, 'details', { className: 'atri-ill-details', attrs: { open: Boolean(own?.perMinute || shared) } }, [el(doc, 'summary', { text: t('More limits') }), el(doc, 'div', { className: 'atri-ill-stack' }, [
                    field(doc, f('Requests per minute for ${0}', [quotaModel]), count(own?.perMinute, value => saveQuota(quotaModel, { perMinute: value })), t('Leave empty if the service sets no rate limit.')),
                    field(doc, t('Requests per day shared by all models of this service'), count(shared?.perDay, value => saveQuota('*', { perDay: value })), t('Only if the provider counts every model against one total.'))])])]);
        }
        let reserve = consent?.maxCost ?? (known ? cost.upperBound : 0.05);
        const children = [modeSwitch, el(doc, 'p', { className: 'atri-ill-muted', text: known ? f('About ${0} ${1} per image.', [cost.upperBound, cost.currency || budget.currency])
            : t('Atria does not know this service’s price. It counts the amount you set per image and stops at your daily limit. Your provider’s bill is the final word.') }),
        field(doc, f('Daily limit (${0})', [budget.currency]), input(doc, String(budget.moneyDay), guard(value => saveBudget({ moneyDay: Math.max(0, Number(value) || 0) })), { type: 'number' }),
            budget.moneyDay > 0 ? '' : t('Set a daily limit above 0 to generate paid images.'))];
        if (!known) children.push(field(doc, f('Count each image as (${0})', [budget.currency]), input(doc, String(reserve), guard(async value => { reserve = Math.max(0, Number(value) || 0); if (consent) await saveConsent(reserve, true); }), { type: 'number' })));
        if (capability?.targetFingerprint) children.push(check(doc, t('Generate without asking each time'), Boolean(consent), guard(enabled => saveConsent(reserve, enabled))));
        const warn = budget.moneyDay <= 0;
        return section(doc, t('Spending'), { step: 4, done: !warn, aside: warn ? el(doc, 'span', { className: 'atri-ill-state', text: t('Needed'), attrs: { 'data-kind': 'error' } }) : null }, children);
    }
    function autoSection(ready) {
        const director = config.settings.director;
        const children = [segmented(doc, t('Automatic illustration'), director.mode, [['manual', t('Off')], ['semi', t('Suggest passages')], ['automatic', t('Automatic')]], guard(mode => saveDirector(mode))),
            el(doc, 'p', { className: 'atri-ill-muted', text: { manual: t('Only passages you choose are illustrated.'), semi: t('After each turn Atria suggests passages worth illustrating. Nothing is drawn until you choose.'),
                automatic: t('Atria illustrates key moments on its own, within your daily image and spending limits.') }[director.mode] })];
        if (director.mode !== 'manual') children.push(field(doc, t('How often'), segmented(doc, t('How often'), director.density, [['restrained', t('Rarely')], ['balanced', t('Sometimes')], ['immersive', t('Often')]], guard(density => saveDirector(director.mode, density)))));
        if (director.mode === 'automatic') children.push(field(doc, t('Automatic images per day'), input(doc, String(config.budget.value.imageDay), guard(value => saveBudget({ imageDay: Math.max(0, Math.floor(Number(value) || 0)) })), { type: 'number' })),
            field(doc, f('Automatic spending per day (${0})', [config.budget.value.currency]), input(doc, String(config.budget.value.autoMoneyDay), guard(value => saveBudget({ autoMoneyDay: Math.max(0, Number(value) || 0) })), { type: 'number' })));
        return section(doc, t('Automatic illustration'), { step: null }, children);
    }
    const ready = reload().catch(error => say(t('Could not load illustration settings. ') + (error.message || ''), 'error'));
    return { root, ready, reload, get config() { return config; }, dispose() { disposed = true; root.remove(); status.remove(); } };
}
