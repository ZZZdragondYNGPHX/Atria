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
test('Package Knowledge content is inert and read-only while the exact source remains visible', async () => {
    const ref = { scope: 'package', resourceType: 'core.knowledge', resourceId: 'kb_a', revision: 'kbv_a', packageId: 'pkg_a', packageVersionId: 'pkgv_a' };
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ref, origin: { displayName: 'Work', version: '1.2.0' }, snapshot: { knowledgeBase: { displayName: '<b>Knowledge</b>' }, entries: [{ content: '<script>unsafe()</script>', metadata: {} }] } }) });
    await mountPackageLibraryOriginal({ document, root: document.body, ref, host: {} });
    expect(document.querySelector('h2').textContent).toBe('<b>Knowledge</b>'); expect(document.querySelector('script')).toBeNull();
    expect(document.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect([...document.querySelectorAll('button')].some(item => /New revision|Delete|Rename/.test(item.textContent))).toBe(false);
    expect(document.body.textContent).toContain('pkgv_a'); expect(document.body.textContent).toContain('1.2.0');
});
