/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
import { mountPackageLibraryList, mountPackageLibraryOriginal } from '../../public/scripts/native/package-library-resources.js';
import { normalizeLibrarySection } from '../../public/scripts/atria-shell/library-runtime-workspaces.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
test('Package discovery failure keeps its retry local and exact routes stay in Worlds and Knowledge', async () => {
    document.body.innerHTML = '<p>Library resource</p>';
    globalThis.fetch = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ ok: true, json: async () => [] });
    await mountPackageLibraryList({ document, root: document.body, knowledge: false, host: {} });
    expect(document.body.textContent).toContain('Library resource'); expect(document.body.textContent).toContain('could not be loaded');
    document.querySelector('button').click(); await tick(); expect(document.body.textContent).toContain('No installed Work resources');
    for (const id of ['world:package:encoded', 'knowledge:package:encoded']) expect(normalizeLibrarySection({ child: { id } })).toBe('worlds-knowledge');
});
test('Package Knowledge content is inert and directly editable while its current source stays visible', async () => {
    const ref = { scope: 'package', resourceType: 'core.knowledge', resourceId: 'kb_a', revision: 'kbv_a', packageId: 'pkg_a', packageVersionId: 'pkgv_a' };
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ref, packageVersionId: 'pkgv_a', origin: { displayName: 'Work', version: '1.2.0' }, snapshot: { knowledgeBase: { displayName: '<b>Knowledge</b>', knowledgeBaseId: 'kb_a', currentRevisionId: 'kbv_a' }, revision: { knowledgeRevisionId: 'kbv_a' }, entries: [{ knowledgeEntryId: 'kentry_a', content: '<script>unsafe()</script>', metadata: {} }] } }) });
    await mountPackageLibraryOriginal({ document, root: document.body, ref, host: {} });
    expect(document.querySelector('h2').textContent).toBe('<b>Knowledge</b>'); expect(document.querySelector('script')).toBeNull();
    expect(document.querySelectorAll('input[type=checkbox]')).toHaveLength(1);
    expect([...document.querySelectorAll('button')].some(item => item.textContent === 'Create editable copy')).toBe(true);
    expect([...document.querySelectorAll('button')].some(item => item.textContent === 'Edit Knowledge')).toBe(true);
    expect([...document.querySelectorAll('button')].some(item => item.textContent === 'Delete entry')).toBe(true);
    expect(document.body.textContent).toContain('pkgv_a'); expect(document.body.textContent).toContain('1.2.0');
});
