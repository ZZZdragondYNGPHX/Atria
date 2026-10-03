import { lifetimePolicyFixture } from './helpers/lifetime-policy.js';
import { initialLifetimes } from '../../src/native/lifetime-authority.js';
import { describe, expect, test } from '@jest/globals';
import { initialHistory, historyIndex } from '../../public/shared/native-history-runtime.js';
import { readChronicle, reviewInterval, formatCivil, readWorldView } from '../../public/shared/native-chronicle-host.js';
import { instant } from '../../public/shared/native-lifetime-runtime.js';
import { fixedHostTarget } from '../../public/shared/native-frontend-host.js';
import { readFixedHost } from '../../src/native/frontend/host-services.js';
import { bridgeValue } from '../../public/shared/native-frontend-bridge.js';
function fixture() {
    const history = initialHistory();
    for (let i = 1; i <= 30; i++) history.facts['history.' + i] = { id: 'history.' + i, kind: 'fact', key: 'person.' + i, label: 'Public record ' + i, tick: 0, year: 1, public: i !== 2, value: i === 2 ? 'SECRET_POISON' : 'Known name', refs: ['family:rook'], provenance: { source: 'public.person.name' } };
    history.index = historyIndex(history);
    return { session: { sessionId: 's' }, revision: { revisionId: 'r1', branchId: 'b1' }, manifest: { runtime: { experienceContract: { lifecycleRuntime: { history: { clockId: 'world' } } } } }, states: { atri_lifecycle: { clocks: { world: 0 }, history } } };
}
describe('closed player Chronicle and calendar Host adapters', () => {
    test('public bounded pages retain exact sources and revision-bound cursors', () => {
        const base = fixture(), before = JSON.stringify(base), result = readChronicle(base, { kind: 'fact' });
        expect(result.rows).toHaveLength(12); expect(result.rows[0].date).toBe('Year 1, 01-01, 00:00');
        expect(result.rows[0].source).toContain('public.person.name');
        expect(JSON.stringify(result)).not.toContain('SECRET_POISON');
        expect(readChronicle(base, { id: 'history.2' }).rows).toEqual([]);
        expect(readChronicle(base, { facet: 'family', value: 'rook' }).rows).toHaveLength(12);
        const next = readChronicle(base, { kind: 'fact', cursor: result.next });
        expect(next.rows[0].id).not.toBe(result.rows[0].id);
        expect(() => readChronicle(base, { kind: 'event', cursor: result.next })).toThrow('Stale');
        expect(JSON.stringify(base)).toBe(before);
        base.revision.revisionId = 'r2'; expect(() => readChronicle(base, { kind: 'fact', cursor: result.next })).toThrow('Stale');
    });
    test('exact artifacts retain marks and explicitly bounded provenance', () => {
        const base = fixture(), h = base.states.atri_lifecycle.history;
        h.artifacts['history.31'] = { id: 'history.31', kind: 'artifact', tick: 0, year: 1, public: true, title: 'First letter', content: 'An attributed account', status: 'destroyed', parentId: 'history.1', sourceId: 'history.1', refs: [], provenance: Array.from({ length: 10 }, (_, i) => ({ eventId: 'history.' + i, tick: i, status: 'held' })) };
        h.memory['history.31'] = { marked: true, journaled: true }; h.index = historyIndex(h);
        const row = readChronicle(base, { id: 'history.31' }).rows[0];
        expect(row.marked).toBe(true); expect(row.clarity).toBe('clear'); expect(row.custody).toContain('destroyed');
        expect(row.custody).toContain('provenance Links: 10'); expect(row.custody).toContain('displayed Latest Links: 8');
        expect(row.source).toContain('source Id: history.1');
    });
    test('civil presets clamp calendar month end and leap anniversaries, not 365-day arithmetic', () => {
        const base = fixture(), set = date => { base.states.atri_lifecycle.clocks.world = instant(date); };
        set({ year: 4, month: 2, day: 29 });
        expect(reviewInterval(base, { quantity: 1, unit: 'years' }).targetText).toBe('Year 5, 02-28, 00:00');
        set({ year: 4, month: 1, day: 31 });
        expect(reviewInterval(base, { quantity: 1, unit: 'months' }).targetText).toBe('Year 4, 02-29, 00:00');
        expect(reviewInterval(base, { quantity: 200, unit: 'years' }).targetText).toBe('Year 204, 01-31, 00:00');
        expect(formatCivil(-1)).toBe('Year 0, 12-31, 23:59');
        for (const input of [{ quantity: 0, unit: 'days' }, { quantity: Number.MAX_SAFE_INTEGER, unit: 'years' }, { quantity: 1, unit: 'weeks' }]) expect(() => reviewInterval(base, input)).toThrow();
    });
    test('only registered typed read targets, executing against the bridge snapshot', async () => {
        for (const [service, method, input] of [['host.history', 'query', { kind: 'fact' }], ['host.chronology', 'interval', { quantity: 1, unit: 'years' }]]) {
            const target = { service, method }, spec = fixedHostTarget(target);
            expect(spec.kind).toBe('read'); expect(spec.local).toBe(false);
            const result = await readFixedHost(null, null, null, fixture(), { target }, bridgeValue(input, spec.inputSchema));
            expect(() => bridgeValue(result, spec.outputSchema)).not.toThrow();
            expect(() => bridgeValue({ ...input, private: true }, spec.inputSchema)).toThrow();
        }
        expect(() => fixedHostTarget({ service: 'host.history', method: 'raw' })).toThrow();
    });
});

test('public person view excludes secret relationships and freezes deceased age', () => {
    const base = fixture(), policy = lifetimePolicyFixture();
    base.manifest.runtime.experienceContract.lifecycleRuntime.lifetimes = policy;
    const state = initialLifetimes(policy); base.states.atri_lifecycle.lifetimes = state;
    state.bonds.private = { id: 'private', visibility: 'secret', refs: ['actor:hero'], secret: 'BOND_POISON' };
    state.bonds.public = { id: 'public', visibility: 'public', refs: ['actor:hero'], kind: 'marriage' };
    const page = readWorldView(base, { view: 'people', id: 'hero' });
    expect(page.rows[0].text).toContain('marriage'); expect(JSON.stringify(page)).not.toContain('BOND_POISON');
    expect(readWorldView(base, { view: 'people', id: 'missing' }).rows).toEqual([]);
    expect(() => bridgeValue(page, fixedHostTarget({ service: 'host.world', method: 'view' }).outputSchema)).not.toThrow();
    state.people.partner.status = { kind: 'dead', tick: 0 }; base.states.atri_lifecycle.clocks.world = instant({ year: 50, month: 1, day: 1 });
    expect(readWorldView(base, { view: 'people', id: 'partner' }).rows[0].text).toContain('chronological Age: 26');
});
