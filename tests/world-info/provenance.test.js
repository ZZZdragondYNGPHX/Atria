import { describe, test, expect, jest } from '@jest/globals';
import { applyProfileWorldInfoFilter } from '../../public/scripts/extensions/orchestrator/lorebook-filter.js';
import { filterWorldInfoByProvenance } from '../../public/scripts/atri-world-info-provenance.js';
import { positions, makeEntry, makePayload } from './prompt-fixture.js';

const filter = { bookPattern: '^private$', entryPattern: '' };

describe('rendered world info occurrence identity', () => {
    test('ambiguous legacy bodies cannot silently choose the first source', () => {
        const payload = { worldInfoBeforeEntries: ['shared body', 'shared body'], worldInfoResolution: {
            activatedEntries: [makeEntry('public', 1), makeEntry('private', 2)],
        } };
        expect(() => applyProfileWorldInfoFilter(payload, filter)).toThrow('requires occurrence provenance');
        expect(payload.worldInfoBeforeEntries).toHaveLength(2);
    });
    test.each([false, true])('identical public/private bodies do not collide, reversed=%s', reverse => {
        const entries = [makeEntry('public', 1), makeEntry('private', 2)];
        const payload = makePayload(reverse ? entries.reverse() : entries);
        const array = payload.worldInfoBeforeEntries;
        applyProfileWorldInfoFilter(payload, filter);
        expect(array).toBe(payload.worldInfoBeforeEntries);
        expect(array).toEqual(['shared body']);
        expect(payload.worldInfoResolution.worldInfoProvenance.worldInfoBeforeEntries).toEqual([
            expect.objectContaining({ id: '["public",1]', world: 'public', uid: 1, sourceVersion: 124 }),
        ]);
    });

    test('regex-transformed private body is filtered without executing the renderer twice', () => {
        const render = jest.fn(entry => entry.content.replace('shared', 'rendered'));
        const payload = makePayload([makeEntry('private', 1)], render);
        applyProfileWorldInfoFilter(payload, filter);
        expect(render).toHaveBeenCalledTimes(1);
        expect(payload.worldInfoBeforeEntries).toEqual([]);
        expect(payload.worldInfoString).toBe('');
        expect(payload.worldInfoResolution.worldInfoString).toBe('');
        expect(payload.worldInfoResolution.worldInfoBeforeEntries).toEqual([]);
    });

    test.each(Object.entries(positions))('source filtering works for %s', (_name, position) => {
        const payload = makePayload([
            makeEntry('public', 1, { position, depth: 2, role: 1, outletName: 'slot' }),
            makeEntry('private', 2, { position, depth: 2, role: 1, outletName: 'slot' }),
        ]);
        applyProfileWorldInfoFilter(payload, filter);
        const values = [
            ...payload.worldInfoBeforeEntries, ...payload.worldInfoAfterEntries,
            ...payload.anBefore, ...payload.anAfter, ...payload.worldInfoExamples.map(e => e.content),
            ...payload.worldInfoDepth.flatMap(b => b.entries), ...Object.values(payload.outletEntries).flat(),
        ];
        expect(values).toEqual(['shared body']);
    });

    test('entry comments and recipient-specific filters preserve independent snapshots', () => {
        const payload = makePayload([makeEntry('public', 1, { comment: 'secret' }), makeEntry('public', 2)]);
        const otherRecipient = structuredClone(payload);
        applyProfileWorldInfoFilter(payload, { entryPattern: '^secret$' });
        applyProfileWorldInfoFilter(otherRecipient, { bookPattern: '^public$' });
        expect(payload.worldInfoBeforeEntries).toHaveLength(1);
        expect(otherRecipient.worldInfoBeforeEntries).toHaveLength(0);
    });

    test('normalization and repeated filtering do not drift provenance', () => {
        const payload = makePayload([makeEntry('private', 1, { content: '   ' }), makeEntry('public', 2, { content: '  keep  ' })]);
        applyProfileWorldInfoFilter(payload, filter);
        applyProfileWorldInfoFilter(payload, filter);
        expect(payload.worldInfoBeforeEntries).toEqual(['keep']);
        expect(payload.worldInfoResolution.worldInfoProvenance.worldInfoBeforeEntries).toHaveLength(1);
    });

    test('mutated channels fail before any channel is partially filtered', () => {
        const payload = makePayload([makeEntry('private', 1), makeEntry('private', 2, { position: positions.after })]);
        payload.worldInfoAfterEntries.push('unattributed');
        const before = structuredClone(payload);
        expect(() => applyProfileWorldInfoFilter(payload, filter)).toThrow('without matching provenance');
        expect(payload).toEqual(before);
    });

    test('reordered depth buckets with identical bodies cannot borrow another bucket identity', () => {
        const payload = makePayload([makeEntry('private', 1, { position: positions.atDepth, depth: 1 }), makeEntry('public', 2, { position: positions.atDepth, depth: 2 })]);
        payload.worldInfoDepth.reverse();
        expect(() => applyProfileWorldInfoFilter(payload, filter)).toThrow('without matching provenance');
    });

    test('throwing filter has no partial effects', () => {
        const payload = makePayload([makeEntry('public', 1)]);
        const before = structuredClone(payload);
        expect(() => filterWorldInfoByProvenance(payload, payload.worldInfoResolution.worldInfoProvenance, () => { throw new Error('fail'); })).toThrow('fail');
        expect(payload).toEqual(before);
    });

    test('outlet names cannot mutate object prototypes', () => {
        const payload = makePayload([makeEntry('private', 1, { position: positions.outlet, outletName: '__proto__' })]);
        expect(Object.getPrototypeOf(payload.outletEntries)).toBe(Object.prototype);
        applyProfileWorldInfoFilter(payload, filter);
        expect(payload.outletEntries.__proto__).toEqual([]);
    });
});
