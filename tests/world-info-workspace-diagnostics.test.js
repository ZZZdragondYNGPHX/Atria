import { describe, expect, test } from '@jest/globals';

import {
    filterWorldInfoWorkspaceEntries,
    getWorldInfoEntryIssues,
    hasSpecialWorldInfoBehavior,
} from '../public/scripts/world-info/diagnostics.js';

function makeEntry(overrides = {}) {
    return {
        uid: 1,
        world: 'book',
        key: ['harbor'],
        keysecondary: [],
        comment: 'Harbor',
        content: 'Harbor lore',
        constant: false,
        vectorized: false,
        disable: false,
        stateConditions: [],
        stateEvents: [],
        requiredEntries: [],
        relatedEntries: [],
        budgetTier: 'normal',
        ...overrides,
    };
}

describe('World Info workspace diagnostics', () => {
    test('reports deterministic authoring issues without mutating entries', () => {
        const entry = makeEntry({
            key: [],
            content: '',
            requiredEntries: ['1', 'missing'],
            stateConditions: [{ providerId: 'mvu', path: [], operator: 'eq' }],
            stateEvents: [{ providerId: 'mvu', path: ['scene'], fromPresent: false, toPresent: false }],
            compactContent: 'compact',
            automationId: 'duplicate',
        });
        const peer = makeEntry({ uid: 2, automationId: 'duplicate' });
        const before = structuredClone(entry);

        const issues = getWorldInfoEntryIssues(entry, {
            worldName: 'book',
            entries: [entry, peer],
        });
        const codes = new Set(issues.map(issue => issue.code));

        expect(codes).toEqual(new Set([
            'empty-content',
            'missing-primary-keywords',
            'self-reference',
            'unresolved-relationship',
            'incomplete-state-condition',
            'incomplete-state-event',
            'duplicate-automation-id',
        ]));
        expect(entry).toEqual(before);
    });

    test('current-book numeric dependency resolves against a loaded entry', () => {
        const root = makeEntry({ uid: 1, requiredEntries: ['2'] });
        const peer = makeEntry({ uid: 2, comment: 'Peer' });
        const issues = getWorldInfoEntryIssues(root, {
            worldName: 'book',
            entries: [root, peer],
        });

        expect(issues.some(issue => issue.code === 'unresolved-relationship')).toBe(false);
        expect(issues.some(issue => issue.code === 'self-reference')).toBe(false);
    });

    test('cross-book reference remains syntactically valid even when not loaded', () => {
        const entry = makeEntry({ requiredEntries: ['Other Book#4'] });
        const issues = getWorldInfoEntryIssues(entry, {
            worldName: 'book',
            entries: [entry],
        });

        expect(issues.some(issue => issue.code === 'invalid-relationship-target')).toBe(false);
        expect(issues.some(issue => issue.code === 'unresolved-relationship')).toBe(true);
    });

    test('compact content without a relationship is reported', () => {
        const entry = makeEntry({ compactContent: 'small body' });
        expect(getWorldInfoEntryIssues(entry, { worldName: 'book', entries: [entry] }))
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ code: 'orphan-compact-content' }),
            ]));
    });

    test('special filter recognizes state, dependency, timing, and vector behaviors', () => {
        expect(hasSpecialWorldInfoBehavior(makeEntry())).toBe(false);
        expect(hasSpecialWorldInfoBehavior(makeEntry({ vectorized: true }))).toBe(true);
        expect(hasSpecialWorldInfoBehavior(makeEntry({ stateConditions: [{ providerId: 'mvu', path: ['x'], operator: 'eq' }] }))).toBe(true);
        expect(hasSpecialWorldInfoBehavior(makeEntry({ requiredEntries: ['2'] }))).toBe(true);
        expect(hasSpecialWorldInfoBehavior(makeEntry({ sticky: 2 }))).toBe(true);
    });

    test('workspace quick filters keep enabled, special, and issue semantics separate', () => {
        const clean = makeEntry({ uid: 1 });
        const disabled = makeEntry({ uid: 2, disable: true });
        const special = makeEntry({ uid: 3, constant: true });
        const issue = makeEntry({ uid: 4, content: '' });
        const entries = [clean, disabled, special, issue];

        expect(filterWorldInfoWorkspaceEntries(entries, 'enabled', { worldName: 'book' }).map(x => x.uid))
            .toEqual([1, 3, 4]);
        expect(filterWorldInfoWorkspaceEntries(entries, 'special', { worldName: 'book' }).map(x => x.uid))
            .toEqual([3]);
        expect(filterWorldInfoWorkspaceEntries(entries, 'issues', { worldName: 'book' }).map(x => x.uid))
            .toContain(4);
        expect(filterWorldInfoWorkspaceEntries(entries, 'all', { worldName: 'book' }))
            .toBe(entries);
    });
});
