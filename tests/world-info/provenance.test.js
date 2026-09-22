import { describe, test, expect, jest } from '@jest/globals';
import { applyProfileWorldInfoFilter } from '../../public/scripts/extensions/orchestrator/lorebook-filter.js';
import {
    createWorldInfoDispatchAttribution,
    filterWorldInfoByProvenance,
    markWorldInfoDispatch,
    snapshotWorldInfoProvenance,
    worldInfoSource,
} from '../../public/scripts/atri-world-info-provenance.js';
import { positions, makeEntry, makePayload } from './prompt-fixture.js';

const filter = { bookPattern: '^private$', entryPattern: '' };

describe('rendered world info occurrence identity', () => {
    test('Native Knowledge provenance uses stable identity even when rendered bodies are equal', () => {
        const one = worldInfoSource({
            world: 'kbind_one',
            uid: 0,
            atri_native: {
                identity: 'native-knowledge-one',
                knowledgeBindingId: 'kbind_one',
                knowledgeBaseId: 'kb_one',
                knowledgeRevisionId: 'kbv_one',
                knowledgeEntryId: 'kentry_one',
                authority: 'package_canonical',
            },
        }, 'same body');
        const two = worldInfoSource({
            world: 'kbind_two',
            uid: 0,
            atri_native: {
                identity: 'native-knowledge-two',
                knowledgeBindingId: 'kbind_two',
                knowledgeBaseId: 'kb_two',
                knowledgeRevisionId: 'kbv_two',
                knowledgeEntryId: 'kentry_two',
                authority: 'library_augment',
            },
        }, 'same body');

        expect(one.content).toBe(two.content);
        expect(one.id).toBe('native-knowledge-one');
        expect(two.id).toBe('native-knowledge-two');
        expect(one.atri_native.knowledgeEntryId).toBe('kentry_one');
        expect(two.atri_native.knowledgeEntryId).toBe('kentry_two');
    });

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


describe('world info request attribution', () => {
    test('compact snapshot preserves occurrence identity without duplicating rendered bodies', () => {
        const render = entry => entry.content.replace('shared', 'rendered');
        const payload = makePayload([
            makeEntry('public', 1, { comment: 'visible' }),
            makeEntry('private', 2, { comment: 'secret' }),
        ], render);
        applyProfileWorldInfoFilter(payload, filter);

        const snapshot = snapshotWorldInfoProvenance(payload.worldInfoResolution.worldInfoProvenance);
        expect(snapshot).toEqual({
            schemaVersion: 1,
            sources: [
                expect.objectContaining({
                    channel: 'before',
                    id: '["public",1]',
                    world: 'public',
                    uid: 1,
                    sourceVersion: 124,
                    comment: 'visible',
                    ordinal: 0,
                }),
            ],
        });
        expect(snapshot.sources[0]).not.toHaveProperty('content');
        expect(JSON.stringify(snapshot)).not.toContain('rendered body');
        expect(JSON.stringify(snapshot)).not.toContain('shared body');
    });

    test('snapshot excludes channels suppressed by final generation flags', () => {
        const payload = makePayload([
            makeEntry('public', 1, { position: positions.before }),
            makeEntry('public', 2, { position: positions.atDepth, depth: 2, role: 1 }),
            makeEntry('public', 3, { position: positions.outlet, outletName: 'slot' }),
            makeEntry('public', 4, { position: positions.ANTop }),
        ]);
        const snapshot = snapshotWorldInfoProvenance(payload.worldInfoResolution.worldInfoProvenance, {
            includeAuthorsNote: false,
            includeDepth: false,
            includeOutlets: false,
        });

        expect(snapshot.sources.map(source => source.id)).toEqual(['["public",1]']);
        expect(snapshot.sources.map(source => source.channel)).toEqual(['before']);
    });

    test('dispatch receipts append request attempts without copying provider payloads', () => {
        const payload = makePayload([makeEntry('public', 1)]);
        const attribution = createWorldInfoDispatchAttribution(payload.worldInfoResolution.worldInfoProvenance);

        markWorldInfoDispatch(attribution, {
            boundary: 'provider_request',
            providerConfirmed: true,
            mainApi: 'openai',
            type: 'normal',
            stream: false,
            requestScope: 'chat',
            model: 'fixture-model',
            messageCount: 7,
            ignoredPayload: { messages: ['large prompt that must not be retained'] },
        });
        markWorldInfoDispatch(attribution, {
            boundary: 'provider_request',
            providerConfirmed: true,
            mainApi: 'openai',
            type: 'normal',
            stream: false,
            requestScope: 'chat',
            model: 'fixture-model',
            messageCount: 8,
        });

        expect(attribution.sources).toEqual([
            expect.objectContaining({ id: '["public",1]', channel: 'before' }),
        ]);
        expect(attribution.dispatches).toEqual([
            expect.objectContaining({ sequence: 1, boundary: 'provider_request', providerConfirmed: true, messageCount: 7 }),
            expect.objectContaining({ sequence: 2, boundary: 'provider_request', providerConfirmed: true, messageCount: 8 }),
        ]);
        expect(JSON.stringify(attribution)).not.toContain('large prompt');
        expect(attribution.dispatches[0]).not.toHaveProperty('ignoredPayload');
    });

    test('takeover handoff stays distinguishable from a core-confirmed provider request', () => {
        const attribution = createWorldInfoDispatchAttribution(null);
        markWorldInfoDispatch(attribution, {
            boundary: 'plugin_takeover',
            providerConfirmed: false,
            mainApi: 'openai',
            type: 'normal',
            stream: true,
        });
        expect(attribution.dispatches).toEqual([
            {
                sequence: 1,
                boundary: 'plugin_takeover',
                providerConfirmed: false,
                mainApi: 'openai',
                type: 'normal',
                stream: true,
            },
        ]);
    });

    test('dispatch history is bounded during repeated transport attempts', () => {
        const attribution = createWorldInfoDispatchAttribution(null);
        for (let i = 0; i < 25; i++) {
            markWorldInfoDispatch(attribution, {
                boundary: 'provider_request',
                providerConfirmed: true,
                mainApi: 'openai',
                type: 'normal',
                stream: false,
            });
        }
        expect(attribution.dispatches).toHaveLength(16);
        expect(attribution.dispatches[0].sequence).toBe(1);
        expect(attribution.dispatches.at(-1).sequence).toBe(16);
    });
});
