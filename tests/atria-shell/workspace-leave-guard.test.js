/** @jest-environment jsdom */
import { beforeEach, expect, jest, test } from '@jest/globals';
import { createAtriaNavigationAuthority } from '../../public/scripts/atria-shell/navigation-authority.js';
import { installAtriaWorkspaceLeaveGuard, observeAtriaDrafts } from '../../public/scripts/atria-shell/workspace-leave-guard.js';
import { serialize, deserialize } from 'node:v8';
import { mountLibraryRevisionEditor } from '../../public/scripts/native/library-revision-editor.js';

globalThis.structuredClone = value => deserialize(serialize(value));

beforeEach(() => { window.history.replaceState(null, '', '/'); document.body.innerHTML = '<main><form class="atri-runtime-form"><input value="Original"></form></main>'; });

test('every authority entry checks the same draft; cancel preserves values, discard permits navigation', () => {
    const navigation = createAtriaNavigationAuthority({ window, initialDomain: 'runtime' });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const guard = installAtriaWorkspaceLeaveGuard({ document, window, navigation, shell: { root: document.querySelector('main') } });
    const field = document.querySelector('input'); field.focus(); field.value = 'Draft'; field.dispatchEvent(new Event('input', { bubbles: true }));
    navigation.navigate('library'); expect(navigation.getRoute().domain).toBe('runtime'); expect(field.value).toBe('Draft');
    navigation.navigateChild({ id: 'models:model_2' }); expect(navigation.getRoute().child).toBeNull();
    confirm.mockReturnValue(true); navigation.navigate('library'); expect(navigation.getRoute().domain).toBe('library');
    guard.dispose(); navigation.dispose(); confirm.mockRestore();
});

test('unchanged values, auto-saving settings and disposed editors do not create leave warnings', () => {
    const navigation = createAtriaNavigationAuthority({ window, initialDomain: 'runtime' });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const root = document.querySelector('main'); const guard = installAtriaWorkspaceLeaveGuard({ document, window, navigation, shell: { root } });
    const field = document.querySelector('input'); field.focus(); field.value = 'Changed'; field.dispatchEvent(new Event('input', { bubbles: true }));
    field.value = 'Original'; field.dispatchEvent(new Event('input', { bubbles: true })); navigation.navigate('library'); expect(confirm).not.toHaveBeenCalled();
    field.value = 'Changed'; field.dispatchEvent(new Event('input', { bubbles: true })); root.replaceChildren(); navigation.navigate('build'); expect(confirm).not.toHaveBeenCalled();
    guard.dispose(); navigation.dispose(); confirm.mockRestore();
});

test('rejected browser Back restores the current history entry without publishing the rejected route', () => {
    const navigation = createAtriaNavigationAuthority({ window, initialDomain: 'play' }); navigation.navigate('runtime');
    const route = navigation.getRoute(), events = jest.fn(); navigation.subscribe(events);
    const go = jest.spyOn(window.history, 'go').mockImplementation(() => {});
    const remove = navigation.addRouteGuard(() => false);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { atriaNavigation: { index: 0, domain: 'play' } } }));
    expect(go).toHaveBeenCalledWith(1); expect(navigation.getRoute()).toBe(route); expect(events).not.toHaveBeenCalled();
    remove(); navigation.dispose(); go.mockRestore();
});


test('a successful write receipt clears the observation before a failed list refresh', () => {
    const navigation = createAtriaNavigationAuthority({ window, initialDomain: 'runtime' });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const guard = installAtriaWorkspaceLeaveGuard({ document, window, navigation, shell: { root: document.querySelector('main') } });
    const field = document.querySelector('input'); field.focus(); field.value = 'Saved'; field.dispatchEvent(new Event('input', { bubbles: true }));
    field.form.dispatchEvent(new CustomEvent('atria-draft-committed', { bubbles: true }));
    navigation.navigate('library'); expect(navigation.getRoute().domain).toBe('library'); expect(confirm).not.toHaveBeenCalled();
    guard.dispose(); navigation.dispose(); confirm.mockRestore();
});

test('model draft markers ignore view selections and clear only after a committed receipt', () => {
    document.body.innerHTML = '<main><section class="atri-library-revision-editor"><section data-atria-draft-dirty="false"><select><option>First</option><option>Second</option></select></section></section></main>';
    const navigation = createAtriaNavigationAuthority({ window, initialDomain: 'library' });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const guard = installAtriaWorkspaceLeaveGuard({ document, window, navigation, shell: { root: document.querySelector('main') } });
    const field = document.querySelector('select'); field.focus(); field.value = 'Second'; field.dispatchEvent(new Event('change', { bubbles: true }));
    navigation.navigate('runtime'); expect(confirm).not.toHaveBeenCalled();
    navigation.navigate('library'); field.parentElement.dataset.atriaDraftDirty = 'true';
    navigation.navigate('runtime'); expect(navigation.getRoute().domain).toBe('library'); expect(confirm).toHaveBeenCalledTimes(1);
    field.closest('.atri-library-revision-editor').dispatchEvent(new CustomEvent('atria-draft-committed', { bubbles: true }));
    navigation.navigate('runtime'); expect(navigation.getRoute().domain).toBe('runtime'); expect(confirm).toHaveBeenCalledTimes(1);
    guard.dispose(); navigation.dispose(); confirm.mockRestore();
});

test('Library successful save clears its dirty draft even if the following owner refresh fails', async () => {
    const navigation = createAtriaNavigationAuthority({ window, initialDomain: 'library' });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const root = document.querySelector('main'); root.replaceChildren();
    const guard = installAtriaWorkspaceLeaveGuard({ document, window, navigation, shell: { root } });
    const saveRevision = jest.fn().mockResolvedValue({ revisionId: 'saved-revision' });
    mountLibraryRevisionEditor({ document, root, knowledge: true,
        detail: { knowledgeBase: { knowledgeBaseId: 'kb-test', displayName: 'Test', currentRevisionId: 'base' }, selectedRevision: { metadata: {} }, entries: [{ knowledgeEntryId: 'kentry_' + 'a'.repeat(32), content: 'Original' }] },
        saveRevision, onSaved: async () => { throw new Error('Owner refresh failed'); }, onClose: () => {},
    });
    const field = root.querySelector('[aria-label="Entry content"]'); field.value = 'Changed'; field.dispatchEvent(new Event('input', { bubbles: true }));
    const click = label => [...root.querySelectorAll('button')].find(node => node.textContent === label).click();
    click('Review Changes'); click('Save Knowledge original');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(saveRevision).toHaveBeenCalledTimes(1); expect(root.textContent).toContain('Owner refresh failed');
    navigation.navigate('runtime'); expect(navigation.getRoute().domain).toBe('runtime'); expect(confirm).not.toHaveBeenCalled();
    guard.dispose(); navigation.dispose(); confirm.mockRestore();
});


test('a compact Runtime editor outside the shell uses the same guard and committed receipt', () => {
    const navigation = createAtriaNavigationAuthority({ window, initialDomain: 'runtime' });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const shell = document.querySelector('main'); const form = shell.querySelector('form');
    const portal = document.createElement('section'); portal.className = 'atri-runtime'; portal.dataset.editor = 'true'; portal.append(form); document.body.append(portal);
    const guard = installAtriaWorkspaceLeaveGuard({ document, navigation, shell: { root: shell } });
    const observer = observeAtriaDrafts({ document, root: form });
    const input = form.querySelector('input'); input.focus(); input.value = 'Portaled draft'; input.dispatchEvent(new Event('input', { bubbles: true }));
    navigation.navigate('library'); expect(navigation.getRoute().domain).toBe('runtime'); expect(input.value).toBe('Portaled draft');
    form.dispatchEvent(new CustomEvent('atria-draft-committed', { bubbles: true }));
    navigation.navigate('library'); expect(navigation.getRoute().domain).toBe('library'); expect(confirm).toHaveBeenCalledTimes(1);
    observer.dispose(); guard.dispose(); navigation.dispose(); confirm.mockRestore();
});


test('model rendering removes old fields without retaining orphaned dirty observations', () => {
    const navigation = createAtriaNavigationAuthority({ window, initialDomain: 'runtime' });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const root = document.querySelector('main'), form = root.querySelector('form'); form.dataset.atriaDraftDirty = 'true';
    const guard = installAtriaWorkspaceLeaveGuard({ document, navigation, shell: { root } });
    const input = form.querySelector('input'); input.focus(); input.value = 'Model draft'; input.dispatchEvent(new Event('input', { bubbles: true }));
    form.replaceChildren(); form.dataset.atriaDraftDirty = 'false';
    navigation.navigate('library'); expect(navigation.getRoute().domain).toBe('library'); expect(confirm).not.toHaveBeenCalled();
    guard.dispose(); navigation.dispose(); confirm.mockRestore();
});
