import { getGameBranchId } from '../world/branch.js';
import {
    advanceTurnContext,
    createTurnContext,
} from './turn-context.js';

export const TURN_TRANSACTION_PHASES = Object.freeze([
    'submitted',
    'resolving',
    'calculating',
    'recalling',
    'orchestrating',
    'narrating',
    'finalized',
    'aborted',
    'failed',
]);

const TERMINAL_PHASES = new Set(['finalized', 'aborted', 'failed']);
const ALLOWED_TRANSITIONS = Object.freeze({
    submitted: new Set(['resolving', 'calculating', 'aborted', 'failed']),
    resolving: new Set(['calculating', 'aborted', 'failed']),
    calculating: new Set(['recalling', 'orchestrating', 'narrating', 'aborted', 'failed']),
    recalling: new Set(['orchestrating', 'narrating', 'aborted', 'failed']),
    orchestrating: new Set(['narrating', 'aborted', 'failed']),
    narrating: new Set(['finalized', 'aborted', 'failed']),
    finalized: new Set(),
    aborted: new Set(),
    failed: new Set(),
});

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

function authoritativeFingerprint(turn) {
    return JSON.stringify({
        anchor: turn?.anchor || null,
        resolvedCommands: turn?.resolvedCommands || [],
        commandResults: turn?.commandResults || [],
        interpretations: turn?.interpretations || [],
        committedEvents: turn?.committedEvents || [],
        observation: turn?.observation || null,
    });
}

function isAbortError(error, signal) {
    return Boolean(
        signal?.aborted
        || error?.name === 'AbortError'
        || String(error?.code || '').toLowerCase() === 'aborted',
    );
}

function normalizeBranchResult(raw, fallbackAnchor) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const branchPath = Array.isArray(source.branchPath)
        ? [...source.branchPath]
        : [...(fallbackAnchor?.branchPath || [])];
    return {
        branchPath,
        branchId: String(source.branchId || getGameBranchId(branchPath)),
        variantId: String(source.variantId || ''),
    };
}

export function createTurnTransaction(input = {}) {
    const attemptId = String(input.attemptId || '').trim();
    const turnId = String(input.turnId || '').trim();
    if (!attemptId || !turnId) {
        throw new Error('Turn Transaction requires turnId and attemptId');
    }

    const controller = new AbortController();
    const history = [];
    let phase = 'submitted';
    let terminalReason = '';
    let result = null;
    let active = false;
    let deleted = false;

    function record(type, details = {}) {
        history.push(Object.freeze({
            seq: history.length + 1,
            type: String(type || 'event'),
            phase,
            details: clone(details),
        }));
    }
    record('transaction.submitted');

    return Object.freeze({
        turnId,
        attemptId,
        signal: controller.signal,

        get phase() {
            return phase;
        },
        get active() {
            return active;
        },
        get deleted() {
            return deleted;
        },
        get terminalReason() {
            return terminalReason;
        },

        transition(nextPhase, details = {}) {
            const next = String(nextPhase || '').trim();
            if (!TURN_TRANSACTION_PHASES.includes(next)) {
                throw new Error(`Unknown Turn Transaction phase '${next}'`);
            }
            if (!ALLOWED_TRANSITIONS[phase]?.has(next)) {
                throw new Error(`Invalid Turn Transaction transition '${phase}' -> '${next}'`);
            }
            phase = next;
            record('transaction.phase', { phase: next, ...clone(details) });
            return phase;
        },

        finalize(nextResult) {
            if (phase !== 'narrating') {
                throw new Error(`Turn Transaction cannot finalize from '${phase}'`);
            }
            result = clone(nextResult);
            phase = 'finalized';
            active = true;
            record('transaction.finalized');
            return result;
        },

        abort(reason = 'user_stop') {
            if (TERMINAL_PHASES.has(phase)) return false;
            terminalReason = String(reason || 'aborted');
            controller.abort(terminalReason);
            phase = 'aborted';
            active = false;
            record('transaction.aborted', { reason: terminalReason });
            return true;
        },

        fail(error) {
            if (TERMINAL_PHASES.has(phase)) return false;
            terminalReason = String(error?.message || error || 'failed');
            phase = 'failed';
            active = false;
            record('transaction.failed', {
                error: terminalReason,
                code: String(error?.code || ''),
            });
            return true;
        },

        deactivate(reason = 'deactivated') {
            active = false;
            record('transaction.deactivated', { reason: String(reason || '') });
        },

        activate() {
            if (phase !== 'finalized' || deleted) {
                throw new Error('Only a non-deleted finalized Turn attempt can become active');
            }
            active = true;
            record('transaction.activated');
        },

        markDeleted() {
            deleted = true;
            active = false;
            record('transaction.deleted');
        },

        getResult() {
            return clone(result);
        },

        snapshot() {
            return deepFreeze({
                turnId,
                attemptId,
                phase,
                active,
                deleted,
                terminalReason,
                result: clone(result),
                history: clone(history),
            });
        },
    });
}

export function createGameTurnController(options = {}) {
    const adapter = options.adapter || {};
    const attempts = new Map();
    const turns = new Map();
    let serial = 0;

    function getAttempt(attemptId) {
        const attempt = attempts.get(String(attemptId || ''));
        if (!attempt) throw new Error(`Unknown Turn attempt '${String(attemptId || '')}'`);
        return attempt;
    }

    function ensureTurnRecord(turnContext) {
        const turnId = String(turnContext?.turnId || '').trim();
        if (!turnId) throw new Error('Turn Controller requires Turn Context with turnId');
        if (!turns.has(turnId)) {
            turns.set(turnId, {
                turnId,
                baseTurn: clone(turnContext),
                attemptIds: [],
                activeAttemptId: null,
            });
        }
        return turns.get(turnId);
    }

    async function executeAttempt(turnContext, input = {}) {
        const turnRecord = ensureTurnRecord(turnContext);
        const attemptId = String(
            input.attemptId
            || turnContext.attemptId
            || `${turnRecord.turnId}:attempt:${++serial}`,
        );
        if (attempts.has(attemptId)) {
            throw new Error(`Duplicate Turn attempt '${attemptId}'`);
        }

        const transaction = createTurnTransaction({
            turnId: turnRecord.turnId,
            attemptId,
        });
        const attempt = {
            attemptId,
            turnId: turnRecord.turnId,
            kind: String(input.kind || 'initial'),
            branch: normalizeBranchResult(input.branch, turnContext.anchor),
            previousActiveAttemptId: turnRecord.activeAttemptId,
            transaction,
            turn: clone(turnContext),
            proseVariants: [],
            selectedProseVariantId: null,
        };
        attempts.set(attemptId, attempt);
        turnRecord.attemptIds.push(attemptId);

        const execute = input.execute || options.executeAttempt;
        if (typeof execute !== 'function') {
            transaction.fail(new Error('Turn Controller has no attempt executor'));
            throw new Error('Turn Controller has no attempt executor');
        }

        try {
            await adapter.prepareAttempt?.({
                turnId: turnRecord.turnId,
                attemptId,
                kind: attempt.kind,
                branch: clone(attempt.branch),
                previousAttemptId: attempt.previousActiveAttemptId,
            });

            const output = await execute({
                attemptId,
                turnId: turnRecord.turnId,
                turn: clone(turnContext),
                signal: transaction.signal,
                transition: (phase, details) => transaction.transition(phase, details),
                kind: attempt.kind,
                branch: clone(attempt.branch),
            });

            if (transaction.signal.aborted || transaction.phase === 'aborted') {
                await adapter.deactivateAttempt?.({
                    turnId: turnRecord.turnId,
                    attemptId,
                    branch: clone(attempt.branch),
                    reason: 'aborted',
                    restoreAttemptId: attempt.previousActiveAttemptId,
                });
                return transaction.snapshot();
            }

            const nextTurn = output?.turn || output;
            if (!nextTurn?.narrative || nextTurn.narrative.status !== 'final') {
                throw new Error('Turn attempt must produce finalized narrative before finalization');
            }
            if (transaction.phase !== 'narrating') {
                throw new Error(
                    `Turn attempt executor ended in '${transaction.phase}', expected 'narrating'`,
                );
            }

            attempt.turn = clone(nextTurn);
            const finalResult = {
                ...clone(output),
                turn: clone(nextTurn),
                attemptId,
                turnId: turnRecord.turnId,
                branch: clone(attempt.branch),
            };
            transaction.finalize(finalResult);

            if (turnRecord.activeAttemptId && turnRecord.activeAttemptId !== attemptId) {
                const previous = attempts.get(turnRecord.activeAttemptId);
                previous?.transaction.deactivate('superseded_by_attempt');
            }
            turnRecord.activeAttemptId = attemptId;
            await adapter.activateAttempt?.({
                turnId: turnRecord.turnId,
                attemptId,
                branch: clone(attempt.branch),
                turn: clone(nextTurn),
            });

            return transaction.snapshot();
        } catch (error) {
            if (isAbortError(error, transaction.signal)) {
                transaction.abort('aborted');
                await adapter.deactivateAttempt?.({
                    turnId: turnRecord.turnId,
                    attemptId,
                    branch: clone(attempt.branch),
                    reason: 'aborted',
                    restoreAttemptId: attempt.previousActiveAttemptId,
                });
                return transaction.snapshot();
            }
            transaction.fail(error);
            await adapter.deactivateAttempt?.({
                turnId: turnRecord.turnId,
                attemptId,
                branch: clone(attempt.branch),
                reason: 'failed',
                restoreAttemptId: attempt.previousActiveAttemptId,
            });
            throw error;
        }
    }

    return Object.freeze({
        async submit(turnContext, input = {}) {
            const record = ensureTurnRecord(turnContext);
            const branch = normalizeBranchResult(
                input.branch || await adapter.createAttemptBranch?.({
                    turnId: record.turnId,
                    previousAttemptId: record.activeAttemptId,
                    attemptIndex: record.attemptIds.length,
                    kind: input.kind || 'initial',
                }),
                turnContext.anchor,
            );
            const branchedTurn = createTurnContext({
                ...clone(turnContext),
                turnId: record.turnId,
                anchor: {
                    ...clone(turnContext.anchor),
                    branchPath: branch.branchPath,
                },
            });
            return executeAttempt(branchedTurn, {
                ...input,
                kind: input.kind || 'initial',
                branch,
            });
        },

        stop(attemptId, reason = 'user_stop') {
            const attempt = getAttempt(attemptId);
            const changed = attempt.transaction.abort(reason);
            if (changed) {
                void adapter.deactivateAttempt?.({
                    turnId: attempt.turnId,
                    attemptId: attempt.attemptId,
                    branch: clone(attempt.branch),
                    reason,
                    restoreAttemptId: attempt.previousActiveAttemptId,
                });
            }
            return changed;
        },

        async undo(turnId) {
            const record = turns.get(String(turnId || ''));
            if (!record?.activeAttemptId) return false;
            const attempt = getAttempt(record.activeAttemptId);
            attempt.transaction.deactivate('undo');
            record.activeAttemptId = null;
            await adapter.restoreBeforeTurn?.({
                turnId: record.turnId,
                attemptId: attempt.attemptId,
                branch: clone(attempt.branch),
            });
            return true;
        },

        async deleteAssistantResult(attemptId) {
            const attempt = getAttempt(attemptId);
            const record = turns.get(attempt.turnId);
            for (const siblingId of record?.attemptIds || [attempt.attemptId]) {
                const sibling = attempts.get(siblingId);
                if (!sibling) continue;
                sibling.transaction.deactivate('assistant_result_deleted');
                sibling.transaction.markDeleted();
            }
            if (record) record.activeAttemptId = null;
            await adapter.deactivateAttempt?.({
                turnId: attempt.turnId,
                attemptId: attempt.attemptId,
                branch: clone(attempt.branch),
                reason: 'assistant_result_deleted',
            });
            await adapter.deleteAssistantResult?.({
                turnId: attempt.turnId,
                attemptId: attempt.attemptId,
                branch: clone(attempt.branch),
            });
            return true;
        },

        async rewriteNarrative(attemptId, input = {}) {
            const attempt = getAttempt(attemptId);
            if (attempt.transaction.phase !== 'finalized' || attempt.transaction.deleted) {
                throw new Error('Rewrite Narrative requires a finalized non-deleted attempt');
            }
            if (typeof input.rewrite !== 'function') {
                throw new Error('Rewrite Narrative requires rewrite()');
            }

            const beforeFingerprint = authoritativeFingerprint(attempt.turn);
            const prose = String(await input.rewrite(clone(attempt.turn), {
                attemptId: attempt.attemptId,
                turnId: attempt.turnId,
            }) || '').trim();
            if (!prose) throw new Error('Rewrite Narrative returned empty prose');

            const afterFingerprint = authoritativeFingerprint(attempt.turn);
            if (afterFingerprint !== beforeFingerprint) {
                throw new Error('Rewrite Narrative changed authoritative turn facts');
            }

            const variantId = `${attempt.attemptId}:prose:${attempt.proseVariants.length + 1}`;
            const producer = String(input.producer || attempt.turn.narrative?.producer || 'narrator');
            attempt.turn = advanceTurnContext(attempt.turn, {
                narrative: {
                    status: 'final',
                    producer,
                    text: prose,
                    variantId,
                    rewrittenFrom: attempt.selectedProseVariantId
                        || attempt.turn.narrative?.variantId
                        || null,
                },
            });
            attempt.proseVariants.push({
                variantId,
                producer,
                text: prose,
                authoritativeFingerprint: beforeFingerprint,
            });
            attempt.selectedProseVariantId = variantId;

            await adapter.replaceNarrative?.({
                turnId: attempt.turnId,
                attemptId: attempt.attemptId,
                variantId,
                prose,
                producer,
            });

            return deepFreeze({
                attemptId: attempt.attemptId,
                turnId: attempt.turnId,
                variantId,
                turn: clone(attempt.turn),
            });
        },

        async retryTurn(turnId, input = {}) {
            const record = turns.get(String(turnId || ''));
            if (!record) throw new Error(`Unknown Turn '${String(turnId || '')}'`);

            const branch = normalizeBranchResult(
                await adapter.createAttemptBranch?.({
                    turnId: record.turnId,
                    previousAttemptId: record.activeAttemptId,
                    attemptIndex: record.attemptIds.length,
                    kind: 'retry',
                }),
                record.baseTurn.anchor,
            );
            const retryBase = createTurnContext({
                ...clone(record.baseTurn),
                turnId: record.turnId,
                anchor: {
                    ...clone(record.baseTurn.anchor),
                    branchPath: branch.branchPath,
                },
                resolvedCommands: [],
                commandResults: [],
                interpretations: [],
                committedEvents: [],
                memories: [],
                memoryUpdates: [],
                orchestration: null,
                narrative: null,
            });

            return executeAttempt(retryBase, {
                ...input,
                kind: 'retry',
                branch,
            });
        },

        async switchVariant(attemptId) {
            const attempt = getAttempt(attemptId);
            if (attempt.transaction.phase !== 'finalized' || attempt.transaction.deleted) {
                throw new Error('Cannot activate an unfinished or deleted Turn attempt');
            }
            const record = turns.get(attempt.turnId);
            if (record.activeAttemptId && record.activeAttemptId !== attempt.attemptId) {
                attempts.get(record.activeAttemptId)?.transaction.deactivate('variant_switched');
            }
            await adapter.activateAttemptBranch?.({
                turnId: attempt.turnId,
                attemptId: attempt.attemptId,
                branch: clone(attempt.branch),
                turn: clone(attempt.turn),
            });
            attempt.transaction.activate();
            record.activeAttemptId = attempt.attemptId;
            return attempt.transaction.snapshot();
        },

        getAttempt(attemptId) {
            const attempt = getAttempt(attemptId);
            return deepFreeze({
                attemptId: attempt.attemptId,
                turnId: attempt.turnId,
                kind: attempt.kind,
                branch: clone(attempt.branch),
                turn: clone(attempt.turn),
                proseVariants: clone(attempt.proseVariants),
                selectedProseVariantId: attempt.selectedProseVariantId,
                transaction: attempt.transaction.snapshot(),
            });
        },

        getTurn(turnId) {
            const record = turns.get(String(turnId || ''));
            if (!record) return null;
            return deepFreeze({
                turnId: record.turnId,
                activeAttemptId: record.activeAttemptId,
                attemptIds: [...record.attemptIds],
                baseTurn: clone(record.baseTurn),
            });
        },
    });
}
