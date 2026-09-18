import { describe, expect, test } from '@jest/globals';
import {
    WorldInfoSelectionIndex,
    buildWorldInfoBundleVariant,
    buildWorldInfoEntryLookup,
    buildWorldInfoSelectionMigrationReport,
    classifyWorldInfoSelectionCompatibility,
    getWorldInfoBudgetTierScore,
    normalizeWorldInfoEntryRef,
    resolveWorldInfoDependencyBundle,
} from '../../public/scripts/atri-world-info-selection.js';

function entry(uid, overrides = {}) {
    return {
        world: 'book',
        uid,
        hash: uid,
        key: ['token-' + String(uid).padStart(4, '0')],
        content: 'content-' + uid,
        decorators: [],
        ...overrides,
    };
}

describe('WorldInfoSelectionIndex', () => {
    test('narrows static keyword candidates while retaining compatibility entries', () => {
        const entries = Array.from({ length: 250 }, (_, uid) => entry(uid, {
            key: ['k' + String(uid).padStart(4, '0') + '-unique'],
        }));
        entries.push(entry(500, { key: ['/dynamic.+regex/i'] }));
        entries.push(entry(501, { constant: true, key: [] }));

        const index = new WorldInfoSelectionIndex();
        const update = index.update(entries);
        expect(update.total).toBe(252);
        expect(update.fallback).toBe(2);

        const selected = index.select({
            getScanText: () => 'the k0042-unique marker is present',
        });

        expect(selected.diagnostics.degraded).toBe(false);
        expect(selected.entries.map(item => item.uid)).toEqual(expect.arrayContaining([42, 500, 501]));
        expect(selected.entries.length).toBeLessThan(entries.length);
    });

    test('reuses unchanged descriptors and rebuilds only changed descriptors', () => {
        const entries = Array.from({ length: 100 }, (_, uid) => entry(uid));
        const index = new WorldInfoSelectionIndex();
        expect(index.update(entries)).toMatchObject({ reused: 0, rebuilt: 100, removed: 0 });

        const same = entries.map(item => ({ ...item, key: [...item.key] }));
        expect(index.update(same)).toMatchObject({ reused: 100, rebuilt: 0, removed: 0 });

        same[12] = { ...same[12], hash: 'changed', key: ['replacement-key'] };
        same.pop();
        expect(index.update(same)).toMatchObject({ reused: 98, rebuilt: 1, removed: 1 });
    });

    test('degrades to a full candidate set if the scan text reader fails', () => {
        const entries = [entry(1), entry(2), entry(3)];
        const index = new WorldInfoSelectionIndex();
        index.update(entries);
        const selected = index.select({
            getScanText: () => {
                throw new Error('fixture failure');
            },
        });
        expect(selected.entries).toHaveLength(3);
        expect(selected.diagnostics).toMatchObject({
            degraded: true,
            fallbackReason: 'index_query_failed',
        });
    });
});

describe('explicit dependencies and selection metadata', () => {
    test('normalizes local and cross-book references', () => {
        expect(normalizeWorldInfoEntryRef('12', 'book')).toEqual({
            world: 'book', uid: 12, key: 'book.12', ref: 'book#12',
        });
        expect(normalizeWorldInfoEntryRef('other#9', 'book')).toEqual({
            world: 'other', uid: 9, key: 'other.9', ref: 'other#9',
        });
        expect(normalizeWorldInfoEntryRef('bad', 'book')).toBeNull();
    });

    test('expands required dependencies in dependency-first order', () => {
        const c = entry(3);
        const b = entry(2, { requiredEntries: ['3'] });
        const a = entry(1, { requiredEntries: ['2'] });
        const lookup = buildWorldInfoEntryLookup([a, b, c]);
        const result = resolveWorldInfoDependencyBundle(a, { entryLookup: lookup });
        expect(result.ok).toBe(true);
        expect(result.entryKeys).toEqual(['book.3', 'book.2', 'book.1']);
    });

    test('rejects missing, cyclic, ineligible and mutex-conflicting bundles atomically', () => {
        const missing = entry(1, { requiredEntries: ['99'] });
        expect(resolveWorldInfoDependencyBundle(missing, {
            entryLookup: buildWorldInfoEntryLookup([missing]),
        })).toMatchObject({ ok: false, reason: 'missing_dependency' });

        const a = entry(10, { requiredEntries: ['11'] });
        const b = entry(11, { requiredEntries: ['10'] });
        const lookup = buildWorldInfoEntryLookup([a, b]);
        expect(resolveWorldInfoDependencyBundle(a, { entryLookup: lookup }))
            .toMatchObject({ ok: false, reason: 'dependency_cycle' });

        const guarded = entry(20);
        const root = entry(21, { requiredEntries: ['20'] });
        expect(resolveWorldInfoDependencyBundle(root, {
            entryLookup: buildWorldInfoEntryLookup([root, guarded]),
            isEligible: candidate => candidate.uid !== 20,
        })).toMatchObject({ ok: false, reason: 'dependency_ineligible' });

        const mutexRoot = entry(30, { mutualExclusionGroup: 'castle-version' });
        expect(resolveWorldInfoDependencyBundle(mutexRoot, {
            entryLookup: buildWorldInfoEntryLookup([mutexRoot]),
            activeMutualExclusionGroups: new Map([['castle-version', 'book.31']]),
        })).toMatchObject({ ok: false, reason: 'mutual_exclusion_conflict' });
    });

    test('builds compact bundle variants without mutating source content', () => {
        const a = entry(1, { compactContent: 'short-a', budgetTier: 'critical' });
        const b = entry(2, { compactContent: '', budgetTier: 'optional' });
        const compact = buildWorldInfoBundleVariant([a, b], 'compact');
        expect(compact.map(item => item.content)).toEqual(['short-a', 'content-2']);
        expect(compact.map(item => item.compact)).toEqual([true, false]);
        expect(a.content).toBe('content-1');
        expect(getWorldInfoBudgetTierScore(a)).toBeGreaterThan(getWorldInfoBudgetTierScore(b));
    });
});

describe('W-05 compatibility classification', () => {
    test('classifies new metadata, safely-indexed legacy entries, and fallback entries', () => {
        const v1 = entry(1, { requiredEntries: ['2'] });
        const indexedLegacy = entry(2);
        const compatibility = entry(3, { key: ['/{{name}}/'] });

        expect(classifyWorldInfoSelectionCompatibility(v1).mode).toBe('atria_v1');
        expect(classifyWorldInfoSelectionCompatibility(indexedLegacy)).toMatchObject({
            mode: 'indexed_legacy',
            indexed: true,
        });
        expect(classifyWorldInfoSelectionCompatibility(compatibility)).toMatchObject({
            mode: 'compatibility',
            indexed: false,
        });

        expect(buildWorldInfoSelectionMigrationReport([v1, indexedLegacy, compatibility])).toMatchObject({
            version: 1,
            total: 3,
            atriaV1: 1,
            indexedLegacy: 1,
            compatibility: 1,
        });
    });
});
