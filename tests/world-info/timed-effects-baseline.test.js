import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, test, expect } from '@jest/globals';

// W-02 contract test against the production class. Evaluation must read the
// same timed-effect snapshot in preview and formal scans without mutating live
// chat metadata. Writes happen only through an explicit commit.
const source = readFileSync(new URL('../../public/scripts/world-info.js', import.meta.url), 'utf8');
const start = source.indexOf('class WorldInfoTimedEffects {');
const end = source.indexOf('export function getWorldInfoSettings()', start);
if (start < 0 || end < 0) throw new Error('Timed effect class boundary changed');

const bufferStart = source.indexOf('class WorldInfoBuffer {');
const bufferEnd = source.indexOf('/**\n * Represents a timed effects manager for World Info.', bufferStart);
if (bufferStart < 0 || bufferEnd < 0) throw new Error('World info buffer class boundary changed');

function createBufferClass() {
    const context = {
        MAX_SCAN_DEPTH: 1000,
        console: { log() {}, debug() {}, warn() {}, error() {} },
    };
    return runInNewContext(source.slice(bufferStart, bufferEnd) + '; WorldInfoBuffer', context);
}

function createEffects(metadata, {
    chat = ['a', 'b', 'c'],
    entry = { world: 'test', uid: 1, hash: 123, sticky: 6, cooldown: 4 },
    legacyDryRunArg = false,
} = {}) {
    const context = {
        chat_metadata: structuredClone(metadata),
        console: { log() {}, debug() {} },
    };
    const TimedEffects = runInNewContext(source.slice(start, end) + '; WorldInfoTimedEffects', context);
    const effects = new TimedEffects(chat, [entry], legacyDryRunArg);
    return { context, effects, entry };
}

describe('W-02 timed effects evaluation / commit split', () => {
    test('preview and formal evaluation read identical sticky state without writes', () => {
        const metadata = {
            timedWorldInfo: {
                sticky: { 'test.1': { hash: 123, start: 1, end: 7, protected: false } },
                cooldown: {},
            },
        };
        const original = structuredClone(metadata);

        const formal = createEffects(metadata, { legacyDryRunArg: false });
        formal.effects.checkTimedEffects();
        const preview = createEffects(metadata, { legacyDryRunArg: true });
        preview.effects.checkTimedEffects();

        expect(formal.effects.isEffectActive('sticky', formal.entry)).toBe(true);
        expect(preview.effects.isEffectActive('sticky', preview.entry)).toBe(true);
        expect(formal.context.chat_metadata).toEqual(original);
        expect(preview.context.chat_metadata).toEqual(original);
        expect(formal.effects.getPendingState()).toEqual(preview.effects.getPendingState());
    });

    test('constructing and evaluating missing metadata stays read-only', () => {
        const { context, effects } = createEffects({});
        effects.checkTimedEffects();
        expect(context.chat_metadata).toEqual({});
        expect(effects.getPendingState()).toEqual({ sticky: {}, cooldown: {} });
    });

    test('expired sticky transitions to cooldown only in pending state until commit', () => {
        const metadata = {
            timedWorldInfo: {
                sticky: { 'test.1': { hash: 123, start: 0, end: 2, protected: false } },
                cooldown: {},
            },
        };
        const { context, effects } = createEffects(metadata);
        effects.checkTimedEffects();

        expect(context.chat_metadata).toEqual(metadata);
        expect(effects.getPendingState().sticky).toEqual({});
        expect(effects.getPendingState().cooldown['test.1']).toEqual({
            hash: 123,
            start: 3,
            end: 7,
            protected: true,
        });

        effects.commit();
        expect(context.chat_metadata.timedWorldInfo).toEqual(effects.getPendingState());
    });

    test('new activation is planned first and committed explicitly', () => {
        const { context, effects, entry } = createEffects({});
        effects.checkTimedEffects();
        effects.setTimedEffects([entry]);

        expect(context.chat_metadata).toEqual({});
        expect(effects.getPendingState()).toEqual({
            sticky: {
                'test.1': { hash: 123, start: 3, end: 9, protected: false },
            },
            cooldown: {
                'test.1': { hash: 123, start: 3, end: 7, protected: false },
            },
        });

        effects.commit();
        expect(context.chat_metadata.timedWorldInfo).toEqual(effects.getPendingState());
    });
});


describe('W-02 external force activation evaluation / commit split', () => {
    test('preview snapshots do not consume a pending force activation', () => {
        const Buffer = createBufferClass();
        const entry = { world: 'test', uid: 1, content: 'first' };
        Buffer.stageExternalActivation(entry);

        const previewA = new Buffer(['hello'], {});
        const previewB = new Buffer(['hello'], {});

        expect(previewA.getExternallyActivated(entry)).toEqual(entry);
        expect(previewB.getExternallyActivated(entry)).toEqual(entry);
        expect(previewA.getExternalActivationCommitToken()).toEqual([
            { key: 'test.1', revision: 1 },
        ]);
        expect(previewB.getExternalActivationCommitToken()).toEqual([
            { key: 'test.1', revision: 1 },
        ]);
    });

    test('stale commit token cannot consume a newer activation for the same entry', () => {
        const Buffer = createBufferClass();
        const first = { world: 'test', uid: 1, content: 'first' };
        const second = { world: 'test', uid: 1, content: 'second' };

        Buffer.stageExternalActivation(first);
        const stalePreview = new Buffer(['hello'], {});
        const staleToken = stalePreview.getExternalActivationCommitToken();

        Buffer.stageExternalActivation(second);
        expect(Buffer.consumeExternalActivations(staleToken)).toBe(0);

        const currentPreview = new Buffer(['hello'], {});
        expect(currentPreview.getExternallyActivated(second)).toEqual(second);
        expect(currentPreview.getExternalActivationCommitToken()).toEqual([
            { key: 'test.1', revision: 2 },
        ]);
    });

    test('current commit token consumes the force activation exactly once', () => {
        const Buffer = createBufferClass();
        const entry = { world: 'test', uid: 1, content: 'first' };
        Buffer.stageExternalActivation(entry);
        const evaluation = new Buffer(['hello'], {});
        const token = evaluation.getExternalActivationCommitToken();

        expect(Buffer.consumeExternalActivations(token)).toBe(1);
        expect(Buffer.consumeExternalActivations(token)).toBe(0);
        expect(new Buffer(['hello'], {}).getExternallyActivated(entry)).toBeUndefined();
    });
});
