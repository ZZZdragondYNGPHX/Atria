import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Diagnostic only. No Package declaration, Session, provider or product file is modified.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const at = args.indexOf('--core');
if (at < 0 || !args[at + 1]) throw new Error('Usage: node tools/simulation-contract-check.mjs --core <main-checkout>');
const core = path.resolve(args[at + 1]);
const load = rel => import(pathToFileURL(path.join(core, rel)).href);
const json = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const { assertLifecycleRuntime } = await load('public/shared/native-lifecycle-contract.js');
const { initialLifecycle, prepareLifecycle } = await load('src/native/lifecycle-authority.js');
const { NativeGenerationHost } = await load('src/native/adapters/generation-host.js');
const lifecycle = await json('runtime/lifecycle.json');
const seed = await json('data/seed.bootstrap.json');
// Match the build tool's seed lowering before validating declarations.
lifecycle.domains.find(d => d.id === 'entities').commands.find(c => c.id === 'bootstrap').assign = { scene: seed.scene, playerStatus: seed.playerStatus, privateNote: seed.privateNote };
const tasks = await json('runtime/tasks.json');
const task = tasks.tasks.find(t => t.id === 'agenda.deliberation');
assert(task);
const input = { institutionId: 'fixture', agendaId: 'foundation', blockers: [], knownRecords: [], tick: 0, permittedActions: ['defer'] };
const automation = { id: 'probe.agenda', scopeId: 'world', trigger: { kind: 'world.schedule', clockId: 'world', at: 30, catchUp: 'all' }, action: { kind: 'task', taskId: task.id, variantId: 'default', input }, maxCatchUp: 1 };
const source = { ...structuredClone(lifecycle), automations: [automation], workflows: [] };
const normalized = assertLifecycleRuntime(source, tasks);
const results = [];
const reject = (name, pattern, mutate) => {
    const value = structuredClone(source); mutate(value);
    assert.throws(() => assertLifecycleRuntime(value, tasks), pattern);
    results.push(name);
};
reject('automation state guard is not declared', /unknown field when/, value => { value.automations[0].when = 'reads.agenda.relevance == "hot"'; });
reject('Task input cannot evaluate current clock', /integer|number|schema/i, value => { value.automations[0].action.input.tick = { formula: 'clock.tick' }; });
reject('Lifecycle cannot dispatch Authority Transaction', /Unknown lifecycle action kind/, value => { value.automations[0].action = { kind: 'authority.transaction', transactionId: 'advance_time', input: {} }; });
reject('Workflow transitions do not accept state guards', /unknown field when/, value => {
    value.workflows = [{ id: 'probe.flow', scopeId: 'world', initial: 'waiting', nodes: [{ id: 'waiting', kind: 'user_gate' }, { id: 'done', kind: 'terminal' }], transitions: [{ id: 'next', from: 'waiting', to: 'done', when: 'true' }] }];
});
const baseFor = def => ({ manifest: { runtime: { experienceContract: { lifecycleRuntime: def, taskRuntime: tasks } } }, timeline: [], states: { atri_lifecycle: initialLifecycle(def) } });
const step = async (base, action) => {
    const before = structuredClone(base);
    const prepared = await prepareLifecycle(base, null, action);
    assert.deepEqual(base, before, 'Preparation must not mutate the source');
    return { ...base, states: prepared.states };
};
let base = baseFor(normalized);
base = await step(base, { kind: 'experience.ready' });
assert.equal(base.states.atri_lifecycle.outbox.length, 0);
base = await step(base, { kind: 'clock.advance', commandId: lifecycle.advances[0].id, ticks: 60 });
base = await step(base, { kind: 'pump' });
assert.equal(base.states.atri_lifecycle.clocks.world, 60);
assert.equal(base.states.atri_lifecycle.outbox.length, 1);
assert.deepEqual(base.states.atri_lifecycle.outbox[0].input, input);
results.push('real Lifecycle due Task keeps literal tick=0 at world tick=60');

// A single large jump pumps by declaration order, not next-due-time order.
const due = structuredClone(source);
due.automations = [60, 30].map(tick => ({ id: 'probe.due.' + tick, scopeId: 'world', trigger: { kind: 'world.schedule', clockId: 'world', at: tick, catchUp: 'all' }, action: { kind: 'app.command', domainId: 'entities', commandId: 'bootstrap', recordId: 'due-' + tick, args: {} }, maxCatchUp: 1 }));
let timed = baseFor(assertLifecycleRuntime(due, tasks));
timed = await step(timed, { kind: 'experience.ready' });
timed = await step(timed, { kind: 'clock.advance', commandId: lifecycle.advances[0].id, ticks: 60 });
const pumped = await prepareLifecycle(timed, null, { kind: 'pump' });
assert.deepEqual(pumped.events.map(event => event.recordId), ['due-60', 'due-30']);
results.push('real Lifecycle catch-up follows declaration order [60,30], not event-driven jumps');

// Invoke the real dispatch loop with explicit doubles at storage/provider boundaries.
// This is a control-flow unit probe, NOT an installed Session or model integration test.
const calls = [];
let snapshot = { revision: { revisionId: 'r0' }, states: { atri_lifecycle: { ready: true, scopes: { world: { status: 'active', epoch: 0 } }, outbox: Array.from({ length: 5 }, (_, i) => ({ invocationId: 'probe-' + i, taskId: task.id, variantId: 'default', input, status: 'pending', scopeId: 'world', scopeEpoch: 0 })) } } };
const host = new NativeGenerationHost({ sessionCore: { load: async () => structuredClone(snapshot) } });
host.executeTask = async (_handle, request) => {
    calls.push({ invocationId: request.invocationId, revisionId: request.revisionId });
    snapshot.states.atri_lifecycle.outbox.find(item => item.invocationId === request.invocationId).status = 'completed';
    snapshot.revision.revisionId = 'r' + calls.length;
    return { record: { invocationId: request.invocationId }, snapshot: structuredClone(snapshot) };
};
await host.executeLifecycle(null, { sessionId: 'probe', revisionId: 'r0' });
assert.deepEqual(calls.map(call => call.revisionId), ['r0', 'r1', 'r2', 'r3']);
assert.equal(snapshot.states.atri_lifecycle.outbox.filter(item => item.status === 'pending').length, 1);
results.push('real Host dispatch loop uses successive anchors and fixed four-call cap (test doubles)');

const logic = await json('runtime/logic.json');
const publications = logic.derivedPublications.flatMap(p => p.effects);
const publicationReads = logic.derivedPublications.reduce((sum, p) => sum + p.reads.length, 0);
const budget = logic.transactions.map(tx => {
    const effects = [...tx.effects, ...publications];
    return { id: tx.id, reads: tx.reads.length + publicationReads, appCommands: effects.filter(e => e.kind === 'app.command').length, effects: effects.length };
});
for (const tx of budget) { assert(tx.reads <= 16); assert(tx.appCommands <= 24); assert(tx.effects <= 32); }
console.log(JSON.stringify({ coreHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: core, encoding: 'utf8' }).trim(), status: 'P3 contract gap reproduced; NOT P3 acceptance', checks: results, declarationBudget: budget, limitations: ['No installed Session/provider integration in this diagnostic', 'No P3 simulation implementation or save-container recovery validated', 'No Core or runtime declaration changes'] }, null, 2));
