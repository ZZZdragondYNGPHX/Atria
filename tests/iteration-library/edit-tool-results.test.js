import { expect, test } from '@jest/globals';
import { applyOutcomesToToolResults, buildEditToolResultPayload } from '../../public/scripts/iteration-library/edit-tool-results.js';

function turn() {
    return { role: 'assistant', toolCalls: [{ id: 'edit-a' }, { id: 'edit-b' }, { id: 'read' }], toolResults: [
        { tool_call_id: 'edit-a', content: buildEditToolResultPayload('pending'), status: 'pending' },
        { tool_call_id: 'edit-b', content: buildEditToolResultPayload('pending'), status: 'pending' },
        { tool_call_id: 'read', content: { schema: ['event'] }, status: 'ok' },
    ] };
}

test.each(['committed', 'rejected', 'conflict', 'rolledBack'])('review %s updates the entire edit batch and preserves read replies and other turns', status => {
    const message = turn();
    const other = { role: 'assistant', toolCalls: [{ id: 'other' }], toolResults: [{ tool_call_id: 'other', content: buildEditToolResultPayload('pending') }] };
    const beforeOther = structuredClone(other);
    const read = message.toolResults[2];
    applyOutcomesToToolResults([message, other], [{ sourceCallId: 'edit-a', kind: 'profile-edit', status, reason: 'CONFLICT', hint: 'Re-read schema' }]);
    const expectedStatus = status === 'rolledBack' ? 'rolled_back' : status;
    for (const reply of message.toolResults.slice(0, 2)) {
        expect(reply.content.status).toBe(expectedStatus);
        expect(reply.status).toBe(status === 'committed' ? 'ok' : 'fail');
    }
    if (status === 'conflict') expect(message.toolResults[0].content).toMatchObject({ reason: 'CONFLICT', hint: 'Re-read schema' });
    expect(message.toolResults[2]).toBe(read);
    expect(other).toEqual(beforeOther);
});

test('a single lorebook decision does not resolve sibling profile proposals', () => {
    const message = turn();
    applyOutcomesToToolResults([message], [{ sourceCallId: 'edit-a', kind: 'lorebook-write', status: 'committed' }]);
    expect(message.toolResults.map(reply => reply.content.status)).toEqual(['committed', 'proposal_pending', undefined]);
});

test('an outcome for removed history leaves retained pending proposals unchanged', () => {
    const message = turn(), before = structuredClone(message);
    applyOutcomesToToolResults([message], [{ sourceCallId: 'deleted-call', kind: 'profile-edit', status: 'committed' }]);
    expect(message).toEqual(before);
});
