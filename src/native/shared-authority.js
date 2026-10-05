import { PERSONA_NAMESPACE, personaIdentity, personaFailure, personaFields } from './persona-contract.js';
import { randomBytes, createHash } from 'node:crypto';
import { fields as valueFields } from '../../public/shared/native-values.js';
import { assertLifecycleJson } from '../../public/shared/native-lifecycle-contract.js';
import { assertTaskValue, taskId } from '../../public/shared/native-task-contract.js';
import { actorAvailability, projectInformation } from '../../public/shared/native-information-runtime.js';
import { SHARED_NAMESPACE as NS } from '../../public/shared/native-shared-contract.js';
import { hashNativeDocument } from './repositories/common.js';
import { prepareLifecycle } from './lifecycle-authority.js';
import { ConflictError } from '../storage/errors.js';

function fields(value, allowed, label) {
    try { valueFields(value, allowed, label); } catch (error) { throw new TypeError(error.message); }
}
const presence = new Map();
const definition = base => base.manifest.runtime?.experienceContract?.sharedRuntime;
const denied = () => { throw new TypeError('Shared participant capability denied'); };
const memberOf = (access, principal) => access?.state.members.find(member => member.handle === principal) ?? denied();
const requireHost = member => { if (member.role !== 'host') denied(); };
const requireHead = (base, expected) => { if (base.revision.revisionId !== expected) throw new ConflictError('native_session_head_conflict'); };
function seatPersona(base, owner, sessionId, member, access) {
    const selection = base.states[PERSONA_NAMESPACE]?.seats[member.seatId];
    const scopeId = definition(base).seats.find(seat => seat.id === member.seatId).scopeId;
    const scope = base.states.atri_lifecycle.scopes[scopeId], grant = selection?.authorization;
    return grant?.principalHash === hashNativeDocument([owner, sessionId, member.handle, member.seatId])
        && grant.accessEpoch === access.state.epoch && scope?.status === 'active' && grant.scopeEpoch === scope.epoch ? selection : null;
}
const presenceKey = (owner, sessionId, principal) => JSON.stringify([owner, sessionId, principal]);

// Deterministic rejection sampling avoids modulo bias. Inputs are committed
// Host seed + exact Session/Turn/seat; no package RNG or client dice result.
export function sharedRoll(seed, sessionId, turnId, seatId, sides) {
    if (!Number.isSafeInteger(sides) || sides < 2 || sides > 1000000) throw new TypeError('Shared RNG bound');
    for (let counter = 0; counter < 128; counter++) {
        const value = createHash('sha256').update(JSON.stringify([seed, sessionId, turnId, seatId, counter])).digest().readUInt32BE();
        if (value < Math.floor(0x100000000 / sides) * sides) return value % sides + 1;
    }
    throw new TypeError('Shared RNG work limit');
}

export class SharedAuthority {
    constructor(core) { this.core = core; this.repo = core._sessions.sharedAccess; }
    async access(owner, sessionId, principal) {
        const access = await this.repo.load(owner, sessionId);
        const member = memberOf(access, principal);
        const base = await this.core.load(owner, sessionId, { skipPackageEdits: true });
        if (!definition(base) || access.state.packageHash !== base.session.packageContentHash) throw new TypeError('Shared exact Package closure changed');
        if ((await this.repo.load(owner, sessionId))?.revisionId !== access.revisionId) throw new ConflictError('native_shared_acl_conflict');
        return { access, member, base };
    }
    async enable(principal, sessionId, expectedRevisionId) {
        return this.repo.lock(principal, sessionId, async () => {
            const base = await this.core.load(principal, sessionId, { skipPackageEdits: true });
            requireHead(base, expectedRevisionId);
            if (!definition(base)) throw new TypeError('Shared contract required');
            const prior = await this.repo.load(principal, sessionId);
            if (!prior) await this.repo.commit(principal, sessionId, null, { packageHash: base.session.packageContentHash, epoch: 0,
                seed: randomBytes(32).toString('hex'), members: [{ handle: principal, seatId: definition(base).seats[0].id, role: 'host' }] }, { kind: 'shared.enabled' });
            return this.snapshot(principal, sessionId, principal);
        });
    }
    async membership(owner, sessionId, principal, raw) {
        const action = assertLifecycleJson(raw); fields(action, ['expectedAccessRevisionId', 'handle', 'seatId', 'role'], 'Shared membership');
        if (typeof action.handle !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(action.handle)) throw new TypeError('Shared account handle required');
        return this.repo.lock(owner, sessionId, async () => {
            const { access, member, base } = await this.access(owner, sessionId, principal); requireHost(member);
            if (access.revisionId !== action.expectedAccessRevisionId) throw new ConflictError('native_shared_acl_conflict');
            if (action.handle === owner || !['participant', 'observer', 'revoked'].includes(action.role)) denied();
            const state = structuredClone(access.state); state.epoch++;
            state.members = state.members.filter(item => item.handle !== action.handle);
            if (action.role !== 'revoked') {
                if (!definition(base).seats.some(seat => seat.id === action.seatId) || state.members.some(item => item.seatId === action.seatId)) throw new TypeError('Shared seat unavailable');
                state.members.push({ handle: action.handle, seatId: action.seatId, role: action.role });
            }
            if (state.members.length > 32) throw new TypeError('Shared participant limit');
            const personaState = base.states[PERSONA_NAMESPACE];
            const oldMember = access.state.members.find(item => item.handle === action.handle);
            if (personaState && oldMember) {
                const seats = { ...personaState.seats }; delete seats[oldMember.seatId];
                await this.core._publish(owner, base, { states: { ...base.states, [PERSONA_NAMESPACE]: { ...personaState, seats } } });
            }
            await this.repo.commit(owner, sessionId, access, state, { kind: 'shared.membership', seatId: action.seatId ?? null, role: action.role });
            presence.delete(presenceKey(owner, sessionId, action.handle));
            return this.snapshot(owner, sessionId, principal);
        });
    }
    async snapshot(owner, sessionId, principal, cursor = null) {
        const { access, member, base } = await this.access(owner, sessionId, principal);
        const def = definition(base); const seat = def.seats.find(item => item.id === member.seatId);
        const scopes = Object.fromEntries(def.seats.filter(item => item.id === member.seatId).map(item => [item.scopeId, base.states.atri_lifecycle.scopes[item.scopeId]]));
        const nextCursor = hashNativeDocument([base.revision.revisionId, access.revisionId, seat.id, scopes, base.realmRevisionId ?? null]);
        const peers = access.state.members.filter(item => def.seats.find(seat => seat.id === item.seatId).scopeId === seat.scopeId);
        const now = Date.now();
        const playerRef = handle => ({ provider: 'local-host', id: hashNativeDocument([owner, base.session.packageId, handle]), trust: 'authenticated-local' });
        const participants = peers.map(item => ({ seatId: item.seatId, playerRef: playerRef(item.handle), role: item.role, online: (presence.get(presenceKey(owner, sessionId, item.handle)) ?? 0) > now - 30000 }));
        const shared = base.states[NS]; const turn = shared?.turns?.[seat.scopeId];
        return { schemaVersion: 1, kind: 'shared-session', sessionId, packageVersionId: base.session.packageVersionId, packageContentHash: base.session.packageContentHash,
            revisionId: base.revision.revisionId, branchId: base.revision.branchId, accessRevisionId: access.revisionId, accessEpoch: access.state.epoch,
            seatId: seat.id, playerRef: playerRef(principal), role: member.role, cursor: nextCursor, reset: cursor !== nextCursor, participants,
            realmRevisionId: seat.realmViewIds?.length || seat.realmCommands?.length || member.role === 'host' ? base.realmRevisionId ?? null : null,
            personas: peers.map(item => ({ seatId: item.seatId, status: seatPersona(base, owner, sessionId, item, access) ? 'selected' : base.states[PERSONA_NAMESPACE]?.seats[item.seatId] ? 'unavailable' : 'none', name: seatPersona(base, owner, sessionId, item, access)?.snapshot.name ?? '',
                avatar: seatPersona(base, owner, sessionId, item, access)?.snapshot.avatar ?? null })),
            scopes, projection: cursor === nextCursor ? null : Object.fromEntries(seat.viewIds.map(id => [id, projectInformation(base, id)])),
            realm: Object.fromEntries((seat.realmViewIds ?? []).map(id => [id, base.realmViews[id]])),
            turn: turn?.scopeId === seat.scopeId ? { id: turn.id, status: turn.status, roster: turn.roster.map(item => item.seatId),
                submitted: turn.submissions.map(item => item.seatId), scopeEpoch: turn.scopeEpoch,
                stale: turn.status === 'collecting' && (turn.expectedRevisionId !== base.revision.revisionId || turn.accessEpoch !== access.state.epoch || turn.scopeEpoch !== scopes[seat.scopeId]?.epoch) } : null,
            receipts: (shared?.receipts ?? []).filter(item => item.scopeId === seat.scopeId).slice(-32).map(item => ({ id: item.id, kind: item.kind, status: item.status, rolls: item.rolls ?? [] })) };
    }
    async selectPersona(owner, sessionId, principal, input) {
        personaFields(input, ['seatId', 'expectedAccessRevisionId', 'expectedRevisionId', 'accessEpoch', 'scopeEpoch', 'selection']);
        if (!Object.hasOwn(input, 'selection') || !this.core.personas) throw personaFailure();
        return this.repo.lock(owner, sessionId, () => this.core.personas.locks([owner, principal], () => this.core.withPersonaSession(owner, sessionId, async () => {
            const context = await this.access(owner, sessionId, principal).catch(error => { if (error instanceof TypeError && error.message.includes('denied')) throw personaFailure('native_persona_scope_denied'); throw error; });
            const { access, member, base } = context;
            if (member.role === 'observer' || member.seatId !== input.seatId) throw personaFailure('native_persona_scope_denied');
            const seat = definition(base).seats.find(item => item.id === member.seatId);
            const scope = base.states.atri_lifecycle.scopes[seat.scopeId];
            if (access.revisionId !== input.expectedAccessRevisionId || access.state.epoch !== input.accessEpoch
                || scope?.status !== 'active' || scope.epoch !== input.scopeEpoch) throw personaFailure('native_persona_conflict');
            requireHead(base, input.expectedRevisionId);
            this.core.assertPersonaWritable(owner, base);
            const selection = await this.core.personas.capture(principal, input.selection);
            if (selection) selection.authorization = { principalHash: hashNativeDocument([owner, sessionId, principal, seat.id]), accessEpoch: access.state.epoch, scopeEpoch: scope.epoch };
            if (selection?.snapshot.avatar && principal !== owner) {
                const { ref, bytes } = await this.core.personas.assets.read(principal, selection.snapshot.avatar.assetId);
                await this.core.personas.assets.put(owner, ref, bytes);
            }
            const state = base.states[PERSONA_NAMESPACE] ?? { schemaVersion: 1, solo: null, seats: {} };
            await this.core._publishLocked(owner, base, { states: { ...base.states, [PERSONA_NAMESPACE]: { ...state, seats: { ...state.seats, [seat.id]: selection } } } });
            return this.snapshot(owner, sessionId, principal);
        })));
    }
    async heartbeat(owner, sessionId, principal) {
        await this.access(owner, sessionId, principal);
        const now = Date.now(); for (const [key, time] of presence) if (time <= now - 30000) presence.delete(key);
        if (presence.size >= 4096 && !presence.has(presenceKey(owner, sessionId, principal))) throw new TypeError('Shared Presence capacity');
        presence.set(presenceKey(owner, sessionId, principal), now);
        return this.snapshot(owner, sessionId, principal);
    }
    async command(owner, sessionId, principal, raw) {
        const action = assertLifecycleJson(raw);
        fields(action, ['kind', 'invocationId', 'expectedRevisionId', 'expectedAccessRevisionId', 'scopeId', 'scopeEpoch', 'turnId', 'ruleId', 'args'], 'Shared command');
        const argumentsByKind = { 'turn.open': ['scopeId', 'scopeEpoch'], 'turn.submit': ['turnId', 'ruleId', 'args'], 'turn.commit': ['turnId'], 'turn.cancel': ['turnId'] };
        if (!Object.hasOwn(argumentsByKind, action.kind)) throw new TypeError('Unknown Shared command');
        fields(action, ['kind', 'invocationId', 'expectedRevisionId', 'expectedAccessRevisionId', ...argumentsByKind[action.kind]], 'Shared typed action');
        taskId(action.invocationId);
        return this.repo.lock(owner, sessionId, async () => {
            const { access, member, base } = await this.access(owner, sessionId, principal);
            if (access.revisionId !== action.expectedAccessRevisionId) throw new ConflictError('native_shared_acl_conflict');
            const def = definition(base); const seat = def.seats.find(item => item.id === member.seatId);
            const state = structuredClone(base.states[NS] ?? { schemaVersion: 1, turns: {}, receipts: [] });
            const id = seat.id + ':' + action.invocationId;
            const fingerprint = hashNativeDocument(action);
            const prior = state.receipts.find(item => item.id === id);
            if (prior) { if (prior.fingerprint !== fingerprint) throw new TypeError('Shared invocation conflict'); return this.snapshot(owner, sessionId, principal); }
            requireHead(base, action.expectedRevisionId);
            if (state.receipts.length >= 2048) throw new TypeError('Shared durable receipt limit');
            let candidate = base; const rolls = []; const events = []; let turn;
            if (action.kind === 'turn.open') {
                requireHost(member); taskId(action.scopeId);
                const scope = base.states.atri_lifecycle.scopes[action.scopeId];
                if (scope?.status !== 'active' || scope.epoch !== action.scopeEpoch) throw new TypeError('Shared Scene Scope stale');
                if (state.turns[action.scopeId]?.status === 'collecting') throw new TypeError('Shared Turn already collecting');
                const roster = access.state.members.filter(item => item.role !== 'observer' && def.seats.find(seat => seat.id === item.seatId).scopeId === action.scopeId)
                    .map(item => ({ seatId: item.seatId })).sort((a, b) => a.seatId < b.seatId ? -1 : a.seatId > b.seatId ? 1 : 0);
                if (!roster.length) throw new TypeError('Shared Turn requires participants');
                turn = state.turns[action.scopeId] = { id, status: 'collecting', roster, scopeId: action.scopeId, scopeEpoch: action.scopeEpoch, branchId: base.revision.branchId,
                    accessEpoch: access.state.epoch, submissions: [], expectedRevisionId: null };
            } else {
                turn = Object.values(state.turns).find(item => item.id === action.turnId);
                if (!turn || turn.id !== action.turnId || turn.status !== 'collecting') throw new TypeError('Shared Turn unavailable');
                if (action.kind === 'turn.cancel') { requireHost(member); turn.status = 'cancelled'; } else {
                    const scope = base.states.atri_lifecycle.scopes[turn.scopeId];
                    if (turn.expectedRevisionId !== base.revision.revisionId || turn.branchId !== base.revision.branchId || turn.accessEpoch !== access.state.epoch
                        || scope?.status !== 'active' || scope.epoch !== turn.scopeEpoch) throw new TypeError('Shared Turn stale');
                    if (action.kind === 'turn.submit') {
                        if (member.role === 'observer' || !turn.roster.some(item => item.seatId === seat.id) || !actorAvailability(base, seat.actorId).available) denied();
                        if (turn.submissions.some(item => item.seatId === seat.id) || !seat.ruleIds.includes(action.ruleId)) throw new TypeError('Shared input duplicate or rule denied');
                        const rule = def.rules.find(item => item.id === action.ruleId);
                        const command = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(item => item.id === rule.domainId).commands.find(item => item.id === rule.commandId);
                        const args = structuredClone(action.args);
                        if (rule.roll) {
                            if (Object.hasOwn(args, rule.roll.argument)) throw new TypeError('Shared RNG is Host-owned');
                            args[rule.roll.argument] = sharedRoll(access.state.seed, sessionId, turn.id, seat.id, rule.roll.sides);
                        }
                        assertTaskValue(args, command.argsSchema);
                        turn.submissions.push({ seatId: seat.id, ruleId: rule.id, args, identity: personaIdentity(seatPersona(base, owner, sessionId, member, access), seat.id) ?? null });
                    } else if (action.kind === 'turn.commit') {
                        requireHost(member);
                        if (turn.submissions.length !== turn.roster.length) throw new TypeError('Shared Turn awaits inputs');
                        const installed = await this.core._openPackage(owner, base.session.packageId, base.session.packageVersionId, base.session.entryPointId);
                        for (const participant of turn.roster) {
                            const input = turn.submissions.find(item => item.seatId === participant.seatId);
                            const assigned = def.seats.find(item => item.id === participant.seatId);
                            if (!actorAvailability(base, assigned.actorId).available) throw new TypeError('Shared Actor unavailable');
                            const rule = def.rules.find(item => item.id === input.ruleId);
                            const prepared = await prepareLifecycle(candidate, installed, { kind: 'app.command', domainId: rule.domainId,
                                commandId: rule.commandId, recordId: assigned.id, args: input.args });
                            candidate = { ...candidate, states: prepared.states };
                            events.push(...prepared.events.map(event => ({ ...event, seatId: assigned.id, ruleId: rule.id })));
                            if (rule.roll) rolls.push({ seatId: assigned.id, sides: rule.roll.sides, result: input.args[rule.roll.argument] });
                        }
                        turn.status = 'committed'; turn.submissions = [];
                    } else throw new TypeError('Unknown Shared command');
                }
            }
            state.receipts.push({ id, fingerprint, kind: action.kind, scopeId: turn.scopeId, scopeEpoch: turn.scopeEpoch, branchId: base.revision.branchId,
                baseRevisionId: base.revision.revisionId, accessEpoch: access.state.epoch, status: 'committed', rolls, events,
                rng: { algorithm: 'sha256-rejection-v1', seedHash: hashNativeDocument(access.state.seed) } });
            if (Buffer.byteLength(JSON.stringify(state)) > 1024 * 1024) throw new TypeError('Shared state byte limit');
            await this.core._publish(owner, base, { states: { ...candidate.states, [NS]: state }, sharedPublication: true });
            return this.snapshot(owner, sessionId, principal);
        });
    }
    async realm(owner, sessionId, principal, command, expectedRevisionId, expectedAccessRevisionId) {
        return this.repo.lock(owner, sessionId, async () => {
            const { access, member, base } = await this.access(owner, sessionId, principal);
            if (access.revisionId !== expectedAccessRevisionId) throw new ConflictError('native_shared_acl_conflict');
            const normalized = assertLifecycleJson(command);
            fields(normalized, ['type', 'invocationId', 'action'], 'Shared Realm command');
            if (normalized.type !== 'realm') throw new TypeError('Shared Realm command type required');
            let action = normalized.action;
            if (member.role !== 'host') {
                const seat = definition(base).seats.find(item => item.id === member.seatId);
                if (member.role === 'observer' || !actorAvailability(base, seat.actorId).available || action?.kind !== 'command' || !seat.realmCommands?.some(grant => grant.domainId === action.domainId && grant.commandId === action.commandId)) denied();
                if (action.recordId !== undefined) throw new TypeError('Participant Realm record identity is Host-owned');
                action = { ...action, recordId: 'player.' + hashNativeDocument([owner, base.session.packageId, principal]).slice(0, 48) };
            }
            // Different authenticated participants cannot collide invocation IDs.
            const invocationId = 'shared.' + hashNativeDocument([principal, normalized.invocationId]).slice(0, 48);
            if (typeof normalized.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(normalized.invocationId)) throw new TypeError('Shared Realm invocation required');
            await this.core.applyRealmCommand(owner, sessionId, { type: 'continuity', invocationId, action }, { expectedRevisionId });
            return this.snapshot(owner, sessionId, principal);
        });
    }
}
