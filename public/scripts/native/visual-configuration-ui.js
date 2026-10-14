import { translateShellText } from '../atria-shell/localization.js';
import { runtimeRequest } from './runtime-client.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button } from './illustration-ui.js';

export function mountVisualConfiguration({ document: doc, parent, connections, data, refresh, request = runtimeRequest, report }) {
    const section = node(doc, parent, 'details'); node(doc, section, 'summary', translateShellText('Image targets, styles and budget'));
    let target = structuredClone(data.targets?.[0] ?? null);
    let selectedRendering = structuredClone(data.renderings?.[0] ?? null);
    const editor = node(doc, section, 'div');
    const newId = prefix => prefix + '_' + doc.defaultView.crypto.randomUUID().replaceAll('-', '');
    const run = action => async () => { try { await action(); } catch (error) { report(error); } };
    const render = () => {
        editor.replaceChildren();
        select(doc, editor, translateShellText('Edit image target'), target?.imageTargetId ?? '', [['', translateShellText('Add target')], ...(data.targets ?? []).map(item => [item.imageTargetId, item.displayName])], id => { target = structuredClone(data.targets.find(item => item.imageTargetId === id) ?? null); render(); });
        const previousRevision = target?.revision ?? null;
        const value = target ?? { schemaVersion: 2, imageTargetId: newId('imgtarget'), revision: newId('r'), displayName: '', connectionProfileId: '',
            model: 'nai-diffusion-5-full', serviceVersion: '', nativeParameters: {}, workflow: null, capabilities: null };
        field(doc, editor, translateShellText('Target name'), value.displayName, text => value.displayName = text);
        select(doc, editor, translateShellText('Service connection'), value.connectionProfileId, [['', translateShellText('Choose a Runtime connection')], ...connections.filter(c => /image|comfy|webui|forge|runninghub/.test(c.providerAdapter)).map(c => [c.connectionProfileId, c.displayName])], id => value.connectionProfileId = id);
        field(doc, editor, translateShellText('Model ID or workflow target'), value.model, text => value.model = text);
        field(doc, editor, translateShellText('Service or node version'), value.serviceVersion, text => value.serviceVersion = text);
        const advanced = node(doc, editor, 'details'); node(doc, advanced, 'summary', translateShellText('Provider parameters and workflow'));
        let native = JSON.stringify(value.nativeParameters, null, 2), workflow = JSON.stringify(value.workflow, null, 2);
        field(doc, advanced, translateShellText('Provider parameters JSON'), native, text => native = text, { multiline: true });
        const file = node(doc, advanced, 'input'); file.type = 'file'; file.accept = 'application/json,.json'; file.setAttribute('aria-label', tl('Import ComfyUI API workflow JSON'));
        const bindingEditor = node(doc, advanced, 'div');
        let workflowInput;
        const setWorkflow = current => { workflow = JSON.stringify(current, null, 2); if (workflowInput) workflowInput.value = workflow; };
        const drawBindings = () => {
            bindingEditor.replaceChildren();
            let current; try { current = JSON.parse(workflow); } catch { node(doc, bindingEditor, 'p', translateShellText('Could not parse workflow JSON.')); return; }
            if (!current) { node(doc, bindingEditor, 'p', translateShellText('Import an API workflow to map its semantic inputs.')); return; }
            const graph = current.graph ?? {}, nodes = Object.entries(graph).filter(([, item]) => item && typeof item === 'object' && item.inputs && typeof item.inputs === 'object');
            node(doc, bindingEditor, 'p', translateShellText('Map workflow inputs. Node types come from the server. Save, then check the actual capabilities.'));
            field(doc, bindingEditor, translateShellText('Workflow ID'), current.id ?? '', text => { current.id = text; setWorkflow(current); });
            for (const binding of current.bindings ?? []) {
                const row = node(doc, bindingEditor, 'fieldset');
                select(doc, row, translateShellText('Purpose'), binding.semantic, ['prompt', 'negativePrompt', 'seed', 'width', 'height', 'base', 'mask', 'identity', 'outfit', 'style', 'structure', 'vibe'].map(item => [item, item]), text => { binding.semantic = text; setWorkflow(current); });
                select(doc, row, translateShellText('Node'), binding.nodeId, nodes.map(([id, item]) => [id, id + ' · ' + (item.class_type ?? 'node')]), text => { binding.nodeId = text; binding.input = Object.keys(graph[text]?.inputs ?? {})[0] ?? ''; setWorkflow(current); drawBindings(); });
                select(doc, row, translateShellText('Input'), binding.input, Object.keys(graph[binding.nodeId]?.inputs ?? {}).map(key => [key, key]), text => { binding.input = text; setWorkflow(current); });
                select(doc, row, translateShellText('Type'), binding.type, [['string', translateShellText('Text')], ['number', translateShellText('Number')], ['image', translateShellText('Image')]], text => { binding.type = text; setWorkflow(current); });
                button(doc, row, translateShellText('Remove binding'), () => { current.bindings = current.bindings.filter(item => item !== binding); setWorkflow(current); drawBindings(); });
            }
            button(doc, bindingEditor, translateShellText('Add input binding'), () => {
                const nodeId = nodes[0]?.[0]; if (!nodeId) throw new Error(translateShellText('The workflow has no input nodes to bind.'));
                current.bindings.push({ nodeId, input: Object.keys(graph[nodeId].inputs)[0], semantic: 'prompt', type: 'string' });
                setWorkflow(current); drawBindings();
            });
            const outputChoices = nodes.map(([id, item]) => [id, id + ' · ' + (item.class_type ?? 'node')]);
            select(doc, bindingEditor, translateShellText('Output node'), current.outputNodes?.[0] ?? '', [['', translateShellText('Choose an output node')], ...outputChoices], id => { current.outputNodes = id ? [id] : []; setWorkflow(current); });
        };
        file.addEventListener('change', run(async () => {
            const selected = file.files?.[0]; if (!selected) return;
            if (selected.size > 2 * 1024 * 1024) throw new Error(translateShellText('The workflow file exceeds 2 MiB.'));
            const parsed = JSON.parse(await selected.text()), graph = parsed.prompt ?? parsed;
            if (!graph || Array.isArray(graph) || typeof graph !== 'object' || !Object.values(graph).some(item => item?.inputs && item?.class_type)) throw new Error(translateShellText('Choose a ComfyUI API workflow JSON file.'));
            setWorkflow({ id: selected.name.replace(/\.json$/i, '').slice(0, 256), graph, bindings: [], outputNodes: [], nodeTypes: {} });
            drawBindings();
        }));
        const rawWorkflow = node(doc, advanced, 'details'); node(doc, rawWorkflow, 'summary', translateShellText('Advanced workflow and type bindings JSON'));
        workflowInput = field(doc, rawWorkflow, translateShellText('API workflow JSON'), workflow, text => { workflow = text; drawBindings(); }, { multiline: true });
        drawBindings();
        button(doc, editor, translateShellText('Save image target'), run(async () => {
            const parsedWorkflow = JSON.parse(workflow);
            if (parsedWorkflow && (!parsedWorkflow.outputNodes?.length || parsedWorkflow.bindings?.some(binding => !parsedWorkflow.graph?.[binding.nodeId]?.inputs || !Object.hasOwn(parsedWorkflow.graph[binding.nodeId].inputs, binding.input)))) throw new Error(translateShellText('Map valid inputs and select an output node.'));
            await request('/visual/resources', { method: 'PUT', body: { resourceType: 'core.image-target', expectedRevision: previousRevision,
                value: { ...value, revision: newId('r'), nativeParameters: JSON.parse(native), workflow: parsedWorkflow, capabilities: null } } });
            await refresh();
        }));
        const rendering = node(doc, editor, 'fieldset'); node(doc, rendering, 'legend', translateShellText('Image style'));
        select(doc, rendering, translateShellText('Edit style'), selectedRendering?.imageRenderingId ?? '', [['', translateShellText('Add style')], ...(data.renderings ?? []).map(item => [item.imageRenderingId, item.displayName])], id => { selectedRendering = structuredClone(data.renderings.find(item => item.imageRenderingId === id) ?? null); render(); });
        const renderingRevision = selectedRendering?.revision ?? null;
        const renderingValue = selectedRendering ?? { schemaVersion: 2, imageRenderingId: newId('imgrender'), revision: newId('r'), displayName: '', style: '', quality: '', negativePrompt: '', defaultTargetId: null, constraints: [] };
        field(doc, rendering, translateShellText('Style name'), renderingValue.displayName, text => renderingValue.displayName = text);
        field(doc, rendering, translateShellText('Style description'), renderingValue.style, text => renderingValue.style = text, { multiline: true });
        field(doc, rendering, translateShellText('Quality preferences'), renderingValue.quality, text => renderingValue.quality = text);
        field(doc, rendering, translateShellText('Negative prompt'), renderingValue.negativePrompt, text => renderingValue.negativePrompt = text, { multiline: true });
        select(doc, rendering, translateShellText('Default image target'), renderingValue.defaultTargetId ?? '', [['', translateShellText('No default target')], ...(data.targets ?? []).map(item => [item.imageTargetId, item.displayName])], id => renderingValue.defaultTargetId = id || null);
        button(doc, rendering, translateShellText('Save image style'), run(async () => {
            await request('/visual/resources', { method: 'PUT', body: { resourceType: 'core.image-rendering', expectedRevision: renderingRevision,
                value: { ...renderingValue, revision: newId('r') } } });
            await refresh();
        }));
        const budget = node(doc, editor, 'fieldset'); node(doc, budget, 'legend', translateShellText('Task and cost budget'));
        const limits = structuredClone(data.budget.value);
        for (const [key, label] of [['imageHour', translateShellText('Automatic images per rolling hour')], ['imageDay', translateShellText('Automatic images per rolling day')], ['autoConcurrency', translateShellText('Concurrent automatic tasks')], ['moneyDay', translateShellText('Total cost per rolling day')], ['autoMoneyDay', translateShellText('Automatic cost per rolling day')], ['plannerHour', translateShellText('Candidate analyses per rolling hour')], ['plannerDay', translateShellText('Candidate analyses per rolling day')], ['plannerTokensDay', translateShellText('Candidate analysis tokens per rolling day')]]) field(doc, budget, label, limits[key], text => limits[key] = Number(text), { type: 'number' });
        field(doc, budget, translateShellText('Currency'), limits.currency, text => limits.currency = text);
        node(doc, budget, 'p', translateShellText('Automatic generation is off by default, with an initial cloud budget of zero. Cancelling a task does not refund provider charges.'));
        button(doc, budget, translateShellText('Save budget'), run(async () => { await request('/visual/budget', { method: 'PUT', body: { value: limits, expectedRevision: data.budget.revision } }); await refresh(); }));
    };
    render(); return section;
}
