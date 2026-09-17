import { expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('function getMessageDeletionStartId('), source.indexOf('/**', source.indexOf('function getMessageDeletionStartId(')));
const deletion = source.slice(source.indexOf('export async function deleteMessage('), source.indexOf('export const reloadChatMutex')).replace('export ', '');

function harness(patched = true) {
    const context = {
        chat: [
            { is_user: true, mes: 'question' },
            { is_system: true, extra: { tool_invocations: [{ name: 'search' }] } },
            { is_system: true, extra: { tool_invocations: [{ name: 'memory' }] } },
            { is_user: false, mes: 'answer', swipes: ['answer', 'alternative'] },
        ],
        chat_metadata: {},
        this_edit_mes_id: 3,
        getFirstDisplayedMessageId: () => 0,
        chatElement: { find: () => ({ length: 1, remove: jest.fn() }) },
        deleteItemizedPromptForMessage: jest.fn(),
        updateViewMessageIds: jest.fn(),
        patchChatMessages: jest.fn(async () => patched),
        saveChatConditional: jest.fn(async () => {}),
        refreshSwipeButtons: jest.fn(),
        settleMessageDeleted: jest.fn(async () => {}),
        eventSource: { emit: jest.fn(async () => {}) },
        event_types: { MESSAGE_DELETED: 'message_deleted' },
        deleteSwipe: jest.fn(async () => {}),
    };
    vm.createContext(context);
    vm.runInContext(`${helper}\n${deletion}`, context);
    return context;
}

test('deleting a reply removes its tool calls with descending PATCH operations and keeps playable floor metadata', async () => {
    const h = harness();
    await h.deleteMessage(3);
    expect(h.chat).toEqual([{ is_user: true, mes: 'question' }]);
    expect(h.patchChatMessages).toHaveBeenCalledWith([
        { op: 'remove', path: '/3' }, { op: 'remove', path: '/2' }, { op: 'remove', path: '/1' },
    ]);
    expect(h.eventSource.emit).toHaveBeenCalledWith('message_deleted', 1, {
        kind: 'delete', deletedPlayableSeqFrom: 2, deletedPlayableSeqTo: 2,
        deletedAssistantSeqFrom: 1, deletedAssistantSeqTo: 1,
    });
});

test('toolcalls=false keeps tool messages and failed PATCH awaits full-save recovery', async () => {
    const h = harness(false);
    await h.deleteMessage(3, undefined, false, false);
    expect(h.chat).toHaveLength(3);
    expect(h.patchChatMessages).toHaveBeenCalledWith([{ op: 'remove', path: '/3' }]);
    expect(h.saveChatConditional).toHaveBeenCalledTimes(1);
});

test('deleting one swipe does not remove the reply or its tool messages', async () => {
    const h = harness();
    await h.deleteMessage(3, 1);
    expect(h.chat).toHaveLength(4);
    expect(h.deleteSwipe).toHaveBeenCalledWith(1, 3);
    expect(h.patchChatMessages).not.toHaveBeenCalled();
});
