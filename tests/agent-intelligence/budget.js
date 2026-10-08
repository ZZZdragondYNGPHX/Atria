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

// Shared S06 ledger for explicitly configured evaluation, including baseline,
// candidate, retries and judges. Separate from S01's six-trial pilot limit.
export class EvaluationBudget {
    constructor({ maxRequests, maxTotalTokens }, { snapshot = null, onChange = () => {}, advisory = false } = {}) {
        const carry = snapshot?.historicalCarry || null;
        if (carry && (Object.keys(carry).sort().join(',') !== 'evidenceHash,origin,requests,tokens' || carry.origin !== 'lost_s06_upper_bound'
            || carry.requests !== 252 || carry.tokens !== 1000000 || !/^[a-f0-9]{64}$/.test(carry.evidenceHash))) throw new Error('Invalid historical carry');
        if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > (carry ? 2048 : 252)
            || !Number.isSafeInteger(maxTotalTokens) || maxTotalTokens < 1) throw new Error('Finite evaluation budget required');
        Object.assign(this, { maxRequests, maxTotalTokens, onChange, advisory }); this.historicalCarry = carry && Object.freeze({ ...carry }); this.entries = new Map(); this.breached = false;
        if (snapshot) {
            if (!snapshot || Object.keys(snapshot).sort().join(',') !== (carry ? 'breached,entries,historicalCarry,requests,tokens' : 'breached,entries,requests,tokens') || typeof snapshot.breached !== 'boolean'
                || !snapshot.entries || typeof snapshot.entries !== 'object' || Array.isArray(snapshot.entries)) throw new Error('Invalid evaluation budget restore');
            for (const [id, value] of Object.entries(snapshot.entries)) {
                if (!id || !value || Object.keys(value).sort().join(',') !== 'kind,settled,tokens,trialId,upperBound,usageStatus'
                    || typeof value.trialId !== 'string' || !value.trialId || !['model', 'retry', 'fallback', 'grader'].includes(value.kind)
                    || !['provider_reported', 'reserved_upper_bound'].includes(value.usageStatus) || typeof value.settled !== 'boolean'
                    || !Number.isSafeInteger(value.tokens) || value.tokens < 0 || !Number.isSafeInteger(value.upperBound) || value.upperBound < 1
                    || value.usageStatus === 'reserved_upper_bound' && value.tokens !== value.upperBound) throw new Error('Corrupt evaluation charge');
                this.entries.set(id, { ...value });
            }
            this.breached = snapshot.breached;
            const restored = this.snapshot();
            if (restored.requests !== snapshot.requests || restored.tokens !== snapshot.tokens || !advisory && restored.requests > maxRequests
                || (restored.tokens > maxTotalTokens || [...this.entries.values()].some(entry => entry.tokens > entry.upperBound)) && !restored.breached
                || !advisory && [...new Set([...this.entries.values()].map(entry => entry.trialId))].some(trialId => [...this.entries.values()].filter(entry => entry.trialId === trialId && entry.kind !== 'grader').length > 6)) throw new Error('Evaluation budget restore mismatch');
        }
    }
    reserve({ requestId, trialId, inputTokens, reservedOutput, kind = 'model' }) {
        if (!requestId || !trialId || this.entries.has(requestId) || !['model', 'retry', 'fallback', 'grader'].includes(kind)
            || ![inputTokens, reservedOutput].every(value => Number.isSafeInteger(value) && value >= 0) || reservedOutput < 1) throw new Error('Invalid evaluation reservation');
        const entries = [...this.entries.values()];
        if (!this.advisory && (this.breached || this.snapshot().requests >= this.maxRequests || entries.filter(entry => entry.trialId === trialId && entry.kind !== 'grader').length >= 6
            || this.snapshot().tokens + inputTokens + reservedOutput > this.maxTotalTokens)) return { status: 'budget_blocked' };
        this.entries.set(requestId, { trialId, kind, tokens: inputTokens + reservedOutput, upperBound: inputTokens + reservedOutput,
            usageStatus: 'reserved_upper_bound', settled: false });
        if (this.snapshot().tokens > this.maxTotalTokens || this.snapshot().requests > this.maxRequests) this.breached = true;
        this.onChange(this.snapshot()); // Durable explicit evaluator port, before send.
        return { status: 'passed' };
    }
    settle(requestId, totalTokens = null) {
        const entry = this.entries.get(requestId);
        if (!entry || entry.settled || totalTokens !== null && (!Number.isSafeInteger(totalTokens) || totalTokens < 0)) throw new Error('Invalid evaluation settlement');
        if (totalTokens !== null) {
            entry.tokens = totalTokens; entry.usageStatus = 'provider_reported';
            if (totalTokens > entry.upperBound) this.breached = true;
        }
        entry.settled = true;
        this.onChange(this.snapshot());
    }
    snapshot() {
        return { requests: (this.historicalCarry?.requests || 0) + this.entries.size, tokens: (this.historicalCarry?.tokens || 0) + [...this.entries.values()].reduce((total, entry) => total + entry.tokens, 0),
            ...(this.historicalCarry ? { historicalCarry: { ...this.historicalCarry } } : {}),
            breached: this.breached, entries: Object.fromEntries([...this.entries].map(([id, entry]) => [id, { ...entry }])) };
    }
}
