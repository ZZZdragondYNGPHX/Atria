import { translateShellText } from '../atria-shell/localization.js';
import { mountVisualConfiguration } from './visual-configuration-ui.js';
import { translateShellText as t } from '../atria-shell/localization.js';
import { defaultIllustrationPreset, OFFICIAL_PROMPT_TEMPLATE, assertIllustrationSettings } from '../../shared/illustration-plugin-contract.js';
import { illustrationSettingsClient } from './illustration-client.js';
import { runtimeRequest } from './runtime-client.js';
import { nativeProductClient } from './product-client.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button, ILLUSTRATION_CSS } from './illustration-ui.js';

export function renderIllustrationPreset(doc, parent, preset) {
    field(doc, parent, translateShellText('Style prompt'), preset.style, value => preset.style = value, { multiline: true });
    field(doc, parent, translateShellText('Quality prompt'), preset.quality, value => preset.quality = value, { multiline: true });
    field(doc, parent, translateShellText('Negative prompt'), preset.negativePrompt, value => preset.negativePrompt = value, { multiline: true });
    let parameters = JSON.stringify(preset.parameters, null, 2);
    const input = field(doc, parent, translateShellText('Image generation parameters JSON'), parameters, value => parameters = value, { multiline: true });
    const read = ({ silent = false } = {}) => { try { preset.parameters = JSON.parse(parameters); input.setCustomValidity(''); } catch { input.setCustomValidity(translateShellText('Enter valid JSON parameters.')); if (!silent) input.reportValidity(); throw new Error(translateShellText('Enter valid JSON parameters.')); } };
    return read;
}

export function mountIllustrationSettings({ document: doc = globalThis.document, parent, client = illustrationSettingsClient,
    configuration = async () => ({ ...await runtimeRequest('/configuration'), ...await runtimeRequest('/visual/configuration') }), works = () => nativeProductClient.listWorks(), packageId, showEnabled = true } = {}) {
    const root = node(doc, parent, 'section', undefined, 'atri-illustration-ui');
    node(doc, root, 'style', ILLUSTRATION_CSS);
    node(doc, root, 'h3', translateShellText('Atria illustrations'));
    const status = node(doc, root, 'p', translateShellText('Loading settings…')); status.setAttribute('role', 'status');
    const content = node(doc, root, 'div');
    let savedValue = '';
    let advanced = false, rawDraft = '', saving = false;
    let disposed = false, record, value, selectedCharacter = '', workId = packageId ?? '', configurationData = {}, workRows = [], readPreset = () => {};
    const fail = error => { if (!disposed) { status.textContent = error.status === 409 ? translateShellText('Settings changed elsewhere. Your draft is preserved. Reopen settings and compare before saving.') : error.message; status.setAttribute('role', 'alert'); } };
    const run = fn => async () => { if (disposed || saving) return; try { await fn(); } catch (error) { fail(error); } };
    const markDirty = () => {
        try { if (!advanced) readPreset({ silent: true }); root.dataset.atriaDraftDirty = String(JSON.stringify(advanced ? JSON.parse(rawDraft) : value) !== savedValue); } catch { root.dataset.atriaDraftDirty = 'true'; }
    };
    content.addEventListener('input', markDirty); content.addEventListener('change', markDirty);
    async function saveSettings() {
        if (disposed || saving) return;
        if (!advanced) readPreset();
        const validated = assertIllustrationSettings(advanced ? JSON.parse(rawDraft) : value);
        saving = true; const fields = [...content.querySelectorAll('input,textarea,select,button')], disabled = fields.map(input => input.disabled);
        fields.forEach(input => input.disabled = true);
        try {
            const next = await client.save(validated, record.revision);
            if (disposed) return;
            record = next; value = structuredClone(next.value); savedValue = JSON.stringify(value); rawDraft = JSON.stringify(value, null, 2);
            root.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true })); status.setAttribute('role', 'status'); status.textContent = translateShellText('Settings saved.'); render();
        } finally { saving = false; fields.forEach((input, index) => input.disabled = disabled[index]); }
    }
    function render() {
        const libraryOpen = Boolean(selectedCharacter || content.querySelector('[data-section=characters]')?.open);
        const templateOpen = Boolean(content.querySelector('[data-section=template]')?.open);
        content.replaceChildren();
        const modes = node(doc, content, 'div', undefined, 'atri-illustration-actions');
        button(doc, modes, advanced ? t('Fields') : t('Source'), run(() => {
            if (advanced) { const parsed = JSON.parse(rawDraft); assertIllustrationSettings(parsed); value = parsed; } else { readPreset(); rawDraft = JSON.stringify(value, null, 2); }
            advanced = !advanced; status.textContent = ''; status.setAttribute('role', 'status'); render();
        }));
        if (advanced) {
            const source = field(doc, content, t('Illustration settings JSON'), rawDraft, text => { rawDraft = text; }, { multiline: true }); source.rows = 18;
            button(doc, content, translateShellText('Save settings'), run(saveSettings)); source.focus(); markDirty(); return;
        }
        if (showEnabled) field(doc, content, translateShellText('Enable Atria illustrations'), value.enabled, enabled => value.enabled = enabled, { type: 'checkbox' });
        node(doc, content, 'p', translateShellText('Character and default changes apply to new annotations. Existing prompts are preserved.'));
        select(doc, content, translateShellText('Image generation mode'), value.director.mode, [['manual', translateShellText('Manual')], ['semi', translateShellText('Review candidates before generating')], ['automatic', translateShellText('Automatic within approval and budget')]], mode => value.director.mode = mode);
        select(doc, content, translateShellText('Automatic image frequency'), value.director.density, [['restrained', translateShellText('Restrained')], ['balanced', translateShellText('Balanced')], ['immersive', translateShellText('Immersive')]], density => value.director.density = density);
        select(doc, content, translateShellText('Optional candidate analysis route'), value.director.routeId, [['', translateShellText('Use rules without a model request')], ...(configurationData.routes ?? []).filter(r => r.role === 'role.illustration_prompt').map(r => [r.runtimeRouteId, r.displayName])], route => value.director.routeId = route);
        let autoLimit = String(value.director.autoApproval?.maxCost ?? 0), autoCurrency = value.director.autoApproval?.currency ?? 'USD';
        field(doc, content, translateShellText('Automatic cost limit per task'), autoLimit, text => autoLimit = text, { type: 'number' });
        field(doc, content, translateShellText('Automatic budget currency'), autoCurrency, text => autoCurrency = text);
        button(doc, content, translateShellText('Check and approve the automatic target'), run(async () => {
            if (!value.imageTargetId) throw new Error(translateShellText('Choose a global image target first.'));
            const result = await runtimeRequest('/visual/targets/describe', { method: 'POST', body: { imageTargetId: value.imageTargetId } });
            if (result.capabilities.cost.kind === 'unknown') throw new Error(translateShellText('This target has no confirmed cost limit. Use review mode instead of automatic submission.'));
            value.director.autoApproval = { targetFingerprint: result.targetFingerprint, maxCost: Number(autoLimit), currency: autoCurrency, externalAssetIds: [], omittedPreferred: [] };
            status.textContent = translateShellText('Approval added to this draft. Save settings to apply it. The global budget still limits submissions.'); markDirty();
        }));
        const library = node(doc, content, 'details'); library.dataset.section = 'characters'; library.open = libraryOpen; node(doc, library, 'summary', translateShellText('Drawing characters'));
        select(doc, library, translateShellText('Edit drawing character'), selectedCharacter, [['', translateShellText('Choose a character')], ...value.characters.map(item => [item.id, item.name + ' · ' + item.id])], id => { try { readPreset(); selectedCharacter = id; render(); } catch (error) { fail(error); } });
        const actions = node(doc, library, 'div', undefined, 'atri-illustration-actions');
        button(doc, actions, translateShellText('Add character'), run(() => {
            readPreset(); const id = 'draw_' + doc.defaultView.crypto.randomUUID().replaceAll('-', '');
            value.characters.push({ id, name: translateShellText('New character'), aliases: [], fixedPrompt: '', defaultClothing: '', enabled: true, storyActorId: '' }); selectedCharacter = id; render();
        }));
        const character = value.characters.find(item => item.id === selectedCharacter);
        if (character) {
            const form = node(doc, library, 'fieldset'); node(doc, form, 'legend', translateShellText('Character details'));
            field(doc, form, translateShellText('Name'), character.name, text => character.name = text);
            field(doc, form, translateShellText('Aliases, one per line'), character.aliases.join('\n'), text => character.aliases = text.split('\n').map(item => item.trim()).filter(Boolean), { multiline: true });
            field(doc, form, translateShellText('Fixed appearance prompt'), character.fixedPrompt, text => character.fixedPrompt = text, { multiline: true });
            field(doc, form, translateShellText('Default outfit'), character.defaultClothing, text => character.defaultClothing = text);
            field(doc, form, translateShellText('Linked story actor, optional'), character.storyActorId, text => character.storyActorId = text);
            field(doc, form, translateShellText('Character enabled'), character.enabled, enabled => character.enabled = enabled, { type: 'checkbox' });
            button(doc, form, translateShellText('Delete character'), run(() => {
                readPreset(); value.characters = value.characters.filter(item => item !== character);
                for (const work of Object.values(value.works)) work.characterIds = work.characterIds.filter(id => id !== character.id);
                selectedCharacter = ''; render();
            }));
        }
        const scope = node(doc, content, 'fieldset'); node(doc, scope, 'legend', translateShellText('Defaults'));
        select(doc, scope, translateShellText('Settings scope'), workId, [['', translateShellText('Global defaults')], ...workRows.map(item => [item.package.packageId, item.package.displayName || item.package.packageId]), ...(packageId && !workRows.some(item => item.package.packageId === packageId) ? [[packageId, packageId]] : [])], id => { try { readPreset(); workId = id; render(); } catch (error) { fail(error); } });
        const work = workId ? (value.works[workId] ?? { characterIds: [] }) : null;
        const ownWork = () => { if (work) value.works[workId] = work; return work; };
        if (work) {
            const characters = node(doc, scope, 'fieldset'); node(doc, characters, 'legend', translateShellText('Characters enabled for this work'));
            if (!value.characters.length) node(doc, characters, 'p', translateShellText('Add drawing characters to the global library first.'));
            for (const item of value.characters) {
                field(doc, characters, item.name + ' · ' + item.id + (item.enabled ? '' : translateShellText(' (disabled)')), work.characterIds.includes(item.id), enabled => {
                    ownWork(); work.characterIds = enabled ? [...work.characterIds, item.id] : work.characterIds.filter(id => id !== item.id);
                }, { type: 'checkbox' });
            }
            field(doc, scope, translateShellText('Use a separate preset for this work'), Boolean(work.preset), enabled => {
                try { readPreset(); ownWork(); if (enabled) work.preset = structuredClone(value.preset); else delete work.preset; render(); } catch (error) { fail(error); }
            }, { type: 'checkbox' });
        }
        const presetContainer = node(doc, scope, 'fieldset'); node(doc, presetContainer, 'legend', work && !work.preset ? translateShellText('Use the global preset') : translateShellText('Preset'));
        const preset = work?.preset ?? value.preset;
        readPreset = renderIllustrationPreset(doc, presetContainer, preset);
        presetContainer.disabled = Boolean(work && !work.preset);
        const targetChoices = [['', work ? translateShellText('Use the global target') : translateShellText('Not selected')], ...(configurationData.targets ?? []).map(item => [item.imageTargetId, item.displayName + ' · ' + item.model])];
        const renderingChoices = [['', work ? translateShellText('Use the global style') : translateShellText('Use the annotation style')], ...(configurationData.renderings ?? []).map(item => [item.imageRenderingId, item.displayName])];
        node(doc, scope, 'p', translateShellText('Manage connections in Runtime. Image targets select a model or workflow; styles are separate from provider parameters.'));
        const routeChoices = [['', work ? translateShellText('Use the global prompt route') : translateShellText('Not selected')], ...(configurationData.routes ?? []).filter(item => item.role === 'role.illustration_prompt').map(item => [item.runtimeRouteId, item.displayName || item.runtimeRouteId])];
        select(doc, scope, translateShellText('Default image target'), work?.imageTargetId ?? (work ? '' : value.imageTargetId), targetChoices, id => (ownWork() ?? value).imageTargetId = id);
        select(doc, scope, translateShellText('Default image style'), work?.imageRenderingId ?? (work ? '' : value.imageRenderingId), renderingChoices, id => (ownWork() ?? value).imageRenderingId = id);
        select(doc, scope, translateShellText('Prompt model route'), work?.promptRouteId ?? (work ? '' : value.promptRouteId), routeChoices, id => (ownWork() ?? value).promptRouteId = id);
        const template = node(doc, content, 'details'); template.dataset.section = 'template'; template.open = templateOpen; node(doc, template, 'summary', translateShellText('Prompt formatting template'));
        field(doc, template, translateShellText('Formatting template'), value.template, text => value.template = text, { multiline: true });
        button(doc, template, translateShellText('Restore the official template'), run(() => { readPreset(); value.template = OFFICIAL_PROMPT_TEMPLATE; render(); }));
        if (configurationData.budget) mountVisualConfiguration({ document: doc, parent: content, connections: configurationData.connections ?? [], data: configurationData, report: fail,
            refresh: async () => { configurationData = await configuration(); render(); } });
        const save = node(doc, content, 'div', undefined, 'atri-illustration-actions');
        button(doc, save, translateShellText('Restore default preset'), run(() => { if (work) ownWork().preset = defaultIllustrationPreset(); else value.preset = defaultIllustrationPreset(); render(); }));
        button(doc, save, translateShellText('Save settings'), run(saveSettings));
        markDirty();
    }
    const ready = (async () => {
        try {
            const [settings, config, availableWorks] = await Promise.all([client.read(), configuration().catch(() => ({})), works().catch(() => [])]);
            if (disposed) return;
            record = settings; value = structuredClone(settings.value); savedValue = JSON.stringify(value); configurationData = config; workRows = availableWorks;
            status.textContent = ''; render();
        } catch (error) { fail(error); }
    })();
    return { root, ready, dispose() { disposed = true; root.remove(); } };
}
