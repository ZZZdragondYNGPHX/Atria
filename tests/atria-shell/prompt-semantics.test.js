/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { mountPromptCondition, mountPromptParameters, mountPromptDerive } from '../../public/scripts/native/prompt-semantics.js';
import { mountPromptEditor, newPromptResource, resourceRef } from '../../public/scripts/native/prompt-authoring.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const button = (root, label) => [...root.querySelectorAll('button')].find(node => node.textContent === label);
const input = (root, label) => root.querySelector(`[aria-label="${label}"]`);
function root() { const node = document.createElement('div'); document.body.replaceChildren(node); return node; }
function change(node, value) { node.value = value; node.dispatchEvent(new Event('change')); }
function entry(type, extra = {}) { const resource = { ...newPromptResource(type), ...extra }; return { resource, ref: resourceRef(type, resource, { scope: 'library' }) }; }
test('nested conditions round trip and author comparisons without JSON', () => {
    const ui = root(), value = { all: [{ op: 'gte', path: 'param.count', value: 2 }, { not: { any: [{ op: 'eq', path: 'host.language', value: 'en' }] } }] };
    const read = mountPromptCondition(document, ui, value); expect(read()).toEqual(value);
    input(ui, 'Comparison value').value = '3'; expect(read().all[0].value).toBe(3);
    input(ui, 'Variable path').value = '__proto__.polluted'; expect(read).toThrow('declared variable');
});
test('typed parameters distinguish missing defaults, validate numeric values and refuse duplicate names', async () => {
    const ui = root(), read = mountPromptParameters(document, ui, { count: { type: 'number', required: true, default: 2 } });
    input(ui, 'Default value').value = ''; expect(read).toThrow('finite number'); input(ui, 'Default value').value = '4'; expect(read().count.default).toBe(4);
    input(ui, 'Use default value').checked = false; expect(read().count).not.toHaveProperty('default');
    button(ui, 'Add parameter').click(); await tick(); const names = ui.querySelectorAll('[aria-label="Parameter name"]'); names[1].value = 'count'; expect(read).toThrow('unique'); names[1].value = 'label'; expect(read().label.type).toBe('string');
});
test('derive controls use exact parent/module revisions and typed configuration without mutating originals', () => {
    const module = entry('core.prompt-module', { parameters: { count: { type: 'number', default: 1 } } });
    const parent = entry('core.prompt-program', { stages: [{ stageId: 'stage.main', moduleRefs: [module.ref] }] });
    const child = entry('core.prompt-program', { parentRef: parent.ref, derive: [{ op: 'configure', moduleId: module.ref.resourceId, config: { count: 2 } }] });
    const before = JSON.stringify([module, parent, child]); const ui = root(); const read = mountPromptDerive(document, ui, child.resource, [module, parent, child], child.ref, () => child.resource.stages);
    input(ui, 'Parameter value').value = '5'; expect(read()).toEqual({ parentRef: parent.ref, derive: [{ op: 'configure', moduleId: module.ref.resourceId, config: { count: 5 } }] }); expect(JSON.stringify([module, parent, child])).toBe(before);
    change(input(ui, 'Derive action'), 'replace'); change(input(ui, 'Exact replacement module'), JSON.stringify(module.ref, Object.keys(module.ref).sort())); expect(read().derive[0].replacementRef).toEqual(module.ref);
});
test('stage condition drafts survive module and stage tree rerenders; provenance stays read-only in Advanced', async () => {
    const module = entry('core.prompt-module'), program = entry('core.prompt-program', { provenance: [{ source: 'system', ref: 'original' }] });
    const onSave = jest.fn(), ui = mountPromptEditor({ document, parent: root(), entry: program, entries: [module], onSave, onBack() {} });
    change(input(ui, 'Condition kind'), 'compare'); input(ui, 'Variable path').value = 'host.language'; input(ui, 'Comparison value').value = 'zh';
    button(ui, 'Add stage').click(); expect(input(ui, 'Comparison value').value).toBe('zh');
    button(ui, 'Advanced editor').click(); const json = ui.querySelector('textarea'), value = JSON.parse(json.value); expect(value.stages[0].condition.value).toBe('zh');
    value.provenance = []; json.value = JSON.stringify(value); button(ui, 'Review / save revision').click(); await tick(); expect(onSave).not.toHaveBeenCalled(); expect(ui.textContent).toContain('System provenance is read-only');
});
test('unknown configure keys remain visible and cannot silently disappear', () => {
    const module = entry('core.prompt-module'), ui = root(), program = entry('core.prompt-program', { stages: [{ stageId: 'stage.main', moduleRefs: [module.ref] }], derive: [{ op: 'configure', moduleId: module.ref.resourceId, config: { unknown: 2 } }] });
    const read = mountPromptDerive(document, ui, program.resource, [module], program.ref, () => program.resource.stages);
    expect(ui.textContent).toContain('unknown'); expect(read).toThrow('Unknown parameter overrides');
});
