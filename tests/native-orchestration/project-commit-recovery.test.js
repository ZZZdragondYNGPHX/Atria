import { projectCommitFixture } from './helpers/project-commit-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readEffect, readApproval } from '../../src/native/orchestration/effect-contracts.js';
import { readReadyEffectResume } from '../../src/native/orchestration/effect-recovery-contracts.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { runGuard, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import express from 'express';
import request from 'supertest';
import storage from 'node-persist';
import { toKey } from '../../src/users.js';
import { StudioService } from '../../src/native/authoring/studio-service.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const refs = prepared => ({ runId: prepared.runId, effectId: prepared.effectId });
const taskOf = f => f.agent._repository.get(f.h.handle, f.projectId, f.taskId);
const rootOf = (f, prepared) => f.authority.execution.runs.get(f.h.handle, prepared.runId);
const effectOf = (f, root, prepared) => f.authority.engine.withTransaction(f.h.handle, async tx => (await readEffect(tx, f.h.handle, root, prepared.effectId)).doc);
const appFor = f => {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle } }; next(); });
    app.use(createNativeStudioRouter(() => f, undefined, () => new NativeGenerationHost({ projectCommitAuthority: f.authority })));
    return app;
};
const pathFor = f => '/projects/' + f.projectId + '/agent/tasks/' + f.taskId + '/commit/';

describe.each(CONTRACT_HARNESSES)('$name original Project Commit cold recovery', ({ make }) => {
    test('a never-claimed ready intent resumes with fresh Source authorization and fresh isolated approval, preserving its Effect and paid work', async () => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare(); await f.approve(prepared);
            const before = await rootOf(f, prepared), task = await taskOf(f), intent = await effectOf(f, before, prepared);
            await f.cold(); await expect(f.dispatch(prepared)).rejects.toThrow();
            const observationOptions = { engine: f.authority.engine, projectAgent: f.agent, studio: f.studio };
            const metadata = { runId: prepared.runId, cursor: null, limit: 100 };
            expect((await new RunObservationService(observationOptions).observe(f.h.handle, metadata)).payload.controls.resume).toBe(false);
            const observer = new RunObservationService({ ...observationOptions, resumeEffect: (handle, input) => f.authority.resume(handle, input) });
            expect((await observer.observe(f.h.handle, metadata)).payload.controls).toMatchObject({ recover: true, resume: true });
            const app = appFor(f), path = pathFor(f);
            const invalid = await request(app).post(path + 'resume').send({ ...refs(prepared), approved: true });
            expect(invalid.status).toBe(400); expect(invalid.headers['cache-control']).toBe('no-store');
            const wrongPath = await request(app).post(path.replace(f.projectId, createNativeId('project')) + 'resume').send(refs(prepared));
            expect(wrongPath.status).toBe(409);
            const response = await request(app).post(path + 'resume').send(refs(prepared));
            expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
            const resumed = response.body;
            expect(resumed).toMatchObject({ ...refs(prepared), status: 'waiting_approval' }); expect(resumed.approvalId).not.toBe(prepared.approvalId);
            const root = await rootOf(f, prepared), fresh = await effectOf(f, root, prepared);
            const projected = await observer.observe(f.h.handle, metadata);
            expect(projected.payload.controls.resume).toBe(false); expect(projected.payload.events.some(event => event.type === 'effect_resumed')).toBe(true);
            expect(root.epoch).toBe(before.epoch + 1); expect(root.hostBootId).not.toBe(before.hostBootId);
            expect(root.progress).toEqual({ ...before.progress, steps: before.progress.steps + 2 });
            expect(root.budgetAuthorityRef).toEqual(before.budgetAuthorityRef); expect(root.attemptRefs).toEqual(before.attemptRefs);
            expect(fresh).toEqual({ ...intent, epoch: root.epoch, hostBootId: root.hostBootId, hostGeneration: root.hostGeneration, approvalRef: resumed.approvalId });
            expect(await taskOf(f)).toEqual(task);
            await f.authority.engine.withTransaction(f.h.handle, async tx => {
                expect((await readApproval(tx, f.h.handle, root, prepared.approvalId)).doc.status).toBe('invalidated');
                expect((await readReadyEffectResume(tx, f.h.handle, root, fresh)).previousEpoch).toBe(before.epoch);
            });
            await expect(f.dispatch(prepared)).rejects.toMatchObject({ code: 'native_orchestration_approval_invalid' });
            expect(await f.authority.resume(f.h.handle, refs(prepared))).toEqual(resumed);
            await f.approve(resumed);
            const dispatched = await request(app).post(path + 'dispatch').send(refs(resumed)); expect(dispatched.status).toBe(200);
            const completed = dispatched.body;
            expect(completed.status).toBe('completed'); expect((await taskOf(f)).compute.localWork).toHaveLength(2);
            expect((await f.studio.getProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.proposed.project.displayName);
            await f.cold(); expect(await f.dispatch(resumed)).toEqual(completed); expect(await f.authority.resume(f.h.handle, refs(resumed))).toEqual(completed);
        } finally { await f.cleanup(); }
    }, 180000);

    test.each(['project', 'review', 'cancel'])('a cold ready intent cannot resume after a legitimate %s change', async change => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare(); await f.approve(prepared); await f.cold();
            if (change === 'project') {
                const project = await f.studio.getProject(f.h.handle, f.projectId), source = structuredClone(project.source); source.project.displayName = 'Human edit retained';
                await f.studio.saveProjectSource(f.h.handle, f.projectId, { source, baseRevision: project.revision.revision, origin: { kind: 'human' } });
            } else if (change === 'review') {
                await f.agent.prepareReview(f.h.handle, f.projectId, f.taskId, {});
            } else {
                const root = await rootOf(f, prepared), runs = f.authority.execution.runs;
                const recovered = await runs.recover(f.h.handle, createNativeId('orchestrationCommand'), runGuard(root));
                await runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(recovered), reasonCode: 'user_cancelled' });
            }
            const task = await taskOf(f), project = await f.studio.getProject(f.h.handle, f.projectId);
            await expect(f.authority.resume(f.h.handle, refs(prepared))).rejects.toThrow();
            expect(await taskOf(f)).toEqual(task); expect(await f.studio.getProject(f.h.handle, f.projectId)).toEqual(project);
            expect((await effectOf(f, await rootOf(f, prepared), prepared)).dispatchToken).toBeNull();
        } finally { await f.cleanup(); }
    }, 180000);

    test('a dispatch claim survives cold restart as observation only, never as another writer permit', async () => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare(); await f.approve(prepared);
            await f.authority.execution.effects.claim(f.h.handle, { ...runGuard(await rootOf(f, prepared)), effectId: prepared.effectId });
            const task = await taskOf(f); await f.cold();
            const observed = await f.authority.resume(f.h.handle, refs(prepared)); expect(observed.status).toBe('dispatching');
            expect(await f.dispatch(prepared)).toEqual(observed); expect(await taskOf(f)).toEqual(task);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
        } finally { await f.cleanup(); }
    }, 180000);

    test('rehashing a previously claimed intent back to ready cannot erase the original dispatch command', async () => {
        const f = await projectCommitFixture(make);
        let saved, key;
        try {
            const prepared = await f.prepare(); await f.approve(prepared);
            await f.authority.execution.effects.claim(f.h.handle, { ...runGuard(await rootOf(f, prepared)), effectId: prepared.effectId });
            const task = await taskOf(f); await f.cold();
            key = controlRecordKey(f.h.handle, prepared.runId, 'effect', prepared.effectId);
            await f.authority.engine.withTransaction(f.h.handle, async tx => {
                saved = await tx.getResource(key); const doc = { ...saved.doc, status: 'ready', dispatchToken: null };
                await tx.putResource(key, { ...saved, doc, integrity: hash(doc) });
            });
            await expect(f.authority.resume(f.h.handle, refs(prepared))).rejects.toMatchObject({ code: 'native_orchestration_effect_already_claimed' });
            expect(await taskOf(f)).toEqual(task); expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
        } finally {
            if (saved) await f.authority.engine.withTransaction(f.h.handle, tx => tx.putResource(key, saved));
            await f.cleanup();
        }
    }, 180000);

    test('a committed domain with missing Effect ACK remains pending output after cold resume and never repeats Studio commit', async () => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare(); await f.approve(prepared);
            f.authority.execution.effects.observe = async () => { throw new StorageCommitUnknownError(new Error('Synthetic missing receipt ACK')); };
            await expect(f.dispatch(prepared)).rejects.toMatchObject({ code: 'storage_commit_unknown' });
            const task = await taskOf(f); expect(task.changeSets).toHaveLength(1); await f.cold();
            const observed = await f.authority.resume(f.h.handle, refs(prepared)); expect(observed.status).toBe('committed_pending_output');
            expect(await f.dispatch(prepared)).toEqual(observed); expect(await taskOf(f)).toEqual(task);
        } finally { await f.cleanup(); }
    }, 180000);

    test.each(['saved', 'missing'])('a %s resume ACK keeps the original costs and obtains one fresh approval on explicit retry', async ack => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare(); await f.approve(prepared); await f.cold();
            const task = await taskOf(f), effects = f.authority.execution.effects, resume = effects.resumeReady.bind(effects);
            effects.resumeReady = async (...args) => {
                if (ack === 'saved') await resume(...args);
                throw new StorageCommitUnknownError(new Error('Synthetic resume ACK loss'));
            };
            await expect(f.authority.resume(f.h.handle, refs(prepared))).rejects.toMatchObject({ code: 'storage_commit_unknown' });
            expect(await taskOf(f)).toEqual(task); effects.resumeReady = resume;
            const resumed = await f.authority.resume(f.h.handle, refs(prepared));
            expect(await taskOf(f)).toEqual(task); expect(await f.authority.resume(f.h.handle, refs(prepared))).toEqual(resumed);
            await f.approve(resumed); expect((await f.dispatch(resumed)).status).toBe('completed');
            expect((await taskOf(f)).compute.localWork).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 180000);

    test('same-transaction cancellation in the last bank recheck remains committed and prevents ready reauthorization', async () => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare(); await f.cold();
            const task = await taskOf(f), service = f.authority.execution, verify = service.budgetPort.verifyBudgetAttempt.bind(service.budgetPort);
            let cancelled = false;
            service.budgetPort.verifyBudgetAttempt = async args => {
                const result = await verify(args);
                if (!cancelled) { cancelled = true; await service.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'),
                    { ...runGuard(await rootOf(f, prepared)), reasonCode: 'user_cancelled' }); }
                return result;
            };
            await expect(f.authority.resume(f.h.handle, refs(prepared))).rejects.toThrow();
            expect(cancelled).toBe(true); expect((await rootOf(f, prepared)).cancelRequested).toBe(true);
            expect(await taskOf(f)).toEqual(task); expect((await effectOf(f, await rootOf(f, prepared), prepared)).dispatchToken).toBeNull();
        } finally { await f.cleanup(); }
    }, 180000);

    test('fresh Preview work rejects copied permits and rechecks real account revocation after its final await', async () => {
        const f = await projectCommitFixture(make), evaluate = StudioService.prototype.evaluateWorkspace;
        let changed = false;
        try {
            const prepared = await f.prepare(); await f.cold();
            const task = await taskOf(f);
            await expect(f.studio.evaluateWorkspace(f.h.handle, task.workspace, { nativeCommitPermit: {} })).rejects.toThrow();
            expect(await taskOf(f)).toEqual(task);
            const resumed = await f.authority.resume(f.h.handle, refs(prepared)); await f.approve(resumed);
            StudioService.prototype.evaluateWorkspace = async function (...args) {
                const result = await evaluate.apply(this, args);
                if (args[2]?.nativeCommitPermit) { changed = true; await storage.setItem(toKey(f.h.handle), { ...f.account, enabled: false }); }
                return result;
            };
            await expect(f.dispatch(resumed)).rejects.toThrow(); expect(changed).toBe(true);
            const retained = await taskOf(f); expect(retained.status).toBe('review'); expect(retained.preview).toEqual(task.preview);
            expect(retained.compute.localWork.map(row => row.usage.outcome)).toEqual(['completed', 'failed']);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
            expect(f.studio.listPreviews(f.h.handle)).toEqual([]);
            const observed = await f.authority.resume(f.h.handle, refs(prepared)); expect(observed.status).toBe('dispatching');
            expect(await taskOf(f)).toEqual(retained);
        } finally { StudioService.prototype.evaluateWorkspace = evaluate; await f.cleanup(); }
    }, 180000);
});
