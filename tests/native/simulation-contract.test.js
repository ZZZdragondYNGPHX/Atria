import { describe, expect, test } from '@jest/globals';
import { assertNativeExperienceContract, assertSupportedExperienceContract } from '../../public/shared/native-experience-contract.js';
import { compileTransactionDeclarations } from '../../public/scripts/native/experience/logic/transactions.js';
import { authorityFixture } from './helpers/authority-fixture.js';

function fixture() {
    const { contract, logic } = authorityFixture();
    contract.capabilities.push({ id: 'world-simulation', version: 1, required: true });
    contract.simulationRuntime = { schemaVersion: 1, clockId: 'world', policy: { maxSteps: 8, maxDeliberations: 1, maxAdvanceTicks: 4320 }, jobs: [{
        id: 'archive.deadline', scopeId: 'session', reads: [{ id: 'note', domainId: 'notes', recordId: 'main', fields: ['text'] }],
        enabled: 'reads.note.text != "done"', due: 30, priority: 1, relevance: 'cold',
        action: { kind: 'transaction', transactionId: 'archive.close', input: { target: 'main', text: 'done', amount: 1 } },
    }] };
    const tx = structuredClone(logic.transactions[0]);
    Object.assign(tx, { id: 'archive.close', verb: 'archive_close', origin: 'simulation', intent: { expose: false, description: 'Bounded scheduled closure.' } });
    tx.reads[0].recordId = 'main';
    tx.effects = tx.effects.filter(effect => ['world.event', 'app.command'].includes(effect.kind));
    tx.effects.find(effect => effect.kind === 'app.command').recordId = 'main';
    logic.transactions.push(tx);
    return { contract, logic };
}
const compile = ({ contract, logic }) => compileTransactionDeclarations(logic, { experienceContract: contract });
describe('World Simulation declaration gate', () => {
    test('strict normalization is idempotent and required capability activates the implemented runtime', () => {
        const { contract } = fixture();
        expect(assertNativeExperienceContract(contract)).toEqual(contract);
        expect(assertNativeExperienceContract(assertNativeExperienceContract(contract))).toEqual(contract);
        expect(assertSupportedExperienceContract(contract)).toEqual(contract);
    });
    test('admits multi-century and safe-integer instants without expanding execution budgets', () => {
        const value = fixture();
        value.contract.simulationRuntime.policy.maxAdvanceTicks = Number.MAX_SAFE_INTEGER;
        value.contract.simulationRuntime.jobs[0].due = Number.MAX_SAFE_INTEGER;
        expect(() => assertNativeExperienceContract(value.contract)).not.toThrow();
        expect(() => compile(value)).not.toThrow();
        value.contract.simulationRuntime.jobs[0].due += 1;
        expect(() => assertNativeExperienceContract(value.contract)).toThrow();
    });
    test('resolves static system Transaction and typed input', () => {
        const value = fixture(); expect(compile(value).transactions.at(-1).origin).toBe('simulation');
        value.contract.simulationRuntime.jobs[0].action.input.text = { formula: 'reads.note.text' };
        expect(() => compile(value)).not.toThrow();
    });
    test.each([
        ['missing required capability', c => { c.capabilities.pop(); }],
        ['optional simulation', c => { c.capabilities[1].required = false; }],
        ['optional authority', c => { c.capabilities[0].required = false; }],
        ['missing runtime', c => { delete c.simulationRuntime; }],
        ['wrong clock', c => { c.simulationRuntime.clockId = 'missing'; }],
        ['extra policy', c => { c.simulationRuntime.policy.unlimited = true; }],
        ['too many steps', c => { c.simulationRuntime.policy.maxSteps = 17; }],
        ['unbounded background', c => { c.simulationRuntime.policy.maxDeliberations = 2; }],
        ['unsafe advance', c => { c.simulationRuntime.policy.maxAdvanceTicks = Number.MAX_SAFE_INTEGER + 1; }],
        ['fractional advance', c => { c.simulationRuntime.policy.maxAdvanceTicks = 1.5; }],
        ['zero advance', c => { c.simulationRuntime.policy.maxAdvanceTicks = 0; }],
        ['undeclared read', c => { c.simulationRuntime.jobs[0].enabled = 'reads.note.secret == "x"'; }],
        ['ambient World', c => { c.simulationRuntime.jobs[0].enabled = 'world.hp > 0'; }],
        ['whole record', c => { c.simulationRuntime.jobs[0].due = { formula: 'reads.note' }; }],
        ['wrong computed due type', c => { c.simulationRuntime.jobs[0].due = { formula: 'reads.note.text' }; }],
        ['arbitrary action', c => { c.simulationRuntime.jobs[0].action.kind = 'javascript'; }],
        ['literal relevance', c => { c.simulationRuntime.jobs[0].relevance = 'omniscient'; }],
        ['dynamic record target', c => { c.simulationRuntime.jobs[0].reads[0].recordId = { formula: 'clock.tick' }; }],
        ['missing fields', c => { c.simulationRuntime.jobs[0].reads[0].fields = []; }],
    ])('rejects %s', (_label, mutate) => {
        const { contract } = fixture(); mutate(contract); expect(() => assertNativeExperienceContract(contract)).toThrow();
    });
    test.each([
        ['unknown transaction', f => { f.contract.simulationRuntime.jobs[0].action.transactionId = 'missing'; }],
        ['player transaction', f => { delete f.logic.transactions[1].origin; }],
        ['exposed system transaction', f => { f.logic.transactions[1].intent.expose = true; }],
        ['computed payload type', f => { f.contract.simulationRuntime.jobs[0].action.input.amount = { formula: 'reads.note.text' }; }],
        ['extra payload', f => { f.contract.simulationRuntime.jobs[0].action.input.secret = 1; }],
        ['recursive clock', f => { f.logic.transactions[1].effects.push({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }); }],
        ['recursive workflow', f => { f.logic.transactions[1].effects.push({ kind: 'workflow.transition', workflowId: 'onboarding', transitionId: 'begin' }); }],
        ['dynamic write target', f => { f.logic.transactions[1].effects[1].recordId = { formula: 'args.target' }; }],
    ])('resource closure rejects %s', (_label, mutate) => {
        const value = fixture(); mutate(value); expect(() => compile(value)).toThrow();
    });
});
