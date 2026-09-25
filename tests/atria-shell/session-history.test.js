/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
import { buildSessionHistoryModel, mountSessionHistory } from '../../public/scripts/native/session-history.js';
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('readable ordinals follow exact parents despite equal timestamps and detect broken ancestry', () => {
    const history = { branches: [{ branchId: 'b', createdAt: 1, parentBranchId: null }], revisions: [{ revisionId: 'a', parentRevisionId: 'z', branchId: 'b', createdAt: 1 }, { revisionId: 'z', parentRevisionId: null, branchId: 'b', createdAt: 1 }] };
    expect(buildSessionHistoryModel(history).ordered.map(item => item.revisionId)).toEqual(['z', 'a']);
    expect(() => buildSessionHistoryModel({ ...history, revisions: [{ ...history.revisions[0], parentRevisionId: 'missing' }] })).toThrow('unavailable');
    expect(() => buildSessionHistoryModel({ ...history, revisions: [{ ...history.revisions[0], parentRevisionId: 'a' }] })).toThrow('cycle');
});
test('history renders bounded readable rows with more, exact read-only inspection and details', async () => {
    const history = { activeBranchId: 'b', headRevisionId: 'r75', branches: [{ branchId: 'b', createdAt: 1, parentBranchId: null, headRevisionId: 'r75' }], revisions: Array.from({ length: 75 }, (_, i) => ({ revisionId: 'r' + (i + 1), parentRevisionId: i ? 'r' + i : null, branchId: 'b', createdAt: i + 1 })) };
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => history }); const inspect = jest.fn();
    const section = mountSessionHistory({ document, root: document.body, sessionId: 'session_a', onInspect: inspect }); section.open = true; section.dispatchEvent(new Event('toggle')); await tick();
    expect(section.querySelectorAll('[data-atria-history-revision]')).toHaveLength(50); expect(section.textContent).toContain('Main branch'); expect(section.textContent).toContain('Previous revision: Revision 74');
    section.querySelector('[data-atria-history-revision] button').click(); await tick(); expect(inspect).toHaveBeenCalledWith('r75');
    [...section.querySelectorAll('button')].find(item => item.textContent === 'Show earlier revisions').click(); await tick(); expect(section.querySelectorAll('[data-atria-history-revision]')).toHaveLength(75);
    expect([...section.querySelectorAll('pre')].every(item => item.parentElement.tagName === 'DETAILS')).toBe(true);
});
