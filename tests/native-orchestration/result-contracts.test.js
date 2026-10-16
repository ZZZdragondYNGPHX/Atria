import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putImmutable } from '../../src/native/repositories/common.js';
import { assertPlanDefinition, assertResultPolicy } from '../../public/shared/native-orchestration-contracts.js';
import { assertResultJson, assertResultRecord, resultDependencyDigest } from '../../src/native/orchestration/result-contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { planFixture } from './fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const harnesses = CONTRACT_HARNESSES.filter(item => ['FsEngine', 'SqliteEngine'].includes(item.name) || process.env.ATRIA_TEST_RESULT_SQL === '1');

function fixture(outputType = 'text', payload = 'Task-local model suggestion.') {
    const runId = createNativeId('orchestrationRun'), resultId = createNativeId('orchestrationResult');
    const sourceBindingDigest = hash({ originalSource: 'synthetic original RP anchor' });
    const envelope = { schemaVersion: 1, resultId, runId, producerAttemptId: createNativeId('orchestrationAttempt'), outputType,
        outputSchemaRef: { kind: 'native_builtin', schema: outputType },
        payloadRef: { kind: 'orchestration_result_payload', runId, resultId, integrity: hash(payload) },
        sourceRefs: [{ kind: 'run_source', runId, epoch: 3, sourceBindingDigest, sourceAuthority: 'rp_chat',
            sourceRef: { controlId: createNativeId('rpControl'), prefixDigest: hash({ prefix: 'original RP prefix' }) } },
        { kind: 'effect_receipt', runId, effectId: createNativeId('orchestrationEffect'), receiptId: createNativeId('orchestrationReceipt'), observedEpoch: 3 }],
        dependencyDigest: '', audienceConstraint: { kind: 'parent_attempt', parentRunId: createNativeId('orchestrationRun'),
            parentAttemptId: createNativeId('orchestrationAttempt'), parentEpoch: 2, sourceBindingDigest,
            grantDigest: hash({ grant: 'reference only, not authorization' }), taskPurpose: 'delegate_suggestion' },
        disclosureConstraint: { kind: 'same_source_parent_only' }, qualityRefs: [], status: 'complete', createdAt: 10 };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    const outputContract = { kind: 'result', ownerNodeId: createNativeId('orchestrationNode'), slot: 'suggestion', allowPartial: false,
        resultPolicy: { outputType, maxBytes: 200 } };
    return { record: { schemaVersion: 1, runId, resultId, envelope, payload }, outputContract };
}

function rebind(record) {
    record.envelope.payloadRef.integrity = hash(record.payload);
    record.envelope.dependencyDigest = resultDependencyDigest(record.envelope);
    return record;
}

describe('explicit Result policy and plain JSON validation', () => {
    test('a Plan may omit a policy until actual payload production, which then fails explicitly', () => {
        const plan = planFixture(); expect(() => assertPlanDefinition(plan.definition, plan.dependencyPins)).not.toThrow();
        expect(() => assertResultPolicy(plan.definition.outputContract)).toThrow('native_orchestration_result_policy_unavailable');
        const f = fixture(); delete f.outputContract.resultPolicy;
        expect(() => assertResultRecord(f.record, f)).toThrow('native_orchestration_result_policy_unavailable');
    });

    test('only result output contracts may carry an explicit positive byte policy', () => {
        for (const policy of [{ outputType: 'text', maxBytes: 1 }, { outputType: 'json', maxBytes: Number.MAX_SAFE_INTEGER }]) {
            const plan = planFixture(); plan.definition.outputContract.resultPolicy = policy;
            expect(assertPlanDefinition(plan.definition, plan.dependencyPins)).toBe(plan.definition);
        }
        for (const maxBytes of [0, -1, 1.1, Infinity, Number.MAX_SAFE_INTEGER + 1])
            expect(() => assertResultPolicy({ kind: 'result', resultPolicy: { outputType: 'text', maxBytes } })).toThrow();
        for (const kind of ['rp_narration', 'project_review']) {
            const plan = planFixture(); plan.definition.outputContract = { ...plan.definition.outputContract, kind, resultPolicy: { outputType: 'text', maxBytes: 1 } };
            expect(() => assertPlanDefinition(plan.definition, plan.dependencyPins)).toThrow('native_orchestration_result_policy_unavailable');
        }
        expect(() => assertResultPolicy({ kind: 'result', resultPolicy: { outputType: 'xml', maxBytes: 20 } })).toThrow();
        expect(() => assertResultPolicy({ kind: 'result', resultPolicy: { outputType: 'text', maxBytes: 20, defaultAllow: true } })).toThrow();
    });

    test.each([undefined, NaN, Infinity, 1n, () => {}, new Date(), new Map(), Object.create({ inherited: true }),
        { value: undefined }, [undefined], Array(1), Object.assign([], { extra: true }), new (class Payload { constructor() { this.value = 1; } })()])('non-JSON payload example %# is rejected', value => { expect(() => assertResultJson(value)).toThrow(); });

    test('cycles, symbols, hidden properties and accessors are rejected without evaluating a getter', () => {
        const cycle = {}; cycle.self = cycle;
        const symbol = { [Symbol('hidden')]: 1 }, hidden = Object.defineProperty({}, 'hidden', { value: 1 });
        let calls = 0; const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { calls++; return 'private'; } });
        for (const value of [cycle, symbol, hidden, accessor]) expect(() => assertResultJson(value)).toThrow();
        expect(calls).toBe(0);
    });

    test('custom array and constructor prototypes cannot masquerade as plain cross-realm JSON', () => {
        const customArray = new (class Values extends Array {})();
        const customArrayPrototype = Object.setPrototypeOf([], []);
        const customObject = class Object {};
        Object.setPrototypeOf(customObject.prototype, null);
        let calls = 0;
        const accessorPrototype = Object.create(null, { constructor: { get() { calls++; return Object; } } });
        for (const value of [customArray, customArrayPrototype, new customObject(), Object.create(accessorPrototype)]) expect(() => assertResultJson(value)).toThrow();
        expect(calls).toBe(0);
        expect(() => assertResultJson(Object.assign(Object.create(null), { plain: [1, 'text'] }))).not.toThrow();
    });
});

describe.each(harnesses)('$name task-local Result contract fixture', ({ make }) => {
    test.each(['text', 'json'])('strict %s record round-trips through the original native result kind', async outputType => {
        const h = await make(), f = fixture(outputType, outputType === 'text' ? 'Only the exact parent may consume this suggestion.' : { nested: [true, null, '雪'], count: 2 });
        try {
            assertResultRecord(f.record, f);
            const key = controlRecordKey(h.handle, f.record.runId, 'result', f.record.resultId);
            // Direct storage is a fixture only. No production Result writer,
            // model completion proof or domain grant is claimed by this test.
            await h.engine.withTransaction(h.handle, tx => putImmutable(tx, key, f.record));
            const stored = await h.engine.withTransaction(h.handle, tx => checkedRecord(tx, key));
            expect(assertResultRecord(stored.doc, f)).toEqual(f.record);
        } finally { await h.engine.close(); await h.cleanup(); }
    });

    test('actual UTF-8 text and canonical JSON byte bounds do not use token or local-work estimates', async () => {
        const h = await make();
        try {
            const text = fixture('text', '雪'); text.outputContract.resultPolicy.maxBytes = 3;
            expect(() => assertResultRecord(text.record, text)).not.toThrow();
            text.outputContract.resultPolicy.maxBytes = 2; expect(() => assertResultRecord(text.record, text)).toThrow('byte bound');
            const json = fixture('json', { a: '雪' }); json.outputContract.resultPolicy.maxBytes = Buffer.byteLength('{"a":"雪"}', 'utf8');
            expect(() => assertResultRecord(json.record, json)).not.toThrow();
            json.outputContract.resultPolicy.maxBytes--; expect(() => assertResultRecord(json.record, json)).toThrow('byte bound');
        } finally { await h.engine.close(); await h.cleanup(); }
    });

    test('stored payload edits fail even when the physical record integrity is honestly rewritten', async () => {
        const h = await make(), f = fixture();
        try {
            const key = controlRecordKey(h.handle, f.record.runId, 'result', f.record.resultId);
            await h.engine.withTransaction(h.handle, tx => putImmutable(tx, key, f.record));
            const changed = structuredClone(f.record); changed.payload = 'different unverified body';
            await h.engine.withTransaction(h.handle, tx => tx.putResource(key, { doc: changed, integrity: hash(changed), createdAt: 10, updatedAt: 11 }));
            const stored = await h.engine.withTransaction(h.handle, tx => checkedRecord(tx, key));
            expect(() => assertResultRecord(stored.doc, f)).toThrow('payload integrity');
        } finally { await h.engine.close(); await h.cleanup(); }
    });

    test('partial requires explicit allowPartial and unknown/unavailable never contain a body', () => {
        const f = fixture(); f.record.envelope.status = 'partial'; rebind(f.record);
        expect(() => assertResultRecord(f.record, f)).toThrow('partial output');
        f.outputContract.allowPartial = true; expect(() => assertResultRecord(f.record, f)).not.toThrow();
        for (const status of ['unknown', 'unavailable']) {
            f.record.envelope.status = status; rebind(f.record);
            expect(() => assertResultRecord(f.record, f)).toThrow('no body');
            f.record.payload = null; rebind(f.record); expect(() => assertResultRecord(f.record, f)).not.toThrow();
            f.record.payload = 'body';
        }
    });

    test.each(['record-id', 'payload-id', 'payload-run', 'schema', 'source-epoch', 'source-binding', 'producer-run', 'extra-field', 'dependency', 'quality', 'disclosure'])('the closed record rejects %s mismatch', change => {
        const f = fixture(), r = f.record, e = r.envelope;
        if (change === 'record-id') r.resultId = createNativeId('orchestrationResult');
        if (change === 'payload-id') e.payloadRef.resultId = createNativeId('orchestrationResult');
        if (change === 'payload-run') e.payloadRef.runId = createNativeId('orchestrationRun');
        if (change === 'schema') e.outputSchemaRef.schema = 'json';
        if (change === 'source-epoch') e.sourceRefs[1].observedEpoch++;
        if (change === 'source-binding') e.audienceConstraint.sourceBindingDigest = hash({ different: true });
        if (change === 'producer-run') e.sourceRefs[0].runId = createNativeId('orchestrationRun');
        if (change === 'extra-field') e.allowed = true;
        if (change === 'dependency') e.dependencyDigest = hash({ changed: true });
        if (change === 'quality') e.qualityRefs = [{ approved: true }];
        if (change === 'disclosure') e.disclosureConstraint.kind = 'public';
        if (change !== 'dependency') e.dependencyDigest = resultDependencyDigest(e);
        expect(() => assertResultRecord(r, f)).toThrow();
    });

    test('expected producer, epoch, source, receipt and exact recipient are independent consistency checks, not authorization', () => {
        const f = fixture(), e = f.record.envelope, source = e.sourceRefs[0];
        const expected = { runId: e.runId, resultId: e.resultId, producerAttemptId: e.producerAttemptId, producerEpoch: source.epoch,
            sourceBindingDigest: source.sourceBindingDigest, sourceRef: source.sourceRef, effectReceiptRef: e.sourceRefs[1], audienceConstraint: e.audienceConstraint };
        expect(() => assertResultRecord(f.record, { ...f, expected })).not.toThrow();
        for (const key of Object.keys(expected)) expect(() => assertResultRecord(f.record, { ...f, expected: { ...expected, [key]: null } })).toThrow('expected');
        expect(() => assertResultRecord(f.record, { ...f, expected: { allowed: true } })).toThrow('unknown expected');
    });
});
