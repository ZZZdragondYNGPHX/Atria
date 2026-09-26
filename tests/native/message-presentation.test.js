/** @jest-environment jsdom */
import { jest, test, expect, afterEach } from '@jest/globals';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { mountMessageProjection, mountConversationPresentation, mountConversationThread } from '../../public/scripts/native/message-presentation.js';

const mounted = [];
afterEach(() => { mounted.splice(0).forEach(value => value?.dispose()); document.body.replaceChildren(); });
function fixture(policy = 'active-tail') {
    return { schemaVersion: 2, stateVersion: 1, views: [{ id: 'main', surface: 'chat.footer', mount: 'always', root: { id: 'empty', type: 'text' } }],
        conversation: { mode: 'feed', profile: 'novel' },
        messageBlocks: { reward: { version: 1, maxInstances: 4, attachmentKind: 'claim', actionPolicy: policy,
            dataSchema: { type: 'object', properties: { label: { type: 'string', maxLength: 64 }, amount: { type: 'integer', minimum: 0, maximum: 100 } }, required: ['label', 'amount'], additionalProperties: false },
            document: { schemaVersion: 2, stateVersion: 1,
                localState: { open: { type: 'boolean', default: false } },
                actions: { toggle: { steps: [{ op: 'ui.toggle', path: 'ui.open' }] }, claim: { steps: [{ op: 'command.dispatch', commandId: 'claim', args: { amount: { expr: 'block.amount' } } }] } },
                views: [{ id: 'block', surface: 'chat.footer', mount: 'always', root: { id: 'card', type: 'stack', children: [
                    { id: 'label', type: 'text', bindings: { text: { template: '{{block.label}}: {{block.amount}}' } } },
                    { id: 'toggle', type: 'button', props: { text: 'Details' }, events: { click: 'toggle' } },
                    { id: 'details', type: 'text', props: { text: 'Snapshot details' }, bindings: { hidden: { expr: '!ui.open' } } },
                    { id: 'claim', type: 'button', props: { text: 'Claim' }, events: { click: 'claim' } },
                ] } }],
            } } } };
}
const projection = { schemaVersion: 1, flow: [{ kind: 'prose', text: 'Before. ' }, { kind: 'block', id: 'reward', type: 'reward', version: 1, data: { label: 'Coins', amount: 3 } }, { kind: 'prose', text: 'After.' }] };
const anchor = { sessionId: 's', branchId: 'b', viewRevisionId: 'r', messageId: 'm', variantId: 'v', role: 'assistant' };
function mount(options = {}, raw = fixture()) {
    const root = document.createElement('div'); document.body.append(root);
    const runtime = mountMessageProjection(compileUiDocument(raw, { mode: 'component' }), { root, anchor,
        content: 'Before. After.', projection, isActiveTail: () => true, ...options });
    mounted.push(runtime); return { runtime, root };
}

test('ordered flow uses v2 components, snapshot data, unique DOM identities and separate render receipts', async () => {
    const getState = jest.fn(() => ({ amount: 999 })); const onRenderReceipt = jest.fn();
    const first = mount({ onRenderReceipt, worldSession: { getState } });
    expect([...first.root.querySelector('.atri-message-flow').children].map(node => node.className)).toEqual(['atri-message-prose', 'atri-message-block atri-ui-document', 'atri-message-prose']);
    expect(first.root.textContent).toContain('Coins: 3'); expect(getState).not.toHaveBeenCalled();
    expect(onRenderReceipt.mock.calls[0][0]).toMatchObject({ kind: 'render', status: 'rendered', variantId: 'v' });
    await first.runtime.execute('reward', 'toggle'); expect(first.root.querySelector('#atri-ui-v-reward-details').hidden).toBe(false);
    const second = mount({ anchor: { ...anchor, variantId: 'v2' } });
    expect(second.root.querySelector('#atri-ui-v2-reward-details').hidden).toBe(true);
    expect(projection.flow[1].data.amount).toBe(3);
});

test('actionable attachment uses P1 typed receipt, survives remount and never repeats a claim', async () => {
    const receipts = []; const dispatchAction = jest.fn(async request => { const receipt = { ...request, receiptId: 'receipt' }; receipts.push(receipt); return receipt; });
    const options = { worldSession: { getRevisionId: () => 'r', dispatchAction, getActionReceipts: () => receipts } };
    const first = mount(options); await first.runtime.execute('reward', 'claim');
    expect(dispatchAction.mock.calls[0][0]).toMatchObject({ commandId: 'claim', args: { amount: 3 }, idempotencyKey: 'v:reward:claim' });
    first.runtime.dispose(); const second = mount(options);
    await second.runtime.execute('reward', 'claim'); second.runtime.refresh();
    expect(dispatchAction).toHaveBeenCalledTimes(1);
    expect(second.root.querySelector('#atri-ui-v-reward-claim').disabled).toBe(true);
    expect(second.root.textContent).toContain('Action completed');
});

test('historical actions are read-only while message-local UI still works', async () => {
    const dispatchAction = jest.fn(); const value = mount({ isActiveTail: () => false, worldSession: { dispatchAction } });
    await value.runtime.execute('reward', 'toggle');
    await expect(value.runtime.execute('reward', 'claim')).rejects.toThrow('read-only');
    expect(value.root.querySelector('#atri-ui-v-reward-claim').disabled).toBe(true); expect(dispatchAction).not.toHaveBeenCalled();
});

test('explicit historical fork awaits confirmation and delegates to the newly active renderer', async () => {
    const onForkAction = jest.fn(async () => ({ status: 'completed' })); const dispatchAction = jest.fn();
    const value = mount({ isActiveTail: () => false, getSnapshot: () => ({ revision: { revisionId: 'r' } }), confirm: async () => true,
        onForkAction, worldSession: { dispatchAction } }, fixture('fork-from-anchor'));
    await value.runtime.execute('reward', 'claim');
    expect(onForkAction).toHaveBeenCalledWith(anchor, 'reward', 'claim', { open: false }, {});
    expect(dispatchAction).not.toHaveBeenCalled();
});

test('cancel, stale confirmation and disposed mounts cannot run historical actions', async () => {
    const onForkAction = jest.fn(); let revision = 'r';
    const cancelled = mount({ isActiveTail: () => false, confirm: async () => false, onForkAction }, fixture('fork-from-anchor'));
    await expect(cancelled.runtime.execute('reward', 'claim')).resolves.toMatchObject({ status: 'cancelled' });
    const stale = mount({ isActiveTail: () => false, getSnapshot: () => ({ revision: { revisionId: revision } }), confirm: async () => { revision = 'r2'; return true; }, onForkAction }, fixture('fork-from-anchor'));
    await expect(stale.runtime.execute('reward', 'claim')).rejects.toThrow('changed');
    stale.runtime.dispose(); expect(() => stale.runtime.execute('reward', 'claim')).toThrow('disposed');
    expect(onForkAction).not.toHaveBeenCalled();
});

test('render failure is a render receipt only and disposes partial UI', () => {
    const onRenderReceipt = jest.fn();
    expect(() => mount({ onRenderReceipt, renderProse: () => { throw new Error('formatter failed'); } })).toThrow('formatter failed');
    expect(onRenderReceipt.mock.calls[0][0]).toMatchObject({ kind: 'render', status: 'failed' });
    expect(document.querySelector('.atri-message-flow')).toBeNull();
});

test('Conversation feed/latest/reader preserves canonical DOM, handles replacement and disposes cleanly', async () => {
    document.body.innerHTML = '<div id="chat">' + [0, 1, 2].map(id => `<div class="mes" mesid="${id}"><div class="mes_text">canonical ${id}</div></div>`).join('') + '</div>';
    const snapshot = { session: { sessionId: 's' }, revision: { branchId: 'b', revisionId: 'r' },
        timeline: [0, 1, 2].map(id => ({ messageId: 'm' + id, activeVariantId: 'v' + id, role: 'assistant' })),
        variants: [0, 1, 2].map(id => ({ variantId: 'v' + id, content: 'Before. After.', projection })) };
    const before = JSON.stringify(snapshot); const runtime = mountConversationPresentation(compileUiDocument(fixture()), { document, window, getSnapshot: () => snapshot, isActiveTail: () => false }); mounted.push(runtime);
    const select = document.querySelector('select'); select.value = 'latest'; select.dispatchEvent(new Event('change'));
    expect(document.querySelector('.mes').hidden).toBe(true);
    select.value = 'reader'; select.dispatchEvent(new Event('change'));
    expect(document.querySelector('#chat').dataset.atriConversation).toBe('reader'); expect(document.querySelector('.mes').hidden).toBe(false);
    const text = document.querySelector('.mes_text'); text.textContent = 'canonical refreshed'; await new Promise(resolve => setTimeout(resolve, 0));
    expect(text.querySelector('.atri-message-flow')).not.toBeNull(); expect(JSON.stringify(snapshot)).toBe(before);
    expect(runtime.getRenderReceipts()).toHaveLength(3);
    runtime.dispose(); expect(text.textContent).toBe('canonical refreshed'); expect(document.querySelector('.atri-conversation-presentation')).toBeNull();
});

test('receipt recovery resumes remaining P1 steps rather than hiding a failed continuation', async () => {
    const raw = fixture(); raw.messageBlocks.reward.document.actions.claim.steps.push({ op: 'composer.submit' });
    const receipts = []; const dispatchAction = jest.fn(async request => { receipts.push(request); return request; });
    const submit = jest.fn().mockRejectedValueOnce(new Error('Composer interrupted')).mockResolvedValue('done');
    const value = mount({ composer: { submit }, worldSession: { getRevisionId: () => 'r', dispatchAction, getActionReceipts: () => receipts } }, raw);
    await expect(value.runtime.execute('reward', 'claim')).rejects.toThrow('interrupted'); value.runtime.refresh();
    expect(value.root.querySelector('#atri-ui-v-reward-claim').disabled).toBe(false);
    await value.runtime.execute('reward', 'claim'); expect(dispatchAction).toHaveBeenCalledTimes(1); expect(submit).toHaveBeenCalledTimes(2);
});

test('scoped threads reuse message presentation with bounded pages and read-only attachments', () => {
    const root = document.createElement('div'); document.body.append(root);
    const thread = { schemaVersion: 1, threadId: 'mail', scope: { kind: 'scene', id: 'harbor' }, participants: [{ id: 'courier', label: 'Courier' }],
        messages: Array.from({ length: 51 }, (_, index) => ({ id: 'mail_' + index, participantId: 'courier', content: 'Before. After.', projection })) };
    const dispatchAction = jest.fn(); const runtime = mountConversationThread(compileUiDocument(fixture('fork-from-anchor')), thread, { root, worldSession: { dispatchAction } }); mounted.push(runtime);
    expect(root.querySelectorAll('.atri-thread-message')).toHaveLength(50);
    expect([...root.querySelectorAll('.atri-ui-button')].filter(button => button.textContent === 'Claim').every(button => button.disabled)).toBe(true);
    [...root.querySelectorAll('button')].find(button => button.textContent === 'Show more messages').click();
    expect(root.querySelectorAll('.atri-thread-message')).toHaveLength(51); expect(dispatchAction).not.toHaveBeenCalled();
    expect(thread.messages).toHaveLength(51);
});

test('all blocks share one rendered-node budget and clean up failed oversized projections', () => {
    const raw = fixture(); raw.messageBlocks.reward.maxInstances = 32;
    raw.messageBlocks.reward.document.views[0].root.children = Array.from({ length: 80 }, (_, index) => ({ id: 'text_' + index, type: 'text', props: { text: 'bounded' } }));
    const flow = [projection.flow[0], ...Array.from({ length: 32 }, (_, index) => ({ ...projection.flow[1], id: 'block_' + index })), projection.flow[2]];
    expect(() => mount({ projection: { schemaVersion: 1, flow } }, raw)).toThrow('node budget');
    expect(document.querySelector('.atri-message-flow')).toBeNull();
});
