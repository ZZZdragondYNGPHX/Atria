/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountVisualGallery } from '../../public/scripts/native/visual-gallery-ui.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const page = (items = [], nextOffset = null) => ({ items, nextOffset, total: items.length, head: 'exact-head' });
const image = id => ({ imageVersionId: id, alt: id, operation: 'txt2img', createdAt: 10, width: 1, height: 1 });
afterEach(() => document.body.replaceChildren());

test('a late gallery read cannot replace the newer requested page', async () => {
    const root = document.createElement('main'); document.body.append(root);
    let release;
    const visual = jest.fn().mockResolvedValueOnce(page())
        .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
        .mockResolvedValueOnce(page([image('current')]));
    const gallery = await mountVisualGallery({ document, parent: root, sdk: { context: {}, illustrations: { visual } }, report: jest.fn() });
    const stale = gallery.refresh(); await gallery.refresh();
    release(page([image('stale')])); await stale;
    expect(root.querySelector('img').alt).toBe('current');
    gallery.dispose();
});

test('a late failure is discarded after a newer gallery read succeeds', async () => {
    const root = document.createElement('main'); document.body.append(root);
    let reject;
    const visual = jest.fn().mockResolvedValueOnce(page())
        .mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
        .mockResolvedValueOnce(page([image('current')]));
    const report = jest.fn();
    const gallery = await mountVisualGallery({ document, parent: root, sdk: { context: {}, illustrations: { visual } }, report });
    const stale = gallery.refresh(); await gallery.refresh();
    reject(new Error('old failure')); await stale;
    expect(root.querySelector('[role=alert]')).toBeNull();
    expect(root.querySelector('img').alt).toBe('current');
    expect(report).not.toHaveBeenCalled();
    gallery.dispose();
});

test('finishing pagination preserves the final page disabled state', async () => {
    const root = document.createElement('main'); document.body.append(root);
    let release;
    const visual = jest.fn().mockResolvedValueOnce(page([], 12))
        .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const gallery = await mountVisualGallery({ document, parent: root, sdk: { context: {}, illustrations: { visual } }, report: jest.fn() });
    const next = [...root.querySelectorAll('button')].find(button => button.textContent === 'Next page');
    next.click(); next.click(); expect(visual).toHaveBeenCalledTimes(2);
    expect(next.getAttribute('aria-busy')).toBe('true');
    release(page()); await flush();
    expect(next.disabled).toBe(true); expect(next.hasAttribute('aria-busy')).toBe(false);
    gallery.dispose();
});

test('a failed initial read exposes a real refresh and restores status after recovery', async () => {
    const root = document.createElement('main'); document.body.append(root);
    const visual = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(page([image('recovered')]));
    const report = jest.fn();
    const gallery = await mountVisualGallery({ document, parent: root, sdk: { context: {}, illustrations: { visual } }, report });
    expect(root.querySelector('[role=alert]').textContent).toBe('Could not load the image gallery.');
    expect(gallery.root.hasAttribute('aria-busy')).toBe(false);
    const refresh = [...root.querySelectorAll('button')].find(button => button.textContent === 'Refresh');
    refresh.click(); refresh.click(); await flush();
    expect(visual).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[role=alert]')).toBeNull();
    expect(root.querySelector('img').alt).toBe('recovered');
    expect(report).toHaveBeenCalledTimes(1);
    gallery.dispose();
});
