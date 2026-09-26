/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
import { mountSessionHistory } from '../../public/scripts/native/session-history.js';
import { createReplyVariantController } from '../../public/scripts/native/reply-variants.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const controllers = [];
afterEach(() => { controllers.splice(0).forEach(item => item.dispose()); document.body.replaceChildren(); });
const history = () => ({ sessionId: 'ses_test', activeBranchId: 'child', headRevisionId: 'r4', branches: [
    { branchId: 'main', parentBranchId: null, headRevisionId: 'r2', createdAt: 1 },
    { branchId: 'child', parentBranchId: 'main', forkRevisionId: 'r1', headRevisionId: 'r4', displayName: 'Alternative path', createdAt: 3 },
], revisions: [
    { revisionId: 'r1', branchId: 'main', parentRevisionId: null, timelineHead: { messageId: 'user' }, createdAt: 1 },
    { revisionId: 'r2', branchId: 'main', parentRevisionId: 'r1', timelineHead: { messageId: 'one', variantId: 'v1' }, createdAt: 2 },
    { revisionId: 'r3', branchId: 'child', parentRevisionId: 'r2', timelineHead: { messageId: 'user' }, createdAt: 3 },
    { revisionId: 'r4', branchId: 'child', parentRevisionId: 'r3', timelineHead: { messageId: 'two', variantId: 'v2' }, createdAt: 4 },
], messages: [
    { messageId: 'user', branchId: 'main', role: 'user', sequence: 0, preview: 'A question' },
    { messageId: 'one', branchId: 'main', role: 'assistant', sequence: 1, preview: '<img src=x onerror=alert(1)> First reply' },
    { messageId: 'two', branchId: 'child', role: 'assistant', sequence: 1, preview: 'Second reply' },
] });
const context = () => ({ sessionId: 'ses_test', revisionId: 'r4', branchId: 'child', tailMessageId: 'two', canWrite: true });
const anchor = (id = 'two') => ({ sessionId: 'ses_test', branchId: 'child', viewRevisionId: 'r4', messageId: id, variantId: id === 'two' ? 'v2' : 'v1', role: 'assistant' });
const button = (root, text) => [...root.querySelectorAll('button')].find(item => item.textContent === text);
async function expand(section) { section.open = true; section.dispatchEvent(new Event('toggle')); await tick(); }
function mount(options = {}) {
    const section = mountSessionHistory({ document, root: document.body, sessionId: 'ses_test', loadHistory: async () => history(), ...options });
    controllers.push(section.atriaHistory); return section;
}
function inline(options = {}) {
    const controller = createReplyVariantController({ document, loadHistory: async () => history(), getContext: context, ...options });
    controllers.push(controller); return controller;
}

test('graph explores logical branch timelines and read-only previews, preserving legacy inspect signature', async () => {
    const onInspect = jest.fn(), onSwitchBranch = jest.fn();
    const section = mount({ onInspect, onSwitchBranch, getContext: context }); await expand(section);
    expect(section.textContent).toContain('Branch graph'); expect(section.textContent).toContain('Current branch'); expect(section.textContent).toContain('Detached');
    button(section.querySelector('[data-atria-history-branch="child"]'), 'Explore branch').click(); await tick();
    expect([...section.querySelectorAll('[data-atria-history-revision]')].map(item => item.dataset.atriaHistoryRevision)).toEqual(['r4', 'r3', 'r1']);
    button(section.querySelector('[data-atria-history-revision="r4"]'), 'Preview revision').click(); await tick();
    const preview = section.querySelector('[data-atria-history-preview]');
    expect(preview.textContent).toContain('Reply 2 of 2'); button(preview, 'Previous reply').click(); await tick();
    expect(preview.textContent).toContain('First reply'); expect(preview.querySelector('img')).toBeNull(); expect(onSwitchBranch).not.toHaveBeenCalled();
    button(preview, 'Inspect revision').click(); await tick(); expect(onInspect).toHaveBeenCalledWith('r2');
    expect(document.activeElement.tagName).toBe('H4');
});

test('revision and branch rows stay bounded; branch search and paging retain keyboard controls', async () => {
    const data = history();
    data.revisions = Array.from({ length: 260 }, (_, i) => ({ revisionId: 'p' + i, parentRevisionId: i ? 'p' + (i - 1) : null, branchId: 'main', createdAt: i }));
    data.headRevisionId = 'p259'; data.activeBranchId = 'main'; data.branches[0].headRevisionId = 'p259';
    data.branches.push(...Array.from({ length: 60 }, (_, i) => ({ branchId: 'other' + i, parentBranchId: 'main', displayName: 'Path ' + i, createdAt: 10 + i })));
    const section = mount({ loadHistory: async () => data }); await expand(section);
    expect(section.querySelectorAll('[data-atria-history-revision]')).toHaveLength(50); expect(section.querySelectorAll('[data-atria-history-branch]')).toHaveLength(25);
    for (let i = 0; i < 5; i++) { button(section, 'Show earlier revisions').click(); await tick(); }
    expect(section.querySelectorAll('[data-atria-history-revision]')).toHaveLength(100); expect(button(section, 'Show earlier revisions').hidden).toBe(true);
    button(section, 'Show newer revisions').focus(); button(section, 'Show newer revisions').click(); await tick();
    expect(document.activeElement).toBe(button(section, 'Show newer revisions'));
    button(section, 'Next branches').click(); await tick(); button(section, 'Next branches').click(); await tick();
    expect(button(section, 'Next branches').disabled).toBe(true); expect(section.querySelectorAll('[data-atria-history-branch]')).toHaveLength(12);
    const search = section.querySelector('input[type=search]'); search.value = 'Path 59'; search.dispatchEvent(new Event('input'));
    expect(section.querySelectorAll('[data-atria-history-branch]')).toHaveLength(1); expect(button(section, 'Previous branches').disabled).toBe(true);
});

test('loading/error/retry/empty and corrupt graph states remain bounded and read-only', async () => {
    let finish; const fetchHistory = jest.fn().mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const section = mount({ loadHistory: fetchHistory }); await expand(section);
    expect(section.querySelector('[role=alert]').textContent).toContain('unchanged'); button(section, 'Try again').click(); await tick();
    expect(section.querySelector('[aria-busy=true]').textContent).toContain('Loading history');
    finish({ branches: [], revisions: [], messages: [] }); await tick();
    expect(section.textContent).toContain('No committed revisions.'); expect(section.querySelector('[aria-busy=true]')).toBeNull();
    const broken = history(); broken.revisions[0].parentRevisionId = 'r2'; fetchHistory.mockResolvedValue(broken);
    await section.atriaHistory.refresh(); expect(section.textContent).toContain('Some history links');
    expect([...section.querySelectorAll('[data-atria-history-revision] button')].every(item => item.disabled)).toBe(true);
});

test('message mounts share one lazy session fetch and wire preview, inspect, switch, retry, fork', async () => {
    const loadHistory = jest.fn(async () => history()), onPreview = jest.fn(), onInspect = jest.fn(), onSwitchBranch = jest.fn(), onRetry = jest.fn(), onFork = jest.fn();
    const controller = inline({ loadHistory, onPreview, onInspect, onSwitchBranch, onRetry, onFork });
    const first = document.createElement('article'), second = document.createElement('article'); document.body.append(first, second);
    const mounted = controller.mount(first, anchor()); controller.mount(second, anchor('one'));
    expect(loadHistory).not.toHaveBeenCalled();
    await Promise.all([expand(first.querySelector('details')), expand(second.querySelector('details'))]);
    expect(loadHistory).toHaveBeenCalledTimes(1); expect(first.textContent).toContain('Reply 2 of 2');
    button(first, 'Retry reply').click(); await tick();
    expect(onRetry).toHaveBeenCalledWith({ sessionId: 'ses_test', branchId: 'child', revisionId: 'r4', messageId: 'two' });
    expect(loadHistory).toHaveBeenCalledTimes(2);
    button(first, 'Previous reply').click(); await tick();
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ revisionId: 'r2', branchId: 'main' }));
    expect(first.querySelector('img')).toBeNull(); expect(button(first, 'Previous reply').disabled).toBe(true); expect(button(first, 'Retry reply').disabled).toBe(true);
    button(first, 'Inspect revision').click(); await tick(); expect(onInspect).toHaveBeenCalledWith(expect.objectContaining({ revisionId: 'r2' }));
    button(first, 'Switch branch').click(); await tick(); expect(onSwitchBranch).toHaveBeenCalledWith('main', expect.objectContaining({ revisionId: 'r2' }));
    button(first, 'Fork from revision').click(); await tick(); expect(onFork).toHaveBeenCalledWith(expect.objectContaining({ revisionId: 'r2' }));
    mounted.dispose(); expect(first.childElementCount).toBe(0);
});

test('non-assistants are skipped and historical/busy reply mounts do not enable retry', async () => {
    const state = { ...context(), isHistory: true, canWrite: false, canFork: true }, onRetry = jest.fn();
    const controller = inline({ getContext: () => state, onRetry, onFork: jest.fn() });
    const skipped = controller.mount(document.body, { ...anchor(), role: 'user' }); skipped.dispose(); expect(document.body.childElementCount).toBe(0);
    controller.mount(document.body, { ...anchor(), viewRevisionId: 'r2' }); await expand(document.querySelector('details'));
    expect(button(document.body, 'Retry reply').disabled).toBe(true); expect(button(document.body, 'Fork from revision').disabled).toBe(false);
    state.busy = true; await controller.invalidate('ses_test');
    expect(button(document.body, 'Fork from revision').disabled).toBe(true); expect(onRetry).not.toHaveBeenCalled();
});

test('failed runtime actions stay visible and disposed mounts ignore late metadata', async () => {
    const controller = inline({ onRetry: jest.fn(async () => { throw new Error('Runtime is busy'); }) });
    controller.mount(document.body, anchor()); await expand(document.querySelector('details'));
    button(document.body, 'Retry reply').click(); await tick(); expect(document.querySelector('[role=alert]').textContent).toBe('Runtime is busy');
    controller.dispose();
    let finish; const pending = inline({ loadHistory: () => new Promise(resolve => { finish = resolve; }) });
    const mounted = pending.mount(document.body, anchor()); await expand(document.querySelector('details')); mounted.dispose(); finish(history()); await tick();
    expect(document.querySelector('[data-atria-reply-variants]')).toBeNull();
});

test('inline metadata failure recovers once without extra full-snapshot reads', async () => {
    const loadHistory = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(history());
    const controller = inline({ loadHistory }); controller.mount(document.body, anchor()); await expand(document.querySelector('details'));
    expect(document.querySelector('[role=alert]')).not.toBeNull(); button(document.body, 'Try again').click(); await tick();
    expect(document.body.textContent).toContain('Reply 2 of 2'); expect(loadHistory).toHaveBeenCalledTimes(2);
});

test('active-tail retry remains enabled after a state-only revision refresh', async () => {
    const source = history(); source.headRevisionId = 'r5'; source.branches[1].headRevisionId = 'r5';
    source.revisions.push({ revisionId: 'r5', branchId: 'child', parentRevisionId: 'r4', timelineHead: { messageId: 'two', variantId: 'v2' }, createdAt: 5 });
    const controller = inline({ loadHistory: async () => source, getContext: () => ({ ...context(), revisionId: 'r5' }), onRetry: jest.fn() });
    const element = document.createElement('article'); document.body.append(element); controller.mount(element, anchor());
    await expand(element.querySelector('details'));
    expect(button(element, 'Retry reply').disabled).toBe(false);
});
