import fs from 'node:fs';
import { createHash } from 'node:crypto';

import { describe, expect, test } from '@jest/globals';

import {
    createNativeId,
    inspectAtriaSaveContainer,
    preflightAtriaSaveContainer,
} from '../../src/native/index.js';
import {
    makeTempFsEngineHarness,
    makeTempSqliteEngineHarness,
} from '../storage/harness/contract-harness.js';
import {
    bindingFor,
    installFixture,
    knowledgeSnapshot,
    publishKnowledge,
    services,
} from './helpers/session-fixture.js';

const SAVE_HARNESSES = [
    ['FsEngine', makeTempFsEngineHarness],
    ['SqliteEngine', makeTempSqliteEngineHarness],
];

const digest = value => createHash('sha256').update(value).digest('hex');

async function installExactPackage(sourceHarness, targetHarness, sourceServices, targetServices, view) {
    const archive = await sourceServices.assetStore.readBlob(
        sourceHarness.handle,
        view.session.packageContentHash,
    );
    await targetServices.packageInstaller.install(targetHarness.handle, archive);
}

describe.each(SAVE_HARNESSES)('N8 Native Save System - %s', (_name, makeHarness) => {
    test('Auto / Quick / Manual save only immutable committed revisions', async () => {
        const h = await makeHarness();
        try {
            const f = await installFixture(h);
            const view = await f.core.create(h.handle, f.start);
            const saves = await Promise.all([
                f.saveSystem.autoSave(h.handle, view.session.sessionId),
                f.saveSystem.quickSave(h.handle, view.session.sessionId),
                f.saveSystem.manualSave(h.handle, view.session.sessionId, { displayName: 'Manual' }),
            ]);

            expect(saves.map(item => item.kind)).toEqual(['auto', 'quick', 'manual']);
            expect(saves.every(item => item.revisionId === view.revision.revisionId)).toBe(true);
            expect(saves[2].displayName).toBe('Manual');
            await expect(f.savePointRepo.create(h.handle, {
                ...saves[0],
                displayName: 'rewrite',
            })).rejects.toMatchObject({ code: 'native_immutable_conflict' });
        } finally {
            await h.cleanup();
        }
    });

    test('historical Save restore activates a derived Branch without overwriting the original route', async () => {
        const h = await makeHarness();
        try {
            const f = await installFixture(h);
            let view = await f.core.create(h.handle, f.start);
            const sessionId = view.session.sessionId;
            const originalBranchId = view.revision.branchId;

            view = await f.core.appendTimeline(h.handle, sessionId, {
                role: 'user',
                content: 'saved boundary',
            });
            const save = await f.saveSystem.quickSave(h.handle, sessionId, { displayName: 'Boundary' });
            const savedRevisionId = view.revision.revisionId;

            view = await f.core.appendTimeline(h.handle, sessionId, {
                role: 'assistant',
                actorId: view.entryPoint.primaryActorId ?? view.entryPoint.actorIds[0],
                content: 'original future',
            });
            const originalFutureRevisionId = view.revision.revisionId;

            const restored = await f.core.restoreSavePoint(h.handle, sessionId, save.saveId, {
                expectedRevisionId: originalFutureRevisionId,
            });
            expect(restored.revision.branchId).not.toBe(originalBranchId);
            expect(restored.timeline.at(-1).content).toBe('saved boundary');

            const derived = restored.graph.find(item => item.branchId === restored.revision.branchId);
            const original = restored.graph.find(item => item.branchId === originalBranchId);
            expect(derived.branch.parentBranchId).toBe(originalBranchId);
            expect(derived.forkRevisionId).toBe(savedRevisionId);
            expect(original.headRevisionId).toBe(originalFutureRevisionId);

            const oldFuture = await f.core.load(h.handle, sessionId, { revisionId: originalFutureRevisionId });
            expect(oldFuture.timeline.at(-1).content).toBe('original future');
        } finally {
            await h.cleanup();
        }
    });
});

describe('N8 .atriasave portability / Checkpoint B', () => {
    test('snapshot export/import round-trips authoritative state and embeds Library Knowledge as Session-owned', async () => {
        const source = await makeTempFsEngineHarness();
        const target = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(source);
            const library = knowledgeSnapshot('Pinned Library lore');
            const libraryBinding = bindingFor(library, 'library');
            const local = knowledgeSnapshot('Session local lore');
            const localBinding = bindingFor(local, 'session');
            await publishKnowledge(source, f.knowledgeRepo, library, libraryBinding);

            let view = await f.core.create(source.handle, {
                ...f.start,
                libraryBindingIds: [libraryBinding.knowledgeBindingId],
                sessionBindings: [localBinding],
                sessionKnowledge: [local],
            });
            const sessionId = view.session.sessionId;

            const bytes = Buffer.from('session attachment bytes');
            const assetId = createNativeId('asset');
            const ref = {
                assetId,
                contentHash: digest(bytes),
                size: bytes.length,
                mediaType: 'text/plain',
                logicalName: 'session-note.txt',
            };
            await f.assetStore.put(source.handle, ref, bytes);

            view = await f.core.applyRuntimeCommit(source.handle, sessionId, {
                commands: [{
                    type: 'append',
                    draft: {
                        role: 'user',
                        content: 'Checkpoint B turn',
                        metadata: { attachments: [{ assetId }] },
                    },
                }],
                statePatch: {
                    atri_game_world: {
                        schemaVersion: 1,
                        revisionId: view.revision.revisionId,
                        journal: [{ eventId: 'event_1', type: 'quest_open', sourceRefs: [{ messageId: view.timeline[0].messageId }] }],
                    },
                    atri_memory_graph: {
                        nodes: { harbor: { fact: 'gate open' } },
                        sourceRefs: [{ messageId: view.timeline[0].messageId }],
                    },
                    atri_orchestrator_anchors: {
                        active: { capsuleText: 'Keep harbor continuity' },
                    },
                    atri_context_derived: {
                        schemaVersion: 1,
                        narrative: [{
                            narrativeId: 'scene_save',
                            level: 'scene',
                            branchId: view.revision.branchId,
                            revisionId: view.revision.revisionId,
                            content: 'Harbor scene',
                            sourceRefs: [{ kind: 'timeline', messageId: view.timeline[0].messageId, sequence: 0 }],
                            childNarrativeIds: [],
                            coverage: { fromSequence: 0, toSequence: 0 },
                        }],
                        commitments: [{
                            commitmentId: 'commit_save',
                            branchId: view.revision.branchId,
                            revisionId: view.revision.revisionId,
                            status: 'open',
                            content: 'Return to harbor',
                            sourceRefs: [{ kind: 'timeline', messageId: view.timeline[0].messageId, sequence: 0 }],
                        }],
                        digests: [],
                        coverage: {
                            narrativeThroughSequence: 0,
                            commitmentsThroughSequence: 0,
                            memoryThroughSequence: 0,
                            digestThroughSequence: -1,
                        },
                    },
                    atri_context_plan_cache: { shouldNotTravel: true },
                },
            }, { expectedRevisionId: view.revision.revisionId });

            // Simulate process/service restart before the Save is created:
            // new repositories/core/service reconstruct authority exclusively
            // from Native storage.
            const restarted = services(source);
            const restartedView = await restarted.core.load(source.handle, sessionId);
            expect(restartedView.revision.revisionId).toBe(view.revision.revisionId);
            expect(restartedView.states.atri_context_derived).toEqual(view.states.atri_context_derived);

            const save = await restarted.saveSystem.manualSave(source.handle, sessionId, { displayName: 'Portable' });
            const savedView = await restarted.core.load(source.handle, sessionId, { revisionId: save.revisionId });

            await restarted.core.updateState(source.handle, sessionId, {
                atri_memory_graph: { nodes: { harbor: { fact: 'changed later' } } },
            });

            const exported = await restarted.saveSystem.exportSnapshot(source.handle, sessionId, save.saveId);
            const inspected = inspectAtriaSaveContainer(exported.archive);
            expect(inspected.save.scope).toBe('snapshot');
            expect(inspected.save.root.revisionId).toBe(save.revisionId);
            expect(inspected.save.closure.stateRecords.some(item => item.namespace === 'atri_context_plan_cache')).toBe(false);
            expect(inspected.save.closure.stateRecords.some(item => item.namespace === 'atri_context_derived')).toBe(true);
            expect(inspected.save.closure.stateRecords
                .find(item => item.namespace === 'atri_knowledge')
                .data.snapshots.some(item => item.kind === 'library')).toBe(true);

            const other = services(target);
            await installExactPackage(source, target, f, other, savedView);
            const imported = await other.saveSystem.importSave(target.handle, exported.archive);

            expect(imported.timeline).toEqual(savedView.timeline);
            expect(imported.states.atri_world_state).toEqual(savedView.states.atri_world_state);
            expect(imported.states.atri_memory_graph).toEqual(savedView.states.atri_memory_graph);
            expect(imported.states.atri_orchestrator_anchors).toEqual(savedView.states.atri_orchestrator_anchors);
            expect(imported.states.atri_context_derived).toEqual(savedView.states.atri_context_derived);
            expect(imported.states.atri_context_plan_cache).toBeUndefined();
            expect(imported.knowledge.bindings.find(
                item => item.knowledgeBindingId === libraryBinding.knowledgeBindingId,
            ).source.kind).toBe('session');
            expect(imported.knowledge.snapshots.some(
                item => item.kind === 'session'
                    && item.snapshot.revision.knowledgeRevisionId === library.revision.knowledgeRevisionId,
            )).toBe(true);
            expect(await other.knowledgeRepo.list(target.handle)).toEqual([]);

            const attachment = await other.assetStore.read(target.handle, assetId);
            expect(attachment.ref).toEqual(ref);
            expect(attachment.bytes).toEqual(bytes);
            expect(fs.readdirSync(target.chatsDir)).toEqual([]);
            expect(fs.readdirSync(target.chatsDir).some(name => name.endsWith('.jsonl'))).toBe(false);
            expect(fs.readdirSync(target.charsDir)).toEqual([]);
            const worldInfoFiles = fs.existsSync(target.dirs.worlds)
                ? fs.readdirSync(target.dirs.worlds)
                : [];
            expect(worldInfoFiles).toEqual([]);
        } finally {
            await source.cleanup();
            await target.cleanup();
        }
    });

    test('full-session export/import preserves Branch graph and Save history', async () => {
        const source = await makeTempFsEngineHarness();
        const target = await makeTempSqliteEngineHarness();
        try {
            const f = await installFixture(source);
            let view = await f.core.create(source.handle, f.start);
            const sessionId = view.session.sessionId;
            const first = await f.saveSystem.autoSave(source.handle, sessionId);
            view = await f.core.forkBranch(source.handle, sessionId, { displayName: 'Child' });
            view = await f.core.appendTimeline(source.handle, sessionId, {
                role: 'user',
                content: 'child route',
            });
            const second = await f.saveSystem.quickSave(source.handle, sessionId);

            const exported = await f.saveSystem.exportSession(source.handle, sessionId);
            const inspected = inspectAtriaSaveContainer(exported.archive);
            expect(inspected.save.scope).toBe('session');
            expect(inspected.save.closure.savePoints.map(item => item.saveId).sort())
                .toEqual([first.saveId, second.saveId].sort());
            expect(inspected.save.closure.branches).toHaveLength(2);

            const other = services(target);
            await installExactPackage(source, target, f, other, view);
            const imported = await other.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.revision.revisionId).toBe(view.revision.revisionId);
            expect(imported.graph.map(item => item.branchId).sort())
                .toEqual(view.graph.map(item => item.branchId).sort());
            expect((await other.savePointRepo.list(target.handle, sessionId)).map(item => item.saveId).sort())
                .toEqual([first.saveId, second.saveId].sort());
        } finally {
            await source.cleanup();
            await target.cleanup();
        }
    });

    test('password AEAD accepts the correct password and fails closed for wrong password or tampering', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const view = await f.core.create(h.handle, f.start);
            const save = await f.saveSystem.manualSave(h.handle, view.session.sessionId);
            const protectedSave = await f.saveSystem.exportSnapshot(
                h.handle,
                view.session.sessionId,
                save.saveId,
                { password: 'correct horse battery staple' },
            );

            expect(preflightAtriaSaveContainer(protectedSave.archive).protection.requiresPassword).toBe(true);
            expect(inspectAtriaSaveContainer(protectedSave.archive, {
                password: 'correct horse battery staple',
            }).save.root.saveId).toBe(save.saveId);
            expect(() => inspectAtriaSaveContainer(protectedSave.archive, { password: 'wrong' }))
                .toThrow(/authentication/i);
            expect(() => inspectAtriaSaveContainer(protectedSave.archive))
                .toThrow(/password/i);

            const tampered = Buffer.from(protectedSave.archive);
            tampered[tampered.length - 20] ^= 0xff;
            expect(() => inspectAtriaSaveContainer(tampered, {
                password: 'correct horse battery staple',
            })).toThrow(/authentication|integrity/i);
        } finally {
            await h.cleanup();
        }
    });

    test('missing exact Package dependency is structured and import mutates no Session state', async () => {
        const source = await makeTempFsEngineHarness();
        const target = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(source);
            const view = await f.core.create(source.handle, f.start);
            const save = await f.saveSystem.manualSave(source.handle, view.session.sessionId);
            const exported = await f.saveSystem.exportSnapshot(source.handle, view.session.sessionId, save.saveId);

            const other = services(target);
            const preflight = await other.saveSystem.preflightImport(target.handle, exported.archive);
            expect(preflight.dependency).toMatchObject({
                status: 'missing',
                code: 'native_save_package_missing',
            });
            await expect(other.saveSystem.importSave(target.handle, exported.archive))
                .rejects.toMatchObject({ code: 'native_save_package_missing' });
            expect(await other.sessionRepo.list(target.handle)).toEqual([]);
        } finally {
            await source.cleanup();
            await target.cleanup();
        }
    });

    test('embedded Knowledge promotion is explicit and does not silently rewrite imported Session binding policy', async () => {
        const source = await makeTempFsEngineHarness();
        const target = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(source);
            const library = knowledgeSnapshot('Promote me explicitly');
            const binding = bindingFor(library, 'library');
            await publishKnowledge(source, f.knowledgeRepo, library, binding);
            const view = await f.core.create(source.handle, {
                ...f.start,
                libraryBindingIds: [binding.knowledgeBindingId],
            });
            const save = await f.saveSystem.manualSave(source.handle, view.session.sessionId);
            const exported = await f.saveSystem.exportSnapshot(source.handle, view.session.sessionId, save.saveId);

            const other = services(target);
            await installExactPackage(source, target, f, other, view);
            const imported = await other.saveSystem.importSave(target.handle, exported.archive);
            expect(await other.knowledgeRepo.list(target.handle)).toEqual([]);
            expect(imported.knowledge.bindings.find(
                item => item.knowledgeBindingId === binding.knowledgeBindingId,
            ).source.kind).toBe('session');

            const promoted = await other.saveSystem.promoteEmbeddedKnowledge(
                target.handle,
                imported.session.sessionId,
                { knowledgeBindingId: binding.knowledgeBindingId },
            );
            expect(promoted.binding.source.kind).toBe('library');
            expect(await other.knowledgeRepo.get(
                target.handle,
                library.knowledgeBase.knowledgeBaseId,
            )).toBeTruthy();

            const unchanged = await other.core.load(target.handle, imported.session.sessionId);
            expect(unchanged.knowledge.bindings.find(
                item => item.knowledgeBindingId === binding.knowledgeBindingId,
            ).source.kind).toBe('session');
        } finally {
            await source.cleanup();
            await target.cleanup();
        }
    });
});
