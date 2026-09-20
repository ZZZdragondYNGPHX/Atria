import { describe, expect, test } from '@jest/globals';
import { getMessageDepthFromTail } from '../../public/scripts/atri-message-depth.js';

function referenceDepth(chat, messageId) {
    const usableMessages = chat
        .map((message, index) => ({ message, index }))
        .filter(entry => !entry.message.is_system);
    const indexOf = usableMessages.findIndex(entry => entry.index === Number(messageId));
    return messageId >= 0 && indexOf !== -1
        ? usableMessages.length - indexOf - 1
        : undefined;
}

describe('P-03 message regex depth hot path', () => {
    test('matches the existing full-history algorithm for mixed system messages', () => {
        const chat = Array.from({ length: 300 }, (_, index) => ({
            is_system: index % 17 === 0 || index % 29 === 0,
            mes: String(index),
        }));

        for (let index = 0; index < chat.length; index++) {
            expect(getMessageDepthFromTail(chat, index)).toBe(referenceDepth(chat, index));
        }
    });

    test('latest non-system message requires no history traversal semantically', () => {
        const chat = Array.from({ length: 10_000 }, (_, index) => ({
            is_system: index % 97 === 0,
        }));
        chat.at(-1).is_system = false;
        expect(getMessageDepthFromTail(chat, chat.length - 1)).toBe(0);
    });

    test('recent visible window counts only the suffix, preserving system-message gaps', () => {
        const chat = Array.from({ length: 10_000 }, () => ({ is_system: false }));
        chat[9_950].is_system = true;
        chat[9_975].is_system = true;
        expect(getMessageDepthFromTail(chat, 9_900)).toBe(referenceDepth(chat, 9_900));
        expect(getMessageDepthFromTail(chat, 9_999)).toBe(0);
    });

    test('invalid and system-message targets keep undefined semantics', () => {
        const chat = [{ is_system: true }, { is_system: false }];
        expect(getMessageDepthFromTail(chat, 0)).toBeUndefined();
        expect(getMessageDepthFromTail(chat, -1)).toBeUndefined();
        expect(getMessageDepthFromTail(chat, 2)).toBeUndefined();
        expect(getMessageDepthFromTail(null, 0)).toBeUndefined();
    });
});
