// Test-only admission ledger, attached at existing request boundaries. It never
// chooses a route or sends a request. Unknown/cancelled usage retains reservation.
export class PilotBudget {
    constructor(config) {
        this.blocked = !config;
        if (config && (!Number.isSafeInteger(config.maxRequests) || config.maxRequests < 1 || config.maxRequests > (config.modelJudge === true ? 42 : 36)
            || !Number.isSafeInteger(config.maxTotalTokens) || config.maxTotalTokens < 1)) throw new Error('Finite S01 pilot limits required');
        this.config = config;
        this.reservations = new Map();
    }
    reserve({ requestId, trialId, inputTokens, reservedOutput, kind = 'model' }) {
        if (this.blocked) return { status: 'budget_blocked', reasonCode: 'finite_pilot_missing' };
        if (!['model', 'retry', 'fallback', 'grader'].includes(kind) || (kind === 'grader' && this.config.modelJudge !== true)) throw new Error('Unsupported request kind');
        if (typeof requestId !== 'string' || !requestId || typeof trialId !== 'string' || !trialId || this.reservations.has(requestId)) throw new Error('Duplicate/invalid request identity');
        if (![inputTokens, reservedOutput].every(n => Number.isSafeInteger(n) && n >= 0) || reservedOutput < 1) throw new Error('Exact input count/output reservation required');
        const entries = [...this.reservations.values()];
        const ordinary = entries.filter(item => item.kind !== 'grader');
        if (entries.length >= this.config.maxRequests || (kind !== 'grader' && (ordinary.length >= 36 || ordinary.filter(item => item.trialId === trialId).length >= 6))
            || (kind === 'grader' && (entries.filter(item => item.kind === 'grader').length >= 6 || entries.some(item => item.kind === 'grader' && item.trialId === trialId)))
            || entries.reduce((sum, item) => sum + item.tokens, 0) + inputTokens + reservedOutput > this.config.maxTotalTokens) return { status: 'budget_blocked', reasonCode: 'pilot_limit' };
        this.reservations.set(requestId, { trialId, kind, tokens: inputTokens + reservedOutput, upperBound: inputTokens + reservedOutput, usageStatus: 'reserved_upper_bound', settled: false });
        return { status: 'passed', reasonCode: 'reserved' };
    }
    settle(requestId, usage = null) {
        const entry = this.reservations.get(requestId);
        if (!entry || entry.settled) throw new Error('Unknown/already settled request');
        if (usage !== null) {
            if (!Number.isSafeInteger(usage.totalTokens) || usage.totalTokens < 0 || usage.totalTokens > entry.upperBound) throw new Error('Usage exceeds reservation/invalid usage');
            entry.tokens = usage.totalTokens;
            entry.usageStatus = 'provider_reported';
        }
        entry.settled = true;
    }
    snapshot() {
        return { requests: this.reservations.size, tokens: [...this.reservations.values()].reduce((sum, item) => sum + item.tokens, 0), entries: Object.fromEntries(this.reservations) };
    }
}
