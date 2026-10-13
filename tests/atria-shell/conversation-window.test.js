/** @jest-environment jsdom */
import { ConversationWindow } from '../../public/scripts/native/conversation-window.js';

test('bounded pages cancel old Branch/Revision reads and dispose is idempotent', async () => {
    const scroll = document.createElement('main'), pending = [];
    let changes = 0;
    const view = new ConversationWindow({ scroll, changed: () => changes++, read: (snapshot, from, limit, signal) => new Promise(resolve => pending.push({ snapshot, from, limit, signal, resolve })) });
    const snapshot = branchId => ({ session: { sessionId: 'session' }, revision: { branchId, revisionId: branchId },
        timeline: Array.from({ length: 5000 }, (_, sequence) => ({ sequence, messageId: branchId + sequence, content: 'Original' })) });
    view.update(snapshot('old'), true); view.update(snapshot('new'), true);
    expect(view.entries).toHaveLength(64); expect(view.from).toBe(4936); expect(pending[0].signal.aborted).toBe(true);
    pending[0].resolve({ revisionId: 'old', branchId: 'old', entries: [{ messageId: 'stale' }] }); await Promise.resolve();
    expect(changes).toBe(0); expect(view.entries[0].messageId).toBe('new4936');
    pending[1].resolve({ revisionId: 'new', branchId: 'new', entries: view.entries }); await Promise.resolve();
    expect(changes).toBe(1);
    for (let index = 0; index < 5000; index++) view.measure(index, 100 + index % 10);
    expect(view.heights.size).toBe(512);
    view.dispose(); view.dispose(); expect(view.entries).toHaveLength(0); expect(view.snapshot).toBeNull();
});

test('byte budget preserves latest and reading anchors, including synchronous fallback and pressure', () => {
    const scroll = document.createElement('main');
    const view = new ConversationWindow({ scroll, changed: () => {}, byteBudget: 4000 });
    const snapshot = { session: { sessionId: 's' }, revision: { branchId: 'b', revisionId: 'r' },
        timeline: Array.from({ length: 100 }, (_, sequence) => ({ sequence, messageId: String(sequence), content: 'x'.repeat(800) })) };
    view.update(snapshot, true);
    expect(view.entries.at(-1).sequence).toBe(99); expect(view.retainedBytes).toBeLessThanOrEqual(4000);
    scroll.scrollTop = 30 * view.estimate;
    view.load(24, true);
    expect(view.entries.some(entry => entry.sequence === 30)).toBe(true);
    view.pressure(); expect(view.entries.some(entry => entry.sequence === 30)).toBe(true);
    view.latest(); expect(view.entries.at(-1).sequence).toBe(99);
    view.canShift = () => false;
    const before = [...view.entries]; view.pressure(); expect(view.entries).toEqual(before);
    view.clear(); expect(view.retainedBytes).toBe(0); expect(view.total).toBe(0); view.dispose();
});
