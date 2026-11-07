import { el, action } from './library-ui.js';
import { runtimeRequest } from './runtime-client.js';
import { validatePromptSelection } from './prompt-parameter-contracts.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export async function mountPromptRuntimeControls({ document: doc, root, routeId }) {
    const panel = el(doc, 'section', 'atri-prompt-runtime-controls', undefined, root);
    const status = el(doc, 'p', '', tl('Loading Prompt controls…'), panel); status.setAttribute('role', 'status');
    try {
        let { route, definitions } = await runtimeRequest('/prompt-controls/' + encodeURIComponent(routeId));
        if (!panel.isConnected) return;
        if (!Object.keys(definitions).length) { status.textContent = tl('This preset has no prompt options to adjust.'); return; }
        status.textContent = tl('These options apply to this preset in every story.');
        const content = el(doc, 'div', '', undefined, panel);
        let read;
        function draw(values) {
            content.replaceChildren();
            const readers = [];
            try { validatePromptSelection(definitions, values); } catch {
                const warning = el(doc, 'p', '', tl('Saved choices are no longer valid. Restore defaults or select valid values before saving.'), content); warning.setAttribute('role', 'alert');
            }
            for (const [name, definition] of Object.entries(definitions)) {
                const group = el(doc, 'fieldset', 'atri-prompt-runtime-control', undefined, content);
                el(doc, 'legend', '', definition.label || name, group);
                if (definition.description) el(doc, 'p', '', definition.description, group);
                const value = Object.hasOwn(values, name) ? values[name] : definition.default;
                const label = el(doc, 'label', '', definition.label || name, group);
                const input = el(doc, definition.options ? 'select' : definition.type === 'json' ? 'textarea' : 'input', '', undefined, label);
                input.setAttribute('aria-label', definition.label || name);
                input.dataset.promptParameter = name;
                if (definition.options) {
                    const empty = el(doc, 'option', '', tl('Choose…'), input); empty.value = '';
                    definition.options.forEach((option, index) => { const item = el(doc, 'option', '', option.label, input); item.value = String(index); });
                    const index = definition.options.findIndex(option => option.value === value); input.value = index < 0 ? '' : String(index);
                } else if (definition.type === 'boolean') { input.type = 'checkbox'; input.checked = value === true; label.classList.add('atri-prompt-toggle'); } else { if (definition.type === 'number') { input.type = 'number'; input.step = 'any'; } input.value = value === undefined ? '' : definition.type === 'json' ? JSON.stringify(value) : String(value); }
                // Only a value that differs from the authored default is stored.
                readers.push(() => {
                    if ((definition.options && input.value === '') || (!definition.options && definition.type !== 'boolean' && !input.value.trim())) return [];
                    const selected = definition.options ? definition.options[input.value]?.value : definition.type === 'boolean' ? input.checked
                        : definition.type === 'number' ? Number(input.value) : definition.type === 'json' ? JSON.parse(input.value) : input.value;
                    return JSON.stringify(selected) === JSON.stringify(definition.default) ? [] : [[name, selected]];
                });
                if (value === undefined) el(doc, 'small', '', tl('No authored default. Choose a value if this parameter is required.'), group);
            }
            read = () => validatePromptSelection(definitions, Object.fromEntries(readers.flatMap(reader => reader())));
        }
        draw(route.promptParameters || {});
        const actions = el(doc, 'div', 'atri-runtime-actions', undefined, panel);
        const save = async parameters => {
            content.inert = actions.inert = true;
            try {
                const next = await runtimeRequest('/prompt-controls/' + encodeURIComponent(routeId), { method: 'PUT', body: { expected: route, parameters } });
                route = next;
                status.setAttribute('role', 'status'); status.textContent = tl('Prompt choices saved.');
            } finally { content.inert = actions.inert = false; }
        };
        action(doc, actions, 'Save', async () => {
            try { await save(read()); draw(route.promptParameters || {}); } catch { status.textContent = tl('Could not save choices. Check values or reopen controls to load current settings.'); status.setAttribute('role', 'alert'); }
        });
        action(doc, actions, 'Reset to defaults', async () => {
            try { await save({}); draw({}); } catch { status.textContent = tl('Could not save choices. Check values or reopen controls to load current settings.'); status.setAttribute('role', 'alert'); }
        });
    } catch {
        status.textContent = tl('Prompt controls are unavailable. Check the route and its exact resources, then reopen.'); status.setAttribute('role', 'alert');
    }
}

export async function mountPlayPromptControls(doc, root) {
    const runtime = globalThis.Atria?.nativeSessionRuntime;
    if (runtime?.snapshot) {
        const operations = el(doc, 'fieldset', '', undefined, root);
        el(doc, 'legend', '', '生成辅助', operations);
        const operationStatus = el(doc, 'p', '', '', operations); operationStatus.setAttribute('role', 'status');
        const run = async (operation, actorId) => {
            if (operations.disabled) return;
            operations.disabled = true;
            try {
                const composer = globalThis.Atria?.shell?.getPlayHost?.()?.product?.composerApi;
                if (!composer?.assist) throw new Error('当前没有可用的故事输入框');
                await composer.assist(operation, actorId);
                operationStatus.textContent = operation === 'impersonate' ? '玩家候选已准备，请检查草稿或候选提示。' : '角色回应已生成。';
            } catch (error) { operationStatus.textContent = error.message; } finally { operations.disabled = false; }
        };
        action(doc, operations, '代写玩家草稿', () => run('impersonate'));
        if (!runtime.snapshot.manifest.runtime?.experienceContract?.taskRuntime?.turn) {
            const actor = el(doc, 'select', '', undefined, operations); actor.setAttribute('aria-label', '回应角色');
            for (const id of runtime.snapshot.entryPoint?.actorIds ?? []) {
                const definition = runtime.snapshot.manifest.actors.find(item => item.actorId === id);
                const option = el(doc, 'option', '', definition?.displayName ?? definition?.name ?? id, actor); option.value = id;
            }
            action(doc, operations, '生成指定角色回应', () => run('actor-reply', actor.value)).disabled = !actor.options.length;
        }
        let captured = runtime.snapshot;
        const group = el(doc, 'fieldset', '', undefined, root);
        el(doc, 'legend', '', '会话场景', group);
        const mode = el(doc, 'select', '', undefined, group); mode.setAttribute('aria-label', '场景来源');
        for (const [value, label] of [['inherit', '继承入口／角色场景'], ['override', '会话覆盖（留空表示清空）']]) {
            const option = el(doc, 'option', '', label, mode); option.value = value;
        }
        const scenario = el(doc, 'textarea', '', undefined, group); scenario.setAttribute('aria-label', '会话场景正文');
        const current = captured.states?.atri_prompt_context?.scenario;
        mode.value = current === undefined ? 'inherit' : 'override'; scenario.value = current ?? ''; scenario.disabled = mode.value === 'inherit';
        mode.addEventListener('change', () => { scenario.disabled = mode.value === 'inherit'; });
        const feedback = el(doc, 'p', '', '', group); feedback.setAttribute('role', 'status');
        action(doc, group, 'Save', async () => {
            try {
                if (runtime.snapshot.session.sessionId !== captured.session.sessionId) throw new Error('Session changed');
                await runtime.commitStatePatch({ atri_prompt_context: mode.value === 'inherit' ? {} : { scenario: scenario.value } }, { expectedRevisionId: captured.revision.revisionId });
                captured = runtime.snapshot;
                feedback.textContent = '已保存；下一次独立生成生效。';
            } catch { feedback.textContent = '未保存；会话已变化或当前不可编辑，请重新打开。'; }
        });
    }
    const status = el(doc, 'p', '', tl('Loading Prompt controls…'), root);
    try {
        const { routes, roleAssignments: { assignments } = {} } = await runtimeRequest('/configuration');
        if (!status.isConnected) return;
        status.textContent = tl('Adjust the prompt options of an API preset.');
        const label = el(doc, 'label', '', tl('API preset'), root);
        const select = el(doc, 'select', '', undefined, label); select.setAttribute('aria-label', tl('API preset'));
        for (const route of routes) { const option = el(doc, 'option', '', route.displayName, select); option.value = route.runtimeRouteId; }
        // Start on the preset that narrates stories today.
        const narrator = assignments?.['role.narrator'];
        if (routes.some(route => route.runtimeRouteId === narrator)) select.value = narrator;
        const content = el(doc, 'div', '', undefined, root);
        const render = () => { content.replaceChildren(); if (select.value) void mountPromptRuntimeControls({ document: doc, root: content, routeId: select.value }); };
        select.addEventListener('change', render); render();
        if (!routes.length) status.textContent = tl('Add an API preset in Runtime first.');
    } catch { status.textContent = tl('Prompt controls are unavailable. Check the route and its exact resources, then reopen.'); status.setAttribute('role', 'alert'); }
}
