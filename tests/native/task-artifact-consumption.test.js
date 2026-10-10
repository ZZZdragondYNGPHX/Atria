import { describe, test, expect } from '@jest/globals';
import { artifactFixture } from './helpers/task-artifact-fixture.js';
import { tradeSource } from './helpers/package-computation-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { captureTaskProduction, readTaskArtifact, decideTaskArtifactReuse } from '../../src/native/task-artifact-authority.js';
import { prepareAuthorityTransaction } from '../../src/native/authority-transaction.js';

const run = f => prepareAuthorityTransaction(f.base, f.installed, f.request);
describe('Task artifact authority consumption', () => {
    test('G03 exact Context reuse uses the original dependency proof and rejects changed scope, branch and manual bypass', () => {
        const f = artifactFixture();
        const grant = { taskId: f.task.id, variantId: 'default', usageId: 'summary' };
        const decide = () => decideTaskArtifactReuse(f.base, grant, 'npc-1');
        const proved = decide();
        expect(proved.decision.status).toBe('reused');
        expect(proved.artifact.value).toEqual({ quantity: 2 });
        f.base.revision.revisionId = createNativeId('revision');
        f.base.states.atri_lifecycle.domains.other.records[0].value.text = 'unrelated';
        expect(decide().decision.status).toBe('reused');
        const epoch = f.base.states.atri_lifecycle.scopes.session.epoch;
        f.base.states.atri_lifecycle.scopes.session.epoch++;
        expect(decide().decision.status).toBe('miss');
        f.base.states.atri_lifecycle.scopes.session.epoch = epoch;
        f.base.revision.branchId = createNativeId('branch');
        expect(decide()).not.toHaveProperty('artifact');
        expect(decideTaskArtifactReuse(f.base, grant, 'npc-1', { bypass: true }).decision.reason).toBe('manual_bypass');
        expect(f.record).not.toHaveProperty('consumptions');
    });
    test('unrelated revision reuse reruns current rules and consumes once only in the private candidate', async () => {
        const f = artifactFixture(); const oldRevision = f.base.revision.revisionId;
        f.base.revision.revisionId = createNativeId('revision'); f.request.anchor.revisionId = f.base.revision.revisionId;
        f.base.states.atri_lifecycle.domains.other.records[0].value.text = 'Unrelated';
        const before = structuredClone(f.base); const prepared = await run(f);
        expect(prepared.receipt.artifacts[0].productionRevisionId).toBe(oldRevision);
        expect(prepared.candidate.states.atri_lifecycle.domains.wallet.records[0].value.value).toBe(14);
        expect(prepared.candidate.states.atri_task_results.records[0].consumptions).toEqual([expect.objectContaining({ usageId: 'trade', authorityId: prepared.identity })]);
        expect(f.base).toEqual(before);
        f.base = structuredClone(prepared.candidate);
        await expect(run(f)).rejects.toThrow();
    });
    test.each(['fake', 'edited', 'purpose', 'producer', 'branch', 'package', 'scope', 'dependency', 'same-revision', 'domain-stale'])('%s cannot authorize adoption', async kind => {
        const f = artifactFixture();
        if (kind === 'fake') { delete f.record.production; f.request.input.payload = { quantity: 2 }; }
        if (kind === 'edited') f.record.payload.quantity = 3;
        if (kind === 'purpose') f.logic.transactions[0].artifacts[0].usageId = 'summary';
        if (kind === 'producer') f.record.taskId = 'other';
        if (kind === 'branch') f.record.branchId = createNativeId('branch');
        if (kind === 'package') f.record.production = { ...f.record.production, anchor: { ...f.record.production.anchor, packageVersionId: createNativeId('packageVersion') } };
        if (kind === 'scope') f.base.states.atri_lifecycle.scopes.session.epoch++;
        if (kind === 'dependency') f.base.states.atri_lifecycle.domains.public_notes.records[0].value.text = 'Changed evidence';
        if (kind === 'same-revision') { f.task.resultPolicy.uses[0].reuse = 'same_revision'; f.record.definitionHash = hashNativeDocument(f.task); f.record.production = captureTaskProduction(f.base, f.task, {}); f.base.revision.revisionId = createNativeId('revision'); f.request.anchor.revisionId = f.base.revision.revisionId; }
        if (kind === 'domain-stale') f.base.states.atri_lifecycle.domains.wallet.records[0].value.value = 1;
        f.sync(); const before = structuredClone(f.base);
        await expect(run(f)).rejects.toThrow(); expect(f.base).toEqual(before);
    });
    test('failed late invariant does not consume a genuine artifact', async () => {
        const f = artifactFixture(); f.installed.sourceFiles.set('rules/trade.ts', Buffer.from(tradeSource.replace('reads.wallet.value >= 0', 'reads.wallet.value < 0')));
        await expect(run(f)).rejects.toThrow(); expect(f.record).not.toHaveProperty('consumptions');
    });
    test('context use is read-only and reusable; raw result JSON is never a reference', () => {
        const f = artifactFixture('reusable');
        const grant = { taskId: f.task.id, variantId: 'default', usageId: 'summary' };
        expect(readTaskArtifact(f.base, grant, 'npc-1', 'context').value).toEqual({ quantity: 2 });
        expect(readTaskArtifact(f.base, grant, 'npc-1', 'context').value).toEqual({ quantity: 2 });
        expect(() => readTaskArtifact(f.base, grant, { quantity: 2 }, 'context')).toThrow();
        expect(f.record).not.toHaveProperty('consumptions');
    });
});
