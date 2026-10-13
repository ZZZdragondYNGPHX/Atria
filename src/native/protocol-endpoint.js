// Only the owner's saved ConnectionProfile supplies these URLs. Discovery may
// not redirect credentials or replace the configured origin/endpoint.
export function protocolEndpoint(url, protocol, { query = true } = {}) {
    let parsed;
    try { parsed = new URL(url); } catch { /* Reject below with a stable public code. */ }
    const loopback = /^http:\/\/(127\.0\.0\.1|\[::1\])(?::[0-9]+)?(?:\/|$)/.test(url);
    if (!parsed || !(parsed.protocol === 'https:' || loopback) || parsed.username || parsed.password || parsed.hash || (!query && parsed.search)) {
        throw Object.assign(new TypeError('A saved HTTPS endpoint or literal loopback HTTP endpoint is required.'), { code: protocol + '_endpoint_denied', dispatched: false, outcome: 'failed' });
    }
    return parsed;
}
