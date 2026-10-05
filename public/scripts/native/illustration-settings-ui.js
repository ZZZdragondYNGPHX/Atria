import { translateShellText as t } from '../atria-shell/localization.js';
import { defaultIllustrationPreset, OFFICIAL_PROMPT_TEMPLATE, assertIllustrationSettings } from '../../shared/illustration-plugin-contract.js';
import { illustrationSettingsClient } from './illustration-client.js';
import { runtimeRequest } from './runtime-client.js';
import { nativeProductClient } from './product-client.js';
import { NOVELAI_IMAGE_ADAPTERS } from '../../shared/novelai-illustration.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button, ILLUSTRATION_CSS } from './illustration-ui.js';

export function renderIllustrationPreset(doc, parent, preset) {
    field(doc, parent, '风格词', preset.style, value => preset.style = value, { multiline: true });
    field(doc, parent, '质量词', preset.quality, value => preset.quality = value, { multiline: true });
    field(doc, parent, '负面提示词', preset.negativePrompt, value => preset.negativePrompt = value, { multiline: true });
    let parameters = JSON.stringify(preset.parameters, null, 2);
    const input = field(doc, parent, 'NovelAI 参数', parameters, value => parameters = value, { multiline: true });
    const read = ({ silent = false } = {}) => { try { preset.parameters = JSON.parse(parameters); input.setCustomValidity(''); } catch { input.setCustomValidity('请填写有效 JSON 参数'); if (!silent) input.reportValidity(); throw new Error('请填写有效 JSON 参数'); } };
    return read;
}

export function mountIllustrationSettings({ document: doc = globalThis.document, parent, client = illustrationSettingsClient,
    configuration = () => runtimeRequest('/configuration'), works = () => nativeProductClient.listWorks(), packageId, showEnabled = true } = {}) {
    const root = node(doc, parent, 'section', undefined, 'atri-illustration-ui');
    node(doc, root, 'style', ILLUSTRATION_CSS);
    node(doc, root, 'h3', 'Atria 官方插图');
    const status = node(doc, root, 'p', '读取配置…'); status.setAttribute('role', 'status');
    const content = node(doc, root, 'div');
    let savedValue = '';
    let advanced = false, rawDraft = '', saving = false;
    let disposed = false, record, value, selectedCharacter = '', workId = packageId ?? '', configurationData = {}, workRows = [], readPreset = () => {};
    const fail = error => { if (!disposed) { status.textContent = error.status === 409 ? '配置已被另一处修改，当前编辑已保留。请重新打开配置后合并。' : error.message; status.setAttribute('role', 'alert'); } };
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
            root.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true })); status.setAttribute('role', 'status'); status.textContent = '配置已保存。'; render();
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
            button(doc, content, '保存配置', run(saveSettings)); source.focus(); markDirty(); return;
        }
        if (showEnabled) field(doc, content, '启用官方插图插件', value.enabled, enabled => value.enabled = enabled, { type: 'checkbox' });
        node(doc, content, 'p', '角色库与默认配置的修改只影响新标注；已有提示词保持原样。');
        const library = node(doc, content, 'details'); library.dataset.section = 'characters'; library.open = libraryOpen; node(doc, library, 'summary', '全局绘图角色库');
        select(doc, library, '编辑绘图角色', selectedCharacter, [['', '选择角色'], ...value.characters.map(item => [item.id, item.name + ' · ' + item.id])], id => { try { readPreset(); selectedCharacter = id; render(); } catch (error) { fail(error); } });
        const actions = node(doc, library, 'div', undefined, 'atri-illustration-actions');
        button(doc, actions, '新增角色', run(() => {
            readPreset(); const id = 'draw_' + doc.defaultView.crypto.randomUUID().replaceAll('-', '');
            value.characters.push({ id, name: '新角色', aliases: [], fixedPrompt: '', defaultClothing: '', enabled: true, storyActorId: '' }); selectedCharacter = id; render();
        }));
        const character = value.characters.find(item => item.id === selectedCharacter);
        if (character) {
            const form = node(doc, library, 'fieldset'); node(doc, form, 'legend', '角色描述');
            field(doc, form, '姓名', character.name, text => character.name = text);
            field(doc, form, '别名（每行一个）', character.aliases.join('\n'), text => character.aliases = text.split('\n').map(item => item.trim()).filter(Boolean), { multiline: true });
            field(doc, form, '固定外观提示词', character.fixedPrompt, text => character.fixedPrompt = text, { multiline: true });
            field(doc, form, '默认服装', character.defaultClothing, text => character.defaultClothing = text);
            field(doc, form, '剧情角色关联（可选）', character.storyActorId, text => character.storyActorId = text);
            field(doc, form, '角色可用', character.enabled, enabled => character.enabled = enabled, { type: 'checkbox' });
            button(doc, form, '删除角色', run(() => {
                readPreset(); value.characters = value.characters.filter(item => item !== character);
                for (const work of Object.values(value.works)) work.characterIds = work.characterIds.filter(id => id !== character.id);
                selectedCharacter = ''; render();
            }));
        }
        const scope = node(doc, content, 'fieldset'); node(doc, scope, 'legend', '默认配置');
        select(doc, scope, '配置范围', workId, [['', '全局默认'], ...workRows.map(item => [item.package.packageId, item.package.displayName || item.package.packageId]), ...(packageId && !workRows.some(item => item.package.packageId === packageId) ? [[packageId, packageId]] : [])], id => { try { readPreset(); workId = id; render(); } catch (error) { fail(error); } });
        const work = workId ? (value.works[workId] ?? { characterIds: [] }) : null;
        const ownWork = () => { if (work) value.works[workId] = work; return work; };
        if (work) {
            const characters = node(doc, scope, 'fieldset'); node(doc, characters, 'legend', '作品启用角色');
            if (!value.characters.length) node(doc, characters, 'p', '先在全局角色库添加绘图角色。');
            for (const item of value.characters) {
                field(doc, characters, item.name + ' · ' + item.id + (item.enabled ? '' : '（已停用）'), work.characterIds.includes(item.id), enabled => {
                    ownWork(); work.characterIds = enabled ? [...work.characterIds, item.id] : work.characterIds.filter(id => id !== item.id);
                }, { type: 'checkbox' });
            }
            field(doc, scope, '覆盖作品预设', Boolean(work.preset), enabled => {
                try { readPreset(); ownWork(); if (enabled) work.preset = structuredClone(value.preset); else delete work.preset; render(); } catch (error) { fail(error); }
            }, { type: 'checkbox' });
        }
        const presetContainer = node(doc, scope, 'fieldset'); node(doc, presetContainer, 'legend', work && !work.preset ? '继承全局预设' : '预设');
        const preset = work?.preset ?? value.preset;
        readPreset = renderIllustrationPreset(doc, presetContainer, preset);
        presetContainer.disabled = Boolean(work && !work.preset);
        const connectionChoices = [['', work ? '继承全局图片连接' : '未选择'], ...(configurationData.connections ?? []).filter(item => NOVELAI_IMAGE_ADAPTERS.includes(item.providerAdapter)).map(item => [item.connectionProfileId, item.displayName || item.connectionProfileId])];
        node(doc, scope, 'p', '在 Runtime → Connections 创建 NovelAI 官方或第三方兼容图片连接，并选择已有密钥。兼容连接需按服务文档声明模型与响应格式。');
        const routeChoices = [['', work ? '继承全局提示词路线' : '未选择'], ...(configurationData.routes ?? []).filter(item => item.role === 'role.illustration_prompt').map(item => [item.runtimeRouteId, item.displayName || item.runtimeRouteId])];
        select(doc, scope, '默认图片连接', work?.imageConnectionId ?? (work ? '' : value.imageConnectionId), connectionChoices, id => (ownWork() ?? value).imageConnectionId = id);
        select(doc, scope, '提示词模型路线', work?.promptRouteId ?? (work ? '' : value.promptRouteId), routeChoices, id => (ownWork() ?? value).promptRouteId = id);
        const template = node(doc, content, 'details'); template.dataset.section = 'template'; template.open = templateOpen; node(doc, template, 'summary', '提示词整理模板');
        field(doc, template, '整理模板', value.template, text => value.template = text, { multiline: true });
        button(doc, template, '恢复官方模板', run(() => { readPreset(); value.template = OFFICIAL_PROMPT_TEMPLATE; render(); }));
        const save = node(doc, content, 'div', undefined, 'atri-illustration-actions');
        button(doc, save, '恢复默认预设', run(() => { if (work) ownWork().preset = defaultIllustrationPreset(); else value.preset = defaultIllustrationPreset(); render(); }));
        button(doc, save, '保存配置', run(saveSettings));
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
