/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { mountGoalAuthoring } from '../../public/scripts/native/goal-authoring.js';
import { rememberEvidenceReceipt, sessionEvidenceReceipts } from '../../public/scripts/native/evidence-receipts.js';
const flush = async () => { await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); };
const button = name => [...document.querySelectorAll('button')].find(node => node.textContent === name);
let dispose;
afterEach(() => { dispose?.(); dispose = null; document.body.replaceChildren(); });
function setup(onCreated = async () => {}) {
    const request = jest.fn(async action => action === 'create-preflight' ? { anchorFingerprint: 'a'.repeat(64) } : { goalId: 'goal_saved' });
    const scope = { domain: 'rp_session', sessionId: 'session_real' };
    dispose = mountGoalAuthoring({ root: document.body, scope, sources: [{ label: 'Saved message', selector: { kind: 'message', messageId: 'message_real' }, path: ['content'], value: 'Before' }], request, onCreated });
    const intent = document.querySelector('input'); intent.value = 'Fix this saved output'; intent.dispatchEvent(new Event('input', { bubbles: true }));
    return { request, scope, intent };
}
test('source and bounded definition must be reviewed again after editing; publication survives failed refresh', async () => {
    const { request, scope } = setup(async () => { throw new Error('read failed'); });
    button('Review goal').click(); await flush(); expect(button('Create reviewed goal').disabled).toBe(false);
    const expected = document.querySelector('textarea'); expected.value = 'Desired'; expected.dispatchEvent(new Event('input', { bubbles: true }));
    expect(button('Create reviewed goal').disabled).toBe(true);
    button('Review goal').click(); await flush(); button('Create reviewed goal').click(); await flush();
    expect(request).toHaveBeenLastCalledWith('create-checked', { expectedAnchorFingerprint: 'a'.repeat(64), definition: expect.objectContaining({ scope, criteria: [expect.objectContaining({ selector: { kind: 'message', messageId: 'message_real' }, equals: 'Desired' })], budget: { maxRequests: 1, maxTokens: 16000 } }) });
    expect(document.body.textContent).toContain('Goal created.'); expect(document.body.textContent).toContain('Saved, but');
    expect(document.querySelector('fieldset').disabled).toBe(true); button('Create reviewed goal').click(); await flush(); expect(request).toHaveBeenCalledTimes(3);
    expect(document.querySelector('[data-atria-draft-dirty]').dataset.atriaDraftDirty).toBe('false');
});
test('failed publication keeps form values and allows retry; receipts stay in their original Session and branch', async () => {
    const { request, intent } = setup(); button('Review goal').click(); await flush(); request.mockRejectedValueOnce(new Error('source changed'));
    button('Create reviewed goal').click(); await flush(); expect(intent.value).toBe('Fix this saved output'); expect(document.querySelector('fieldset').disabled).toBe(false);
    expect(document.body.textContent).toContain('source changed');
    const runtime = { snapshot: { session: { sessionId: 'one' }, revision: { branchId: 'b1', revisionId: 'r1' } } };
    rememberEvidenceReceipt(runtime, { evidenceCapture: { status: 'complete' } }); expect(sessionEvidenceReceipts(runtime)).toEqual([]);
    rememberEvidenceReceipt(runtime, { evidenceCapture: { evidenceId: 'c'.repeat(64) } }); expect(sessionEvidenceReceipts(runtime)).toHaveLength(1);
    runtime.snapshot.revision.branchId = 'b2'; expect(sessionEvidenceReceipts(runtime)).toEqual([]);
    runtime.snapshot.revision.branchId = 'b1'; runtime.snapshot.session.sessionId = 'two'; expect(sessionEvidenceReceipts(runtime)).toEqual([]);
});
