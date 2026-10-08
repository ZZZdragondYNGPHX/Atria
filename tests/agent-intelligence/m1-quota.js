import { AgentEvolutionRepository, evolutionInteger } from '../../src/native/agent-intelligence/evolution-repository.js';

// Local test fixture only; the production repository and its gates stay strict.
export class M1AdvisoryRepository extends AgentEvolutionRepository {
    async reserve(handle, attempt) {
        let reserved;
        await this.mutateOwner(handle, d => {
            if (!d.limits || d.attempts.some(a => a.id === attempt.id)) throw new Error('invalid_advisory_reservation');
            reserved = { trialId: null, requestHash: null, snapshotHash: null, usage: null, cost: null, ...attempt,
                tokens: attempt.upperBound, status: 'reserved', createdAt: Math.max(Date.now(), (d.attempts.at(-1)?.createdAt || 0) + d.limits.minIntervalMs) };
            d.attempts.push(reserved);
        });
        return reserved;
    }
    async settle(handle, id, tokens = null, { usage = null, cost = null } = {}) {
        return this.mutateOwner(handle, d => {
            const attempt = d.attempts.find(a => a.id === id);
            if (!attempt || attempt.status !== 'reserved') throw new Error('invalid_advisory_settlement');
            if (tokens !== null) evolutionInteger(tokens, 0, 10000000);
            attempt.status = tokens === null ? 'unknown' : 'reported'; attempt.tokens = tokens ?? attempt.upperBound;
            attempt.usage = usage; attempt.cost = cost;
            // Token suggestions are observations, not hard quota violations.
            // Never clear an existing breach or change an earlier charge.
        });
    }
}

// A rolling 24 hours is conservative across unknown API reset timezones.
// The migration carry counts existing use without inventing old request rows.
export class M1ApiQuota {
    constructor(snapshot, persist = () => {}, now = Date.now) {
        if (!snapshot || snapshot.schemaVersion !== 1 || !Number.isSafeInteger(snapshot.carry?.requests) || snapshot.carry.requests < 0
            || !Number.isSafeInteger(snapshot.carry.at) || snapshot.carry.at < 0 || !Array.isArray(snapshot.admissions)
            || snapshot.admissions.some(a => !a.id || !Number.isSafeInteger(a.at) || a.at < 0)
            || new Set(snapshot.admissions.map(a => a.id)).size !== snapshot.admissions.length) throw new Error('invalid_api_quota_checkpoint');
        this.snapshot = structuredClone(snapshot); this.persist = persist; this.now = now;
        if (snapshot.carry.at > now() + 60000 || snapshot.admissions.some(a => a.at > now() + 60000)) throw new Error('invalid_api_quota_clock');
    }
    assertAvailable() {
        const at = this.now(), recent = this.snapshot.admissions.filter(a => a.at > at - 86400000);
        const carry = this.snapshot.carry.at > at - 86400000 ? this.snapshot.carry.requests : 0;
        if (recent.length + carry >= 2000) throw new Error('m1_api_daily_limit');
        if (recent.filter(a => a.at > at - 60000).length >= 20) throw new Error('m1_api_rate_limit');
        return at;
    }
    admit(id) {
        const at = this.assertAvailable();
        if (this.snapshot.admissions.some(a => a.id === id)) throw new Error('duplicate_api_admission');
        this.snapshot.admissions.push({ id, at }); this.persist(this.snapshot);
    }
}
