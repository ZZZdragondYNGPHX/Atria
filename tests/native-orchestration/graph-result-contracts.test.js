import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putImmutable, putMutable } from '../../src/native/repositories/common.js';
import { graphResultContract, graphNodeResult, readGraphNodeResult, readGraphNodeResults, graphResultPublicationId } from '../../src/native/orchestration/graph-result-contracts.js';
import { assertResultRecord, resultDependencyDigest } from '../../src/native/orchestration/result-contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { writeAttemptSettlement, attemptReceiptId } from '../../src/native/orchestration/attempt-settlement.js';
import { effectDecision } from '../../src/native/orchestration/effect-contracts.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const id = kind => createNativeId('orchestration' + kind);
function fixture(outputType = 'text') {
    const runId = id('Run'), a = id('Node'), b = id('Node'), c = id('Node');
    const sourceRef = { controlId: createNativeId('rpControl'), prefixDigest: hash('original-prefix') };
    const source = { sourceAuthority: 'rp_chat', sourceRef, sourceRequest: { domain: 'rp_chat' } }, sourceBinding = { ...source, bindingDigest: hash(source) };
    const root = { runId, parentRef: null, graphRevision: 0, sourceBinding, graph: { graphChangePolicy: { allowedOperations: [], allowedNodeKinds: [] },
        nodes: [{ nodeId: a, kind: 'agent', outputs: [{ name: 'result', type: outputType }] }, { nodeId: b, kind: 'review' }, { nodeId: c, kind: 'judge' }],
        edges: [{ from: { nodeId: a }, to: { nodeId: c }, loopBack: false }, { from: { nodeId: a }, to: { nodeId: b }, loopBack: false }],
        outputContract: { kind: 'rp_narration', ownerNodeId: id('Node'), slot: 'assistant', allowPartial: false, resultPolicy: { outputType: 'text', maxBytes: 1000 } } } };
    const producer = { nodeId: a, attemptId: id('Attempt'), epoch: 3, graphRevision: 0, effectiveGrantDigest: hash('original-producer-grant') };
    const text = outputType === 'text' ? 'Untrusted draft.' : '{"decision":"approve"}';
    const proof = { runId, producerAttemptId: producer.attemptId, epoch: 3, outputType: 'text', payloadHash: hash(text), sourceBinding,
        effectId: id('Effect'), receiptRef: { runId, receiptId: id('Receipt') } };
    return { root, producer, proof, text, b, c };
}
const build = f => graphNodeResult({ ...f, now: 100 });

// Pure data contracts only; a fixture proof is not accepted by ModelPort and
// these functions do not publish, disclose payloads, send or authorize a recipient.
describe('same-source RP graph Result data contracts', () => {
    test('an exact Audience pin cannot label another Audience input as its own provenance', () => {
        const f = fixture(), audience = { kind: 'actor', id: 'source-actor' };
        const pin = { pinId: 'actor.context', port: 'context', integrity: hash('original-exact-view'), resourceRef: {
            kind: 'native_information_context', sessionId: createNativeId('session'), branchId: createNativeId('branch'), revisionId: createNativeId('revision'), audience,
        } };
        Object.assign(f.root.graph.nodes[0], { policy: { audiencePinId: pin.pinId }, dependencyPinIds: [pin.pinId] });
        f.producer.inputRefs = [{ audience }];
        expect(graphNodeResult({ ...f, dependencyPins: [pin], now: 100 }).envelope.sourceRefs[2].sourceRef.audience).toEqual(audience);
        f.producer.inputRefs[0].audience = { kind: 'narrator' };
        expect(() => graphNodeResult({ ...f, dependencyPins: [pin], now: 100 })).toThrow('native_orchestration_context_audience_denied');
    });
    test.each(['text', 'json'])('%s retains exact original generation and only canonical direct successor identities', outputType => {
        const f = fixture(outputType), result = build(f), contract = graphResultContract(f.root, f.producer);
        expect(result.envelope.audienceConstraint).toMatchObject({ kind: 'graph_nodes', runId: f.root.runId, nodeIds: [f.b, f.c].sort(), epoch: 3,
            grantDigest: f.producer.effectiveGrantDigest, taskPurpose: 'original_rp_graph_result' });
        expect(result.payload).toEqual(outputType === 'text' ? f.text : { text: f.text, toolCalls: [] });
        expect(assertResultRecord(result, { outputContract: contract.output })).toEqual(result);
        expect(() => assertResultRecord(result, { outputContract: f.root.graph.outputContract })).toThrow();
    });
    test.each(['source', 'parent', 'dynamic', 'revision', 'output', 'untyped', 'no-recipient'])('%s does not infer a new consumer authority', problem => {
        const f = fixture();
        if (problem === 'source') f.root.sourceBinding.sourceAuthority = 'native_session';
        if (problem === 'parent') f.root.parentRef = { parentRunId: id('Run') };
        if (problem === 'dynamic') f.root.graph.graphChangePolicy.allowedOperations = ['addNode'];
        if (problem === 'revision') f.root.graphRevision = 1;
        if (problem === 'output') f.root.graph.nodes[1].kind = 'output';
        if (problem === 'untyped') f.root.graph.nodes[0].outputs[0].type = 'task.result';
        if (problem === 'no-recipient') f.root.graph.edges = [];
        expect(() => build(f)).toThrow('Invalid Graph Result facts');
    });
    test.each(['run', 'receipt-run', 'producer', 'epoch', 'payload', 'source'])('%s proof mismatch cannot produce even a consistent protected record', problem => {
        const f = fixture();
        if (problem === 'run') f.proof.runId = id('Run');
        if (problem === 'receipt-run') f.proof.receiptRef.runId = id('Run');
        if (problem === 'producer') f.proof.producerAttemptId = id('Attempt');
        if (problem === 'epoch') f.proof.epoch++;
        if (problem === 'payload') f.proof.payloadHash = hash('other');
        if (problem === 'source') f.proof.sourceBinding = { ...f.proof.sourceBinding, bindingDigest: hash('other') };
        expect(() => build(f)).toThrow('Invalid Graph Result facts');
    });
    test.each(['duplicate', 'unsorted', 'extra-field', 'other-run', 'epoch', 'source', 'purpose', 'disclosure'])('%s audience remains invalid after honest dependency rehash', problem => {
        const f = fixture(), result = build(f), audience = result.envelope.audienceConstraint;
        if (problem === 'duplicate') audience.nodeIds = [f.b, f.b];
        if (problem === 'unsorted') audience.nodeIds = [...audience.nodeIds].reverse();
        if (problem === 'extra-field') audience.approved = true;
        if (problem === 'other-run') audience.runId = id('Run');
        if (problem === 'epoch') audience.epoch++;
        if (problem === 'source') audience.sourceBindingDigest = hash('other');
        if (problem === 'purpose') audience.taskPurpose = 'world_commit';
        if (problem === 'disclosure') result.envelope.disclosureConstraint.kind = 'public';
        result.envelope.dependencyDigest = resultDependencyDigest(result.envelope);
        expect(() => assertResultRecord(result, { outputContract: graphResultContract(f.root, f.producer).output })).toThrow();
    });
    test('node payload bound reuses the declared Plan limit and measures actual UTF-8 representation', () => {
        const f = fixture('json'), initial = build(f), bytes = Buffer.byteLength(JSON.stringify(initial.payload));
        f.root.graph.outputContract.resultPolicy.maxBytes = bytes;
        expect(() => build(f)).not.toThrow();
        f.root.graph.outputContract.resultPolicy.maxBytes--;
        expect(() => build(f)).toThrow('byte bound');
    });
    test('an original graph snapshot freezes recipients while later edges cannot enlarge it or publish a stale producer', () => {
        const f = fixture(), snapshot = { graphRevision: 0, graph: structuredClone(f.root.graph) };
        const later = id('Node'); f.root.graphRevision = 1;
        f.root.graph.nodes.push({ nodeId: later, kind: 'agent' });
        f.root.graph.edges.push({ from: { nodeId: f.producer.nodeId }, to: { nodeId: later }, loopBack: false });
        expect(graphResultContract(f.root, f.producer, snapshot).audience.nodeIds).toEqual([f.b, f.c].sort());
        expect(() => graphNodeResult({ ...f, graphSnapshot: snapshot, now: 100 })).toThrow('Invalid Graph Result facts');
        expect(() => graphResultContract(f.root, f.producer, { ...snapshot, graphRevision: 1 })).toThrow('Invalid Graph Result facts');
    });
});

describe.each(CONTRACT_HARNESSES)('$name Graph Result history and recipient consistency', ({ make }) => {
    test.each(['text', 'json'])('%s protected record binds Model/settlement/publication; another recipient cannot consume it', async outputType => {
        const h = await make(), f = fixture(outputType), { root, proof } = f;
        root.ownerRef = { handle: h.handle }; root.epoch = 3; root.eventSeq = 5; root.status = 'running'; root.cancelRequested = false;
        root.attemptRefs = [f.producer.attemptId]; const result = build(f), resultRef = { runId: root.runId, resultId: result.resultId }; root.resultRefs = [resultRef];
        const attempt = { schemaVersion: 1, runId: root.runId, ...f.producer, attemptNumber: 1, inputState: 'prepared', reservationRef: null,
            inputRefs: [], inputDigest: hash([]), sourceBindingDigest: root.sourceBinding.bindingDigest, budgetRef: { authority: 'controlled-original-bank' },
            status: 'running', effectRefs: [proof.effectId], resultRefs: [], startedAt: 1, endedAt: null, reasonCode: null };
        const intent = { schemaVersion: 1, effectId: proof.effectId, runId: root.runId, nodeAttemptId: attempt.attemptId, epoch: 3, graphRevision: 0,
            hostBootId: 'controlled-original-host', hostGeneration: 1, actionRef: { kind: 'controlled-model' }, targetRef: { id: 'original-model' }, inputRef: { id: 'original-input' },
            inputHash: hash([]), capability: 'generation.send', endpointBindingDigest: hash([]), grantDigest: attempt.effectiveGrantDigest, risk: 'R1', egressDigest: hash([]),
            budgetEnvelopeDigest: hash([]), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' }, requiresApproval: false,
            sourceBindingDigest: root.sourceBinding.bindingDigest, budgetAttemptRef: null, approvalRef: null, status: 'confirmed', dispatchToken: null, createdAt: 1 };
        const observationId = 'model.completed:' + intent.effectId, modelReceiptId = 'oreceipt_' + hash({ effectId: intent.effectId, observationId }).slice(0, 32);
        proof.receiptRef.receiptId = modelReceiptId;
        const model = { schemaVersion: 1, runId: root.runId, effectId: intent.effectId, receiptId: modelReceiptId, observationId, observedEpoch: 3, outcome: 'confirmed',
            reasonCode: 'generation_response_validated', dispatchEvidence: { kind: 'original_port_observation', reference: { protocol: 'generation', resultOutputType: 'text', resultPayloadHash: hash(f.text),
                completionBindingDigest: hash({ runId: intent.runId, effectId: intent.effectId, epoch: intent.epoch, hostBootId: intent.hostBootId, hostGeneration: intent.hostGeneration,
                    sourceBindingDigest: intent.sourceBindingDigest, decision: effectDecision(intent) }) } }, observedAt: 90 };
        // Rebuild after assigning the fixture's stable original Model receipt.
        const storedResult = build(f), recipient = { ...attempt, nodeId: f.b, attemptId: id('Attempt'), effectRefs: [], inputRefs: [resultRef], inputDigest: hash([resultRef]) };
        root.attemptRefs.push(recipient.attemptId);
        try {
            await h.engine.withTransaction(h.handle, async tx => {
                const key = controlRecordKey(h.handle, root.runId, 'attempt', attempt.attemptId);
                await putImmutable(tx, key, attempt);
                await writeAttemptSettlement({ tx, handle: h.handle, root, record: await tx.getResource(key), outcome: 'completed', resultRefs: [resultRef], effectReceiptRefs: [modelReceiptId], reasonCode: 'graph_result_published', now: 100 });
                await putImmutable(tx, controlRecordKey(h.handle, root.runId, 'attempt', recipient.attemptId), recipient);
                await putImmutable(tx, controlRecordKey(h.handle, root.runId, 'effect', intent.effectId), intent);
                await putImmutable(tx, controlRecordKey(h.handle, root.runId, 'receipt', modelReceiptId), model);
                await putImmutable(tx, controlRecordKey(h.handle, root.runId, 'result', result.resultId), storedResult);
                const receiptId = graphResultPublicationId(root.runId, result.resultId);
                await putImmutable(tx, controlRecordKey(h.handle, root.runId, 'receipt', receiptId), {
                    schemaVersion: 1, receiptKind: 'graph_node_result', receiptId, runId: root.runId, epoch: 3, producerAttemptId: attempt.attemptId,
                    resultRef, resultIntegrity: hash(storedResult), modelEffectId: intent.effectId, modelReceiptRef: proof.receiptRef, modelPayloadHash: hash(f.text),
                    producerGrantDigest: attempt.effectiveGrantDigest, sourceBindingDigest: root.sourceBinding.bindingDigest,
                    audienceDigest: hash(storedResult.envelope.audienceConstraint), decisionSeq: 6, createdAt: 100 });
            });
            root.eventSeq = 6;
            const read = options => h.engine.withTransaction(h.handle, tx => readGraphNodeResult(tx, h.handle, root, result.resultId, options));
            const readBatch = () => h.engine.withTransaction(h.handle, tx => readGraphNodeResults(tx, h.handle, root, [result.resultId, result.resultId]));
            expect((await read()).record).toEqual(storedResult);
            const batch = await readBatch();
            expect(batch.size).toBe(1);
            expect(batch.get(result.resultId).record).toEqual(storedResult);
            batch.get(result.resultId).record.payload = 'caller mutation';
            expect((await readBatch()).get(result.resultId).record).toEqual(storedResult);
            expect((await read({ recipient })).record).toEqual(storedResult);
            await expect(read({ recipient: { ...recipient, nodeId: f.c } })).rejects.toThrow('Invalid Graph Result facts');
            const keys = {
                producer: controlRecordKey(h.handle, root.runId, 'attempt', attempt.attemptId),
                settlement: controlRecordKey(h.handle, root.runId, 'receipt', attemptReceiptId(root.runId, attempt.attemptId)),
                intent: controlRecordKey(h.handle, root.runId, 'effect', intent.effectId),
                model: controlRecordKey(h.handle, root.runId, 'receipt', modelReceiptId),
                result: controlRecordKey(h.handle, root.runId, 'result', result.resultId),
                publication: controlRecordKey(h.handle, root.runId, 'receipt', graphResultPublicationId(root.runId, result.resultId)),
            };
            const mutateAndRestore = async mutate => {
                const originals = await h.engine.withTransaction(h.handle, async tx => Object.fromEntries(await Promise.all(Object.entries(keys).map(async ([name, key]) => [name, await tx.getResource(key)]))));
                const copies = Object.fromEntries(Object.entries(originals).map(([name, row]) => [name, structuredClone(row.doc)])); mutate(copies);
                const changed = Object.keys(copies).filter(name => hash(copies[name]) !== originals[name].integrity);
                await h.engine.withTransaction(h.handle, async tx => { for (const name of changed) await putMutable(tx, keys[name], copies[name], { expectedIntegrity: originals[name].integrity }); });
                await expect(read()).rejects.toThrow('Invalid Graph Result facts');
                await expect(readBatch()).rejects.toThrow('Invalid Graph Result facts');
                await h.engine.withTransaction(h.handle, async tx => { for (const name of changed) { const current = await tx.getResource(keys[name]); await putMutable(tx, keys[name], originals[name].doc, { expectedIntegrity: current.integrity }); } });
            };
            await mutateAndRestore(rows => {
                rows.result.envelope.sourceRefs[1].effectId = id('Effect');
                rows.result.envelope.dependencyDigest = resultDependencyDigest(rows.result.envelope); rows.publication.resultIntegrity = hash(rows.result);
            });
            await mutateAndRestore(rows => { rows.producer.sourceBindingDigest = rows.settlement.sourceBindingDigest = hash('foreign-source'); });
            await mutateAndRestore(rows => {
                rows.intent.sourceBindingDigest = hash('foreign-source');
                rows.model.dispatchEvidence.reference.completionBindingDigest = hash({ runId: intent.runId, effectId: intent.effectId, epoch: intent.epoch, hostBootId: intent.hostBootId,
                    hostGeneration: intent.hostGeneration, sourceBindingDigest: rows.intent.sourceBindingDigest, decision: effectDecision(rows.intent) });
            });
            const changed = { ...model, dispatchEvidence: { ...model.dispatchEvidence, reference: { ...model.dispatchEvidence.reference, resultPayloadHash: hash('other') } } };
            await h.engine.withTransaction(h.handle, async tx => { const key = controlRecordKey(h.handle, root.runId, 'receipt', modelReceiptId); const row = await tx.getResource(key); await putMutable(tx, key, changed, { expectedIntegrity: row.integrity }); });
            await expect(read()).rejects.toThrow('Invalid Graph Result facts');
            await expect(readBatch()).rejects.toThrow('Invalid Graph Result facts');
        } finally { await h.engine.close(); await h.cleanup(); }
    });
});
