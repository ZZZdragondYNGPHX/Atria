/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { randomUUID } from 'node:crypto';
import { mountKnowledgeBindingManager } from '../../public/scripts/native/knowledge-binding-manager.js';

globalThis.structuredClone = value => deserialize(serialize(value));
globalThis.crypto.randomUUID = randomUUID;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('binding creation requires an explicit exact revision and keeps failed review drafts', async () => {
    const base = { knowledgeBaseId: 'kb_' + 'a'.repeat(32), displayName: 'Canon' };
    const oldId = 'kbv_' + 'b'.repeat(32), newId = 'kbv_' + 'c'.repeat(32);
    const detail = { knowledgeBase: base, revisions: [oldId, newId].map(knowledgeRevisionId => ({ knowledgeRevisionId, createdAt: 1 })), bindings: [] };
    let failed = true; const writes = [];
    globalThis.fetch = jest.fn(async (url, options) => {
        if (options.method === 'PUT') { writes.push(JSON.parse(options.body)); return { ok: !failed, status: failed ? 503 : 200, json: async () => ({}) }; }
        return { ok: true, json: async () => url.endsWith('/worlds') ? [] : url.endsWith('/knowledge') ? [{ knowledgeBase: base }] : detail };
    });
    const root = document.createElement('div'); document.body.replaceChildren(root);
    mountKnowledgeBindingManager({ document, root, detail, host: {} });
    const button = name => [...root.querySelectorAll('button')].find(item => item.textContent === name);
    const field = name => root.querySelector('[aria-label="' + name + '"]');
    const change = (name, value) => { const node = field(name); node.value = value; node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input')); };
    button('Create binding').click(); await tick();
    expect(field('Exact Knowledge revision').value).toBe('');
    button('Review binding').click(); await tick(); expect(root.querySelector('[role="alert"]').textContent).toContain('Choose a revision');
    change('Exact Knowledge revision', oldId); change('Binding name', 'Navigator'); change('Binding mode', 'override');
    button('Add target rule').click(); await tick(); change('Target kind 1', 'actor'); change('Exact target identity 1', 'navigator');
    button('Review binding').click(); await tick(); button('Save binding').click(); await tick();
    expect(writes[0]).toMatchObject({ expectedIntegrity: null, binding: { source: { knowledgeRevisionId: oldId }, metadata: { displayName: 'Navigator' }, target: { kind: 'actor', id: 'navigator' }, mode: 'override' } });
    expect(button('Save binding').disabled).toBe(false);
    failed = false; button('Save binding').click(); await tick();
    expect(writes[1]).toEqual(writes[0]);
    expect(button('Create binding').closest('div').hidden).toBe(false);
    delete globalThis.fetch;
});
