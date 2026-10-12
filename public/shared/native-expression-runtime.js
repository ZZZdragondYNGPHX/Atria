import { informationDefinition, projectInformation, actorAvailability, assertInformationAnchor } from './native-information-runtime.js';
import { informationItemFingerprint } from './native-cognition-runtime.js';
import { assertJsonDeclaration } from './native-values.js';

const fallback = reason => ({ schemaVersion: 1, kind: 'expression_plan', mode: 'text', status: 'fallback', reason });
const usable = item => (!item.cognition || item.cognition.sourceCurrent && item.cognition.status === 'active'
    && (item.semantic !== 'intention' || item.cognition.selection === 'current'))
    && (!item.memory || item.memory.sourceCurrent && item.memory.status === 'active' && item.memory.applicability === 'applicable'
        && ['willing', 'reluctant'].includes(item.memory.use))
    && (!item.causality || item.causality.sourceCurrent);

// This text-only plan selects already disclosed items; it never interprets
// private context as a public grant or changes any cognitive/World state.
export function deriveExpressionPlan(snapshot, information, { onScan = null } = {}) {
    const definition = informationDefinition(snapshot), narration = definition?.narration, expression = narration?.expression;
    if (!expression) return null;
    const contextView = definition.views.find(view => view.id === narration.contextViewId);
    const disclosureView = definition.views.find(view => view.id === narration.disclosureViewId);
    if (contextView?.audience !== 'narrator' || !contextView.exposure.includes('context')
        || disclosureView?.audience !== 'player' || !disclosureView.exposure.includes('display')
        || expression.sourceIds.some(id => !contextView.sources.includes(id) || !disclosureView.sources.includes(id))) return fallback('display_grant_unavailable');
    if (!snapshot.manifest.actors?.some(actor => actor.actorId === expression.actorId)
        || narration.mode === 'limited' && contextView.actorId !== expression.actorId) return fallback('actor_unavailable');
    if (!actorAvailability(snapshot, expression.actorId).available
        || expression.sourceIds.some(id => snapshot.states.atri_lifecycle.scopes[definition.sources.find(source => source.id === id)?.scopeId]?.status !== 'active')) return fallback('scope_unavailable');
    const disclosure = information?.disclosure;
    if (information?.projection?.viewId !== contextView.id || disclosure?.viewId !== disclosureView.id) return fallback('display_grant_unavailable');
    if (information.projection.truncated || disclosure.truncated) return fallback('truncated');
    let scanFailure, scanFailed = false;
    try {
        assertInformationAnchor(snapshot, information.projection.anchor);
        assertInformationAnchor(snapshot, disclosure.anchor);
    } catch {
        return fallback('stale');
    }
    try {
        // Re-use the original display projector and its cognitive qualifiers.
        // The caller's object cannot broaden fields or inject an expression.
        assertJsonDeclaration(disclosure, 'Expression display grant', 65536);
        const current = projectInformation(snapshot, disclosureView.id, { purpose: 'display', includeRollups: false, onScan: count => {
            try { onScan?.(count); } catch (error) { scanFailed = true; scanFailure = error; throw error; }
        } });
        if (informationItemFingerprint(current) !== informationItemFingerprint(disclosure)) return fallback('display_grant_changed');
    } catch {
        if (scanFailed) throw scanFailure;
        return fallback('display_grant_unavailable');
    }
    const items = disclosure.items.filter(item => expression.sourceIds.includes(item.sourceId)
        && [item.actorId, item.data.actor, item.data.actorId].every(actor => actor === undefined || actor === expression.actorId) && usable(item));
    if (expression.sourceIds.some(id => !items.some(item => item.sourceId === id))) return fallback('source_unavailable');
    if (items.length > 8) return fallback('item_limit');
    const plan = { schemaVersion: 1, kind: 'expression_plan', mode: 'text', status: 'ready', actorId: expression.actorId,
        intent: expression.intent, anchor: disclosure.anchor, sourceRefs: items.map(item => ({ itemId: item.id, fingerprint: informationItemFingerprint(item) })), items };
    try { return assertJsonDeclaration(plan, 'Expression plan', 8192); } catch { return fallback('byte_limit'); }
}

export function expressionPlanCurrent(snapshot, information, plan, options) {
    if (plan?.status !== 'ready') return false;
    const current = deriveExpressionPlan(snapshot, information, options);
    return current?.status === 'ready' && informationItemFingerprint(current) === informationItemFingerprint(plan);
}
