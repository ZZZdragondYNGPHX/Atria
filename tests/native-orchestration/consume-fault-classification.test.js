import { jest } from '@jest/globals';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { toolCompletionFixture } from './helpers/tool-completion-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { GenerationError } from '../../src/native/model-prompt-runtime/execution-utils.js';

const fault = kind => kind === 'unknown' ? new StorageCommitUnknownError(new Error('Synthetic original authority ACK loss'))
    : kind === 'integrity' ? Object.assign(new TypeError('Synthetic original RunControl integrity failure'), { code: 'native_run_control_integrity' })
        : kind === 'resource_identity' ? new GenerationError('generation_exact_resource_mismatch') : new TypeError('Synthetic unexpected original authority error');

// SQL setup and original cold reopen exceed the unit-test 15s default.
// This opt-in affects only this integration test's harness.
if (process.env.ATRIA_TEST_CONSUME_FAULT_SQL === '1') jest.setTimeout(60_000);

// Real original provider/repository, bank and receipt. These are explicit
// callback error injections, not evidence of actual disk/transport failures.
describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_CONSUME_FAULT_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name final consumption error classification', ({ make }) => {
    test.each([...['unknown', 'integrity', 'unexpected'].flatMap(kind => [['Model', kind], ['Skill', kind]]), ['Model', 'resource_identity']])('%s preserves %s authority failure instead of converting it to a committed permission denial', async (producer, kind) => {
        const model = producer === 'Model', f = await (model ? modelPortFixture(make) : toolCompletionFixture(make, 'skill_read'));
        const service = model ? f.authority.execution : f.exec, error = fault(kind);
        const bankCurrent = service.budgetPort.assertCurrent.bind(service.budgetPort);
        const sourceCurrent = service.sourcePort.revalidate.bind(service.sourcePort), authorize = model ? null : f.port.authorizeTool;
        let armed = false, injected = false;
        try {
            service.budgetPort.assertCurrent = async (...args) => {
                const result = await bankCurrent(...args), ref = model ? f.effectRef : { runId: f.root.runId, effectId: f.effectId };
                if (!ref) return result;
                await service.runs.engine.withTransaction(f.h.handle, async tx => {
                    const root = await service.runs.get(f.h.handle, ref.runId);
                    if ((await readEffect(tx, f.h.handle, root, ref.effectId)).doc.status === 'confirmed') armed = true;
                });
                return result;
            };
            if (model) service.sourcePort.revalidate = (...args) => {
                if (armed) { injected = true; throw error; }
                return sourceCurrent(...args);
            };
            else f.port.authorizeTool = async args => {
                if (armed && args.phase === 'consume') { injected = true; throw error; }
                return authorize(args);
            };
            await expect(f.start()).rejects.toBe(error);
            expect(injected).toBe(true); expect((await f.observe()).outcome).toBe('confirmed');
            expect(model ? f.requests.length : f.calls.length).toBe(model ? 1 : 0);
            await f.cold(); expect((await f.observe()).outcome).toBe('confirmed');
            expect(model ? f.requests.length : f.calls.length).toBe(model ? 1 : 0);
        } finally {
            service.budgetPort.assertCurrent = bankCurrent; service.sourcePort.revalidate = sourceCurrent;
            await f.cleanup();
        }
    });

    test('a legitimate Source write inside the final original Skill grant callback refuses body and preserves the committed domain fact', async () => {
        const f = await toolCompletionFixture(make, 'skill_read'), authorize = f.port.authorizeTool;
        const sessionId = f.root.sourceBinding.sourceRef.sessionId, marker = 'Source changed inside final original Skill grant validation.';
        let consumes = 0, changed, body, version;
        try {
            f.port.authorizeTool = async args => {
                const grant = await authorize(args);
                if (args.phase === 'consume' && ++consumes === 2) {
                    version = (await f.exec.runs.get(f.h.handle, f.root.runId)).stateVersion;
                    changed = await f.core.appendTimeline(f.h.handle, sessionId, { role: 'user', content: marker });
                }
                return grant;
            };
            const result = await f.start().then(value => { body = value; return { status: 'fulfilled' }; }, error => ({ status: 'rejected', error }));
            expect(consumes).toBe(2); expect(changed).toBeDefined(); expect(body).toBeUndefined();
            expect(result).toMatchObject({ status: 'rejected', error: { code: 'native_orchestration_consumption_stale' } });
            expect((await f.exec.runs.get(f.h.handle, f.root.runId)).stateVersion).toBe(version);
            const saved = await f.observe(), charged = (await f.core.runs.status(f.h.handle, sessionId)).operations[f.root.budgetAuthorityRef.operationId].compute;
            expect(saved.outcome).toBe('confirmed'); expect(charged.localWork.every(row => row.status === 'settled')).toBe(true);
            await f.cold(); expect(await f.observe()).toEqual(saved);
            expect((await f.core.observe(f.h.handle, sessionId)).timeline.some(item => item.content === marker)).toBe(true);
            expect((await f.core.runs.status(f.h.handle, sessionId)).operations[f.root.budgetAuthorityRef.operationId].compute).toEqual(charged);
        } finally { await f.cleanup(); }
    });
});
