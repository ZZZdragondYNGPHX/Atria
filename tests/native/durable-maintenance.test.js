import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONTRACT_HARNESSES, makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, services } from './helpers/session-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { maintainSession, acquireSessionReadLease } from '../../src/native/session-maintenance.js';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';

async function setup(h) {
    const f = await installFixture(h); let view = await f.core.create(h.handle, f.start);
    const sessionId = view.session.sessionId, save = await f.core.createSavePoint(h.handle, sessionId);
    view = await f.core.restoreSavePoint(h.handle, sessionId, save.saveId);
    const options = { expectedRevisionId: view.revision.revisionId, commitId: 'e7:uncertain-ack' }, draft = { role: 'user', content: 'Only once across GC' };
    const base = view; view = await f.core.appendTimeline(h.handle, sessionId, draft, options);
    const orphanId = createNativeId('revision'); await f.sessionRepo.putRevision(h.handle, { ...view.revision, revisionId: orphanId });
    const now = Date.now() + 1000;
    expect((await maintainSession(f.sessionRepo, h.handle, sessionId, { now })).phase).toBe('quarantine');
    return { f, view, base, sessionId, save, orphanId, now, draft, options };
}
describe.each(CONTRACT_HARNESSES)('E7 roots/receipts/GC — $name', ({ make }) => {
    test('a queued event can pause long Mark before any candidate is published', async () => {
        const h = await make();
        try {
            const f = await installFixture(h), base = await f.core.create(h.handle, f.start);
            const additions = Array.from({ length: 64 }, (_, index) => f.core._newEntry(base, { role: 'user', content: 'Mark ' + index }, index + 1));
            const view = await f.core._publish(h.handle, base, { timeline: [...base.timeline, ...additions.map(item => item.entry)],
                entries: additions.map(item => item.entry), variants: additions.map(item => item.variant) });
            const controller = new AbortController(); setImmediate(() => controller.abort());
            expect(await maintainSession(f.sessionRepo, h.handle, view.session.sessionId, { signal: controller.signal })).toMatchObject({ phase: 'paused', deleted: [] });
            expect((await f.core.load(h.handle, view.session.sessionId)).timeline).toHaveLength(65);
        } finally { await h.cleanup(); }
    });
    test('export/read lease, concurrent SavePoint and ACK uncertainty preserve coherent legal branches', async () => {
        const h = await make();
        try {
            const t = await setup(h), release = acquireSessionReadLease(h.handle, t.sessionId, t.save.revisionId);
            expect((await maintainSession(t.f.sessionRepo, h.handle, t.sessionId, { now: t.now + 60001 })).deleted).toEqual([]);
            const save = await t.f.core.createSavePoint(h.handle, t.sessionId); release();
            expect((await maintainSession(t.f.sessionRepo, h.handle, t.sessionId, { now: t.now + 60001 })).deleted).toEqual([]);
            await maintainSession(t.f.sessionRepo, h.handle, t.sessionId, { now: t.now + 120002 });
            const replay = await services(h).core.appendTimeline(h.handle, t.sessionId, t.draft, t.options);
            expect(replay.timeline.filter(entry => entry.content === t.draft.content)).toHaveLength(1);
            expect(replay.revision.revisionId).toBe(t.view.revision.revisionId);
            expect((await t.f.core.load(h.handle, t.sessionId, { revisionId: t.save.revisionId })).timeline[0].content).toBe('Opening');
            expect(await t.f.savePointRepo.get(h.handle, t.sessionId, save.saveId)).not.toBeNull();
            expect(await t.f.sessionRepo.getRevision(h.handle, t.sessionId, t.orphanId)).toBeNull();
            await t.f.sessionRepo.delete(h.handle, t.sessionId);
            expect(await h.engine.withTransaction(h.handle, tx => tx.getResource({ kind: 'atri_maintenance', handle: h.handle, scope: 'session:' + t.sessionId }))).toBeNull();
        } finally { await h.cleanup(); }
    });
});
test.each(['publish', 'install'])('GC process loss at %s recovers roots and a resumable cursor (S1)', async stage => {
    const h = await makeTempFsEngineHarness();
    try {
        const t = await setup(h), file = path.join(h.dataRoot, 'gc-process.json');
        fs.writeFileSync(file, JSON.stringify({ handle: h.handle, dirs: h.dirs, sessionId: t.sessionId, stage, now: t.now + 60001 }));
        const child = spawnSync(process.execPath, [fileURLToPath(new URL('./helpers/durable-maintenance-process.mjs', import.meta.url)), file]);
        expect(child.status).toBe(72);
        const engine = new FsEngine({ directoriesByHandle: () => h.dirs }), restored = services(h, engine);
        expect((await restored.core.load(h.handle, t.sessionId)).timeline).toEqual(t.view.timeline);
        expect(await restored.sessionRepo.getRevision(h.handle, t.sessionId, t.orphanId)).toBeNull();
        expect(await restored.sessionRepo.getCommitReceipt(h.handle, t.sessionId, t.options.commitId)).toMatchObject({ revisionId: t.view.revision.revisionId });
        await maintainSession(restored.sessionRepo, h.handle, t.sessionId, { now: t.now + 120002 });
        expect((await restored.core.appendTimeline(h.handle, t.sessionId, t.draft, t.options)).timeline).toEqual(t.view.timeline);
    } finally { await h.cleanup(); }
});
