import { computationFixture, tradeSource } from './package-computation-fixture.js';
import { lifecycleFixture } from './lifecycle-fixture.js';
import { closed } from './authority-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument } from '../../../src/native/repositories/common.js';
import { captureTaskProduction } from '../../../src/native/task-artifact-authority.js';

export function artifactFixture(cardinality = 'once') {
    const f = computationFixture(tradeSource.replace('precondition({args, reads})', 'precondition({args, reads, artifacts})').replace('return reads.wallet.value', 'return artifacts.npc.quantity === args.quantity && reads.wallet.value'));
    const runtime = lifecycleFixture().taskRuntime;
    const task = runtime.tasks[0];
    task.id = 'npc.propose'; task.executionClass = 'interactive';
    task.resultPolicy = { resultClass: 'advisory', sink: 'proposal', uses: [
        { id: 'trade', purpose: 'operation_proposal', reuse: 'same_branch', cardinality, viewIds: ['player.notes'], scopeIds: ['session'] },
        { id: 'summary', purpose: 'context', reuse: 'same_branch', cardinality: 'reusable', viewIds: ['player.notes'], scopeIds: ['session'] },
    ] };
    task.variants[0].outputSchema = closed({ quantity: { type: 'integer', minimum: 1, maximum: 8 } });
    f.contract.taskRuntime = runtime;
    const payload = { quantity: 2 };
    const record = { kind: 'task', invocationId: 'npc-1', taskId: task.id, variantId: 'default', payload, status: 'draft', resultClass: 'advisory',
        definitionHash: hashNativeDocument(task), normalizedResultHash: hashNativeDocument(payload),
        production: captureTaskProduction(f.base, task, {}), anchorRevisionId: f.base.revision.revisionId,
        storedRevisionId: f.base.revision.revisionId, branchId: f.base.revision.branchId };
    f.base.states.atri_task_results = { schemaVersion: 1, records: [record] };
    f.logic.transactions[0].inputSchema.properties.invocationId = { type: 'string', maxLength: 128 };
    f.logic.transactions[0].inputSchema.required.push('invocationId'); f.request.input.invocationId = 'npc-1';
    f.logic.transactions[0].artifacts = [{ id: 'npc', taskId: task.id, variantId: 'default', usageId: 'trade', invocationId: { formula: 'args.invocationId' } }];
    f.sync(); return { ...f, record, task };
}
