/** @jest-environment jsdom */
import { readFileSync } from 'node:fs';
import { afterEach, expect, jest, test } from '@jest/globals';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { mountUiDocument } from '../../public/scripts/native/experience/ui/v2-runtime.js';
import { createSurfaceHost } from '../../public/scripts/native/experience/ui/surfaces.js';
import { mountAtriaPlayProduct } from '../../public/scripts/native/play-product.js';
import { resetNativeSessionLifecycleForTesting } from '../../public/scripts/native/session-lifecycle.js';

const rawFixture = () => JSON.parse(readFileSync(new URL('../native/fixtures/component-v2-opening.json', import.meta.url), 'utf8'));
const mounted = [];
function server(opening = {}) {
    let snapshot = { session: { sessionId: 'session' }, revision: { revisionId: 'r0' }, timeline: [],
        states: { atri_lifecycle: { opening: { completed: false, step: null, history: [], values: {}, variant: null, ...opening } } } };
    let revision = 0;
    const lifecycle = { getSnapshot: () => snapshot, isWritable: () => true, command: jest.fn(async action => {
        snapshot = JSON.parse(JSON.stringify(snapshot)); snapshot.revision.revisionId = 'r' + ++revision;
        if (action.kind === 'opening.progress') { const { kind: _kind, ...values } = action; snapshot.states.atri_lifecycle.opening = { ...values, completed: false }; }
        if (action.kind === 'opening.complete') {
            snapshot.states.atri_lifecycle.opening.completed = true;
            if (action.submission) snapshot.timeline.push({ role: 'user', content: action.submission.text });
        }
        return snapshot;
    }) };
    return lifecycle;
}
function mount({ lifecycle = server(), raw = rawFixture(), ...options } = {}) {
    const root = document.createElement('section'); document.body.append(root);
    const composer = { setDraft: jest.fn(), appendDraft: jest.fn(), clearDraft: jest.fn(), submit: jest.fn(), submitCommitted: jest.fn(async () => 'generated') };
    const worldSession = { getState: () => ({}), getRevisionId: () => lifecycle.getSnapshot().revision.revisionId, dispatchAction: jest.fn() };
    const writes = jest.fn();
    const runtime = mountUiDocument(compileUiDocument(raw, { mode: 'component' }), { document, window,
        environmentRoot: root, surfaceHost: createSurfaceHost({ resolveSurface: () => root }), data: { items: [] },
        lifecycle, composer, worldSession, stateStorage: { write: writes }, ...options });
    mounted.push(runtime); return { runtime, root, composer, lifecycle, worldSession, writes };
}
const visible = (root, id) => !root.querySelector('#atri-ui-' + id).closest('[data-atria-game-mount]').hidden;
afterEach(() => { mounted.splice(0).forEach(item => item.dispose()); resetNativeSessionLifecycleForTesting(); document.body.replaceChildren(); delete globalThis.Atria; jest.useRealTimers(); });

test('Opening resumes saved step/history/variant and both mount/session setup values', async () => {
    const lifecycle = server({ step: 'review', history: ['setup'], values: { name: 'Saved', path: 'scholar' }, variant: 'chosen' });
    const f = mount({ lifecycle });
    expect(f.runtime.state.snapshot().ui).toEqual({ name: 'Saved', path: 'scholar' });
    expect(visible(f.root, 'review_form')).toBe(true); expect(visible(f.root, 'setup_form')).toBe(false);
    await f.runtime.execute('back');
    expect(visible(f.root, 'setup_form')).toBe(true);
    expect(lifecycle.command).toHaveBeenLastCalledWith({ kind: 'opening.progress', step: 'setup', history: [], values: { name: 'Saved', path: 'scholar' }, variant: 'chosen' });
    expect(f.writes).not.toHaveBeenCalled();
});

test('local draft autosaves flat setup fields; player preferences keep their own authority', async () => {
    jest.useFakeTimers(); const f = mount();
    f.runtime.state.set('ui.name', 'Draft'); f.runtime.state.set('ui.path', 'scholar'); f.runtime.state.set('prefs.compact', true);
    await jest.advanceTimersByTimeAsync(151);
    expect(f.lifecycle.getSnapshot().states.atri_lifecycle.opening.values).toEqual({ name: 'Draft', path: 'scholar' });
    expect(f.writes).toHaveBeenCalledWith('prefs', 'compact', 'player', true);
    expect(f.writes).toHaveBeenCalledTimes(1);
    f.runtime.dispose(); const next = mount({ lifecycle: f.lifecycle });
    expect(next.runtime.state.snapshot().ui).toEqual({ name: 'Draft', path: 'scholar' });
});

test('completed Opening remount hides all wizard views and never submits again', () => {
    const f = mount({ lifecycle: server({ completed: true, step: 'review', values: { name: 'Done' } }) });
    expect(visible(f.root, 'setup_form')).toBe(false); expect(visible(f.root, 'review_form')).toBe(false);
    expect(f.lifecycle.command).not.toHaveBeenCalled(); expect(f.composer.submitCommitted).not.toHaveBeenCalled();
});

test('conditional next/back validation stays intact and failed progress does not navigate', async () => {
    const f = mount(); await expect(f.runtime.execute('next')).rejects.toThrow('highlighted');
    f.runtime.state.set('ui.name', 'Aster'); f.lifecycle.command.mockRejectedValueOnce(new Error('offline'));
    await expect(f.runtime.execute('next')).rejects.toThrow('offline'); expect(visible(f.root, 'setup_form')).toBe(true);
    await f.runtime.execute('next'); expect(visible(f.root, 'review_form')).toBe(true);
    await f.runtime.execute('back'); expect(visible(f.root, 'setup_form')).toBe(true);
    expect(f.runtime.state.snapshot().ui.name).toBe('Aster');
});

test('World confirm and Composer submission share one complete; frontend never dispatches or appends twice', async () => {
    const raw = rawFixture(); raw.actions.start.steps.unshift({ op: 'command.dispatch', commandId: 'choose', args: { name: { expr: 'ui.name' } } });
    const f = mount({ raw }); f.runtime.state.set('ui.name', 'Aster'); await f.runtime.execute('next');
    await Promise.all([f.runtime.execute('begin'), f.runtime.execute('begin')]);
    expect(f.lifecycle.command.mock.calls.filter(([action]) => action.kind === 'opening.complete')).toEqual([[{
        kind: 'opening.complete', preferences: { compact: false }, confirmation: { commandId: 'choose', args: { name: 'Aster' } }, submission: { text: 'Name: Aster; Path: explorer' },
    }]]);
    expect(f.worldSession.dispatchAction).not.toHaveBeenCalled(); expect(f.composer.submit).not.toHaveBeenCalled();
    expect(f.composer.submitCommitted).toHaveBeenCalledTimes(1); expect(f.lifecycle.getSnapshot().timeline).toHaveLength(1);
    f.runtime.dispose(); const remount = mount({ lifecycle: f.lifecycle, raw });
    expect(remount.composer.submitCommitted).not.toHaveBeenCalled(); expect(visible(remount.root, 'review_form')).toBe(false);
});

test('uncertain completion retains args and resumes without a progress write or repeated authority', async () => {
    const f = mount(); f.runtime.state.set('ui.name', 'Original'); await f.runtime.execute('next');
    const command = f.lifecycle.command.getMockImplementation();
    f.lifecycle.command.mockImplementation(async action => {
        if (action.kind === 'opening.complete') { f.lifecycle.command.mockImplementation(command); throw new Error('lost'); }
        return command(action);
    });
    await expect(f.runtime.execute('begin')).rejects.toThrow('lost');
    const before = f.lifecycle.command.mock.calls.length; f.runtime.state.set('ui.name', 'Edited');
    await f.runtime.execute('begin');
    expect(f.lifecycle.command.mock.calls.slice(before)).toEqual([[{ kind: 'opening.complete', preferences: { compact: false }, submission: { text: 'Name: Original; Path: explorer' } }]]);
    expect(f.composer.submitCommitted).toHaveBeenCalledTimes(1);
});

test('postcommit generation failure may retry UI continuation but never resubmit Opening authority', async () => {
    const f = mount(); f.runtime.state.set('ui.name', 'Aster'); await f.runtime.execute('next');
    f.composer.submitCommitted.mockRejectedValueOnce(new Error('provider failed'));
    await expect(f.runtime.execute('begin')).rejects.toThrow('provider failed'); await f.runtime.execute('begin');
    expect(f.lifecycle.command.mock.calls.filter(([action]) => action.kind === 'opening.complete')).toHaveLength(1);
    expect(f.lifecycle.getSnapshot().timeline).toHaveLength(1); expect(f.composer.submit).not.toHaveBeenCalled();
});

test('cancelled confirmation, historical view and disposal publish no completion or delayed progress', async () => {
    jest.useFakeTimers(); const raw = rawFixture(); raw.actions.start.constraints = [{ when: 'true', status: 'confirm_required', reasonCode: 'start', playerMessage: 'Begin?' }];
    const f = mount({ raw, confirm: async () => false }); f.runtime.state.set('ui.name', 'Aster'); await f.runtime.execute('next');
    await f.runtime.execute('begin'); expect(f.lifecycle.command.mock.calls.some(([action]) => action.kind === 'opening.complete')).toBe(false);
    f.lifecycle.isWritable = () => false; await expect(f.runtime.execute('back')).rejects.toThrow('writable');
    const calls = f.lifecycle.command.mock.calls.length; f.runtime.dispose(); await jest.advanceTimersByTimeAsync(1000);
    expect(f.lifecycle.command).toHaveBeenCalledTimes(calls); expect(f.lifecycle.getSnapshot().states.atri_lifecycle.opening.step).toBe('review');
});

test('Host continues committed user input with an empty legacy textarea, and rejects stale/historical snapshots', async () => {
    document.body.innerHTML = '<div id="host"><div id="chat"></div><form id="send_form"><textarea id="send_textarea"></textarea></form></div>';
    const snapshot = { session: { sessionId: 's' }, revision: { revisionId: 'r' }, timeline: [{ role: 'user', content: 'already saved' }], manifest: {} };
    const runtime = { active: true, snapshot };
    const generate = jest.fn(async () => { expect(document.getElementById('send_textarea').value).toBe(''); return 'ok'; });
    globalThis.Atria = { nativeSessionRuntime: runtime, getContext: () => ({ generate }) };
    const product = mountAtriaPlayProduct({ document, root: document.getElementById('host'), native: {
        sendForm: document.getElementById('send_form'), sendTextarea: document.getElementById('send_textarea'),
    } }); mounted.push(product);
    product.composerApi.setDraft('already saved'); await product.composerApi.submitCommitted(snapshot);
    expect(generate).toHaveBeenCalledWith('normal'); expect(snapshot.timeline).toHaveLength(1);
    runtime.history = true; await expect(product.composerApi.submitCommitted(snapshot)).rejects.toThrow('no longer current');
    runtime.history = false; await expect(product.composerApi.submitCommitted({ ...snapshot, revision: { revisionId: 'old' } })).rejects.toThrow('no longer current');
});
