import { jest } from '@jest/globals';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { assertPlanDefinition } from '../../public/shared/native-orchestration-contracts.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture } from './fixtures.js';

const commandId = () => createNativeId('orchestrationCommand');
const expected = root => ({ planId: root.planId, expectedDraftVersion: root.draftVersion, expectedDefinitionHash: root.definitionHash });

describe.each(CONTRACT_HARNESSES)('$name Host authoring', ({ make }) => {
    let h, repository, authorize, validateDependencies, assertWriter;
    beforeEach(async () => {
        h = await make();
        authorize = jest.fn(async () => {});
        assertWriter = jest.fn(async () => {});
        validateDependencies = jest.fn(async ({ dependencyPins }) => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument(dependencyPins) }));
        repository = new PlanRepository({ engine: h.engine, authorize, validateDependencies, assertWriter });
    });
    afterEach(async () => { await h?.cleanup(); });

    test('durable command replay returns the original ID; changed payload is a conflict', async () => {
        const id = commandId(), input = planFixture();
        const created = await repository.create(h.handle, id, input);
        const reopened = new PlanRepository({ engine: h.engine, authorize, validateDependencies, assertWriter });
        expect(await reopened.create(h.handle, id, input)).toEqual(created);
        await expect(repository.create(h.handle, id, { ...input, viewState: {} })).rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
        authorize.mockRejectedValueOnce(new Error('revoked'));
        await expect(repository.create(h.handle, id, input)).rejects.toThrow('revoked');
        expect(await repository.get(h.handle, created.planId)).toEqual(created);
    });

    test('view edits preserve semantic hash; stale save and stale validation cannot publish', async () => {
        const input = planFixture(), root = await repository.create(h.handle, commandId(), input);
        const report = await repository.validate(h.handle, expected(root));
        const saved = await repository.save(h.handle, commandId(), { ...expected(root), ...input, viewState: { positions: { x: 10 } } });
        expect(saved.definitionHash).toBe(root.definitionHash);
        await expect(repository.save(h.handle, commandId(), { ...expected(root), ...input })).rejects.toMatchObject({ code: 'native_orchestration_draft_conflict' });
        await expect(repository.publish(h.handle, commandId(), { ...expected(root), validationDigest: validationDigest(report) })).rejects.toMatchObject({ code: 'native_orchestration_draft_conflict' });
        expect(validateDependencies).toHaveBeenCalledTimes(1);
    });

    test('concurrent publication has one winner; immutable revision survives later draft edits', async () => {
        const input = planFixture(), root = await repository.create(h.handle, commandId(), input);
        const report = await repository.validate(h.handle, expected(root));
        const body = { ...expected(root), validationDigest: validationDigest(report) };
        const commands = [commandId(), commandId()];
        const outcomes = await Promise.allSettled(commands.map(id => repository.publish(h.handle, id, body)));
        expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
        expect(outcomes.filter(outcome => outcome.status === 'rejected')[0].reason.code).toBe('native_orchestration_draft_conflict');
        const winner = outcomes.findIndex(outcome => outcome.status === 'fulfilled'), published = outcomes[winner].value;
        expect(await repository.publish(h.handle, commands[winner], body)).toEqual(published);
        const revision = await repository.getRevision(h.handle, published.planRef);
        const current = await repository.get(h.handle, root.planId);
        input.definition.nodes[0].label = 'Changed draft';
        await repository.save(h.handle, commandId(), { ...expected(current), ...input });
        expect(await repository.getRevision(h.handle, published.planRef)).toEqual(revision);
    });

    test('missing or changed dependency evidence blocks publish without partial revision/command writes', async () => {
        const root = await repository.create(h.handle, commandId(), planFixture());
        const report = await repository.validate(h.handle, expected(root));
        validateDependencies.mockResolvedValueOnce({ status: 'unknown', issues: [{ code: 'source_unavailable', severity: 'unknown' }], dependencyDigest: 'a'.repeat(64) });
        const id = commandId();
        await expect(repository.publish(h.handle, id, { ...expected(root), validationDigest: validationDigest(report) })).rejects.toMatchObject({ code: 'native_orchestration_validation_stale' });
        for (const kind of [K.orchestrationRevision, K.orchestrationCommand]) {
            const records = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind, handle: h.handle }));
            expect(records.some(record => record.key.commandId === id || kind === K.orchestrationRevision)).toBe(false);
        }
        expect(await repository.get(h.handle, root.planId)).toEqual(root);
    });

    test('exact source binding is CAS/versioned and never falls back to another subject', async () => {
        const root = await repository.create(h.handle, commandId(), planFixture());
        const report = await repository.validate(h.handle, expected(root));
        const { planRef } = await repository.publish(h.handle, commandId(), { ...expected(root), validationDigest: validationDigest(report) });
        const sourceSelector = { domain: 'rp_chat', controlId: createNativeId('rpControl') };
        const id = commandId(), body = { sourceSelector, planRef, expectedVersion: null };
        const binding = await repository.saveBinding(h.handle, id, body);
        expect(await repository.saveBinding(h.handle, id, body)).toEqual(binding);
        await expect(repository.saveBinding(h.handle, commandId(), body)).rejects.toMatchObject({ code: 'native_orchestration_binding_conflict' });
        expect(await repository.getBinding(h.handle, sourceSelector)).toEqual(binding);
        expect(await repository.getBinding(h.handle, { ...sourceSelector, controlId: createNativeId('rpControl') })).toBeNull();
    });

    test('invalid writer cannot mutate; corrupt root is refused before CAS', async () => {
        assertWriter.mockRejectedValueOnce(new Error('old owner'));
        await expect(repository.create(h.handle, commandId(), planFixture())).rejects.toThrow('old owner');
        const root = await repository.create(h.handle, commandId(), planFixture());
        const key = { kind: K.orchestrationPlan, handle: h.handle, planId: root.planId };
        await h.engine.withTransaction(h.handle, async tx => {
            const record = await tx.getResource(key); record.doc.definitionHash = 'b'.repeat(64);
            await tx.putResource(key, record);
        });
        await expect(repository.get(h.handle, root.planId)).rejects.toThrow();
    });
});

test('strict graph rejects executable/unknown policy, unconnected ports, missing output and capability escalation', () => {
    for (const mutate of [
        value => { value.definition.mode = 'Single'; },
        value => { value.definition.nodes[0].policy.js = 'return true'; },
        value => { value.definition.nodes[0].capabilities.push('world.write'); },
        value => { value.definition.outputContract.ownerNodeId = createNativeId('orchestrationNode'); },
        value => { value.definition.limits.maxSteps = Infinity; },
        value => { value.dependencyPins.push({ pinId: 'old', port: 'model', resourceRef: {}, integrity: 'invalid' }); },
    ]) {
        const value = planFixture(); mutate(value);
        expect(() => assertPlanDefinition(value.definition, value.dependencyPins)).toThrow();
    }
});
