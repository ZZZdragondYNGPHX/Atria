import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONTRACT_HARNESSES, makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, services } from './helpers/session-fixture.js';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';

describe.each(CONTRACT_HARNESSES)('Durable commit receipt — $name', ({ make }) => {
    test('ACK loss retry resolves once and conflicting request IDs fail', async () => {
        const h = await make();
        try {
            const f = await installFixture(h), before = await f.core.create(h.handle, f.start);
            const options = { expectedRevisionId: before.revision.revisionId, commitId: 'request:ack-loss' };
            const draft = { role: 'user', content: 'Do once' };
            const next = await f.core.appendTimeline(h.handle, before.session.sessionId, draft, options);
            const retried = await services(h).core.appendTimeline(h.handle, before.session.sessionId, draft, options);
            expect(retried.revision.revisionId).toBe(next.revision.revisionId);
            expect(retried.timeline.filter(item => item.content === draft.content)).toHaveLength(1);
            expect(await f.sessionRepo.getCommitReceipt(h.handle, before.session.sessionId, options.commitId)).toMatchObject({ status: 'committed', revisionId: next.revision.revisionId });
            await expect(f.core.appendTimeline(h.handle, before.session.sessionId, { ...draft, content: 'Different' }, options)).rejects.toMatchObject({ code: 'native_commit_id_conflict' });
            if (h.kind === 'sqlite') expect(h.engine._dbFor(h.handle).pragma('synchronous', { simple: true })).toBe(2);
        } finally { await h.cleanup(); }
    });
});

describe('FS durable journal process interruption (S1, not physical S2 proof)', () => {
    test.each(['prepare', 'dependencies', 'publish', 'install', 'ack'])('%s leaves complete old or new root', async stage => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h), before = await f.core.create(h.handle, f.start);
            const configuration = path.join(h.dataRoot, 'worker.json');
            fs.writeFileSync(configuration, JSON.stringify({ dirs: h.dirs, handle: h.handle, sessionId: before.session.sessionId,
                revisionId: before.revision.revisionId, stage }));
            const child = spawnSync(process.execPath, [fileURLToPath(new URL('./helpers/durable-commit-process.mjs', import.meta.url)), configuration]);
            expect(child.status).toBe(71);
            const engine = new FsEngine({ directoriesByHandle: () => h.dirs });
            const restored = services(h, engine);
            const view = await restored.core.load(h.handle, before.session.sessionId);
            const receipt = await restored.sessionRepo.getCommitReceipt(h.handle, before.session.sessionId, 'request:process-loss');
            const committed = ['publish', 'install', 'ack'].includes(stage);
            expect(Boolean(receipt)).toBe(committed);
            expect(view.timeline.length).toBe(before.timeline.length + Number(committed));
            expect(view.states.atri_world_state).toEqual(before.states.atri_world_state);
            if (committed) {
                const retry = await restored.core.appendTimeline(h.handle, before.session.sessionId, { role: 'user', content: 'Crash boundary' },
                    { expectedRevisionId: before.revision.revisionId, commitId: 'request:process-loss' });
                expect(retry.revision.revisionId).toBe(view.revision.revisionId);
            }
        } finally { await h.cleanup(); }
    });
});
