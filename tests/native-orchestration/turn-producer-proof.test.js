import { modelPortFixture } from './helpers/model-port-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { assertNativeNarratorQuota } from '../../src/native/orchestration/native-turn-quota.js';

const setup = make => modelPortFixture(make);
const operationId = f => hashNativeDocument({ lane: 'turn', anchor: { branchId: f.base.revision.branchId, revisionId: f.base.revision.revisionId } });
const bank = async f => (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[operationId(f)];

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s actual original Turn producer identity', (_name, make) => {
    test('the fixed narrator spends original compute once, confirms its Effect and finalizes/replays the original Turn', async () => {
        const f = await setup(make);
        try {
            const result = await f.start();
            expect(f.requests).toHaveLength(1);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            expect(await f.observe()).toMatchObject({ outcome: 'confirmed' });
            const op = await bank(f);
            expect(op.lane).toBe('turn'); expect(op.total ?? 0).toBe(0);
            expect(op.compute.attempts).toHaveLength(1);
            expect(op.compute.attempts[0]).toMatchObject({ status: 'settled' });
            expect(op.compute.attempts[0].generationQuotaRef).toBeUndefined();
            const replay = await f.start(); expect(replay.revision).toEqual(result.revision); expect(replay.timeline).toEqual(result.timeline);
            expect(await bank(f)).toEqual(op); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['role', 'json-proof', 'foreign-host', 'json-selection'])('%s cannot reuse the fixed producer identity or consume compute', async fault => {
        const f = await setup(make);
        try {
            const execute = f.authority.executeNarrator.bind(f.authority);
            f.authority.executeNarrator = async args => {
                const expected = { host: args.host, sessionCore: f.core, handle: f.h.handle, sessionId: f.base.session.sessionId,
                    requestId: f.input.invocationId, role: fault === 'role' ? 'intent_resolver' : 'narrator',
                    ...(fault === 'json-selection' ? { selection: structuredClone(args.selection) } : {}) };
                if (fault === 'foreign-host') expected.host = {};
                assertNativeNarratorQuota(fault === 'json-proof' ? JSON.parse(JSON.stringify(args.quotaProof)) : args.quotaProof, expected);
                return execute(args);
            };
            await expect(f.start()).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            expect(f.requests).toHaveLength(0);
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(control).toBeNull();
        } finally { await f.cleanup(); }
    });

    test('source revocation after original admission refuses HTTP without refunding compute', async () => {
        const f = await setup(make), admit = f.core.runs.admitCompute.bind(f.core.runs);
        try {
            f.core.runs.admitCompute = async (...args) => {
                const receipt = await admit(...args);
                await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Revoke this exact producer source' });
                return receipt;
            };
            await expect(f.start()).rejects.toThrow();
            expect(f.requests).toHaveLength(0);
            const op = await bank(f);
            expect(op.total ?? 0).toBe(0);
            expect(op.compute.attempts).toHaveLength(1); expect(op.compute.attempts[0].status).toBe('unknown');
        } finally { f.core.runs.admitCompute = admit; await f.cleanup(); }
    });

    test('unknown original-admission ACK observes the charged row once and never sends', async () => {
        const f = await setup(make), admit = f.core.runs.admitCompute.bind(f.core.runs);
        let admitted = 0;
        try {
            f.core.runs.admitCompute = async (...args) => {
                admitted++; await admit(...args); throw new StorageCommitUnknownError(new Error('Synthetic original quota ACK loss'));
            };
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_budget_reconcile_required' });
            const op = await bank(f);
            expect(op.total ?? 0).toBe(0);
            expect(op.compute.attempts).toHaveLength(1); expect(op.compute.attempts[0].status).toBe('charged');
            expect(admitted).toBe(1); expect(f.requests).toHaveLength(0);
            await expect(f.start()).rejects.toThrow();
            expect(admitted).toBe(1); expect(await bank(f)).toEqual(op); expect(f.requests).toHaveLength(0);
        } finally { f.core.runs.admitCompute = admit; await f.cleanup(); }
    });

});
