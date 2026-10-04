import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { runFixture } from './helpers/run-fixture.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { assertRunTransactions, assertRunContinuation } from '../../public/shared/native-run-contract.js';

let h, f;
beforeEach(async () => { h = await makeTempFsEngineHarness(); f = await runFixture(h, 'http://127.0.0.1:1/unused'); });
afterEach(async () => { await h?.cleanup(); });
test.each(['story-start', 'run-policy', 'generation-budget'])('opt-in %s requires its explicit versioned capability', id => {
    const contract = structuredClone(f.contract); contract.capabilities = contract.capabilities.filter(item => item.id !== id);
    expect(() => assertNativeExperienceContract(contract)).toThrow();
    contract.capabilities.push({ id, version: 2, required: true }); expect(() => assertNativeExperienceContract(contract)).toThrow();
});
test.each([
    contract => contract.capabilities.find(item => item.id === 'authority-transaction').required = false,
    contract => contract.generationBudget.turnCounter.domainId = 'missing',
    contract => contract.generationBudget.turnCounter.field = 'text',
    contract => delete contract.lifecycleRuntime.domains.find(item => item.id === 'progress').recordSchema.properties.effectiveTurns.minimum,
    contract => contract.generationBudget.narratorAttempts = 9,
    contract => contract.generationBudget.backgroundPeriodTurns = 3,
    contract => contract.runPolicy.deathTransactions = ['story.begin'],
    contract => contract.runPolicy.script = 'delete all saves',
    contract => contract.storyStart.effects = [],
])('closed declarations reject unsafe or incoherent run contracts', change => {
    const contract = structuredClone(f.contract); change(contract); expect(() => assertNativeExperienceContract(contract)).toThrow();
});
test.each([
    transactions => transactions.find(tx => tx.id === 'story.begin').intent.expose = true,
    transactions => transactions.find(tx => tx.id === 'story.begin').resolution.kind = 'bounded_fortune',
    transactions => transactions.find(tx => tx.id === 'story.begin').effects.push({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }),
    transactions => transactions.find(tx => tx.id === 'story.begin').inputSchema.properties.mode.enum = ['ordinary'],
    transactions => transactions.find(tx => tx.id === 'story.begin').receipt.schema.properties.opening.type = 'integer',
    transactions => transactions[0].resolution.cases = [],
])('start/death declarations link to fixed deterministic authority transactions', change => {
    const transactions = structuredClone(f.logic.transactions); change(transactions); expect(() => assertRunTransactions(f.contract, transactions)).toThrow();
});
test('continuation ledger rejects invented lanes, negative counts and unbounded payloads', () => {
    const value = { operations: {}, background: {}, highWaterTurn: 0 }; expect(assertRunContinuation(value)).toEqual(value);
    for (const change of [value => value.highWaterTurn = -1, value => value.patch = {}, value => value.operations['a'.repeat(64)] = { lane: 'other', anchor: {}, total: 0, attempts: {} }]) {
        const bad = structuredClone(value); change(bad); expect(() => assertRunContinuation(bad)).toThrow();
    }
});
