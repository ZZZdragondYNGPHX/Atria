import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertConnectionProfile } from './contracts.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
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
export function createCredentialSecretPort({ resolveSecret }) {
    return { resolveSecret: async (ref, context) => {
        const { connection } = context ?? {};
        if (!connection?.secretRef || hash(ref) !== hash(connection.secretRef)) fail('generation_secret_unavailable');
        canonicalCredentialTarget(connection);
        return resolveSecret(ref, context);
    } };
}
