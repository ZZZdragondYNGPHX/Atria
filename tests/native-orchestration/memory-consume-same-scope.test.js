import { modelPortFixture } from './helpers/model-port-fixture.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { PROVENANCE_NAMESPACE } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
const marker = 'Legitimate same-transaction Memory revocation';
async function atFinalBankRead(f, write) {
    const service = f.authority.execution, original = service.budgetPort.assertCurrent.bind(service.budgetPort);
    let injected = false;
    service.budgetPort.assertCurrent = async (...args) => {
        const result = await original(...args), ref = f.effectRef ?? f.effects?.at(-1);
        if (ref && !injected) await f.h.engine.withTransaction(f.h.handle, async tx => {
            const root = await service.runs.get(f.h.handle, ref.runId), { doc } = await readEffect(tx, f.h.handle, root, ref.effectId);
            if (doc.status === 'confirmed') { injected = true; await write(); }
        });
        return result;
    };
    return () => injected;
}

describe.each(CONTRACT_HARNESSES)('$name same-transaction Memory consumption', ({ make }) => {
    test.each(['session-settings', 'rp-settings', 'rp-ledger'])('%s commits its legitimate revocation and refuses the already-paid response', async change => {
        const session = change === 'session-settings';
        const f = session ? await modelPortFixture(make, { memorySettings, changeContract: contract => {
            const view = contract.informationRuntime.views.find(item => item.id === 'pov'); view.sources.push('history'); view.memory = true;
        } }) : await rpModelFixture(make, { memorySettings, seedMemory: true });
        try {
            const settings = new SettingsRepo({ engine: f.h.engine });
            const injected = await atFinalBankRead(f, async () => {
                if (change !== 'rp-ledger') return settings.save(f.h.handle, { atri_capabilities: {
                    memory_graph: { ...memorySettings, recallEnabled: false } } });
                const state = await f.chats.getState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE);
                state.facts['rp-memory-fact'].text = marker;
                await f.chats.setState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE, state);
            });
            const outcome = await (session ? f.start() : f.run()).then(() => ({ accepted: true }), error => ({ error }));
            expect(injected()).toBe(true); expect(f.requests).toHaveLength(1);
            const observed = change === 'rp-ledger' ? (await f.chats.getState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE)).facts['rp-memory-fact'].text
                : (await settings.get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled;
            expect(observed).toBe(change === 'rp-ledger' ? marker : false);
            expect(outcome.error).toMatchObject({ code: 'native_orchestration_consumption_stale' });
            const compute = session ? Object.values((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations)[0].compute
                : Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(compute.localWork.find(row => row.kind === 'context_build').status).toBe('settled');
        } finally { await f.cleanup(); }
    }, 60000);
});
