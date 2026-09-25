/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
import { NativeSessionRuntime } from '../../public/scripts/native/session-runtime.js';
import { mountSessionRename } from '../../public/scripts/native/session-naming.js';
import { normalizeSessionTitle } from '../../public/scripts/native/session-title-contract.js';
globalThis.structuredClone ??= value => JSON.parse(JSON.stringify(value));
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
test('Session title normalization accepts clearing and rejects invalid display text', () => {
    expect(normalizeSessionTitle('  Voyage  ')).toBe('Voyage'); expect(normalizeSessionTitle('   ')).toBeNull();
    expect(() => normalizeSessionTitle('two\nlines')).toThrow('single line'); expect(() => normalizeSessionTitle('x'.repeat(257))).toThrow('256');
});
test('metadata refresh preserves active revision and generation state', async () => {
    const runtime = new NativeSessionRuntime(); const revision = { revisionId: 'rev_old' };
    runtime.snapshot = { session: { sessionId: 'session_a', displayTitle: 'Old', headRevisionId: 'rev_old' }, revision, states: {} }; runtime.generation = { draft: true };
    await runtime.applySessionMetadata({ sessionId: 'session_a', displayTitle: 'New', headRevisionId: 'unrelated' });
    expect(runtime.snapshot.session).toEqual({ sessionId: 'session_a', displayTitle: 'New', headRevisionId: 'rev_old' }); expect(runtime.snapshot.revision).toBe(revision); expect(runtime.generation).toEqual({ draft: true });
});
test('rename conflict retains the draft and offers explicit current-name reload', async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'native_session_title_conflict' }) }).mockResolvedValueOnce({ ok: true, json: async () => [{ sessionId: 'session_a', displayTitle: 'Other edit' }] });
    mountSessionRename({ document, root: document.body, session: { sessionId: 'session_a', displayTitle: 'Old' } });
    document.querySelector('input').value = 'My draft'; document.querySelector('button').click(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('input').value).toBe('My draft');
    document.querySelector('[data-atria-reload-session-name]').click(); await new Promise(resolve => setTimeout(resolve, 0)); expect(document.querySelector('input').value).toBe('Other edit');
});
