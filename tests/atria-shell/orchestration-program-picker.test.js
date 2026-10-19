/** @jest-environment jsdom */
import { afterEach, beforeAll, expect, jest, test } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { mountPlanEditor } from '../../public/scripts/native/orchestration/plan-workspace.js';
import { starterDocument } from '../../public/scripts/native/orchestration/plan-draft.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
beforeAll(() => { window.ResizeObserver = class { observe() {} disconnect() {} };  globalThis.structuredClone = value => JSON.parse(JSON.stringify(value)); Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: randomUUID }); });
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
test('Pins offers all original Program owners and delegates normalized fingerprinting to the original Host', async () => {
    const doc = starterDocument('Programs'), planId = 'oplan_' + 'a'.repeat(32);
    const refs = ['library', 'project', 'package'].map((scope, index) => ({ scope, resourceType: 'core.prompt-program', resourceId: 'pprog_' + String(index).repeat(32), revision: 'r1',
        ...(scope === 'project' ? { projectId: 'project-one' } : scope === 'package' ? { packageId: 'package-one', packageVersionId: 'v1' } : {}) }));
    const root = { ...doc, planId, draftVersion: 0, definitionHash: 'b'.repeat(64), currentPlanRevisionId: null, archived: false };
    const client = { getPlan: jest.fn(async () => root), listRevisions: jest.fn(async () => ({ items: [], cursor: null })), onHostChange: () => () => {},
        inspectDependency: jest.fn(async body => ({ ...body, integrity: 'c'.repeat(64) })) };
    globalThis.fetch = jest.fn(async url => ({ ok: true, json: async () => url.endsWith('/resources') ? refs.map(ref => ({ ref, resource: { displayName: ref.scope + ' Program' } })) : { routes: [] } }));
    const ui = mountPlanEditor({ document, root: document.body, client, planId, shell: { setContextContent: content => document.body.append(content) }, environment: { get: () => ({ mode: 'expanded' }) } }); await flush(); await flush();
    const pins = [...document.querySelectorAll('button')].find(node => node.textContent === 'Pins'); pins.click(); await flush(); await flush();
    const picker = document.querySelector('[data-field="pin.program"]');
    expect(picker).not.toBeNull();
    for (const ref of refs) expect([...picker.options].some(option => option.value === JSON.stringify(ref))).toBe(true);
    picker.value = JSON.stringify(refs[1]); picker.dispatchEvent(new Event('change'));
    document.querySelector('[data-field="pin.id"]').value = 'program.project';
    [...document.querySelectorAll('button')].find(node => node.textContent === 'Pin exact fingerprint').click(); await flush();
    expect(client.inspectDependency).toHaveBeenCalledWith({ pinId: 'program.project', port: 'model', resourceRef: refs[1] }, expect.any(AbortSignal));
    expect(document.body.textContent).toContain('program.project'); ui.dispose();
});
