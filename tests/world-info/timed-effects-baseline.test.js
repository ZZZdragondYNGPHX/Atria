import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, test, expect } from '@jest/globals';

// W-00 characterization of the current production class, not a replacement
// evaluator. W-02 must deliberately change these expectations when it splits
// snapshot evaluation from writes. Each run gets isolated synthetic metadata.
const source = readFileSync(new URL('../../public/scripts/world-info.js', import.meta.url), 'utf8');
const start = source.indexOf('class WorldInfoTimedEffects {');
const end = source.indexOf('export function getWorldInfoSettings()', start);
if (start < 0 || end < 0) throw new Error('Timed effect class boundary changed');
function evaluate(dryRun, metadata) {
    const context = { chat_metadata: structuredClone(metadata), console: { log() {}, debug() {} } };
    const TimedEffects = runInNewContext(source.slice(start, end) + '; WorldInfoTimedEffects', context);
    const entry = { world: 'test', uid: 1, hash: 123, sticky: 6 };
    const effects = new TimedEffects(['a', 'b', 'c'], [entry], dryRun);
    effects.checkTimedEffects();
    return { active: effects.isEffectActive('sticky', entry), metadata: context.chat_metadata };
}

describe('W-00 timed effects characterization (W-02 still open)', () => {
    test('formal evaluation recognizes sticky; dry run currently skips it', () => {
        const metadata = { timedWorldInfo: { sticky: { 'test.1': { hash: 123, start: 1, end: 7, protected: false } }, cooldown: {} } };
        const original = structuredClone(metadata);
        expect(evaluate(false, metadata).active).toBe(true);
        expect(evaluate(true, metadata).active).toBe(false);
        expect(metadata).toEqual(original);
    });
    test('even dry-run construction currently initializes metadata', () => {
        expect(evaluate(true, {}).metadata).toEqual({ timedWorldInfo: { sticky: {}, cooldown: {} } });
    });
});
