import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument as hash, nativeRecord } from '../repositories/common.js';
import { assertConnectionProfile } from './contracts.js';
import { withRuntimeWrite } from './persistence.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { fields } from '../../../public/shared/native-values.js';
import { ConflictError } from '../../storage/errors.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function credentialNetworkTarget(endpoint) {
    const url = new URL(endpoint), hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('native_credential_target_invalid');
    const range = isIP(hostname) ? ipaddr.process(hostname).range() : null;
    const local = hostname === 'localhost' || range === 'loopback';
    if (range && !['unicast', 'loopback'].includes(range)) fail('native_credential_network_denied');
    if (url.protocol !== 'https:' && !local) fail('native_credential_insecure_target');
    return { endpoint: url.href, origin: url.origin, path: url.pathname, local };
}
export function canonicalCredentialTarget(value) {
    const connection = assertConnectionProfile(value), target = credentialNetworkTarget(connection.endpoint);
    return { ...target, connectionProfileId: connection.connectionProfileId, providerAdapter: connection.providerAdapter,
        transport: connection.transport, secretRef: connection.secretRef ?? null,
        networkPolicy: connection.networkPolicy, options: connection.options };
}
export function createCredentialSecretPort({ authority, resolveSecret }) {
    return { resolveSecret: async (ref, context) => {
        const { handle, connection } = context ?? {};
        if (!connection || !connection.secretRef || hash(ref) !== hash(connection.secretRef)) fail('native_credential_target_approval_required');
        await authority.assertConnection(handle, connection);
        return resolveSecret(ref, context);
    } };
}

/** Explicit Native credential use authority. Reading/sending never creates a permit. */
export class CredentialTargetAuthority {
    constructor({ persistence }) { this.persistence = persistence; this.engine = persistence._engine; }
    key(handle, connectionProfileId) { return { kind: K.credentialTargetPermit, handle, connectionProfileId }; }
    async _read(handle, id) {
        const record = await this.engine.withTransaction(handle, tx => tx.getResource(this.key(handle, id)));
        if (record && record.integrity !== hash(record.doc)) fail('native_credential_permit_integrity');
        return record?.doc ?? null;
    }
    async inspect(handle, input) {
        fields(input, ['connectionProfileId'], 'Credential target inspection');
        const connection = await this.persistence.getConnectionProfile(handle, input.connectionProfileId);
        if (!connection) fail('native_credential_connection_missing');
        const target = canonicalCredentialTarget(connection), permit = await this._read(handle, input.connectionProfileId);
        return { connectionProfileId: input.connectionProfileId, connectionFingerprint: hash(connection), target, targetFingerprint: hash(target),
            permitFingerprint: hash(permit), authorized: Boolean(permit && permit.targetFingerprint === hash(target)), permit };
    }
    async authorize(handle, input) {
        fields(input, ['connectionProfileId', 'expectedFingerprint', 'expectedTargetFingerprint', 'expectedPermitFingerprint', 'allowLocal'], 'Credential target authorization');
        if (![input.expectedFingerprint, input.expectedTargetFingerprint, input.expectedPermitFingerprint].every(digest)
            || input.allowLocal !== undefined && typeof input.allowLocal !== 'boolean') fail('native_credential_authorization_invalid');
        assertWritable();
        return withRuntimeWrite(handle, async () => {
            const view = await this.inspect(handle, { connectionProfileId: input.connectionProfileId });
            if (view.connectionFingerprint !== input.expectedFingerprint || view.targetFingerprint !== input.expectedTargetFingerprint
                || view.permitFingerprint !== input.expectedPermitFingerprint) throw new ConflictError('native_credential_target_conflict');
            if (view.target.local && input.allowLocal !== true) fail('native_credential_local_approval_required');
            const permit = { schemaVersion: 1, connectionProfileId: input.connectionProfileId, targetFingerprint: view.targetFingerprint,
                target: view.target, allowLocal: input.allowLocal === true, authorizedAt: Date.now() };
            await this.engine.withTransaction(handle, async tx => {
                assertWritable();
                const key = this.key(handle, input.connectionProfileId), existing = await tx.getResource(key);
                if (hash(existing?.doc ?? null) !== input.expectedPermitFingerprint) throw new ConflictError('native_credential_target_conflict');
                const result = await tx.putResourceIfMatch(key, existing?.integrity ?? null, nativeRecord(permit, { existing }));
                if (!result.updated) throw new ConflictError('native_credential_target_conflict');
            });
            return this.inspect(handle, { connectionProfileId: input.connectionProfileId });
        });
    }
    async assertConnection(handle, value) {
        const connection = assertConnectionProfile(value);
        const current = await this.persistence.getConnectionProfile(handle, connection.connectionProfileId);
        if (!current || hash(current) !== hash(connection)) throw new ConflictError('native_credential_connection_stale');
        const target = canonicalCredentialTarget(connection), permit = await this._read(handle, connection.connectionProfileId);
        if (!permit || permit.schemaVersion !== 1 || permit.targetFingerprint !== hash(target) || hash(permit.target) !== hash(target)
            || target.local && !permit.allowLocal) fail('native_credential_target_approval_required');
        return target;
    }
}
