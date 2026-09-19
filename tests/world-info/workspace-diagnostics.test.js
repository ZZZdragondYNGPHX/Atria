import { describe, expect, test } from '@jest/globals';

import {
    filterWorldInfoWorkspaceEntries,
    getWorldInfoEntryIssues,
    hasSpecialWorldInfoBehavior,
} from '../../public/scripts/world-info/diagnostics.js';

function entry(uid, overrides = {}) {
    return {
        world: 'book',
        uid,
        comment: `entry-${uid}`,
        content: `content-${uid}`,
        key: [`key-${uid}`],
        keysecondary: [],
        constant: false,
        vectorized: false,
        stateConditions: [],
        stateEvents: [],
        requiredEntries: [],
        relatedEntries: [],
        ...overrides,
    };
}

describe('World Info workspace deterministic diagnostics', () => {
    test('flags empty content and keyword-driven entries without primary keys', () => {
        const target = entry(1, { content: '', key: [] });
        const issues = getWorldInfoEntryIssues(target, { worldName: 'book', entries: [target] });
        expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
            'empty-content',
            'missing-primary-keywords',
        ]));
    });

    test('constant/vector/state-gated entries do not get the missing-primary-keywords warning', () => {
        const variants = [
            entry(1, { key: [], constant: true }),
            entry(2, { key: [], vectorized: true }),
            entry(3, {
                key: [],
                stateConditions: [{ providerId: 'mvu', path: ['scene'], operator: 'exists' }],
            }),
        ];
        for (const target of variants) {
            const issues = getWorldInfoEntryIssues(target, { worldName: 'book', entries: variants });
            expect(issues.some(issue => issue.code === 'missing-primary-keywords')).toBe(false);
        }
    });

    test('flags self-reference and unresolved same-book dependency', () => {
        const target = entry(1, { requiredEntries: ['1', '99'] });
        const issues = getWorldInfoEntryIssues(target, { worldName: 'book', entries: [target] });
        expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
            'self-reference',
            'unresolved-relationship',
        ]));
    });

    test('does not claim a cross-book dependency is unresolved without loading that book', () => {
        const target = entry(1, { requiredEntries: ['Other Book#4'] });
        const issues = getWorldInfoEntryIssues(target, { worldName: 'book', entries: [target] });
        expect(issues.some(issue => issue.code === 'unresolved-relationship')).toBe(false);
        expect(issues.some(issue => issue.code === 'invalid-relationship-target')).toBe(false);
    });

    test('flags incomplete state conditions and change events', () => {
        const target = entry(1, {
            stateConditions: [{ providerId: 'mvu', path: [], operator: 'eq', value: 1 }],
            stateEvents: [{ providerId: 'mvu', path: ['scene'] }],
        });
        const issues = getWorldInfoEntryIssues(target, { worldName: 'book', entries: [target] });
        expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
            'incomplete-state-condition',
            'incomplete-state-event',
        ]));
    });

    test('flags duplicate automation ids and orphan compact content', () => {
        const first = entry(1, { automationId: 'scene-open', compactContent: 'compact' });
        const second = entry(2, { automationId: 'scene-open' });
        const issues = getWorldInfoEntryIssues(first, { worldName: 'book', entries: [first, second] });
        expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
            'duplicate-automation-id',
            'orphan-compact-content',
        ]));
    });

    test('special and issues quick filters are conservative', () => {
        const normal = entry(1);
        const special = entry(2, { stateEvents: [{ providerId: 'mvu', path: ['scene'], to: 'night' }] });
        const broken = entry(3, { content: '' });
        const entries = [normal, special, broken];

        expect(filterWorldInfoWorkspaceEntries(entries, 'special', { worldName: 'book' }))
            .toEqual([special]);
        expect(filterWorldInfoWorkspaceEntries(entries, 'issues', { worldName: 'book' }))
            .toEqual([broken]);
        expect(hasSpecialWorldInfoBehavior(normal)).toBe(false);
        expect(hasSpecialWorldInfoBehavior(special)).toBe(true);
    });
});
