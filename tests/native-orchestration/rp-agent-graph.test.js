import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { configureAgentGraph } from './helpers/rp-agent-graph-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { TransitionController } from '../../src/native/orchestration/transition-controller.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

jest.setTimeout(60_000);
const fixture = (make, shape = 'diamond', options = {}) => rpModelFixture(make, { configurePlan: (...args) => configureAgentGraph(...args, shape),
    responsePayload: (_body, ordinal) => 'AGENT_' + ordinal + '_PRIVATE', ...options });
const id = () => createNativeId('orchestrationCommand');

describe.each(CONTRACT_HARNESSES)('$name original RP static Agent graph', ({ make }) => {
    // The general RP control graph supports success edges and optional inputs;
    // predecessor-only exposure is asserted by the marker shapes below.
    test.each(['conditional', 'optional-input'])('%s graph executes each declared Agent once', async variation => {
        const f = await rpModelFixture(make, { configurePlan: async (...args) => {
            await configureAgentGraph(...args);
            const graph = args[0].definition;
            if (variation === 'conditional') graph.edges[0].condition = 'success';
            else graph.nodes[1].inputs[0].required = false;
        } });
        try {
            const result = await f.run();
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(4); expect(f.effects).toHaveLength(5);
        } finally { await f.cleanup(); }
    });
    test.each(['diamond', 'merge', 'three-entries'])('%s executes each declared Agent once and exposes only exact direct predecessor bodies', async shape => {
        const f = await fixture(make, shape);
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(4);
            const predecessors = shape === 'diamond' ? [[], [1], [1], [2, 3]] : shape === 'merge' ? [[], [], [1, 2], [3]] : [[], [], [], [1, 2, 3]];
            for (const [index, request] of f.requests.entries()) {
                for (let ordinal = 1; ordinal <= 4; ordinal++) expect(JSON.stringify(request).includes('AGENT_' + ordinal + '_PRIVATE')).toBe(predecessors[index].includes(ordinal));
            }
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults).toHaveLength(3); expect(output.closure.effectIds).toHaveLength(5);
            expect(root.progress.attempts).toBe(5); expect(root.progress.edgeVisits).toBe(shape === 'diamond' ? 5 : 4);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });

    test.each(['binding', 'cancel'])('same-transaction %s after final predecessor authorization preserves withdrawal and sends no successor', async change => {
        const f = await fixture(make), advance = TransitionController.prototype.advance; let changed = false;
        const spy = jest.spyOn(TransitionController.prototype, 'advance').mockImplementation(function (handle, input) {
            const authorize = this.authorizeTransition;
            this.authorizeTransition = async args => {
                const permission = await authorize(args);
                if (!changed && f.requests.length === 3) {
                    changed = true;
                    if (change === 'binding') {
                        const binding = await f.plans.getBinding(handle, f.sourceSelector);
                        await f.plans.saveBinding(handle, id(), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                    } else await f.authority.execution.runs.cancel(handle, id(), { ...runGuard(args.root), reasonCode: 'controlled_user_cancel' });
                }
                return permission;
            };
            return advance.call(this, handle, input);
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(3);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            // Cancel fails the Run CAS before any successor; a Binding change is
            // caught at the successor's dispatch, which sends nothing.
            expect(row.doc.cancelRequested).toBe(change === 'cancel'); expect(row.doc.attemptRefs).toHaveLength(change === 'cancel' ? 3 : 4);
            expect(row.doc.resultRefs).toHaveLength(3); expect(row.doc.outputClaims).toEqual([]);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });

    test('cold merged history survives Source deletion and rejects a rehashed upstream edge attribution', async () => {
        const f = await fixture(make, 'merge'); let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            await cold.withTransaction(f.h.handle, async tx => {
                const rows = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'receipt' });
                const row = rows.find(row => row.doc.receiptKind === 'edge_admission' && row.doc.nodeAttemptId === root.attemptRefs[2] && row.doc.producerAttemptId === root.attemptRefs[0]);
                await putMutable(tx, row.key, { ...row.doc, producerAttemptId: root.attemptRefs[1] }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid original output graph traversal');
            expect(f.requests).toHaveLength(4);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('second branch publication ACK %s keeps exact existing facts without repeating a paid Model', async ack => {
        const f = await fixture(make), transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        const match = value => f.requests.length === 2 && value?.outcome?.status === 'published' && value.outcome.publicationReceiptRef;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const outer = !f.h.engine.hasActiveTransaction(handle);
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (outer && !injected && ack === 'no_save' && match(result)) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-branch-result' }); }
                return result;
            }, ...options);
            if (outer && !injected && ack === 'saved' && match(value)) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-branch-result' }); }
            return value;
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ code: error.code }));
            expect(injected).toBe(true); expect(result.code ?? result.value.output.runStatus).toBe(ack === 'saved' ? 'completed' : 'storage_commit_unknown');
            expect(f.requests).toHaveLength(ack === 'saved' ? 4 : 2);
            const [row] = await transaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.resultRefs).toHaveLength(ack === 'saved' ? 4 : 1); expect(row.doc.outputClaims).toHaveLength(ack === 'saved' ? 1 : 0);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });

    test('unknown usage in a three-predecessor graph retains legal Chat output with a completed output and estimated charges', async () => {
        const f = await fixture(make, 'three-entries', { usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(root.outputClaims).toEqual([result.output.outputClaimRef]); expect(root.resultRefs).toHaveLength(4);
            expect(f.requests).toHaveLength(4); expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });
});
