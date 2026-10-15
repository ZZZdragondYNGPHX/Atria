import { SourcePort } from '../../src/native/orchestration/source-port.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

// A Host transaction cannot wait for a domain writer that may itself need the
// Engine. Test the real domain queue, not a permissive source or lock double.
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s SourcePort transaction lock order', (_name, make) => {
    test.each(['session', 'project'])('%s observation does not acquire a domain writer queue inside the Host transaction', async domain => {
        const h = await make(); let release, blocked, pending, timer;
        try {
            await prepareControllerOwnerRoot(h.dirs.root);
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            let source, port, lock;
            if (domain === 'session') {
                const f = await installFixture(h), base = await f.core.create(h.handle, f.start);
                port = new SourcePort({ budgetPort: new BudgetPort({ sessionCore: f.core }), sessionCore: f.core });
                source = { domain: 'native_session', sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId };
                lock = fn => f.core.runs.repo.withRunLock(h.handle, base.session.sessionId, fn);
            } else {
                const f = services(h), src = projectSource(), project = await f.studio.createProject(h.handle, src);
                const task = await f.agent.createTask(h.handle, src.project.projectId, { intent: 'Readonly source', baseRevision: project.revision.revision });
                port = new SourcePort({ budgetPort: new BudgetPort({ projectAgent: f.agent, projectRepository: f.repository }), projectAgent: f.agent });
                source = { domain: 'project', projectId: src.project.projectId, taskId: task.taskId, revision: project.revision.revision, executionFingerprint: task.executionFingerprint };
                lock = fn => f.studio._queue(src.project.projectId, fn);
            }
            const before = await port.capture(h.handle, source);
            let entered;
            const started = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { release = resolve; });
            blocked = lock(async () => { entered(); await held; });
            await started;
            pending = h.engine.withTransaction(h.handle, async tx => {
                const current = await port.capture(h.handle, source, { tx });
                await port.revalidate(h.handle, current.sourceBinding, { tx });
                return current;
            });
            const deadline = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Host source observation waited for the domain writer')), 2000); });
            await expect(Promise.race([pending, deadline])).resolves.toEqual(before);
        } finally {
            clearTimeout(timer); release?.(); await blocked; await pending?.catch(() => {});
            await h.engine.close?.(); await h.cleanup();
        }
    });
});
