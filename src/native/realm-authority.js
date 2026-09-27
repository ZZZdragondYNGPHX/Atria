import { applyContinuity, reconcileOwnership, continuityEffects, projectContinuityRevision } from './continuity-authority.js';
import { REALM_TRANSFER_NAMESPACE } from '../../public/shared/native-shared-contract.js';
import { assertLifecycleJson } from '../../public/shared/native-lifecycle-contract.js';

// A local Host's Package family is one Realm. Realm and Player revisions are
// different resources, coordinated by the same existing authority lock/Saga.
export const realmDefinition = base => base.manifest.runtime?.experienceContract?.sharedRuntime?.realm;
export function reconcileRealm(base, states, revision, options = {}) {
    return reconcileOwnership(base, states, revision, { ...options, definition: realmDefinition(base), namespace: REALM_TRANSFER_NAMESPACE });
}
export function realmDisplay(base, revision) {
    const definition = realmDefinition(base);
    const adapted = { ...base, manifest: { ...base.manifest, runtime: { ...base.manifest.runtime,
        experienceContract: { ...base.manifest.runtime.experienceContract, continuityRuntime: definition } } } };
    return Object.fromEntries(definition.views.map(view => [view.id, { ...projectContinuityRevision(adapted, view.id, revision), kind: 'realm' }]));
}
export async function loadRealm(core, handle, base, historical = false) {
    if (!realmDefinition(base)) return base;
    const revision = await core._sessions.realm.load(handle, base.session.packageId);
    if (!historical) base.states = reconcileRealm(base, base.states, revision);
    base.realmRevisionId = revision?.revisionId ?? null;
    base.realmViews = realmDisplay(base, revision);
    base.externalEffects = [...(base.externalEffects ?? []), ...continuityEffects(revision, base.session.sessionId).map(effect => ({ ...effect, authority: 'realm' }))];
    return base;
}
export async function applyRealm(core, handle, sessionId, command, expectedRevisionId) {
    command = assertLifecycleJson(command);
    if (Object.hasOwn(command.action ?? {}, 'expectedContinuityRevisionId')) throw new TypeError('Realm requires expectedRealmRevisionId');
    const action = { ...command.action };
    if (Object.hasOwn(action, 'expectedRealmRevisionId')) { action.expectedContinuityRevisionId = action.expectedRealmRevisionId; delete action.expectedRealmRevisionId; }
    const result = await applyContinuity(core, handle, sessionId, { ...command, action }, expectedRevisionId, {
        repo: core._sessions.realm, definitionFor: realmDefinition, namespace: REALM_TRANSFER_NAMESPACE, pendingKey: 'pendingRealmIntentId',
    });
    const { continuityReceipt, continuityRevisionId: _revision, ...snapshot } = result;
    // Retain the actual player HEAD returned by load, not the adapted Saga HEAD.
    const player = await core._continuity.load(handle, snapshot.session.packageId);
    return { ...snapshot, continuityRevisionId: player?.revisionId ?? null, realmReceipt: continuityReceipt };
}
