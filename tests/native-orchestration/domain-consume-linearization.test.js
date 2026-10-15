import { jest } from '@jest/globals';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { toolCompletionFixture } from './helpers/tool-completion-fixture.js';
import { withNativeResourceWrites } from '../../src/native/repositories/common.js';
import { withRuntimeWrite } from '../../src/native/model-prompt-runtime/runtime-write.js';
import { withSessionWrite } from '../../src/native/repositories/session-repo.js';
import { createNativeId } from '../../src/native/identity.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const command = () => createNativeId('orchestrationCommand');
const cases = [['Model', 'source'], ['Model', 'binding'], ['Skill', 'source']];
if (process.env.ATRIA_TEST_DOMAIN_CONSUME_SQL === '1') jest.setTimeout(60000);
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_DOMAIN_CONSUME_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name));

async function fixture(make, producer) {
    const model = producer === 'Model', f = await (model ? modelPortFixture(make) : toolCompletionFixture(make, 'skill_read'));
    const exec = model ? f.authority.execution : f.exec;
    const sessionId = model ? f.input.sessionId : f.root.sourceBinding.sourceRef.sessionId;
    const ref = () => model ? f.effectRef : { runId: f.root.runId, effectId: f.effectId };
    const fees = async () => {
        const root = await exec.runs.get(f.h.handle, ref().runId);
        const control = await f.core.runs.status(f.h.handle, sessionId);
        return control.operations[root.budgetAuthorityRef.operationId].compute;
    };
    const write = async domain => {
        if (domain === 'binding') {
            const binding = await f.plans.saveBinding(f.h.handle, command(), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 });
            return { before: 0, after: binding.version };
        }
        const before = (await f.core.observe(f.h.handle, sessionId)).revision.revisionId;
        const after = (await f.core.appendTimeline(f.h.handle, sessionId, { role: 'user', content: 'Synthetic independent Source revision change.' })).revision.revisionId;
        return { before, after };
    };
    const lock = (domain, work) => domain === 'binding' ? withRuntimeWrite(f.h.handle, work) : withSessionWrite(f.h.handle, sessionId, work);
    return { f, model, exec, sessionId, ref, fees, write, lock };
}

describe.each(harnesses)('$name original domain and Port consumption order', ({ make }) => {
    test('the original Runtime and Session write locks remain available while the actual Provider response is pending', async () => {
        const f = await modelPortFixture(make), entered = deferred(), release = deferred(), events = [];
        // Register the independent actor before either the HTTP call or any
        // original consumer transaction. No mutation or synthetic grant occurs.
        const driver = entered.promise.then(async () => {
            await withRuntimeWrite(f.h.handle, () => { events.push('runtime_during_http'); });
            await withSessionWrite(f.h.handle, f.input.sessionId, () => { events.push('session_during_http'); });
            release.resolve();
        });
        f.onResponse(() => { events.push('provider_pending'); entered.resolve(); return release.promise; });
        try {
            const result = await f.start(); await driver;
            expect(events).toEqual(['provider_pending', 'runtime_during_http', 'session_during_http']);
            expect(f.requests).toHaveLength(1);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
        } finally { release.resolve(); await f.cleanup(); }
    });

    test.each(cases)('%s %s committed by an ALS-independent writer before consumption refuses actual body and retains original facts', async (producer, domain) => {
        const { f, model, exec, sessionId, fees, write } = await fixture(make, producer);
        const trigger = deferred(), events = [], bodies = []; let changed, charged;
        // This callback is registered before entering any original transaction,
        // Run ancestry lock, Session publication lock or Runtime write lock.
        const writer = trigger.promise.then(async () => { changed = await write(domain); events.push('domain_committed'); });
        try {
            const observe = exec.effects.observe.bind(exec.effects);
            exec.effects.observe = async (...args) => { const ack = await observe(...args); charged = await fees(); trigger.resolve(); await writer; return ack; };
            if (model) {
                const generate = f.port.generate.bind(f.port);
                f.port.generate = async (...args) => { const result = await generate(...args); bodies.push(result); return result; };
            }
            const result = await f.start().then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
            expect(events).toEqual(['domain_committed']); expect(changed.after).not.toEqual(changed.before);
            expect(result.status).toBe('rejected'); expect(bodies).toEqual([]);
            expect(model ? f.requests.length : f.calls.length).toBe(model ? 1 : 0);
            const current = await f.core.observe(f.h.handle, sessionId);
            expect(current.timeline.some(item => item.content === 'Synthetic native narrator response.')).toBe(false);
            expect(await fees()).toEqual(charged); expect((await f.observe()).outcome).toBe('confirmed');
            await f.cold(); expect((await f.observe()).outcome).toBe('confirmed');
            // Re-read through the cold fixture's actual current Run/bank objects.
            const coldExec = model ? f.authority.execution : f.exec;
            const coldRoot = await coldExec.runs.get(f.h.handle, model ? f.effectRef.runId : f.root.runId);
            const coldControl = await f.core.runs.status(f.h.handle, sessionId);
            expect(coldControl.operations[coldRoot.budgetAuthorityRef.operationId].compute).toEqual(charged);
        } finally { await f.cleanup(); }
    });

    test.each(cases)('%s consumption decides before an independent %s writer enters the original domain write lock', async (producer, domain) => {
        const { f, model, exec, sessionId, fees, write, lock } = await fixture(make, producer);
        const trigger = deferred(), release = deferred(), events = [], bodies = []; let changed, charged;
        const driver = trigger.promise.then(async () => {
            const entry = lock(domain, () => { events.push('domain_lock_acquired'); });
            // Let the domain queue run before releasing the consumer. A brief
            // original lock probe avoids manufacturing the legacy Session/Tx
            // inversion by holding a Session lock while awaiting the consumer.
            await withNativeResourceWrites(f.h.handle, [command()], () => { release.resolve(); });
            await entry;
            changed = await write(domain); events.push('domain_committed');
        });
        try {
            const consume = exec.runs.withConsumption.bind(exec.runs);
            exec.runs.withConsumption = (handle, runId, work, ...rest) => consume(handle, runId, async scope => {
                charged = await fees(); trigger.resolve(); await release.promise;
                const value = await work(scope);
                expect(JSON.stringify(value)).toContain(model ? 'Synthetic native narrator response.' : 'Synthetic Skill body');
                events.push('consume_decided'); return value;
            }, ...rest);
            if (model) {
                const generate = f.port.generate.bind(f.port);
                f.port.generate = async (...args) => { const value = await generate(...args); bodies.push(value); await driver; return value; };
            }
            const result = await f.start().then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
            await driver;
            expect(changed.after).not.toEqual(changed.before);
            expect(model ? bodies.length : JSON.stringify(result).includes('Synthetic Skill body')).toBe(model ? 1 : true);
            expect(model ? f.requests.length : f.calls.length).toBe(model ? 1 : 0);
            expect(await fees()).toEqual(charged); expect((await f.observe()).outcome).toBe('confirmed');
            const current = await f.core.observe(f.h.handle, sessionId);
            // Source changes after the Port decision still meet the original
            // Native HEAD CAS. This is not a V3 P4 OutputClaim proof.
            expect(current.timeline.some(item => item.content === 'Synthetic native narrator response.')).toBe(model && domain === 'binding');
            await f.cold(); expect((await f.observe()).outcome).toBe('confirmed');
            expect(events).toEqual(['consume_decided', 'domain_lock_acquired', 'domain_committed']);
        } finally { release.resolve(); await f.cleanup(); }
    });
});
