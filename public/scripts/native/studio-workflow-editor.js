import { WORKFLOW_NODE_KINDS } from '../../shared/native-lifecycle-contract.js';
import { TASK_RESULT_STATUSES } from '../../shared/native-task-contract.js';
import { translateShellText as t, formatShellText as f } from '../atria-shell/localization.js';

const nextId = (items, prefix) => {
    const ids = new Set(items.map(item => item.id)); let index = 1;
    while (ids.has(prefix + index)) index++;
    return prefix + index;
};

export function workflowFieldOptions(path, draft) {
    const match = /^lifecycleRuntime\.workflows\.(\d+)\.(.*)$/.exec(path);
    if (!match) return undefined;
    const flow = draft.lifecycleRuntime?.workflows?.[Number(match[1])], field = match[2];
    if (field === 'scopeId') return Array.isArray(draft.lifecycleRuntime.scopes) ? draft.lifecycleRuntime.scopes.filter(Boolean).map(scope => scope.id) : undefined;
    if (field === 'initial' || /^transitions\.\d+\.(from|to)$/.test(field)) return Array.isArray(flow?.nodes) ? flow.nodes.filter(Boolean).map(node => node.id) : undefined;
    if (/^nodes\.\d+\.kind$/.test(field)) return WORKFLOW_NODE_KINDS;
    if (/^transitions\.\d+\.taskStatus$/.test(field)) return TASK_RESULT_STATUSES;
    if (/^nodes\.\d+\.wait\.clockId$/.test(field)) return Array.isArray(draft.lifecycleRuntime.clocks) ? draft.lifecycleRuntime.clocks.filter(Boolean).map(clock => clock.id) : undefined;
    return undefined;
}

// These controls edit the same Runtime draft. Nothing is sent until Review.
export function renderWorkflowStructure({ document: doc, parent, draft, rerender }) {
    const node = (tag, text, owner = parent) => {
        const element = doc.createElement(tag); element.textContent = t(text); owner.append(element); return element;
    };
    const button = (label, owner, action, focusLabel = label) => {
        const element = node('button', label, owner); element.type = 'button';
        element.addEventListener('click', () => {
            action(); rerender();
            const target = [...parent.querySelectorAll('button')].find(item => item.textContent === t(focusLabel));
            for (let owner = target?.parentElement; owner && owner !== parent; owner = owner.parentElement) if (owner.tagName === 'DETAILS') owner.open = true;
            target?.focus();
        });
        return element;
    };
    const life = draft.lifecycleRuntime;
    if (life !== undefined && (!life || !Array.isArray(life.scopes) || !Array.isArray(life.clocks)
        || !Array.isArray(life.workflows) || life.workflows.some(flow => !flow || !Array.isArray(flow.nodes) || !Array.isArray(flow.transitions)
            || flow.nodes.some(stage => !stage || typeof stage !== 'object') || flow.transitions.some(edge => !edge || typeof edge !== 'object')))) {
        node('p', 'Use Source to repair the Lifecycle structure before adding a Workflow.'); return;
    }
    const structure = node('section', ''); structure.className = 'atria-studio-workflows';
    node('h4', 'Story structure', structure);
    node('p', 'Admission, waits and choices stay in the existing Lifecycle. Conditions and actions use declared facts; Review checks the complete contract.', structure);
    const actions = node('div', '', structure); actions.className = 'atria-studio-actions';
    button('Refresh draft structure', actions, () => {});
    const add = button('Add Workflow', actions, () => {
        draft.lifecycleRuntime ||= { schemaVersion: 1, scopes: [{ id: 'session', kind: 'session' }], clocks: [], advances: [],
            domains: [], interactions: [], automations: [], workflows: [], retention: { maxTaskResults: 32, maxReceipts: 64 } };
        draft.capabilities ||= [];
        if (!draft.capabilities.some(item => item.id === 'workflow')) draft.capabilities.push({ id: 'workflow', version: 1, required: true });
        const runtime = draft.lifecycleRuntime;
        runtime.workflows.push({ id: nextId(runtime.workflows, 'story-'), scopeId: runtime.scopes[0].id, initial: 'entry',
            nodes: [{ id: 'entry', kind: 'user_gate' }, { id: 'end', kind: 'terminal' }],
            transitions: [{ id: 'finish', from: 'entry', to: 'end' }] });
    });
    add.disabled = Boolean(life && (!life.scopes.length || life.workflows.length >= 32));
    for (const flow of life?.workflows ?? []) {
        const section = node('details', '', structure);
        node('summary', flow.id, section);
        node('h5', flow.id, section);
        node('p', f('Initial: ${0} | Scope: ${1}', [flow.initial, flow.scopeId]), section);
        const list = node('ol', '', section);
        for (const stage of flow.nodes) {
            const item = node('li', stage.id + ' [' + stage.kind + ']', list);
            if (stage.wait) node('span', ' | ' + stage.wait.clockId + ': ' + (stage.wait.ticks ?? stage.wait.tick), item);
            for (const edge of flow.transitions.filter(edge => edge.from === stage.id)) {
                node('p', edge.id + ': ' + edge.from + ' -> ' + edge.to
                    + (edge.interrupt ? ' | interrupt' : '') + (edge.automatic ? ' | automatic' : '')
                    + (edge.taskStatus ? ' | ' + edge.taskStatus : '')
                    + (edge.when === undefined ? '' : ' | ' + JSON.stringify(edge.when)), item);
            }
        }
        const controls = node('div', '', section); controls.className = 'atria-studio-actions';
        button(f('Add Stage: ${0}', [flow.id]), controls, () => { flow.nodes.push({ id: nextId(flow.nodes, 'stage-'), kind: 'user_gate' }); }).disabled = flow.nodes.length >= 64;
        const connect = button(f('Add Transition: ${0}', [flow.id]), controls, () => {
            const from = flow.nodes.find(stage => stage.kind !== 'terminal');
            flow.transitions.push({ id: nextId(flow.transitions, 'transition-'), from: from.id, to: flow.nodes.find(stage => stage.id !== from.id)?.id ?? from.id });
        });
        connect.disabled = flow.transitions.length >= 128 || !flow.nodes.some(stage => stage.kind !== 'terminal');
    }
}
