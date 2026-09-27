import { fields as valueFields } from '../../public/scripts/native/experience/ui/v2-values.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { assertLifecycleJson } from '../../public/shared/native-lifecycle-contract.js';
import { assertTaskValue, taskId } from '../../public/shared/native-task-contract.js';
import { CONTINUITY_SESSION_NAMESPACE as NS } from '../../public/shared/native-continuity-contract.js';
import { hashNativeDocument } from './repositories/common.js';
import { ConflictError } from '../storage/errors.js';

export const continuityDefinition = base => base.manifest.runtime?.experienceContract?.continuityRuntime;
const copy = value => structuredClone(value);
function fields(value, allowed, label) {
    try { valueFields(value, allowed, label); } catch (error) { throw new TypeError(error.message); }
}
const lineage = (sessionId, domainId, recordId) => 'line.' + hashNativeDocument([sessionId, domainId, recordId]).slice(0, 56);
const domainHash = definition => hashNativeDocument(definition.domains);
function stateFor(revision, definition, writable = true) {
    if (revision) {
        if (revision.state.definitionHash !== domainHash(definition)) throw new TypeError('Continuity schema/command migration required');
        return writable ? copy(revision.state) : revision.state;
    }
    return { definitionHash: domainHash(definition), domains: Object.fromEntries(definition.domains.map(domain => [domain.id, []])), claims: [], intents: [], receipts: [] };
}
function validateState(state, definition) {
    const pending = state.intents.filter(intent => intent.status === 'prepared');
    if (state.claims.length > 2048 || state.intents.length > 2048 || state.receipts.length + pending.length > 2048) throw new TypeError('Continuity durable receipt limit');
    const reservedBytes = pending.reduce((total, intent) => total + 2048 + (intent.direction === 'deposit'
        && !state.domains[intent.continuityDomainId].some(record => record.id === intent.lineageId)
        ? Buffer.byteLength(JSON.stringify({ id: intent.lineageId, status: 'active', value: intent.value })) : 0), 0);
    // Reserve final receipt and incoming record bytes before debiting Session.
    // Leave headroom under the repository's 8 MiB Revision envelope limit.
    if (Buffer.byteLength(JSON.stringify(state)) + reservedBytes > 6 * 1024 * 1024) throw new TypeError('Continuity state and transfer reservation byte limit');
    for (const domain of definition.domains) {
        const records = state.domains[domain.id];
        // Escrow reserves destination capacity too. Another Session must not
        // consume a slot needed to finish a previously debited transfer.
        const reserved = [...records, ...pending.filter(intent => intent.direction === 'deposit' && intent.continuityDomainId === domain.id
            && !records.some(record => record.id === intent.lineageId)).map(intent => ({ id: intent.lineageId, status: 'active', value: intent.value }))];
        if (reserved.length > domain.retention.maxItems || Buffer.byteLength(JSON.stringify(reserved)) > domain.retention.maxLogicalBytes) throw new TypeError('Continuity domain retention limit');
        if (new Set(records.map(record => record.id)).size !== records.length) throw new TypeError('Duplicate Continuity record');
        for (const record of records) { taskId(record.id); assertTaskValue(record.value, domain.recordSchema); }
    }
}
function requireHead(revision, expected) {
    if (expected === undefined || (revision?.revisionId ?? null) !== expected) throw new ConflictError('native_continuity_head_conflict');
}
function sessionTransferState(base) { return copy(base.states[NS] ?? { schemaVersion: 1, bindings: [], receipts: [] }); }
function activeScope(base, domain, epoch) {
    const scope = base.states.atri_lifecycle?.scopes[domain.scopeId];
    if (!scope || scope.status !== 'active' || scope.epoch !== epoch) throw new TypeError('Transfer scope is stale or inactive');
}

// Called for every publication, including restore/switch/fork and Task/Activity
// settlement. Historical snapshots remain immutable; their continuation loses
// claims already externalized. No external authority is rolled back.
export function reconcileOwnership(base, states, revision, { pendingIntentId = null, publication = false } = {}) {
    const definition = continuityDefinition(base);
    if (!definition) return states;
    const state = stateFor(revision, definition, false);
    if (publication && state.intents.some(intent => intent.sessionId === base.session.sessionId && intent.status === 'prepared' && intent.id !== pendingIntentId)) throw new ConflictError('native_transfer_pending');
    const result = copy(states);
    const bindings = new Map((result[NS]?.bindings ?? []).map(binding => [binding.domainId + ':' + binding.recordId, binding]));
    const claims = new Map(state.claims.map(claim => [claim.lineageId, claim]));
    for (const transfer of definition.transfers) {
        const domain = result.atri_lifecycle?.domains[transfer.sessionDomainId];
        if (!domain) continue;
        domain.records = domain.records.filter(record => {
            const binding = bindings.get(transfer.sessionDomainId + ':' + record.id);
            const id = binding?.lineageId ?? lineage(base.session.sessionId, transfer.sessionDomainId, record.id);
            const claim = claims.get(id);
            if (!claim) return !binding; // Imported receipts cannot manufacture account ownership.
            const owned = claim.owner === 'session' || (claim.owner === 'escrow' && claim.intentId === pendingIntentId);
            return owned && claim.sessionId === base.session.sessionId && claim.domainId === transfer.sessionDomainId
                && claim.recordId === record.id && claim.grant === (binding?.grant ?? null);
        });
    }
    return result;
}

export async function projectContinuity(repo, handle, base, viewId, revisionId = null) {
    const revision = await repo.load(handle, base.session.packageId, revisionId);
    return projectContinuityRevision(base, viewId, revision);
}

export function projectContinuityRevision(base, viewId, revision) {
    const definition = continuityDefinition(base); const view = definition?.views.find(view => view.id === viewId);
    if (!view) throw new TypeError('Declared Continuity display view required');
    const state = stateFor(revision, definition, false);
    const unavailable = new Set(state.claims.filter(claim => claim.owner !== 'continuity').map(claim => claim.lineageId));
    const visible = state.domains[view.domainId].filter(record => !unavailable.has(record.id));
    return { kind: 'player-continuity', exposure: 'display', packageId: base.session.packageId, domainId: view.domainId,
        revisionId: revision?.revisionId ?? null, receiptRefs: state.receipts.filter(receipt => receipt.domainId === view.domainId).map(receipt => receipt.id), truncated: visible.length > view.maxItems,
        records: visible.slice(0, view.maxItems).map(record => ({ id: record.id, value: Object.fromEntries(view.fields.filter(field => Object.hasOwn(record.value, field)).map(field => [field, copy(record.value[field])])) })) };
}

export function continuityDisplay(base, revision) {
    return Object.fromEntries(continuityDefinition(base).views.map(view => [view.id, projectContinuityRevision(base, view.id, revision)]));
}

export async function applyContinuity(core, handle, sessionId, raw, expectedRevisionId) {
    const command = assertLifecycleJson(raw);
    fields(command, ['type', 'invocationId', 'action'], 'Continuity command');
    if (command.type !== 'continuity' || typeof command.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(command.invocationId)) throw new TypeError('Continuity invocation required');
    let base = await core.load(handle, sessionId);
    const definition = continuityDefinition(base);
    if (!definition || !core._continuity) throw new TypeError('Continuity contract required');
    const packageId = base.session.packageId;
    if (command.action?.kind === 'transfer.resume') {
        fields(command.action, ['kind', 'intentId'], 'Transfer resume');
        if (base.revision.revisionId !== expectedRevisionId) throw new ConflictError('native_session_head_conflict');
        const revision = await core._continuity.load(handle, packageId);
        const intent = revision?.state.intents.find(intent => intent.id === command.action.intentId && intent.sessionId === sessionId);
        if (!intent || intent.status === 'compensated') throw new TypeError('Recoverable transfer required');
        return applyContinuity(core, handle, sessionId, { type: 'continuity', invocationId: intent.invocationId, action: intent.action }, intent.baseRevisionId);
    }
    return core._continuity.lock(handle, packageId, async () => {
        base = await core.load(handle, sessionId, { skipPackageEdits: true });
        let revision = await core._continuity.load(handle, packageId);
        let state = stateFor(revision, definition);
        const action = command.action, id = sessionId + ':' + command.invocationId;
        const fingerprint = hashNativeDocument({ action, expectedRevisionId });
        const commit = async event => {
            validateState(state, definition);
            revision = await core._continuity.commit(handle, packageId, revision, state, event);
        };
        const response = async receipt => ({ ...await core.load(handle, sessionId, { skipPackageEdits: true }), continuityRevisionId: revision?.revisionId ?? null, continuityReceipt: receipt });
        const prior = state.receipts.find(receipt => receipt.id === id);
        if (prior) {
            if (prior.fingerprint !== fingerprint) throw new TypeError('Continuity invocation conflict');
            return response(prior);
        }
        if (action.kind === 'command') {
            fields(action, ['kind', 'domainId', 'recordId', 'commandId', 'args', 'expectedContinuityRevisionId'], 'Continuity typed Command');
            if (base.revision.revisionId !== expectedRevisionId) throw new ConflictError('native_session_head_conflict');
            requireHead(revision, action.expectedContinuityRevisionId);
            const domain = definition.domains.find(domain => domain.id === action.domainId);
            const mutation = domain?.commands.find(item => item.id === action.commandId);
            if (!mutation) throw new TypeError('Unknown Continuity Command');
            taskId(action.recordId);
            const args = assertTaskValue(action.args, mutation.argsSchema);
            const records = state.domains[domain.id]; let record = records.find(record => record.id === action.recordId);
            if (record?.status === 'terminal') throw new TypeError('Continuity record terminal');
            if (!record) { record = { id: action.recordId, status: 'active', value: copy(domain.initial) }; records.push(record); }
            const { terminal, ...declaration } = mutation;
            const logic = compileDeclarativeLogic({ schemaVersion: 2, mutations: [declaration] });
            record.value = assertTaskValue(logic.reducers[0].reduce(record.value, { type: mutation.event, payload: args }), domain.recordSchema);
            if (terminal) record.status = 'terminal';
            const receipt = { id, fingerprint, domainId: domain.id, kind: 'authority', event: mutation.event, status: 'committed', baseRevisionId: revision?.revisionId ?? null };
            state.receipts.push(receipt); await commit({ kind: 'command', receiptId: id, domainId: domain.id, commandId: mutation.id, event: mutation.event, args,
                source: { sessionId, revisionId: expectedRevisionId, packageVersionId: base.session.packageVersionId, packageContentHash: base.session.packageContentHash } });
            return response(receipt);
        }
        if (action.kind === 'transfer.cancel') {
            fields(action, ['kind', 'intentId', 'expectedContinuityRevisionId'], 'Transfer cancellation');
            if (base.revision.revisionId !== expectedRevisionId) throw new ConflictError('native_session_head_conflict');
            requireHead(revision, action.expectedContinuityRevisionId);
            const intent = state.intents.find(intent => intent.id === action.intentId && intent.sessionId === sessionId);
            if (!intent || intent.status !== 'prepared') throw new TypeError('Pending transfer required');
            const rawBase = await core._sessions.loadSnapshot(handle, sessionId);
            if (rawBase.states[NS]?.receipts.some(receipt => receipt.id === intent.id)) throw new TypeError('Session transfer already published; resume to complete');
            const index = state.claims.findIndex(claim => claim.lineageId === intent.lineageId);
            if (intent.previousClaim) state.claims[index] = intent.previousClaim;
            else state.claims.splice(index, 1);
            intent.status = 'compensated';
            const receipt = { id, fingerprint, domainId: intent.continuityDomainId, kind: 'transfer', status: 'compensated', intentId: intent.id };
            state.receipts.push(receipt); await commit({ kind: 'transfer.compensated', intentId: intent.id });
            return response(receipt);
        }
        fields(action, ['kind', 'transferId', 'direction', 'recordId', 'lineageId', 'scopeEpoch', 'expectedContinuityRevisionId'], 'Transfer Intent');
        if (action.kind !== 'transfer' || !['deposit', 'withdraw'].includes(action.direction)) throw new TypeError('Unknown Continuity action');
        const transfer = definition.transfers.find(transfer => transfer.id === action.transferId);
        if (!transfer) throw new TypeError('Unknown transfer definition');
        const sessionDomain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === transfer.sessionDomainId);
        const playerDomain = definition.domains.find(domain => domain.id === transfer.continuityDomainId);
        let intent = state.intents.find(intent => intent.id === id);
        if (intent && (intent.fingerprint !== fingerprint || intent.status === 'compensated')) throw new TypeError('Transfer invocation conflict or compensated');
        if (!intent) {
            if (base.revision.revisionId !== expectedRevisionId) throw new ConflictError('native_session_head_conflict');
            requireHead(revision, action.expectedContinuityRevisionId); activeScope(base, sessionDomain, action.scopeEpoch); taskId(action.recordId);
            if (state.intents.some(intent => intent.sessionId === sessionId && intent.status === 'prepared')) throw new ConflictError('native_transfer_pending');
            const sessionState = sessionTransferState(base);
            let value, lineageId, previousClaim;
            if (action.direction === 'deposit') {
                if (action.lineageId !== undefined) throw new TypeError('Deposit lineage is Host-owned');
                const record = base.states.atri_lifecycle.domains[sessionDomain.id].records.find(record => record.id === action.recordId);
                if (!record || record.status !== 'active') throw new TypeError('Transfer source unavailable');
                const binding = sessionState.bindings.find(binding => binding.domainId === sessionDomain.id && binding.recordId === record.id);
                lineageId = binding?.lineageId ?? lineage(sessionId, sessionDomain.id, record.id);
                previousClaim = state.claims.find(claim => claim.lineageId === lineageId) ?? null;
                value = assertTaskValue(record.value, playerDomain.recordSchema);
                if (previousClaim && (previousClaim.owner !== 'session' || previousClaim.sessionId !== sessionId || previousClaim.grant !== binding?.grant)) throw new TypeError('Entity lineage already claimed');
            } else {
                taskId(action.lineageId); lineageId = action.lineageId;
                previousClaim = state.claims.find(claim => claim.lineageId === lineageId) ?? null;
                if (!previousClaim || previousClaim.owner !== 'continuity' || previousClaim.continuityDomainId !== playerDomain.id) throw new TypeError('Continuity lineage unavailable');
                const record = state.domains[playerDomain.id].find(record => record.id === lineageId);
                if (!record || base.states.atri_lifecycle.domains[sessionDomain.id].records.some(record => record.id === action.recordId)) throw new TypeError('Transfer destination conflict');
                value = assertTaskValue(record.value, sessionDomain.recordSchema);
            }
            intent = { id, invocationId: command.invocationId, action: copy(action), fingerprint, status: 'prepared', sessionId, packageVersionId: base.session.packageVersionId, baseRevisionId: expectedRevisionId,
                branchId: base.revision.branchId, scopeEpoch: action.scopeEpoch, direction: action.direction, sessionDomainId: sessionDomain.id,
                continuityDomainId: playerDomain.id, recordId: action.recordId, lineageId, value, previousClaim, grant: action.direction === 'withdraw' ? id : previousClaim?.grant ?? null };
            const claim = { lineageId, owner: 'escrow', intentId: id, sessionId, domainId: sessionDomain.id, recordId: action.recordId, grant: intent.grant, continuityDomainId: playerDomain.id };
            state.claims = state.claims.filter(claim => claim.lineageId !== lineageId); state.claims.push(claim); state.intents.push(intent);
            // Check the eventual destination budget before reserving ownership.
            const prospective = copy(state);
            if (action.direction === 'deposit') prospective.domains[playerDomain.id].push({ id: lineageId, status: 'active', value });
            validateState(prospective, definition);
            await commit({ kind: 'transfer.prepared', intentId: id, lineageId, direction: intent.direction });
        }
        // Crash/retry recovery reads the durable Session publication receipt. No
        // in-memory operation, model call or new scheduler is needed to resume.
        const rawBase = await core._sessions.loadSnapshot(handle, sessionId);
        const published = rawBase.states[NS]?.receipts.find(receipt => receipt.id === id);
        let sessionRevisionId = published?.sessionRevisionId ?? rawBase.revision.revisionId;
        if (!published) {
            if (rawBase.revision.revisionId !== intent.baseRevisionId) throw new ConflictError('native_transfer_session_conflict');
            activeScope(base, sessionDomain, intent.scopeEpoch);
            const states = copy(rawBase.states); const markers = sessionTransferState(rawBase); states[NS] = markers;
            const records = states.atri_lifecycle.domains[sessionDomain.id].records;
            if (intent.direction === 'deposit') states.atri_lifecycle.domains[sessionDomain.id].records = records.filter(record => record.id !== intent.recordId);
            else {
                if (records.some(record => record.id === intent.recordId)) throw new TypeError('Transfer destination conflict');
                records.push({ id: intent.recordId, scopeId: sessionDomain.scopeId, status: 'active', pinned: true, value: intent.value,
                    createdLogicalTime: states.atri_lifecycle.logicalTime, updatedLogicalTime: states.atri_lifecycle.logicalTime + 1 });
                if (records.length > sessionDomain.retention.maxItems || Buffer.byteLength(JSON.stringify(records)) > sessionDomain.retention.maxLogicalBytes) throw new TypeError('Session transfer retention limit');
                markers.bindings = markers.bindings.filter(binding => binding.domainId !== sessionDomain.id || binding.recordId !== intent.recordId);
                markers.bindings.push({ domainId: sessionDomain.id, recordId: intent.recordId, lineageId: intent.lineageId, grant: intent.grant });
            }
            if (markers.receipts.length >= 2048) throw new TypeError('Session transfer receipt limit');
            markers.receipts.push({ id, kind: 'transfer', lineageId: intent.lineageId, direction: intent.direction });
            const next = await core._publishLocked(handle, { ...base, states: rawBase.states }, { states, pendingIntentId: id });
            sessionRevisionId = next.revision.revisionId;
        }
        state = copy(revision.state); intent = state.intents.find(intent => intent.id === id);
        const claim = state.claims.find(claim => claim.lineageId === intent.lineageId);
        if (intent.direction === 'deposit') {
            state.domains[playerDomain.id].push({ id: intent.lineageId, status: 'active', value: intent.value }); claim.owner = 'continuity';
        } else {
            state.domains[playerDomain.id] = state.domains[playerDomain.id].filter(record => record.id !== intent.lineageId); claim.owner = 'session';
        }
        intent.status = 'committed';
        const receipt = { id, fingerprint, domainId: intent.continuityDomainId, kind: 'transfer', status: 'committed', direction: intent.direction, lineageId: intent.lineageId,
            baseSessionRevisionId: intent.baseRevisionId, sessionRevisionId, baseContinuityRevisionId: revision.revisionId };
        state.receipts.push(receipt); await commit({ kind: 'transfer.committed', intentId: id, lineageId: intent.lineageId, sessionRevisionId });
        return response(receipt);
    });
}

export function continuityEffects(revision, sessionId) {
    return (revision?.state.intents ?? []).filter(intent => intent.sessionId === sessionId)
        .map(intent => ({ intentId: intent.id, lineageId: intent.lineageId, direction: intent.direction, status: intent.status, branchId: intent.branchId, baseRevisionId: intent.baseRevisionId }));
}
