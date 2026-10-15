import { ConflictError } from '../../storage/errors.js';
import { assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable } from '../repositories/common.js';
import { assertObject, assertCounter, assertDigest, assertToken } from '../../../public/shared/native-orchestration-contracts.js';
import { controlCommandId, controlRecordKey } from './controller-common.js';
import { readEffect, readApproval, approvalBinding, currentApprovalBinding } from './effect-contracts.js';

const conflict = code => { throw new ConflictError(code); };

/** Approval state only. Identity/challenge verification belongs to the trusted Review Origin Port. */
export class ApprovalController {
    constructor({ runs, authorizeRequest, verifyDecision }) {
        if (!runs || typeof authorizeRequest !== 'function' || typeof verifyDecision !== 'function') throw new TypeError('ApprovalController requires the trusted original identity/review Port');
        Object.assign(this, { runs, authorizeRequest, verifyDecision });
    }

    async request(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'effectId', 'approvalId', 'expiresAt'], 'requestApproval');
        const { effectId, approvalId, expiresAt, ...guard } = input;
        assertNativeId(effectId, 'orchestrationEffect'); assertNativeId(approvalId, 'orchestrationApproval'); assertCounter(expiresAt, 'expiresAt');
        return this.runs.control(handle, controlCommandId('approval.request', approvalId), { ...guard, operation: 'approval.request', detail: { effectId, approvalId, expiresAt } }, async ({ tx, root, now }) => {
            const effectRecord = await readEffect(tx, handle, root, effectId), intent = effectRecord.doc;
            if (root.cancelRequested || !['running', 'waiting_approval'].includes(root.status) || intent.status !== 'ready' || !intent.requiresApproval || !intent.budgetAttemptRef
                || intent.epoch !== root.epoch || intent.hostBootId !== root.hostBootId || intent.hostGeneration !== root.hostGeneration) conflict('native_orchestration_approval_not_admitted');
            if (expiresAt <= now || expiresAt > root.progress.deadlineAt || root.progress.steps >= root.limits.maxSteps) conflict('native_orchestration_approval_expired');
            if (intent.approvalRef) {
                const prior = await readApproval(tx, handle, root, intent.approvalRef);
                if (['pending', 'approved', 'consumed'].includes(prior.doc.status) && prior.doc.expiresAt > now) conflict('native_orchestration_approval_already_pending');
                await putMutable(tx, controlRecordKey(handle, root.runId, 'approval', prior.doc.approvalId), { ...prior.doc, status: prior.doc.expiresAt <= now ? 'expired' : 'invalidated' }, { expectedIntegrity: prior.integrity });
                root.pendingApprovalRefs = root.pendingApprovalRefs.filter(id => id !== prior.doc.approvalId);
            }
            // The original Review Port supplies an idempotent, private nonce
            // challenge for this exact approvalId. Its plaintext never enters
            // this repository, command outcome, Context or main-origin API.
            const challenge = cloneNativeDocument(await this.authorizeRequest({ handle, tx, root, intent, approvalId, expiresAt }));
            assertObject(challenge, ['actorRequirement', 'requestNonceHash'], 'ApprovalChallenge');
            assertObject(challenge.actorRequirement, ['handle'], 'actorRequirement');
            if (challenge.actorRequirement.handle !== root.ownerRef.handle) throw new TypeError('Approval actor must be the original authorized owner');
            assertDigest(challenge.requestNonceHash, 'requestNonceHash');
            const bindingHash = hashNativeDocument(approvalBinding(intent, approvalId, challenge.actorRequirement, expiresAt));
            const approval = { schemaVersion: 1, approvalId, effectId, runId: root.runId, nodeAttemptId: intent.nodeAttemptId, bindingHash,
                ...challenge, hostBootId: root.hostBootId, hostGeneration: root.hostGeneration, epoch: root.epoch, sourceBindingDigest: intent.sourceBindingDigest,
                endpointBindingDigest: intent.endpointBindingDigest, inputHash: intent.inputHash, budgetEnvelopeDigest: intent.budgetEnvelopeDigest,
                risk: intent.risk, expiresAt, status: 'pending', decisionRef: null };
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'approval', approvalId), approval);
            await putMutable(tx, controlRecordKey(handle, root.runId, 'effect', effectId), { ...intent, approvalRef: approvalId }, { expectedIntegrity: effectRecord.integrity });
            root.pendingApprovalRefs.push(approvalId); root.status = 'waiting_approval'; root.progress.steps++;
            return { root, eventType: 'approval_requested', reasonCode: null, outcome: { approvalId, effectId, status: 'pending' } };
        });
    }

    async decide(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'approvalId', 'decision', 'proof'], 'decideApproval');
        const { approvalId, decision, proof, ...guard } = input;
        assertNativeId(approvalId, 'orchestrationApproval');
        if (!['approve', 'reject'].includes(decision)) throw new TypeError('Invalid approval decision');
        assertObject(proof, ['nonce', 'contextRef'], 'trusted decision proof');
        if (typeof proof.nonce !== 'string' || proof.nonce.length < 32 || proof.nonce.length > 256) throw new TypeError('Trusted approval challenge nonce is required');
        const proofDigest = hashNativeDocument(proof);
        return this.runs.control(handle, controlCommandId('approval.decide', approvalId), { ...guard, operation: 'approval.decide', detail: { approvalId, decision, proofDigest } }, async ({ tx, root, now }) => {
            const record = await readApproval(tx, handle, root, approvalId), approval = record.doc;
            const effectRecord = await readEffect(tx, handle, root, approval.effectId), intent = effectRecord.doc;
            if (root.cancelRequested || approval.status !== 'pending' || approval.expiresAt <= now || intent.status !== 'ready'
                || approval.hostBootId !== root.hostBootId || approval.hostGeneration !== root.hostGeneration || approval.epoch !== root.epoch
                || approval.bindingHash !== currentApprovalBinding(intent, approval) || hashNativeDocument(proof.nonce) !== approval.requestNonceHash) conflict('native_orchestration_approval_invalid');
            const principal = cloneNativeDocument(await this.verifyDecision({ handle, tx, root, intent, approval, decision, proof }));
            assertObject(principal, ['principalRef', 'authenticationContextRef'], 'ApprovalPrincipal');
            assertObject(principal.principalRef, ['handle'], 'principalRef');
            if (principal.principalRef.handle !== approval.actorRequirement.handle) conflict('native_orchestration_approval_principal_mismatch');
            const auth = principal.authenticationContextRef;
            assertObject(auth, ['authority', 'accountVersion', 'contextId'], 'authenticationContextRef');
            if (auth.authority !== 'native_user_reauthentication') throw new TypeError('Approval requires original user reauthentication');
            assertDigest(auth.accountVersion, 'accountVersion'); assertToken(auth.contextId, 'contextId');
            const decisionRef = 'decision:' + approvalId;
            const decided = { schemaVersion: 1, decisionId: hashNativeDocument({ approvalId, decision, bindingHash: approval.bindingHash, principal }), approvalId,
                bindingHash: approval.bindingHash, ...principal, decision, decidedAt: now, expiresAt: approval.expiresAt, hostBootId: root.hostBootId, hostGeneration: root.hostGeneration, epoch: root.epoch };
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'approval', decisionRef), decided);
            await putMutable(tx, controlRecordKey(handle, root.runId, 'approval', approvalId), { ...approval, status: decision === 'approve' ? 'approved' : 'rejected', decisionRef }, { expectedIntegrity: record.integrity });
            if (decision === 'reject') {
                await putMutable(tx, controlRecordKey(handle, root.runId, 'effect', intent.effectId), { ...intent, status: 'not_dispatched' }, { expectedIntegrity: effectRecord.integrity });
                root.pendingApprovalRefs = root.pendingApprovalRefs.filter(id => id !== approvalId);
                // Original budget reconciliation still owns reservation release.
                // A rejected approval is no refund or remote rollback receipt.
                root.status = 'blocked';
            }
            return { root, eventType: 'approval_decided', reasonCode: decision === 'reject' ? 'approval_rejected' : null, outcome: { approvalId, decisionRef, status: decision === 'approve' ? 'approved' : 'rejected' } };
        });
    }
}
