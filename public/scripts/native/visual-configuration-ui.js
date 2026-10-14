import { runtimeRequest } from './runtime-client.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button } from './illustration-ui.js';

export function mountVisualConfiguration({ document: doc, parent, connections, data, refresh, request = runtimeRequest, report }) {
    const section = node(doc, parent, 'details'); node(doc, section, 'summary', '图片目标、画风与预算');
    let target = structuredClone(data.targets?.[0] ?? null);
    let selectedRendering = structuredClone(data.renderings?.[0] ?? null);
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
        const file = node(doc, advanced, 'input'); file.type = 'file'; file.accept = 'application/json,.json'; file.setAttribute('aria-label', '导入 ComfyUI API 工作流 JSON');
        const bindingEditor = node(doc, advanced, 'div');
        let workflowInput;
        const setWorkflow = current => { workflow = JSON.stringify(current, null, 2); if (workflowInput) workflowInput.value = workflow; };
        const drawBindings = () => {
            bindingEditor.replaceChildren();
            let current; try { current = JSON.parse(workflow); } catch { node(doc, bindingEditor, 'p', '工作流 JSON 无法解析'); return; }
            if (!current) { node(doc, bindingEditor, 'p', '导入 API 工作流后可逐项绑定语义插槽。'); return; }
            const graph = current.graph ?? {}, nodes = Object.entries(graph).filter(([, item]) => item && typeof item === 'object' && item.inputs && typeof item.inputs === 'object');
            node(doc, bindingEditor, 'p', '映射工作流输入。节点类型以服务端探测为准；保存后再检查实际能力。');
            field(doc, bindingEditor, '工作流标识', current.id ?? '', text => { current.id = text; setWorkflow(current); });
            for (const binding of current.bindings ?? []) {
                const row = node(doc, bindingEditor, 'fieldset');
                select(doc, row, '语义', binding.semantic, ['prompt', 'negativePrompt', 'seed', 'width', 'height', 'base', 'mask', 'identity', 'outfit', 'style', 'structure', 'vibe'].map(item => [item, item]), text => { binding.semantic = text; setWorkflow(current); });
                select(doc, row, '节点', binding.nodeId, nodes.map(([id, item]) => [id, id + ' · ' + (item.class_type ?? 'node')]), text => { binding.nodeId = text; binding.input = Object.keys(graph[text]?.inputs ?? {})[0] ?? ''; setWorkflow(current); drawBindings(); });
                select(doc, row, '输入', binding.input, Object.keys(graph[binding.nodeId]?.inputs ?? {}).map(key => [key, key]), text => { binding.input = text; setWorkflow(current); });
                select(doc, row, '类型', binding.type, [['string', '文本'], ['number', '数字'], ['image', '图片']], text => { binding.type = text; setWorkflow(current); });
                button(doc, row, '移除绑定', () => { current.bindings = current.bindings.filter(item => item !== binding); setWorkflow(current); drawBindings(); });
            }
            button(doc, bindingEditor, '添加输入绑定', () => {
                const nodeId = nodes[0]?.[0]; if (!nodeId) throw new Error('工作流缺少可绑定的输入节点');
                current.bindings.push({ nodeId, input: Object.keys(graph[nodeId].inputs)[0], semantic: 'prompt', type: 'string' });
                setWorkflow(current); drawBindings();
            });
            const outputChoices = nodes.map(([id, item]) => [id, id + ' · ' + (item.class_type ?? 'node')]);
            select(doc, bindingEditor, '输出节点', current.outputNodes?.[0] ?? '', [['', '选择输出节点'], ...outputChoices], id => { current.outputNodes = id ? [id] : []; setWorkflow(current); });
        };
        file.addEventListener('change', run(async () => {
            const selected = file.files?.[0]; if (!selected) return;
            if (selected.size > 2 * 1024 * 1024) throw new Error('工作流文件超过 2 MiB');
            const parsed = JSON.parse(await selected.text()), graph = parsed.prompt ?? parsed;
            if (!graph || Array.isArray(graph) || typeof graph !== 'object' || !Object.values(graph).some(item => item?.inputs && item?.class_type)) throw new Error('请选择 ComfyUI 的 API 格式工作流 JSON');
            setWorkflow({ id: selected.name.replace(/\.json$/i, '').slice(0, 256), graph, bindings: [], outputNodes: [], nodeTypes: {} });
            drawBindings();
        }));
        const rawWorkflow = node(doc, advanced, 'details'); node(doc, rawWorkflow, 'summary', '高级：工作流与类型绑定 JSON');
        workflowInput = field(doc, rawWorkflow, 'API 工作流 JSON', workflow, text => { workflow = text; drawBindings(); }, { multiline: true });
        drawBindings();
        button(doc, editor, '保存图片目标', run(async () => {
            const parsedWorkflow = JSON.parse(workflow);
            if (parsedWorkflow && (!parsedWorkflow.outputNodes?.length || parsedWorkflow.bindings?.some(binding => !parsedWorkflow.graph?.[binding.nodeId]?.inputs || !Object.hasOwn(parsedWorkflow.graph[binding.nodeId].inputs, binding.input)))) throw new Error('请映射有效输入并选择输出节点');
            await request('/visual/resources', { method: 'PUT', body: { resourceType: 'core.image-target', expectedRevision: previousRevision,
                value: { ...value, revision: newId('r'), nativeParameters: JSON.parse(native), workflow: parsedWorkflow, capabilities: null } } });
            await refresh();
        }));
        const rendering = node(doc, editor, 'fieldset'); node(doc, rendering, 'legend', '画风配置');
        select(doc, rendering, '编辑画风', selectedRendering?.imageRenderingId ?? '', [['', '新增画风'], ...(data.renderings ?? []).map(item => [item.imageRenderingId, item.displayName])], id => { selectedRendering = structuredClone(data.renderings.find(item => item.imageRenderingId === id) ?? null); render(); });
        const renderingRevision = selectedRendering?.revision ?? null;
        const renderingValue = selectedRendering ?? { schemaVersion: 2, imageRenderingId: newId('imgrender'), revision: newId('r'), displayName: '', style: '', quality: '', negativePrompt: '', defaultTargetId: null, constraints: [] };
        field(doc, rendering, '画风名称', renderingValue.displayName, text => renderingValue.displayName = text);
        field(doc, rendering, '画风描述', renderingValue.style, text => renderingValue.style = text, { multiline: true });
        field(doc, rendering, '质量偏好', renderingValue.quality, text => renderingValue.quality = text);
        field(doc, rendering, '负面提示词', renderingValue.negativePrompt, text => renderingValue.negativePrompt = text, { multiline: true });
        select(doc, rendering, '默认图片目标', renderingValue.defaultTargetId ?? '', [['', '无默认目标'], ...(data.targets ?? []).map(item => [item.imageTargetId, item.displayName])], id => renderingValue.defaultTargetId = id || null);
        button(doc, rendering, '保存画风配置', run(async () => {
            await request('/visual/resources', { method: 'PUT', body: { resourceType: 'core.image-rendering', expectedRevision: renderingRevision,
                value: { ...renderingValue, revision: newId('r') } } });
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
