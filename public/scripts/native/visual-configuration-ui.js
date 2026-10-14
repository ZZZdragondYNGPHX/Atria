import { runtimeRequest } from './runtime-client.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button } from './illustration-ui.js';

export function mountVisualConfiguration({ document: doc, parent, connections, data, refresh, request = runtimeRequest, report }) {
    const section = node(doc, parent, 'details'); node(doc, section, 'summary', '图片目标、画风与预算');
    let target = structuredClone(data.targets?.[0] ?? null);
    const editor = node(doc, section, 'div');
    const newId = prefix => prefix + '_' + doc.defaultView.crypto.randomUUID().replaceAll('-', '');
    const run = action => async () => { try { await action(); } catch (error) { report(error); } };
    const render = () => {
        editor.replaceChildren();
        select(doc, editor, '编辑图片目标', target?.imageTargetId ?? '', [['', '新增目标'], ...(data.targets ?? []).map(item => [item.imageTargetId, item.displayName])], id => { target = structuredClone(data.targets.find(item => item.imageTargetId === id) ?? null); render(); });
        const previousRevision = target?.revision ?? null;
        const value = target ?? { schemaVersion: 2, imageTargetId: newId('imgtarget'), revision: newId('r'), displayName: '', connectionProfileId: '',
            model: 'nai-diffusion-5-full', serviceVersion: '', nativeParameters: {}, workflow: null, capabilities: null };
        field(doc, editor, '目标名称', value.displayName, text => value.displayName = text);
        select(doc, editor, '服务连接', value.connectionProfileId, [['', '选择 Runtime 连接'], ...connections.filter(c => /image|comfy|webui|forge|runninghub/.test(c.providerAdapter)).map(c => [c.connectionProfileId, c.displayName])], id => value.connectionProfileId = id);
        field(doc, editor, '模型 ID / 工作流目标', value.model, text => value.model = text);
        field(doc, editor, '服务或节点版本', value.serviceVersion, text => value.serviceVersion = text);
        const advanced = node(doc, editor, 'details'); node(doc, advanced, 'summary', '后端参数与工作流');
        let native = JSON.stringify(value.nativeParameters, null, 2), workflow = JSON.stringify(value.workflow, null, 2);
        field(doc, advanced, '后端原生参数 JSON', native, text => native = text, { multiline: true });
        field(doc, advanced, 'API 工作流与类型绑定 JSON', workflow, text => workflow = text, { multiline: true });
        node(doc, advanced, 'p', 'ComfyUI 使用 API graph、bindings、outputNodes 和 object_info 节点类型；能力检查会拒绝缺节点或错插槽。');
        button(doc, editor, '保存图片目标', run(async () => {
            await request('/visual/resources', { method: 'PUT', body: { resourceType: 'core.image-target', expectedRevision: previousRevision,
                value: { ...value, revision: newId('r'), nativeParameters: JSON.parse(native), workflow: JSON.parse(workflow), capabilities: null } } });
            await refresh();
        }));
        const rendering = node(doc, editor, 'fieldset'); node(doc, rendering, 'legend', '创建画风配置');
        let name = '', style = '', quality = '', negativePrompt = '';
        field(doc, rendering, '画风名称', name, text => name = text);
        field(doc, rendering, '画风描述', style, text => style = text, { multiline: true });
        field(doc, rendering, '质量偏好', quality, text => quality = text);
        field(doc, rendering, '负面提示词', negativePrompt, text => negativePrompt = text, { multiline: true });
        button(doc, rendering, '保存画风配置', run(async () => {
            await request('/visual/resources', { method: 'PUT', body: { resourceType: 'core.image-rendering', expectedRevision: null,
                value: { schemaVersion: 2, imageRenderingId: newId('imgrender'), revision: newId('r'), displayName: name, style, quality, negativePrompt, defaultTargetId: value.imageTargetId, constraints: [] } } });
            await refresh();
        }));
        const budget = node(doc, editor, 'fieldset'); node(doc, budget, 'legend', '任务与费用预算');
        const limits = structuredClone(data.budget.value);
        for (const [key, label] of [['imageHour', '自动图片 / 滚动小时'], ['imageDay', '自动图片 / 滚动日'], ['autoConcurrency', '自动任务并发'], ['moneyDay', '全局金额 / 滚动日'], ['autoMoneyDay', '自动金额 / 滚动日'], ['plannerHour', '导演分析 / 滚动小时'], ['plannerDay', '导演分析 / 滚动日'], ['plannerTokensDay', '导演 Token / 滚动日']]) field(doc, budget, label, limits[key], text => limits[key] = Number(text), { type: 'number' });
        field(doc, budget, '币种', limits.currency, text => limits.currency = text);
        node(doc, budget, 'p', '自动生成默认关闭；自动云金额初始为 0。取消任务不代表供应商退款。');
        button(doc, budget, '保存预算', run(async () => { await request('/visual/budget', { method: 'PUT', body: { value: limits, expectedRevision: data.budget.revision } }); await refresh(); }));
    };
    render(); return section;
}
