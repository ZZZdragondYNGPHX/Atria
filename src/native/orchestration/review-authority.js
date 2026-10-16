import { randomBytes } from 'node:crypto';
import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { ApprovalController } from './approval-controller.js';
import { approvalBinding, currentApprovalBinding, effectDecision, readApproval, readEffect } from './effect-contracts.js';
import { runGuard } from './controller-common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';

const deny = () => { throw new ConflictError('native_orchestration_review_unavailable'); };
const token = () => randomBytes(32).toString('base64url');

/** Host-private bridge to the existing Approval records and original Effect authority. */
export class ReviewAuthority {
    #entries = new Map();
    #proofs = new WeakMap();

    constructor({ accounts, now = Date.now }) {
        this.accounts = accounts; this.now = now;
    }

    #prune() {
        for (const [key, entry] of this.#entries) if (entry.expiresAt <= this.now()) this.#entries.delete(key);
    }

    connect({ runs, effects, describeReview }) {
        if (effects.runs !== runs) throw new TypeError('Review requires the original Effect controller');
        const authorize = async ({ handle, tx, root, intent }) => {
            let decision;
            try { decision = await effects.authorizeEffect({ handle, tx, root, intent, phase: 'claim' }); } catch (error) {
                if (error.code?.startsWith('native_')) deny();
                throw error;
            }
            if (hash(decision) !== hash(effectDecision(intent))) deny();
            if (root.ownerRef.handle !== handle || root.cancelRequested || !['running', 'waiting_approval'].includes(root.status)
                || intent.hostBootId !== root.hostBootId || intent.hostGeneration !== root.hostGeneration || intent.epoch !== root.epoch) deny();
            // An authority callback can await and can perform legitimate control writes.
            // Never authorize against its obsolete caller snapshot.
            if (hash(await runs.get(handle, root.runId)) !== hash(root)) deny();
        };
        const approvals = new ApprovalController({ runs,
            authorizeRequest: async args => {
                if (typeof describeReview !== 'function') deny();
                await authorize(args);
                await this.accounts.inspect(args.handle);
                const actorRequirement = { handle: args.handle };
                const bindingHash = hash(approvalBinding(args.intent, args.approvalId, actorRequirement, args.expiresAt));
                this.#prune();
                const key = hash({ handle: args.handle, approvalId: args.approvalId });
                let entry = this.#entries.get(key);
                if (entry && entry.bindingHash !== bindingHash) deny();
                if (!entry) {
                    if (this.#entries.size >= 256) deny();
                    entry = { handle: args.handle, runId: args.root.runId, approvalId: args.approvalId, bindingHash,
                        expiresAt: args.expiresAt, nonce: token(), launchRef: token(), runs, effects, authorize, describeReview, approvals };
                    this.#entries.set(key, entry);
                }
                await authorize(args);
                return { actorRequirement, requestNonceHash: hash(entry.nonce) };
            },
            verifyDecision: async args => {
                const proof = this.#proofs.get(args.proof.contextRef);
                if (!proof || proof.entry.approvalId !== args.approval.approvalId || proof.entry.handle !== args.handle
                    || proof.entry.bindingHash !== args.approval.bindingHash || proof.nonce !== args.proof.nonce) deny();
                await authorize(args);
                const account = await this.accounts.inspect(args.handle);
                if (account.accountVersion !== proof.accountVersion || proof.expiresAt <= this.now()) deny();
                await authorize(args);
                return { principalRef: { handle: args.handle }, authenticationContextRef: {
                    authority: 'native_user_reauthentication', accountVersion: account.accountVersion, contextId: proof.contextId,
                } };
            },
        });
        return approvals;
    }

    async verifyApproval({ handle, approval, decision }) {
        const account = await this.accounts.inspect(handle);
        if (approval.actorRequirement.handle !== handle || decision.principalRef.handle !== handle
            || decision.authenticationContextRef.authority !== 'native_user_reauthentication'
            || decision.authenticationContextRef.accountVersion !== account.accountVersion) deny();
    }

    #entry(launchRef) {
        this.#prune();
        const entry = [...this.#entries.values()].find(value => value.launchRef === launchRef);
        if (!entry) deny();
        return entry;
    }

    available(handle, root, approval) {
        this.#prune();
        const entry = this.#entries.get(hash({ handle, approvalId: approval.approvalId }));
        return !!entry && entry.runId === root.runId && entry.bindingHash === approval.bindingHash
            && approval.status === 'pending' && root.status === 'waiting_approval' && !root.cancelRequested
            && approval.hostBootId === root.hostBootId && approval.hostGeneration === root.hostGeneration && approval.epoch === root.epoch;
    }

    async #current(entry, consume) {
        const result = await entry.runs.withApprovalReview(entry.handle, entry.runId, async ({ tx, root }) => {
            const { doc: approval } = await readApproval(tx, entry.handle, root, entry.approvalId);
            const { doc: intent } = await readEffect(tx, entry.handle, root, approval.effectId);
            if (approval.status !== 'pending' || intent.status !== 'ready' || intent.approvalRef !== entry.approvalId
                || approval.expiresAt <= this.now() || approval.bindingHash !== entry.bindingHash
                || approval.bindingHash !== currentApprovalBinding(intent, approval) || approval.requestNonceHash !== hash(entry.nonce)) deny();
            try {
                await entry.authorize({ handle: entry.handle, tx, root, intent });
                return { value: await consume({ tx, root, intent, approval }) };
            } catch (error) { return { error }; }
        });
        if (result.error) throw result.error;
        return result.value;
    }

    async launch(handle, input) {
        assertObject(input, ['runId', 'approvalId'], 'review launch');
        const { runId, approvalId } = input;
        this.#prune();
        const entry = this.#entries.get(hash({ handle, approvalId }));
        if (!entry || entry.runId !== runId) deny();
        await this.#current(entry, async () => { await this.accounts.inspect(handle); });
        return { launchRef: entry.launchRef, expiresAt: entry.expiresAt };
    }

    async authenticate(launchRef, password) {
        const entry = this.#entry(launchRef);
        const account = await this.accounts.authenticate(entry.handle, password);
        await this.#current(entry, async () => {});
        return { handle: entry.handle, accountVersion: account.accountVersion, contextId: token(), expiresAt: Math.min(entry.expiresAt, this.now() + 300000) };
    }

    async #identity(entry, identity) {
        if (!identity || identity.handle !== entry.handle || identity.expiresAt <= this.now()) deny();
        if ((await this.accounts.inspect(entry.handle)).accountVersion !== identity.accountVersion) deny();
    }

    async details(launchRef, identity) {
        const entry = this.#entry(launchRef);
        await this.#identity(entry, identity);
        return this.#current(entry, async ({ root, intent, approval, tx }) => {
            const description = await entry.describeReview({ handle: entry.handle, root, intent, tx });
            assertObject(description, ['title', 'input', 'impact'], 'review description');
            for (const value of Object.values(description)) if (typeof value !== 'string' || value.length > 32768) throw new TypeError('Invalid review description');
            await this.#identity(entry, identity);
            await entry.authorize({ handle: entry.handle, root, intent, tx });
            return { schemaVersion: 1, runId: entry.runId, approvalId: entry.approvalId, bindingHash: entry.bindingHash,
                risk: approval.risk, expiresAt: entry.expiresAt, description, sourceRef: root.sourceBinding.sourceRef,
                actionRef: intent.actionRef, targetRef: intent.targetRef, inputHash: intent.inputHash,
                endpointBindingDigest: intent.endpointBindingDigest, egressDigest: intent.egressDigest,
                budgetEnvelopeDigest: intent.budgetEnvelopeDigest, nonce: entry.nonce };
        });
    }

    async decide(launchRef, identity, body) {
        assertObject(body, ['bindingHash', 'nonce', 'decision'], 'review decision');
        const entry = this.#entry(launchRef);
        await this.#identity(entry, identity);
        if (body.bindingHash !== entry.bindingHash || body.nonce !== entry.nonce || !['approve', 'reject'].includes(body.decision)) deny();
        const root = await this.#current(entry, async ({ root }) => root);
        const contextRef = {};
        this.#proofs.set(contextRef, { ...identity, nonce: body.nonce, entry });
        try {
            return await entry.approvals.decide(entry.handle, { ...runGuard(root), approvalId: entry.approvalId,
                decision: body.decision, proof: { nonce: body.nonce, contextRef } });
        } finally { this.#proofs.delete(contextRef); }
    }

    close() { this.#entries.clear(); }
}
