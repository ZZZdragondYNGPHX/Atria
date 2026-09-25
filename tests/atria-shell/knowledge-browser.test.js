/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { mountKnowledgeEntryBrowser } from '../../public/scripts/native/knowledge-entry-browser.js';

test('large entry list paginates, searches content/triggers, filters state and preserves expansion/context', async () => {
    const entries = Array.from({ length: 101 }, (_, index) => ({ knowledgeEntryId: 'entry-' + index, content: 'Long content ' + index, metadata: { title: 'Title ' + index }, enabled: index !== 40, discovery: { keywords: ['trigger-' + index] } }));
    const root = document.createElement('div'); document.body.replaceChildren(root); const state = {};
    const toggle = jest.fn((entry, enabled) => { entry.enabled = enabled; });
    mountKnowledgeEntryBrowser({ document, root, entries, state, onToggle: toggle });
    expect(root.querySelectorAll('article')).toHaveLength(25);
    expect(root.querySelectorAll('details[open]')).toHaveLength(0);
    const search = root.querySelector('input[type=search]'); search.value = 'trigger-40'; search.dispatchEvent(new Event('input'));
    expect(root.querySelectorAll('article')).toHaveLength(1);
    const checkbox = root.querySelector('input[type=checkbox]'); expect(checkbox.checked).toBe(false);
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change')); await Promise.resolve();
    expect(toggle).toHaveBeenCalledWith(entries[40], true, 40);
    const details = root.querySelector('details'); details.open = true; details.dispatchEvent(new Event('toggle'));
    expect(details.textContent).toContain('Long content 40');
    root.replaceChildren(); mountKnowledgeEntryBrowser({ document, root, entries, state });
    expect(root.querySelector('input[type=search]').value).toBe('trigger-40');
    expect(root.querySelector('details').open).toBe(true);
    const filter = root.querySelector('[aria-label="Entry status"]'); filter.value = 'disabled'; filter.dispatchEvent(new Event('change'));
    expect(root.querySelectorAll('article')).toHaveLength(0);
});
