import '../util/browser-context.js';
import { afterEach, expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { evolutionFixture, runEvolution, labelAll, skillMd } from './evolution-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { AgentEvolutionRepository } from '../../src/native/agent-intelligence/evolution-repository.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { createNativeId } from '../../src/native/identity.js';

const cleanup = [];
afterEach(async () => { jest.restoreAllMocks(); for (const fn of cleanup.splice(0)) await fn(); });
async function setup(make = makeTempFsEngineHarness, change = async () => {}) {
    const sends = [], pending = [];
    const f = await evolutionFixture(make, 'rp-skill', { fetchImpl: async (_url, options) => {
        sends.push(JSON.parse(options.body)); await change(f);
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: 'The NPC waits for your decision.' } }],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    } });
    cleanup.push(async () => {
        for (const operation of nativeTaskScheduler.operations.values()) if (operation.owner === f.h.handle) nativeTaskScheduler.cancel(f.h.handle, operation.view.operationId);
        await Promise.allSettled(pending); await f.h.engine.close(); await f.h.cleanup();
    });
    const { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
    const publication = (await f.repository.get(f.h.handle, f.scope, f.subject)).publications[0];
    if (!publication) throw new Error('Publication unavailable: ' + JSON.stringify(await f.repository.get(f.h.handle, f.scope, f.subject)));
    expect(publication.activation).toBeNull();
    const host = new NativeGenerationHost(f.host), chats = new ChatRepo({ engine: f.h.engine });
    const { controlId: originalControlId } = await f.host.turnOrchestration.rpControl.bind(f.h.handle,
        { charDir: f.scope.charDir, name: f.scope.name, isGroup: false, groupId: null });
    const binding = await f.host.turnOrchestration.plans.getBinding(f.h.handle, { domain: 'rp_chat', controlId: originalControlId });
    const run = async (name = f.scope.name) => {
        await chats.save(f.h.handle, f.scope.charDir, name, {}, [{ memory_os_source_id: 'next-user', is_user: true, name: 'User', mes: 'Wait for my choice.' }], null);
        const { controlId } = await f.host.turnOrchestration.rpControl.bind(f.h.handle, { charDir: f.scope.charDir, name, isGroup: false, groupId: null });
        const original = await f.host.turnOrchestration.plans.getBinding(f.h.handle, { domain: 'rp_chat', controlId });
        if (!original) await f.host.turnOrchestration.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'),
            { sourceSelector: { domain: 'rp_chat', controlId }, planRef: binding.planRef, expectedVersion: null });
        const operation = await host.startRp(f.h.handle, { controlId, floor: 0, requestId: 'native-skill-activation-' + name,
            routeRef: { scope: 'player', runtimeRouteId: f.route.runtimeRouteId } });
        pending.push(operation.result); return operation.result;
    };
    return { ...f, host, chats, sends, publication, run, originalControlId,
        activation: async () => (await new AgentEvolutionRepository({ engine: f.h.engine }).get(f.h.handle, f.scope, f.subject)).publications[0].activation };
}

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s next Native RP output observes its exact published Skill and original receipts without client trace', async (_name, make) => {
    const f = await setup(make), owner = await f.repository.owner(f.h.handle), result = await f.run();
    expect(result.output).toMatchObject({ status: 'committed', runStatus: 'completed' });
    expect(f.sends).toHaveLength(1); expect(JSON.stringify(f.sends)).toContain(f.publication.desired);
    const activation = await f.activation();
    expect(activation).toMatchObject({ origin: 'host', runId: result.runId, effectId: result.effectId,
        requestId: 'native-skill-activation-' + f.scope.name, modelReceiptRef: result.receiptRef,
        outputReceiptRef: result.output.outputReceiptRef });
    expect(activation.contextId).toMatch(/^[a-f0-9]{64}$/); expect(activation.consumptionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await f.repository.owner(f.h.handle)).toEqual(owner);
    const root = await f.host.turnOrchestration.execution.runs.get(f.h.handle, result.runId);
    const control = await f.host.turnOrchestration.rpControl.status(f.h.handle, root.sourceBinding.sourceRef.controlId);
    const facts = control.operations[root.budgetAuthorityRef.operationId].compute;
    expect(facts.attempts).toHaveLength(1); expect(facts.attempts[0].status).toBe('settled');
    expect(facts.localWork.map(row => row.kind)).toEqual(expect.arrayContaining(['skill_inventory', 'skill_pin', 'skill_load', 'rp_output']));
});

test.each(['replaced', 'disabled', 'on-demand'])('Native output leaves activation pending when published Skill is %s before compilation', async mode => {
    const f = await setup();
    if (mode === 'replaced') await f.host.skillRepository(f.h.handle).install({ scope: f.target.scope, conflictStrategy: 'replace', payload: { files: [{ path: 'SKILL.md', content: skillMd('Different guidance') }] } });
    else {
        const before = await f.host.extensions.settings(f.h.handle);
        await f.host.extensions.saveSettings(f.h.handle, { ...before.value, skills: { [skillEntryKey(f.target)]: { paths: { narrative: mode === 'disabled' ? 'off' : 'on-demand' } } } }, before.revision);
    }
    const result = await f.run();
    expect(result.output.runStatus).toBe('completed'); expect(f.sends).toHaveLength(1);
    expect(JSON.stringify(f.sends)).not.toContain(f.publication.desired); expect(await f.activation()).toBeNull();
});

test('the same exact Skill consumed by another RP chat does not activate this chat publication', async () => {
    const f = await setup(), result = await f.run('other-chat');
    expect(result.output.runStatus).toBe('completed'); expect(f.sends).toHaveLength(1);
    expect(JSON.stringify(f.sends)).toContain(f.publication.desired); expect(await f.activation()).toBeNull();
});

test('Skill drift after actual Provider send retains fees and leaves activation pending', async () => {
    const f = await setup(makeTempFsEngineHarness, async f => {
        await f.host.skillRepository(f.h.handle).install({ scope: f.target.scope, conflictStrategy: 'replace', payload: { files: [{ path: 'SKILL.md', content: skillMd('Changed during Provider request') }] } });
    });
    await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_skill_source_stale' });
    expect(f.sends).toHaveLength(1); expect(await f.activation()).toBeNull();
    expect((await f.chats.get(f.h.handle, f.scope.charDir, f.scope.name)).body).toHaveLength(1);
    const control = await f.host.turnOrchestration.rpControl.status(f.h.handle, f.originalControlId);
    const attempts = Object.values(control.operations).flatMap(operation => operation.compute?.attempts ?? []);
    expect(attempts).toHaveLength(1); expect(attempts[0].status).toBe('settled');
});

test('unknown original RP output never marks a Skill activated from Model completion alone', async () => {
    const f = await setup();
    jest.spyOn(ChatRepo.prototype, 'commitNativeOutput').mockImplementationOnce(async () => { throw Object.assign(new Error('Lost original writer ACK'), { code: 'storage_commit_unknown' }); });
    const result = await f.run();
    expect(result.output).toMatchObject({ status: 'unknown', runStatus: 'pending_output' });
    expect(f.sends).toHaveLength(1); expect(await f.activation()).toBeNull();
    expect((await f.chats.get(f.h.handle, f.scope.charDir, f.scope.name)).body).toHaveLength(1);
});
