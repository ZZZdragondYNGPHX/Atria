import { AgentEvolutionRepository, evolutionInteger } from '../../src/native/agent-intelligence/evolution-repository.js';
import { setTimeout as delay } from 'node:timers/promises';

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
    constructor(snapshot, persist = () => {}, now = Date.now, wait = delay) {
        if (!snapshot || snapshot.schemaVersion !== 1 || !Number.isSafeInteger(snapshot.carry?.requests) || snapshot.carry.requests < 0
            || !Number.isSafeInteger(snapshot.carry.at) || snapshot.carry.at < 0 || !Array.isArray(snapshot.admissions)
            || snapshot.admissions.some(a => !a.id || !Number.isSafeInteger(a.at) || a.at < 0)
            || new Set(snapshot.admissions.map(a => a.id)).size !== snapshot.admissions.length) throw new Error('invalid_api_quota_checkpoint');
        this.snapshot = structuredClone(snapshot); this.persist = persist; this.now = now;
        this.wait = wait;
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
    async waitAvailable(signal) {
        for (;;) {
            signal?.throwIfAborted();
            try { this.assertAvailable(); return; }
            catch (error) {
                if (!['m1_api_daily_limit', 'm1_api_rate_limit'].includes(error.message)) throw error;
                const at = this.now();
                const times = this.snapshot.admissions.filter(a => a.at > at - 86400000).map(a => ({ at: a.at, count: 1 }));
                if (this.snapshot.carry.at > at - 86400000) times.push({ at: this.snapshot.carry.at, count: this.snapshot.carry.requests });
                times.sort((a, b) => a.at - b.at);
                let count = times.reduce((sum, a) => sum + a.count, 0), readyAt = at;
                for (const row of times) { if (count < 2000) break; count -= row.count; readyAt = Math.max(readyAt, row.at + 86400000); }
                const minute = this.snapshot.admissions.filter(a => a.at > at - 60000).sort((a, b) => a.at - b.at);
                if (minute.length >= 20) readyAt = Math.max(readyAt, minute[minute.length - 20].at + 60000);
                await this.wait(Math.max(1, Math.min(60000, readyAt - at)), undefined, { signal });
            }
        }
    }
}
