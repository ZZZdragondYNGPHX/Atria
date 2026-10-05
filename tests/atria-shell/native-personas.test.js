/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { mountPersonaWorkspace, openPersonaSelector, PERSONA_EMPTY } from '../../public/scripts/native/persona-ui.js';
import { createHeadlessConversation } from '../../public/scripts/native/frontend/conversation.js';
const flush = async () => { await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); };
const content = { name: 'Player', avatar: null, description: 'Player description', managementNotes: 'PRIVATE' };
const ref = { personaId: 'persona_a', revisionId: 'rev_a', contentIdentity: 'a'.repeat(64) };
const item = { root: { archived: false }, revision: content, ref, expectedFingerprint: 'b'.repeat(64) };
const button = name => [...document.querySelectorAll('button')].find(node => node.textContent === name);
beforeEach(() => {
    document.body.innerHTML = '<main></main>';
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { jest.restoreAllMocks(); document.body.replaceChildren(); });

test('failed save keeps draft, successful receipt prevents replay and leaves immutable details readable', async () => {
    const client = { getPersona: jest.fn(async () => item), getPersonaRevisions: jest.fn(async () => []), revisePersona: jest.fn().mockRejectedValueOnce(new Error('save failed')).mockResolvedValueOnce({ ...item, published: true }) };
    const controller = mountPersonaWorkspace({ document, body: document.querySelector('main'), route: { child: { id: 'persona:persona_a' } }, host: {}, client });
    await flush(); const name = document.querySelector('input'); name.value = 'Draft'; name.dispatchEvent(new Event('input', { bubbles: true }));
    button('Save new revision').click(); await flush(); expect(name.value).toBe('Draft'); expect(document.querySelector('fieldset').disabled).toBe(false);
    expect(document.querySelector('[role="alert"]').textContent).toContain('save failed');
    button('Save new revision').click(); await flush(); expect(button('Save new revision').disabled).toBe(true); expect(document.querySelector('fieldset').disabled).toBe(true);
    button('Save new revision').click(); await flush(); expect(client.revisePersona).toHaveBeenCalledTimes(2);
    expect(client.revisePersona.mock.calls[1][0].content).toMatchObject({ name: 'Draft', managementNotes: 'PRIVATE' });
    client.getPersona.mockRejectedValueOnce(new Error('refresh failed')); button('Reload Latest').click(); await flush();
    expect(client.revisePersona).toHaveBeenCalledTimes(2); expect(document.body.textContent).toContain('refresh failed'); controller.dispose();
});

test('cancel preserves the editor on rejected leave; creation uses mandatory empty CAS and freezes draft', async () => {
    const client = { listPersonas: async () => ({ items: [], nextCursor: null }), createPersona: jest.fn(async input => ({ ...item, revision: input.content })) };
    const controller = mountPersonaWorkspace({ document, body: document.querySelector('main'), route: {}, host: {}, client });
    await flush(); button('New Persona').click(); await flush(); const input = document.querySelector('input'); input.value = 'New'; input.dispatchEvent(new Event('input', { bubbles: true }));
    jest.spyOn(window, 'confirm').mockReturnValue(false); button('Cancel').click(); await flush(); expect(input.isConnected).toBe(true);
    button('Save new revision').click(); await flush(); expect(client.createPersona).toHaveBeenCalledWith(expect.objectContaining({ expectedFingerprint: PERSONA_EMPTY, content: expect.objectContaining({ name: 'New' }) })); controller.dispose();
});

test('picker preserves draft, checks scope at selection and records successful publication before failed refresh', async () => {
    const runtime = { snapshot: { session: { sessionId: 's1' }, revision: { revisionId: 'r1' }, states: {} }, assertWritable: jest.fn(), request: jest.fn(async () => ({ revision: { revisionId: 'r2' } })), acceptOperationSnapshot: jest.fn().mockRejectedValue(new Error('refresh failed')), reload: jest.fn() };
    const client = { listPersonas: async () => ({ items: [item], nextCursor: null }) };
    const focus = document.createElement('textarea'); focus.value = 'unsent'; document.body.append(focus); focus.focus();
    const picker = openPersonaSelector({ document, runtime, client }); await flush();
    runtime.snapshot.revision.revisionId = 'r-other'; button('Player').click(); await flush(); expect(runtime.request).not.toHaveBeenCalled();
    runtime.snapshot.revision.revisionId = 'r1'; button('Player').click(); await flush(); expect(runtime.request).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Identity saved.'); expect(button('Player').disabled).toBe(true);
    button('Close').click(); await flush(); expect(document.querySelector('dialog')).toBeNull(); expect(document.activeElement).toBe(focus); expect(focus.value).toBe('unsent'); picker.close();
});

test('Host opens only the guarded selector, rejects readonly/generation and denies arbitrary methods', async () => {
    const action = jest.fn(); const runtime = { active: true, snapshot: { session: { sessionId: 's1' }, revision: { revisionId: 'r1' } }, assertWritable: jest.fn() };
    const bridge = createHeadlessConversation({ runtime: () => runtime, actions: { openPersonaSelector: action } });
    await bridge.invoke({ service: 'host.persona', method: 'openSelector' }, {}, 'r1'); expect(action).toHaveBeenCalledWith({ sessionId: 's1', revision: 'r1' });
    await expect(bridge.invoke({ service: 'host.persona', method: 'openSelector' }, {}, 'old')).rejects.toMatchObject({ code: 'bridge_revision_stale' });
    runtime.history = true; await expect(bridge.invoke({ service: 'host.persona', method: 'openSelector' }, {}, 'r1')).rejects.toMatchObject({ code: 'bridge_session_readonly' });
    await expect(bridge.invoke({ service: 'host.persona', method: 'list' }, {}, 'r1')).rejects.toMatchObject({ code: 'bridge_method_denied' });
});
