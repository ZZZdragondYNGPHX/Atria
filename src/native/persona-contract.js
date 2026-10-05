import { assertNativeId } from './identity.js';
import { assertAssetRef } from './contracts.js';
import { cloneNativeDocument, hashNativeDocument } from './repositories/common.js';

export const PERSONA_NAMESPACE = 'atri_player_persona';
export const EMPTY_PERSONA_FINGERPRINT = hashNativeDocument(null);
export const PERSONA_MEDIA_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
export function personaFailure(code = 'native_persona_invalid', details) {
    return Object.assign(code === 'native_persona_invalid' ? new TypeError(code) : new Error(code), { code, details });
}
export function personaFields(value, allowed) {
    if (Object.prototype.toString.call(value) !== '[object Object]' || Object.keys(value).some(key => !allowed.includes(key))) throw personaFailure();
}
export function personaHash(value) {
    if (!/^[a-f0-9]{64}$/.test(value ?? '')) throw personaFailure();
    return value;
}
export function assertPersonaRef(value) {
    personaFields(value, ['personaId', 'revisionId', 'contentIdentity']);
    try { assertNativeId(value.personaId, 'persona'); assertNativeId(value.revisionId, 'revision'); } catch { throw personaFailure(); }
    personaHash(value.contentIdentity);
    return cloneNativeDocument(value);
}
export function assertPersonaContent(value) {
    personaFields(value, ['name', 'avatar', 'description', 'managementNotes']);
    if (typeof value.name !== 'string' || !value.name.trim() || [...value.name].length > 256) throw personaFailure();
    for (const [field, limit] of [['description', 65536], ['managementNotes', 16384]]) {
        if (typeof value[field] !== 'string' || Buffer.byteLength(value[field], 'utf8') > limit) throw personaFailure();
    }
    if (value.avatar !== null) {
        personaFields(value.avatar, ['assetId', 'contentHash', 'size', 'mediaType', 'logicalName']);
        try { assertAssetRef(value.avatar); } catch { throw personaFailure(); }
        if (!PERSONA_MEDIA_TYPES.includes(value.avatar.mediaType) || value.avatar.size > 8 * 1024 * 1024) throw personaFailure();
    }
    return cloneNativeDocument(value);
}
export function capturePersona(revision, source) {
    if (!revision) return null;
    const ref = { personaId: revision.personaId, revisionId: revision.revisionId, contentIdentity: hashNativeDocument(revision) };
    const snapshot = { name: revision.name, avatar: revision.avatar, description: revision.description };
    return { ref, snapshot, snapshotHash: hashNativeDocument(snapshot), source };
}
export function assertPersonaSelection(value) {
    if (value === null) return null;
    personaFields(value, ['ref', 'snapshot', 'snapshotHash', 'source', 'authorization']);
    assertPersonaRef(value.ref);
    personaFields(value.snapshot, ['name', 'avatar', 'description']);
    assertPersonaContent({ ...value.snapshot, managementNotes: '' });
    if (hashNativeDocument(value.snapshot) !== value.snapshotHash || !['explicit', 'default', 'migration', 'restored'].includes(value.source)) throw personaFailure();
    if (value.authorization) {
        personaFields(value.authorization, ['principalHash', 'accessEpoch', 'scopeEpoch']);
        personaHash(value.authorization.principalHash);
        if (![value.authorization.accessEpoch, value.authorization.scopeEpoch].every(epoch => Number.isSafeInteger(epoch) && epoch >= 0)) throw personaFailure();
    }
    return cloneNativeDocument(value);
}
export function assertPersonaState(value) {
    personaFields(value, ['schemaVersion', 'solo', 'seats']);
    if (value.schemaVersion !== 1 || Object.prototype.toString.call(value.seats) !== '[object Object]') throw personaFailure();
    assertPersonaSelection(value.solo);
    if (Object.keys(value.seats).length > 32) throw personaFailure();
    for (const [seat, selection] of Object.entries(value.seats)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(seat)) throw personaFailure();
        assertPersonaSelection(selection);
    }
    return cloneNativeDocument(value);
}
export function personaIdentity(selection, seatId) {
    if (selection === undefined) return undefined; // Legacy remains unbound.
    return { schemaVersion: 1, ref: selection?.ref ?? null, name: selection?.snapshot.name ?? '', avatar: selection?.snapshot.avatar ?? null,
        snapshotHash: selection?.snapshotHash ?? null, ...(seatId ? { seatId } : {}) };
}
export function personaAvatars(state) {
    if (!state) return [];
    const checked = assertPersonaState(state);
    return [checked.solo, ...Object.values(checked.seats)].flatMap(selection => selection?.snapshot.avatar ? [selection.snapshot.avatar] : []);
}

export function assertPersonaIdentity(value) {
    personaFields(value, ['schemaVersion', 'ref', 'name', 'avatar', 'snapshotHash', 'seatId']);
    if (value.schemaVersion !== 1) throw personaFailure();
    if (value.ref === null) {
        if (value.name !== '' || value.avatar !== null || value.snapshotHash !== null) throw personaFailure();
    } else {
        assertPersonaRef(value.ref); personaHash(value.snapshotHash);
        assertPersonaContent({ name: value.name, avatar: value.avatar, description: '', managementNotes: '' });
    }
    if (value.seatId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.seatId)) throw personaFailure();
    return cloneNativeDocument(value);
}

export function personaDocumentReferences(value, field, id) {
    if (!value || typeof value !== 'object') return false;
    if (!Array.isArray(value) && value[field] === id) return true;
    return Object.values(value).some(item => personaDocumentReferences(item, field, id));
}
