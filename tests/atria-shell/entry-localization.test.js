/** @jest-environment jsdom */
import { expect, jest, test } from '@jest/globals';
import { loadEntryLocalization, applyEntryLocalization } from '../../public/scripts/entry-localization.js';

test('entry reads the existing supported language and only translates annotated interface text', async () => {
    const request = jest.fn(async () => ({ ok: true, json: async () => ({ 'Sign in': '登录' }) }));
    const locale = await loadEntryLocalization({ storage: { getItem: () => 'zh-cn' }, fetch: request });
    document.body.innerHTML = '<button data-entry-text="Sign in">Sign in</button><section data-entry-label="Sign in"></section><input name="handle" value="Sign in"><p>Sign in</p>';
    applyEntryLocalization(document, locale);
    expect(document.documentElement.lang).toBe('zh-cn');
    expect(document.querySelector('button').textContent).toBe('登录');
    expect(document.querySelector('section').getAttribute('aria-label')).toBe('登录');
    expect(document.querySelector('input').value).toBe('Sign in'); expect(document.querySelector('p').textContent).toBe('Sign in');
    expect(request).toHaveBeenCalledWith('/locales/zh-cn.json');
});

test('unsupported language and inaccessible storage use English without fetching a catalog', async () => {
    const request = jest.fn();
    for (const storage of [{ getItem: () => 'fr-fr' }, { getItem: () => { throw new Error('Storage blocked'); } }]) {
        const locale = await loadEntryLocalization({ storage, fetch: request });
        expect(locale.locale).toBe('en'); expect(locale.translate('Sign in')).toBe('Sign in');
    }
    expect(request).not.toHaveBeenCalled();
});
