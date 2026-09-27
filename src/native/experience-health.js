import { hashNativeDocument } from './repositories/common.js';
import { prepareLifecycle } from './lifecycle-authority.js';
import { fields as checkFields, json } from '../../public/scripts/native/experience/ui/v2-values.js';
import { assertNativeId } from './identity.js';
import { ConflictError } from '../storage/errors.js';
import { CONTINUITY_SESSION_NAMESPACE } from '../../public/shared/native-continuity-contract.js';
import { REALM_TRANSFER_NAMESPACE } from '../../public/shared/native-shared-contract.js';

function fields(value, allowed, label) {
    try { checkFields(value, allowed, label); } catch (error) { throw new TypeError(error.message); }
}

const anchors = base => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
    branchId: base.revision.branchId, packageVersionId: base.session.packageVersionId,
    playerRevisionId: base.continuityRevisionId ?? null, realmRevisionId: base.realmRevisionId ?? null });

export async function inspectExperienceHealth(core, handle, sessionId) {
    let base;
    try { base = await core.load(handle, sessionId, { skipPackageEdits: true }); } catch {
        // Only an owned readable snapshot may disclose recovery metadata. Never
        // repair invalid authority by copying a projection or a raw state patch.
        const saved = await core._sessions.loadSnapshot(handle, sessionId);
        return { schemaVersion: 1, anchor: anchors(saved), status: 'blocked',
            diagnostics: [{ code: 'session.validation_failed', severity: 'error', remediation: 'Restore the exact Package dependency or an explicitly reviewed save.' }],
            capabilities: [], domains: [], tasks: { pending: [], completed: 0 }, repairKinds: [],
            migration: { status: 'review-required', automatic: false } };
    }
    const contract = base.manifest.runtime?.experienceContract;
    const state = base.states.atri_lifecycle;
    const diagnostics = [];
    if (state && !state.ready) diagnostics.push({ code: 'experience.not_ready', severity: 'info', remediation: 'Complete Opening and configure required Task bindings.' });
    for (const effect of base.externalEffects ?? []) if (effect.status === 'prepared') diagnostics.push({
        code: 'transfer.prepared', severity: 'error', authority: effect.authority ?? 'player', intentId: effect.intentId,
        remediation: 'Resume the durable transfer, or cancel only before Session publication.' });
    for (const [id, scope] of Object.entries(state?.scopes ?? {})) if (scope.status !== 'active') diagnostics.push({ code: 'scope.' + scope.status, severity: 'info', scopeId: id });
    const tasks = base.states.atri_task_results?.records ?? [];
    const pending = (state?.outbox ?? []).filter(item => item.status === 'pending');
    for (const task of tasks.filter(task => task.status === 'draft')) diagnostics.push({ code: 'task.proposal_pending', severity: 'info', invocationId: task.invocationId });
    for (const [scopeId, turn] of Object.entries(base.states.atri_shared?.turns ?? {})) if (turn.status === 'collecting') diagnostics.push({ code: 'shared.collecting', severity: 'info', scopeId });
    return { schemaVersion: 1, anchor: anchors(base), status: diagnostics.some(item => item.severity === 'error') ? 'blocked' : 'healthy', diagnostics,
        capabilities: contract?.capabilities ?? [],
        domains: (contract?.lifecycleRuntime?.domains ?? []).map(domain => ({ id: domain.id, schemaVersion: domain.schemaVersion,
            records: state?.domains[domain.id]?.records.length ?? 0, limit: domain.retention.maxItems })),
        tasks: { pending: pending.map(item => ({ invocationId: item.invocationId, taskId: item.taskId, scopeId: item.scopeId, scopeEpoch: item.scopeEpoch })),
            completed: tasks.filter(item => item.status === 'completed' || item.status === 'applied').length },
        migration: { status: 'exact-version-pinned', packageVersionId: base.session.packageVersionId,
            automatic: false, message: 'Session and external ledgers retain their exact schemas. Schema replacement requires an explicit versioned adapter; restore never migrates or rewinds Player/Realm.' },
        repairKinds: [...(state ? ['retention.compact'] : []), ...(base.externalEffects?.some(item => item.status === 'prepared') ? ['transfer.resume', 'transfer.cancel'] : [])] };
}

export async function previewExperienceRepair(core, handle, sessionId, raw) {
    const request = json(raw);
    fields(request, ['kind', 'authority', 'intentId', 'expectedRevisionId'], 'Experience repair');
    assertNativeId(request.expectedRevisionId, 'revision');
    const base = await core.load(handle, sessionId, { skipPackageEdits: true });
    if (request.expectedRevisionId !== base.revision.revisionId) throw new ConflictError('native_health_stale');
    let changes;
    if (request.kind === 'retention.compact') {
        if (request.authority !== undefined || request.intentId !== undefined) throw new TypeError('Invalid retention repair');
        const installed = await core._openPackage(handle, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
        const prepared = await prepareLifecycle(base, installed, { kind: 'retention.compact' });
        changes = { before: base.states.atri_lifecycle, after: prepared.states?.atri_lifecycle ?? prepared.statePatch?.atri_lifecycle };
    } else if (['transfer.resume', 'transfer.cancel'].includes(request.kind) && ['player', 'realm'].includes(request.authority)) {
        const effect = base.externalEffects?.find(item => item.intentId === request.intentId && (item.authority ?? 'player') === request.authority && item.status === 'prepared');
        if (!effect) throw new TypeError('Prepared transfer required');
        if (request.kind === 'transfer.cancel') {
            const rawBase = await core._sessions.loadSnapshot(handle, sessionId);
            const namespace = request.authority === 'realm' ? REALM_TRANSFER_NAMESPACE : CONTINUITY_SESSION_NAMESPACE;
            if (rawBase.states[namespace]?.receipts.some(receipt => receipt.id === effect.intentId)) throw new TypeError('Session transfer already published; resume to complete');
        }
        // No balances, lineage grants or reservation bytes are edited here.
        changes = { before: { status: 'prepared', authority: request.authority, intentId: effect.intentId },
            after: { status: request.kind === 'transfer.resume' ? 'committed' : 'compensated', prePublicationOnly: request.kind === 'transfer.cancel' } };
    } else throw new TypeError('Unsupported typed repair');
    const anchor = anchors(base);
    return { schemaVersion: 1, anchor, request, changes, token: hashNativeDocument({ anchor, request, changes }), confirmationRequired: true };
}

export async function applyExperienceRepair(core, handle, sessionId, raw) {
    fields(raw, ['request', 'token', 'confirmed', 'invocationId'], 'Experience repair confirmation');
    if (raw.confirmed !== true || typeof raw.invocationId !== 'string') throw new TypeError('Explicit repair confirmation required');
    const plan = await previewExperienceRepair(core, handle, sessionId, raw.request);
    if (raw.token !== plan.token) throw new ConflictError('native_health_stale');
    const { kind, authority, intentId, expectedRevisionId } = plan.request;
    const action = kind === 'retention.compact' ? { kind } : { kind, intentId };
    if (kind === 'transfer.cancel') action[authority === 'realm' ? 'expectedRealmRevisionId' : 'expectedContinuityRevisionId'] = authority === 'realm' ? plan.anchor.realmRevisionId : plan.anchor.playerRevisionId;
    const command = { type: kind === 'retention.compact' ? 'lifecycle' : 'continuity', invocationId: raw.invocationId, action };
    if (kind === 'retention.compact') return core.applyLifecycleCommand(handle, sessionId, command, { expectedRevisionId });
    return authority === 'realm' ? core.applyRealmCommand(handle, sessionId, command, { expectedRevisionId })
        : core.applyContinuityCommand(handle, sessionId, command, { expectedRevisionId });
}
