import { ChatRepo } from '../../../src/storage/repositories/chat-repo.js';
import { GroupRepo } from '../../../src/storage/repositories/group-repo.js';
import { RpRunControl, rpOperationInput } from '../../../src/native/rp-run-control.js';
import { BudgetPort } from '../../../src/native/orchestration/budget-port.js';
import { SourcePort } from '../../../src/native/orchestration/source-port.js';
import { RunRepository } from '../../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../../src/native/orchestration/attempt-controller.js';
import { runGuard } from '../../../src/native/orchestration/controller-common.js';
import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { createNativeId } from '../../../src/native/identity.js';
import { attachNativeHostLifecycle } from '../../../src/storage/native-host-lifecycle.js';
import { planFixture, prepareControllerOwnerRoot } from '../fixtures.js';

const command = () => createNativeId('orchestrationCommand');

// An explicit read-only controlled consumer, never a model/Actor grant or
// the P4 unique-output/marker consumer. Every source/bank/write is original.
export async function rpConsumptionFixture(make, { isGroup = false } = {}) {
    const h = await make();
    try {
        await prepareControllerOwnerRoot(h.dirs.root);
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const chats = new ChatRepo({ engine: h.engine }), groups = new GroupRepo({ engine: h.engine });
        const locator = { charDir: isGroup ? null : 'Actor', name: isGroup ? 'group-chat' : 'main', isGroup, groupId: isGroup ? 'group-chat' : null };
        const options = { isGroup, groupId: locator.groupId }, charDir = locator.charDir;
        const messages = [{ name: 'Actor', is_user: false, is_system: false, mes: 'Prior original context', memory_os_source_id: 'm0' },
            { name: 'User', is_user: true, is_system: false, mes: 'Current original input', swipe_id: 0, memory_os_source_id: 'm1' }];
        await chats.save(h.handle, charDir, locator.name, {}, messages, null, options);
        if (isGroup) await groups.save(h.handle, 'different-group-document', { id: 'different-group-document', chats: ['group-chat'] });
        const control = new RpRunControl({ engine: h.engine, chatRepo: chats });
        const { controlId } = await control.bind(h.handle, locator);
        const sourceRequest = { domain: 'rp_chat', controlId, source: { input: rpOperationInput(messages[1], 1), purpose: 'narration', outputSlot: 'assistant' } };
        const budget = new BudgetPort({ rpControl: control }), source = new SourcePort({ budgetPort: budget, rpControl: control });
        const { plans } = createOrchestrationAuthoringService(h.engine, { rpControl: control });
        const plan = planFixture(), draft = await plans.create(h.handle, command(), plan);
        const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected);
        if (report.status !== 'valid') throw new Error('Capability-free fixture plan must validate');
        const { planRef } = await plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) });
        const runs = new RunRepository({ engine: h.engine, assertWriter: (owner, tx) => lifecycle.assertWriter(owner, tx),
            authorize: async ({ handle }) => { if (handle !== h.handle) throw new TypeError('Fixture owner required'); },
            admit: ({ handle, tx, sourceRequest }) => source.capture(handle, sourceRequest, { tx }) });
        const started = await runs.start(h.handle, command(), { planRef, sourceRequest, retentionPolicyRef: { policyId: 'controlled_rp_boundary_retention' } });
        const { attemptId } = await runs.beginAttempt(h.handle, command(), { ...runGuard(started), nodeId: plan.definition.entryNodeIds[0], inputRefs: [],
            inputDigest: hash([]), effectiveGrantDigest: hash(started.sourceBinding), budgetRef: started.budgetAuthorityRef });
        await new AttemptController({ runs, authorizeAttempt: ({ handle, tx, root }) => source.revalidate(handle, root.sourceBinding, { tx }) })
            .activate(h.handle, { ...runGuard(await runs.get(h.handle, started.runId)), attemptId });
        const root = await runs.get(h.handle, started.runId);
        const boundary = () => source.consumptionBoundary(h.handle, root.sourceBinding, { engine: h.engine });
        const read = async ({ tx, root: current }) => {
            await source.revalidate(h.handle, current.sourceBinding, { tx });
            await budget.assertCurrent(h.handle, current.budgetAuthorityRef, { tx });
            return (await RpRunControl.prototype.context.call(control, h.handle, controlId, sourceRequest.source, { tx })).messages.at(-1).content;
        };
        const consume = work => runs.withConsumption(h.handle, root.runId, work ?? read, { withAuthority: boundary() });
        const write = async change => {
            if (change === 'delete') return chats.delete(h.handle, charDir, locator.name, options);
            if (change === 'rename') return chats.rename(h.handle, charDir, locator.name, 'renamed-chat', options);
            if (change === 'bulk-delete') return chats.deleteAllForCharacter(h.handle, charDir);
            if (change === 'bulk-rename') return chats.renameCharDir(h.handle, charDir, 'RenamedActor');
            if (change === 'group-cascade') return groups.delete(h.handle, 'different-group-document');
            const current = await chats.get(h.handle, charDir, locator.name, options);
            if (change === 'header') return chats.updateChatMetadata(h.handle, charDir, locator.name, { nativeControlId: null }, current.integrity, options);
            const next = structuredClone(current.body);
            if (change === 'content') next[1].mes = 'Independent original writer';
            if (change === 'variant') next[1].swipe_id = 1;
            if (change === 'history-role') next[0].is_user = true;
            return chats.save(h.handle, charDir, locator.name, current.header, next, current.integrity, options);
        };
        return { h, chats, groups, locator, control, controlId, sourceRequest, source, budget, runs, root, read, consume, boundary, write,
            cleanup: async () => { await h.engine.close(); await h.cleanup(); } };
    } catch (error) { await h.engine.close(); await h.cleanup(); throw error; }
}
