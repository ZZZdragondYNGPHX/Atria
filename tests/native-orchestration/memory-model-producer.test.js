import { modelPortFixture } from './helpers/model-port-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';

const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
const changeContract = contract => {
    const view = contract.informationRuntime.views.find(item => item.id === 'pov');
    view.sources.push('history'); view.memory = true;
};
describe.each(CONTRACT_HARNESSES)('$name original Hybrid/model bank composition', ({ make }) => {
    test('actual original Context work includes Hybrid and pays only its enclosing bank work', async () => {
        const f = await modelPortFixture(make, { memorySettings, changeContract });
        try {
            await f.start();
            expect(f.requests).toHaveLength(1);
            expect(JSON.stringify(f.requests)).toContain('historical_source');
            const ledger = Object.values((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations)[0].compute;
            expect(ledger.localWork.filter(row => row.kind === 'context_build')).toHaveLength(1);
            expect(ledger.localWork.find(row => row.kind === 'context_build')).toMatchObject({ status: 'settled', usage: { outcome: 'completed' } });
            expect(ledger.attempts[0].usage.totalTokens).toBe(20);
        } finally { await f.cleanup(); }
    }, 60000);
    test('settings revoked during actual Provider HTTP withhold response but preserve paid attempts', async () => {
        const f = await modelPortFixture(make, { memorySettings, changeContract });
        try {
            f.onResponse(() => new SettingsRepo({ engine: f.h.engine }).save(f.h.handle,
                { atri_capabilities: { memory_graph: { ...memorySettings, recallEnabled: false } } }));
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_memory_source_stale' });
            expect(f.requests).toHaveLength(1); expect(f.chunks.some(chunk => 'text' in chunk)).toBe(false);
            const ledger = Object.values((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations)[0].compute;
            expect(ledger.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(ledger.localWork.find(row => row.kind === 'context_build').status).toBe('settled');
        } finally { await f.cleanup(); }
    }, 60000);
});
