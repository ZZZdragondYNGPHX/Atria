import { normalizeKnowledgeEntryEnabled, parseKnowledgeRegex } from './knowledge-contracts.js';

export const KNOWLEDGE_RUNTIME_NAMESPACE = 'atri_knowledge_runtime';

const tiers = { critical: 3, scene: 2, normal: 1, optional: 0 };
const relationKey = (item, id) => JSON.stringify([item.knowledgeBindingId, id]);

/** Native exact-identity selection. Evaluation is detached; only an accepted
 * generation may publish pendingState through Native Session state. */
export async function evaluateNativeKnowledge(plan, {
    messages = [], turn = messages.length, state = null, budget = Infinity,
    countTokens = text => Math.ceil(text.length / 4), render = text => text,
    random = Math.random,
} = {}) {
    const selected = new Map();
    const rejected = [...plan.rejected];
    const effects = {};
    const previous = state?.effects ?? {};
    // Also enforce the contract for detached plans passed directly to selection.
    const included = plan.included.filter(item => {
        if (normalizeKnowledgeEntryEnabled(item.entry.enabled) !== false) return true;
        rejected.push({ identity: item.identity, reason: 'entry_disabled' }); return false;
    });
    const byId = new Map(included.map(item => [relationKey(item, item.knowledgeEntryId), item]));
    const ordered = [...included].sort((a, b) => b.authorityRank - a.authorityRank
        || (tiers[b.entry.metadata?.budgetTier] ?? 1) - (tiers[a.entry.metadata?.budgetTier] ?? 1)
        || b.priority - a.priority || a.identity.localeCompare(b.identity));
    const eligible = new Map();
    const sticky = item => Number(previous[item.identity]?.stickyUntil ?? -1) > turn;
    for (const item of ordered) {
        const old = previous[item.identity];
        if (old && (old.stickyUntil > turn || old.cooldownUntil > turn)) effects[item.identity] = { ...old };
        const lifecycle = item.entry.lifecycle ?? {};
        const reason = turn < (lifecycle.delay ?? 0) ? 'delay'
            : !sticky(item) && Number(old?.cooldownUntil ?? -1) > turn ? 'cooldown'
                : !sticky(item) && random() * 100 >= (lifecycle.probability ?? 100) ? 'probability' : null;
        eligible.set(item.identity, !reason);
        if (reason) rejected.push({ identity: item.identity, reason });
    }
    let scan = messages.map(String).join('\n');
    const related = new Set();
    const attempted = new Set();
    let progress = true;
    while (progress) {
        progress = false;
        for (const item of ordered) {
            if (selected.has(item.identity) || attempted.has(item.identity) || !eligible.get(item.identity)) continue;
            const discovery = item.entry.discovery ?? {};
            const words = [...(discovery.keywords ?? []), ...(discovery.aliases ?? [])];
            const patterns = discovery.regex ?? [];
            const direct = item.stateActivated || (!words.length && !patterns.length);
            const matched = direct || sticky(item) || related.has(item.identity)
                || words.some(word => scan.toLocaleLowerCase().includes(String(word).toLocaleLowerCase()))
                || patterns.some(pattern => parseKnowledgeRegex(pattern).test(scan));
            if (!matched) continue;
            attempted.add(item.identity);
            const bundle = new Map();
            const collect = candidate => {
                if (!candidate || !eligible.get(candidate.identity)) return false;
                if (bundle.has(candidate.identity) || selected.has(candidate.identity)) return true;
                bundle.set(candidate.identity, candidate);
                return (candidate.entry.relations?.requiredEntryIds ?? [])
                    .every(id => collect(byId.get(relationKey(candidate, id))));
            };
            if (!collect(item)) {
                rejected.push({ identity: item.identity, reason: 'required_dependency_ineligible' });
                continue;
            }
            let accepted = null;
            for (const variant of ['full', 'compact']) {
                const additions = [];
                for (const candidate of bundle.values()) {
                    const compact = candidate.entry.metadata?.compactContent;
                    const content = String(await render(variant === 'compact' && compact ? compact : candidate.entry.content, candidate));
                    additions.push({ ...candidate, content, variant,
                        activationReason: candidate !== item ? 'required_dependency'
                            : sticky(item) ? 'sticky' : direct ? 'direct' : related.has(item.identity) ? 'related' : 'discovery' });
                }
                const text = [...selected.values(), ...additions].map(value => value.content).join('\n');
                if (await countTokens(text) <= budget) { accepted = additions; break; }
            }
            if (!accepted) {
                rejected.push({ identity: item.identity, reason: 'dependency_budget_overflow' });
                continue;
            }
            for (const candidate of accepted) {
                selected.set(candidate.identity, candidate);
                const lifecycle = candidate.entry.lifecycle ?? {};
                if (!sticky(candidate)) {
                    const stickyUntil = turn + (lifecycle.sticky ?? 0);
                    const cooldownUntil = stickyUntil + (lifecycle.cooldown ?? 0);
                    if (cooldownUntil > turn) effects[candidate.identity] = { stickyUntil, cooldownUntil };
                }
                for (const id of candidate.entry.relations?.relatedEntryIds ?? []) {
                    const other = byId.get(relationKey(candidate, id));
                    if (other) related.add(other.identity);
                }
                scan += '\n' + candidate.content;
            }
            progress = true;
        }
    }
    for (const item of ordered) {
        if (!selected.has(item.identity) && !rejected.some(value => value.identity === item.identity)) {
            rejected.push({ identity: item.identity, reason: 'discovery_unmatched' });
        }
    }
    const entries = ordered.filter(item => selected.has(item.identity)).map(item => selected.get(item.identity));
    const before = entries.filter(item => item.entry.delivery?.position !== 'after');
    const after = entries.filter(item => item.entry.delivery?.position === 'after');
    return { schemaVersion: 1, revisionId: plan.revisionId, branchId: plan.branchId, target: plan.target,
        entries, rejected, before, after, pendingState: { schemaVersion: 1, effects } };
}
