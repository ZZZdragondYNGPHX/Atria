/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { mountEmbeddedKnowledgePromotion } from '../../public/scripts/native/embedded-knowledge-promotion.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('promotion previews source and destination before writing, preserving drafts and stable retry identity', async () => {
    const binding = { knowledgeBindingId: 'binding', source: { kind: 'session', knowledgeBaseId: 'base', knowledgeRevisionId: 'exact' } };
    const snapshot = { knowledgeBase: { knowledgeBaseId: 'base', displayName: 'Harbor canon' }, revision: { knowledgeRevisionId: 'exact' }, entries: [{ content: 'The harbor closes at dusk.', metadata: { title: 'Curfew' } }] };
    const detail = { snapshot: { session: { sessionId: 'session', displayTitle: 'Harbor voyage' }, revision: { revisionId: 'committed' }, knowledge: { snapshots: [{ kind: 'session', snapshot }] } } };
    const writes = []; let failed = true;
    globalThis.fetch = jest.fn(async (_url, options) => {
        if (options.method === 'GET') return { ok: false, status: 404, json: async () => ({}) };
        writes.push(JSON.parse(options.body)); return { ok: !failed, status: failed ? 503 : 200, json: async () => ({ knowledgeBase: { knowledgeBaseId: 'base', displayName: 'My canon' } }) };
    });
    const root = document.createElement('div'); document.body.replaceChildren(root); const host = { openLibraryKnowledge: jest.fn() };
    mountEmbeddedKnowledgePromotion({ document, root, detail, binding, host });
    const button = title => [...root.querySelectorAll('button')].find(item => item.textContent === title);
    expect(root.querySelector('h4').textContent).toBe('Harbor canon'); expect(root.textContent).toContain('Harbor voyage'); expect(root.textContent).toContain('The harbor closes at dusk.');
    button('Save to my Library').click(); await tick();
    const name = root.querySelector('[aria-label="Knowledge Base name"]'); name.value = 'My canon';
    expect(writes).toHaveLength(0); button('Review promotion').click(); await tick(); expect(writes).toHaveLength(0);
    button('Confirm save to Library').click(); await tick(); expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(writes[0]).toMatchObject({ revisionId: 'committed', knowledgeBindingId: 'binding', displayName: 'My canon', expectedLibraryRevisionId: null });
    failed = false; button('Confirm save to Library').click(); await tick(); expect(writes[1]).toEqual(writes[0]);
    expect(root.textContent).toContain('Saved to Library'); button('Open in Library').click(); expect(host.openLibraryKnowledge).toHaveBeenCalledWith('base', 'My canon');
    delete globalThis.fetch;
});
