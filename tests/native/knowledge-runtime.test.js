import { describe, expect, test } from '@jest/globals';
import {
    buildNativeKnowledgeStateProviders,
    compileNativeKnowledgeEntries,
    compileNativeKnowledgePlan,
} from '../../public/scripts/native/knowledge-runtime.js';
import { createNativeId } from '../../src/native/index.js';
import { bindingFor, knowledgeSnapshot, sessionFixture } from './helpers/session-fixture.js';

function snapshotFromFixture(fixture = sessionFixture()) {
    return {
        manifest: fixture.manifest,
        knowledge: { schemaVersion: 1, bindings: [fixture.binding], snapshots: [] },
        states: {
            atri_game_world: {
                schemaVersion: 1,
                state: { hp: 8, location: 'harbor', quest: { stage: 2 } },
                journal: {
                    version: 1,
                    nextSeq: 2,
                    events: [{
                        id: 'event:1',
                        seq: 1,
                        type: 'arrive',
                        payload: { location: 'harbor' },
                        branchPath: [],
                        branchId: 'root',
                    }],
                    snapshots: [],
                },
            },
        },
        revision: {
            revisionId: createNativeId('revision'),
            branchId: createNativeId('branch'),
        },
    };
}

function replacePackageEntry(snapshot, entry) {
    const source = snapshot.manifest.knowledge[0];
    source.entries = [entry];
    source.revision.entryIds = [entry.knowledgeEntryId];
    return entry;
}

function addPackageEntry(snapshot, entry) {
    const source = snapshot.manifest.knowledge[0];
    source.entries.push(entry);
    source.revision.entryIds.push(entry.knowledgeEntryId);
    return entry;
}

function addExternal(snapshot, kind, knowledge, binding) {
    snapshot.knowledge.bindings.push(binding);
    snapshot.knowledge.snapshots.push({ kind, snapshot: knowledge });
}

describe('N6 Native KnowledgeCompiler / KnowledgePlan', () => {
    test('Package canonical Knowledge reaches the narrator World Info adapter with stable identity', () => {
        const snapshot = snapshotFromFixture();
        const { plan, entries } = compileNativeKnowledgeEntries(snapshot, { target: 'narrator' });

        expect(plan.included).toHaveLength(1);
        expect(plan.included[0]).toMatchObject({
            authority: 'package_canonical',
            knowledgeBindingId: snapshot.manifest.knowledgeBindings[0].knowledgeBindingId,
            knowledgeEntryId: snapshot.manifest.knowledge[0].entries[0].knowledgeEntryId,
        });
        expect(entries).toHaveLength(1);
        expect(entries[0].atri_native).toMatchObject({
            identity: plan.included[0].identity,
            knowledgeBaseId: plan.included[0].knowledgeBaseId,
            knowledgeRevisionId: plan.included[0].knowledgeRevisionId,
            knowledgeEntryId: plan.included[0].knowledgeEntryId,
            authority: 'package_canonical',
        });
    });

    test('current Session State deterministically suppresses stale applicable canonical Knowledge', () => {
        const snapshot = snapshotFromFixture();
        const entry = structuredClone(snapshot.manifest.knowledge[0].entries[0]);
        entry.content = 'The party is still at the castle.';
        entry.applicability = {
            stateConditions: [{
                providerId: 'atri_game_world',
                path: ['location'],
                operator: 'eq',
                value: 'castle',
            }],
        };
        replacePackageEntry(snapshot, entry);

        const plan = compileNativeKnowledgePlan(snapshot, { target: 'narrator' });
        expect(plan.included).toHaveLength(0);
        expect(plan.rejected).toEqual(expect.arrayContaining([
            expect.objectContaining({
                knowledgeEntryId: entry.knowledgeEntryId,
                reason: 'current_state_conflict',
                authority: 'package_canonical',
            }),
        ]));
        expect(plan.rejected[0].stateEvidence).toMatchObject({ status: 'false' });
    });

    test('Library augment cannot silently override Package canon inside one exclusive group', () => {
        const snapshot = snapshotFromFixture();
        const canonical = structuredClone(snapshot.manifest.knowledge[0].entries[0]);
        canonical.content = 'Canonical harbor rule';
        canonical.relations = { exclusiveGroup: 'world-rule' };
        replacePackageEntry(snapshot, canonical);

        const library = knowledgeSnapshot('Library replacement attempt');
        library.entries[0].relations = { exclusiveGroup: 'world-rule' };
        const libraryBinding = bindingFor(library, 'library');
        addExternal(snapshot, 'library', library, libraryBinding);

        const plan = compileNativeKnowledgePlan(snapshot, { target: 'narrator' });
        expect(plan.included.map(item => item.content ?? item.entry.content)).toEqual(['Canonical harbor rule']);
        expect(plan.rejected).toEqual(expect.arrayContaining([
            expect.objectContaining({
                knowledgeBindingId: libraryBinding.knowledgeBindingId,
                authority: 'library_augment',
                reason: 'exclusive_group_lower_authority',
            }),
        ]));
    });

    test('explicit Knowledge override beats ordinary Knowledge but never bypasses current-state applicability', () => {
        const snapshot = snapshotFromFixture();
        const canonical = structuredClone(snapshot.manifest.knowledge[0].entries[0]);
        canonical.relations = { exclusiveGroup: 'weather' };
        canonical.content = 'Package weather';
        replacePackageEntry(snapshot, canonical);

        const sessionKnowledge = knowledgeSnapshot('Explicit session weather');
        sessionKnowledge.entries[0].relations = { exclusiveGroup: 'weather' };
        const override = { ...bindingFor(sessionKnowledge, 'session'), mode: 'override' };
        addExternal(snapshot, 'session', sessionKnowledge, override);

        let plan = compileNativeKnowledgePlan(snapshot, { target: 'narrator' });
        expect(plan.included).toHaveLength(1);
        expect(plan.included[0]).toMatchObject({
            knowledgeBindingId: override.knowledgeBindingId,
            authority: 'knowledge_override',
        });
        expect(plan.rejected).toEqual(expect.arrayContaining([
            expect.objectContaining({
                authority: 'package_canonical',
                reason: 'exclusive_group_lower_authority',
            }),
        ]));

        sessionKnowledge.entries[0].applicability = {
            stateConditions: [{
                providerId: 'atri_game_world',
                path: ['location'],
                operator: 'eq',
                value: 'castle',
            }],
        };
        plan = compileNativeKnowledgePlan(snapshot, { target: 'narrator' });
        expect(plan.included).toHaveLength(1);
        expect(plan.included[0].authority).toBe('package_canonical');
        expect(plan.rejected).toEqual(expect.arrayContaining([
            expect.objectContaining({
                knowledgeBindingId: override.knowledgeBindingId,
                reason: 'current_state_conflict',
            }),
        ]));
    });

    test('old Memory evidence is diagnostic history and cannot override current Session State', () => {
        const snapshot = snapshotFromFixture();
        const plan = compileNativeKnowledgePlan(snapshot, {
            target: 'narrator',
            memoryEvidence: [{
                memoryId: 'memory-old-location',
                content: 'Earlier the party was at the castle.',
                stateClaim: {
                    providerId: 'atri_game_world',
                    path: ['location'],
                    value: 'castle',
                },
            }],
        });

        expect(plan.authorityEvidence.currentState).toEqual(expect.arrayContaining([
            expect.objectContaining({ providerId: 'atri_game_world', status: 'ready' }),
        ]));
        expect(plan.authorityEvidence.memory.included).toHaveLength(0);
        expect(plan.authorityEvidence.memory.rejected).toEqual([
            expect.objectContaining({
                memoryId: 'memory-old-location',
                authority: 'memory_history_evidence',
                reason: 'memory_conflicts_current_state',
                current: 'harbor',
                claimed: 'castle',
            }),
        ]);
    });

    test('equal entry bodies with different Knowledge identities stay distinct through prompt adaptation', () => {
        const snapshot = snapshotFromFixture();
        const first = snapshot.manifest.knowledge[0].entries[0];
        const second = {
            knowledgeEntryId: createNativeId('knowledgeEntry'),
            content: first.content,
            metadata: {},
        };
        addPackageEntry(snapshot, second);

        const { plan, entries } = compileNativeKnowledgeEntries(snapshot, { target: 'narrator' });
        expect(plan.included).toHaveLength(2);
        expect(new Set(plan.included.map(item => item.identity)).size).toBe(2);
        expect(entries[0].content).toBe(entries[1].content);
        expect(entries[0].atri_native.identity).not.toBe(entries[1].atri_native.identity);
        expect(entries[0].atri_native.knowledgeEntryId).not.toBe(entries[1].atri_native.knowledgeEntryId);
    });

    test('visibility produces different Narrator, Actor and Agent KnowledgePlan views', () => {
        const snapshot = snapshotFromFixture();
        const source = snapshot.manifest.knowledge[0];
        source.entries = [
            {
                knowledgeEntryId: createNativeId('knowledgeEntry'),
                content: 'Narrator only',
                delivery: { visibility: ['narrator'] },
                metadata: {},
            },
            {
                knowledgeEntryId: createNativeId('knowledgeEntry'),
                content: 'Actor only',
                delivery: { visibility: ['actor'] },
                metadata: {},
            },
            {
                knowledgeEntryId: createNativeId('knowledgeEntry'),
                content: 'Agent only',
                delivery: { visibility: ['agent'] },
                metadata: {},
            },
        ];
        source.revision.entryIds = source.entries.map(entry => entry.knowledgeEntryId);

        const narrator = compileNativeKnowledgePlan(snapshot, { target: 'narrator' });
        const actor = compileNativeKnowledgePlan(snapshot, { target: { kind: 'actor', id: 'actor-a' } });
        const agent = compileNativeKnowledgePlan(snapshot, { target: { kind: 'agent', id: 'agent-a' } });

        expect(narrator.included.map(item => item.entry.content)).toEqual(['Narrator only']);
        expect(actor.included.map(item => item.entry.content)).toEqual(['Actor only']);
        expect(agent.included.map(item => item.entry.content)).toEqual(['Agent only']);
        expect(narrator.rejected.filter(item => item.reason === 'visibility_mismatch')).toHaveLength(2);
    });

    test('required dependencies map by stable identity and related/exclusive metadata reaches the existing WI selector', () => {
        const snapshot = snapshotFromFixture();
        const dependency = snapshot.manifest.knowledge[0].entries[0];
        dependency.content = 'Required basis';
        const root = {
            knowledgeEntryId: createNativeId('knowledgeEntry'),
            content: 'Dependent rule',
            relations: {
                requiredEntryIds: [dependency.knowledgeEntryId],
                relatedEntryIds: [dependency.knowledgeEntryId],
                exclusiveGroup: 'rule-group',
            },
            metadata: {},
        };
        addPackageEntry(snapshot, root);

        const { entries } = compileNativeKnowledgeEntries(snapshot, { target: 'narrator' });
        const adaptedRoot = entries.find(entry => entry.atri_native.knowledgeEntryId === root.knowledgeEntryId);
        expect(adaptedRoot.requiredEntries).toEqual([
            snapshot.manifest.knowledgeBindings[0].knowledgeBindingId + '#0',
        ]);
        expect(adaptedRoot.relatedEntries).toEqual([
            snapshot.manifest.knowledgeBindings[0].knowledgeBindingId + '#0',
        ]);
        expect(adaptedRoot.mutualExclusionGroup).toBe('rule-group');
    });

    test('Native providers expose current state and committed Event Journal without floor/swipe identity', () => {
        const snapshot = snapshotFromFixture();
        const providers = buildNativeKnowledgeStateProviders(snapshot);
        expect(providers.find(item => item.providerId === 'atri_game_world')).toMatchObject({
            status: 'ready',
            revision: snapshot.revision.revisionId,
            contract: 'Native SessionState/revision',
        });
        const eventProvider = providers.find(item => item.providerId === 'atri_event_journal');
        expect(eventProvider).toMatchObject({
            status: 'ready',
            revision: snapshot.revision.revisionId,
            contract: 'Native committed Event Journal',
        });
        expect(eventProvider.fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: ['latestEvent', 'type'], value: 'arrive' }),
        ]));
        expect(JSON.stringify(providers)).not.toMatch(/swipeId|playableFloor/);
    });
});
