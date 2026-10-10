import { hashNativeDocument } from '../repositories/common.js';
import { assertEvidenceScope, assertEvidenceSelector, assertEvidenceSet, evidenceBudget, evidenceSet,
    EvidenceSourceError, text } from './contracts.js';
import { ProjectEvidenceSourceAdapter, RpEvidenceSourceAdapter } from './source-adapters.js';

function same(left, right) { return hashNativeDocument(left) === hashNativeDocument(right); }

function sourceFailure(error) {
    if (error instanceof EvidenceSourceError) return { status: error.status, code: error.code };
    if (error?.name === 'NotFoundError') return { status: 'missing', code: 'source_missing' };
    // Corrupt/missing dependencies and IO errors never become current evidence.
    return { status: 'unavailable', code: 'source_authority_failed' };
}

// S02 is a read-only contract/consumer. Durable capture belongs to S03/S04.
// EvidenceSet stores references only; hashes label content, not authorization.
export class AgentEvidenceService {
    constructor({ chatRepo, sessionCore, studio, agent } = {}) {
        this.rp = new RpEvidenceSourceAdapter({ chatRepo, sessionCore });
        this.project = new ProjectEvidenceSourceAdapter({ studio, agent });
    }

    _adapter(scope) { return scope.domain === 'project' ? this.project : this.rp; }

    async capture(handle, scopeValue, selectorsValue, budgetValue) {
        text(handle, 'Authenticated owner');
        const scope = assertEvidenceScope(scopeValue);
        const budget = evidenceBudget(budgetValue);
        if (!Array.isArray(selectorsValue) || !selectorsValue.length || selectorsValue.length > budget.maxSources) throw new TypeError('Source selection exceeds budget');
        const selectors = selectorsValue.map(value => assertEvidenceSelector(value, scope));
        if (new Set(selectors.map(hashNativeDocument)).size !== selectors.length) throw new TypeError('Duplicate source selection');
        const references = [];
        let sources;
        try { sources = await this._adapter(scope).readMany(handle, scope, selectors, budget); } catch (error) {
            const failure = sourceFailure(error);
            throw new EvidenceSourceError(failure.status, failure.code);
        }
        for (const item of sources) {
            if (item.error) {
                const failure = sourceFailure(item.error);
                throw new EvidenceSourceError(failure.status, failure.code);
            }
            const source = item.source;
            budget.expand(source.value);
            references.push(source.reference);
        }
        return evidenceSet(handle, scope, references);
    }

    async evaluate(handle, expectedScopeValue, setValue, budgetValue, { expand = false } = {}) {
        text(handle, 'Authenticated owner');
        if (typeof expand !== 'boolean') throw new TypeError('Evidence expand must be boolean');
        const scope = assertEvidenceScope(expectedScopeValue);
        const set = assertEvidenceSet(setValue);
        const budget = evidenceBudget(budgetValue);
        // Check owner/scope before any source access or expansion. Neither a
        // client-supplied handle nor a model result can replace this boundary.
        if (set.owner !== handle || !same(scope, set.scope)) throw new EvidenceSourceError('denied', 'evidence_owner_scope_mismatch');
        if (set.references.length > budget.maxSources) throw new EvidenceSourceError('budget_blocked', 'evidence_source_budget');
        const checks = [];
        const content = [];
        const selectors = set.references.map(ref => ref.selector);
        const read = async () => {
            try { return await this._adapter(scope).readMany(handle, scope, selectors, budget); } catch (error) {
                return selectors.map(() => ({ error }));
            }
        };
        const sources = await read();
        for (let index = 0; index < set.references.length; index++) {
            try {
                if (sources[index].error) throw sources[index].error;
                const source = sources[index].source;
                if (!same(source.reference, set.references[index])) throw new EvidenceSourceError('stale', 'evidence_anchor_hash_changed');
                if (expand) { budget.expand(source.value); content.push(source.value); }
                checks.push({ status: 'current', code: null });
            } catch (error) { checks.push(sourceFailure(error)); }
        }
        // Resolve the whole scope in one coherent observation, then recheck
        // the whole selection. No await separates the final checks and return.
        const rechecked = checks.some(check => check.status === 'current') ? await read() : [];
        for (let index = 0; index < checks.length; index++) {
            if (checks[index].status !== 'current') continue;
            try {
                if (rechecked[index].error) throw rechecked[index].error;
                const source = rechecked[index].source;
                if (!same(source.reference, set.references[index])) throw new EvidenceSourceError('stale', 'evidence_changed_during_read');
            } catch (error) { checks[index] = sourceFailure(error); }
        }
        const current = checks.every(check => check.status === 'current');
        return { schemaVersion: 1, evidenceSetHash: set.integrity, status: current ? 'current' : 'incomplete',
            checks, usage: budget.usage(), ...(expand && current ? { content } : {}) };
    }
}
