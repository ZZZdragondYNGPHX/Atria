import { describe, test, expect } from '@jest/globals';
import { ChatSnapshotCache } from '../../public/scripts/atri-chat-snapshot-cache.js';

describe('chat wire snapshot lifecycle', () => {
    test('switching 100 chats retains only the active and latest inactive pair', () => {
        let active = '';
        const cache = new ChatSnapshotCache({ activeKey: () => active });
        for (let i = 0; i < 100; i++) {
            active = 'chat:' + i;
            cache.set(active, 'messages', [{ mes: String(i) }]);
            cache.set(active, 'metadata', { integrity: String(i) });
            expect(cache.size).toBeLessThanOrEqual(2);
        }
        expect(cache.get('chat:0', 'messages')).toBeUndefined();
        expect(cache.get('chat:98', 'messages')).toEqual([{ mes: '98' }]);
        expect(cache.get(active, 'metadata')).toEqual({ integrity: '99' });
    });

    test('inactive recency never evicts the active chat', () => {
        const cache = new ChatSnapshotCache({ activeKey: () => 'active' });
        cache.set('active', 'messages', ['active']);
        cache.set('a', 'metadata', { integrity: 'a' });
        cache.set('b', 'metadata', { integrity: 'b' });
        expect(cache.get('a', 'metadata')).toBeUndefined();
        expect(cache.get('active', 'messages')).toEqual(['active']);
        expect(cache.size).toBe(2);
    });

    test('all queued and in-flight writes stay protected until the last release', () => {
        const cache = new ChatSnapshotCache({ activeKey: () => 'new' });
        const releaseFirst = cache.holdWrites();
        const releaseSecond = cache.holdWrites();
        for (const key of ['old', 'group', 'branch', 'new']) {
            cache.set(key, 'messages', [key]);
            cache.set(key, 'metadata', { integrity: key });
        }
        releaseFirst();
        releaseFirst(); // idempotent cleanup
        expect(cache.size).toBe(4);
        expect(cache.get('old', 'metadata')).toEqual({ integrity: 'old' });
        releaseSecond();
        expect(cache.size).toBe(2);
        expect(cache.get('old', 'messages')).toEqual(['old']);
        expect(cache.get('new', 'messages')).toEqual(['new']);
    });

    test('failed write releases protection without changing live data', async () => {
        const live = [{ mes: 'unsaved' }];
        const cache = new ChatSnapshotCache({ activeKey: () => 'next' });
        const release = cache.holdWrites();
        cache.set('old', 'messages', structuredClone(live));
        cache.set('other', 'messages', []);
        cache.set('next', 'messages', []);
        await expect(Promise.reject(new Error('network')).finally(release)).rejects.toThrow('network');
        expect(cache.size).toBe(2);
        expect(live).toEqual([{ mes: 'unsaved' }]);
    });

    test('invalidation clears both halves; message-only invalidation keeps metadata', () => {
        const cache = new ChatSnapshotCache({ activeKey: () => 'a' });
        cache.set('a', 'messages', ['a']);
        cache.set('a', 'metadata', { integrity: 'ok' });
        cache.delete('a', 'messages');
        expect(cache.get('a', 'messages')).toBeUndefined();
        expect(cache.get('a', 'metadata')).toEqual({ integrity: 'ok' });
        cache.delete('a');
        expect(cache.size).toBe(0);
    });

    test('switching away from an empty or deleted target prunes the former active entry', () => {
        let active = 'a';
        const cache = new ChatSnapshotCache({ activeKey: () => active, inactiveLimit: 0 });
        cache.set(active, 'messages', ['saved']);
        active = '';
        cache.prune();
        expect(cache.size).toBe(0);
    });
});
