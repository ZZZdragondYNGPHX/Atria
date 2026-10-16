import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionOutputFixture as setup } from './helpers/session-output-fixture.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { readSessionNarrationResult } from '../../src/native/orchestration/session-narration-result-contracts.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

describe.each(harnesses)('$name original Session output Effect', ({ make }) => {
    test('the Session Result crosses the real Graph edge to the output owner and original domain receipt and bank confirm its Effect', async () => {
        const f = await setup(make);
        try {
            const result = await f.start(), { runs } = f.authority.execution;
            const root = await runs.get(f.h.handle, f.effectRef.runId);
            const facts = await f.h.engine.withTransaction(f.h.handle, async tx => {
                const published = await readSessionNarrationResult(tx, f.h.handle, root);
                const effect = (await checkedRecord(tx, controlRecordKey(f.h.handle, root.runId, 'effect', f.effectRef.effectId))).doc;
                const attempt = (await checkedRecord(tx, controlRecordKey(f.h.handle, root.runId, 'attempt', effect.nodeAttemptId))).doc;
                return { published, effect, attempt };
            });
            expect(facts.published.record.payload).toBe('Synthetic native narrator response.');
            expect(facts.published.record.envelope).toMatchObject({ audienceConstraint: { kind: 'session_output' },
                sourceRefs: [{ sourceAuthority: 'native_session' }, { kind: 'effect_receipt' }] });
            expect(facts.effect).toMatchObject({ status: 'confirmed', capability: 'chat.output', actionRef: { kind: 'native_session_output' } });
            expect(facts.attempt.nodeId).toBe(root.graph.outputContract.ownerNodeId);
            const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
            expect(bank.localWork.filter(row => row.kind === 'session_output')).toMatchObject([{ status: 'settled', usage: { outcome: 'completed' } }]);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1); expect(f.requests).toHaveLength(1);
            const closed = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
            expect(closed.claim.domainReceiptRef).toMatchObject({ domain: 'native_session', revisionId: result.revision.revisionId });
        } finally { await f.cleanup(); }
    });

    test('an uncertain output dispatch claim never calls the Session writer or refunds original work', async () => {
        const f = await setup(make), effects = f.authority.execution.effects, claim = effects.claim.bind(effects);
        let writes = 0; const writer = f.core.finalizeTurn.bind(f.core);
        f.core.finalizeTurn = (...args) => { writes++; return writer(...args); };
        effects.claim = async (handle, request) => {
            const ack = await claim(handle, request);
            const intent = await f.h.engine.withTransaction(handle, async tx => (await readEffect(tx, handle, await f.authority.execution.runs.get(handle, request.runId), request.effectId)).doc);
            if (intent.actionRef.kind === 'native_session_output')
                throw new StorageCommitUnknownError(new Error('Synthetic output claim ACK loss'));
            return ack;
        };
        try {
            await expect(f.start()).rejects.toThrow();
            expect(writes).toBe(0); expect(f.requests).toHaveLength(1);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(f.base.revision);
        } finally { await f.cleanup(); }
    });

    test('the explicit Result byte bound refuses domain publication after preserving the original Model charge', async () => {
        const f = await setup(make, { maxBytes: 1 });
        try {
            await expect(f.start()).rejects.toThrow('byte bound'); expect(f.requests).toHaveLength(1);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(f.base.revision);
        } finally { await f.cleanup(); }
    });

    test('Memory withdrawn in the last output budget read remains revoked and refuses the writer', async () => {
        const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
        const f = await setup(make, { memorySettings, changeContract: contract => {
                const view = contract.informationRuntime.views.find(item => item.id === 'pov'); view.sources.push('history'); view.memory = true;
            } }), verify = BudgetPort.prototype.verifyBudgetAttempt; let changed = false;
        BudgetPort.prototype.verifyBudgetAttempt = async function (args) {
            const value = await verify.call(this, args);
            if (!changed && this === f.authority.execution.budgetPort && args.intent.actionRef.kind === 'native_session_output'
                && args.intent.status === 'dispatching') {
                changed = true;
                await new SettingsRepo({ engine: f.h.engine }).save(f.h.handle, { atri_capabilities: { memory_graph: { ...memorySettings, recallEnabled: false } } });
            }
            return value;
        };
        try {
            await expect(f.start()).rejects.toThrow(); expect(changed).toBe(true);
            expect((await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled).toBe(false);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(f.base.revision); expect(f.requests).toHaveLength(1);
        } finally { BudgetPort.prototype.verifyBudgetAttempt = verify; await f.cleanup(); }
    });
});
