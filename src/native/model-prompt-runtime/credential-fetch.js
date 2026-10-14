import { lookup } from 'node:dns/promises';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import ipaddr from 'ipaddr.js';
import fetch from 'node-fetch';
import { credentialNetworkTarget } from './credential-targets.js';

// Validate DNS results inside socket creation, rather than resolving once and
// allowing fetch to resolve the name again. TLS still verifies the original host.
export function credentialLookup(resolve = lookup) {
    return (hostname, options, callback) => {
        const local = hostname.toLowerCase() === 'localhost';
        Promise.resolve(resolve(hostname, { all: true, verbatim: true })).then(addresses => {
            if (!addresses.length || addresses.some(item => ipaddr.process(item.address).range() !== (local ? 'loopback' : 'unicast')))
                throw new Error('native_credential_network_denied');
            callback(null, ...(options?.all ? [addresses] : [addresses[0].address, addresses[0].family]));
        }).catch(() => callback(Object.assign(new Error('Native credential destination denied'), { code: 'native_credential_network_denied' })));
    };
}
const http = new HttpAgent({ lookup: credentialLookup() }), https = new HttpsAgent({ lookup: credentialLookup() });
export async function credentialFetch(url, options = {}) {
    const target = new URL(String(url));
    // Adapters may append bounded discovery cursors or provider query fields;
    // credentials/user-info and fragment targets remain forbidden.
    if (target.username || target.password || target.hash) throw new Error('native_credential_target_invalid');
    const policyTarget = new URL(target); policyTarget.search = '';
    credentialNetworkTarget(policyTarget.href);
    return fetch(url, { ...options, redirect: 'error', agent: parsed => parsed.protocol === 'https:' ? https : http });
}
export async function publicTargetFetch(url, options = {}) {
    const target = new URL(String(url)), policyTarget = new URL(target); policyTarget.search = '';
    if (target.username || target.password || target.hash || credentialNetworkTarget(policyTarget.href).local)
        throw new Error('native_public_target_denied');
    return credentialFetch(target, { ...options, signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
}
export async function readPublicTargetText(url, { signal, maxBytes = 2 * 1024 * 1024 } = {}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) throw new Error('native_public_response_bound');
    const response = await publicTargetFetch(url, { signal });
    if (!response.ok) { response.body?.destroy(); throw new Error('native_public_response_failed'); }
    const chunks = []; let bytes = 0;
    try {
        for await (const chunk of response.body) {
            bytes += chunk.length;
            if (bytes > maxBytes) throw new Error('native_public_response_bound');
            chunks.push(Buffer.from(chunk));
        }
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)), bytes,
            contentType: response.headers.get('content-type'), url: response.url };
    } finally { response.body?.destroy(); }
}
