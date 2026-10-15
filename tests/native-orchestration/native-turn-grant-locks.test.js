import { modelPortFixture } from './helpers/model-port-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

describe.each(CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name)))('$name original Turn grant read ordering', ({ make }) => {
    test('a Host transaction checks original Run access without waiting for a queued Session writer', async () => {
        const f = await modelPortFixture(make);
        let entered, release, timer, writer, pending;
        const started = new Promise(resolve => { entered = resolve; });
        const held = new Promise(resolve => { release = resolve; });
        try {
            writer = f.core.runs.repo.withRunLock(f.h.handle, f.base.session.sessionId, async () => { entered(); await held; });
            await started;
            pending = f.h.engine.withTransaction(f.h.handle, () => f.authority.preflightBinding({ host: f.host, handle: f.h.handle,
                base: f.base, input: f.input, transaction: f.transaction ?? null }));
            const deadline = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Turn grant read waited for a Session writer inside its Host transaction')), 2000); });
            await expect(Promise.race([pending, deadline])).resolves.toEqual({});
            expect(f.requests).toHaveLength(0);
        } finally {
            clearTimeout(timer); release(); await writer; await pending?.catch(() => {}); await f.cleanup();
        }
    });
});
