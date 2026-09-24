const fail = code => { throw Object.assign(new Error('native_provider_' + code), { code: 'native_provider_' + code }); };
const formats = ['provider.openai-compatible', 'provider.raw-text', 'provider.anthropic', 'provider.gemini'];

// Non-generating, explicit-connection probe. Never follows provider-supplied URLs.
export function prepareProviderDiscovery(connection) {
    if (!formats.includes(connection.providerAdapter) || connection.transport !== 'transport.http'
        || Object.keys(connection.options).length || Object.keys(connection.networkPolicy).length) fail('probe_unsupported');
    const url = new URL(connection.endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('endpoint_invalid');
    const format = connection.providerAdapter.replace('provider.', '');
    if (format === 'gemini') url.pathname = url.pathname.replace(/\/$/, '') + '/models';
    else {
        const suffix = format === 'anthropic' ? /\/messages\/?$/ : /\/(?:chat\/)?completions\/?$/;
        if (!suffix.test(url.pathname)) fail('probe_unsupported');
        url.pathname = url.pathname.replace(suffix, '/models');
    }
    return { url, format };
}

export async function discoverProviderModels(connection, { secret, signal, fetchImpl = fetch } = {}) {
    const { url, format } = prepareProviderDiscovery(connection);
    const headers = format === 'anthropic' ? { 'x-api-key': secret, 'anthropic-version': '2023-06-01' }
        : format === 'gemini' ? { 'x-goog-api-key': secret } : { Authorization: 'Bearer ' + secret };
    const models = []; const cursors = new Set();
    const provenance = [{ kind: 'provider-discovery', source: connection.providerAdapter + ' models list: ' + connection.connectionProfileId, observedAt: Date.now() }];
    for (let page = 0; page < 20; page++) {
        let response;
        try { response = await fetchImpl(url, { headers, redirect: 'error', signal }); } catch { fail(signal?.aborted ? 'probe_cancelled' : 'unreachable'); }
        if (!response.ok) {
            await response.body?.cancel();
            fail(response.status === 401 || response.status === 403 ? 'authentication_failed'
                : response.status === 404 || response.status === 405 ? 'probe_unsupported' : 'unavailable');
        }
        let raw = ''; const decoder = new TextDecoder();
        for await (const chunk of response.body) { raw += decoder.decode(chunk, { stream: true }); if (raw.length > 2 * 1024 * 1024) fail('response_invalid'); }
        raw += decoder.decode();
        let value; try { value = JSON.parse(raw); } catch { fail('response_invalid'); }
        const entries = format === 'gemini' ? value.models : value.data;
        if (!Array.isArray(entries)) fail('response_invalid');
        for (const entry of entries) {
            if (format === 'gemini' && !entry.supportedGenerationMethods?.includes('generateContent')) continue;
            const id = format === 'gemini' ? entry.name?.replace(/^models\//, '') : entry.id;
            if (typeof id !== 'string' || !id || id.length > 512) fail('response_invalid');
            const limits = {}; const capabilities = [];
            for (const [key, observed] of Object.entries({ contextTokens: format === 'gemini' ? entry.inputTokenLimit : format === 'anthropic' ? entry.max_input_tokens : undefined,
                outputTokens: format === 'gemini' ? entry.outputTokenLimit : format === 'anthropic' ? entry.max_tokens : undefined })) {
                if (Number.isSafeInteger(observed) && observed > 0) limits[key] = observed;
            }
            for (const [capability, supported] of Object.entries({ 'generation.reasoning': format === 'gemini' ? entry.thinking : format === 'anthropic' ? entry.capabilities?.thinking?.supported : undefined,
                'generation.structured-output': format === 'anthropic' ? entry.capabilities?.structured_outputs?.supported : undefined })) {
                if (typeof supported === 'boolean') capabilities.push({ capability, state: supported ? 'supported' : 'unsupported', provenance });
            }
            models.push({ remoteModelId: id, displayName: String(entry.displayName || entry.display_name || id).slice(0, 256), limits, capabilities, provenance });
            if (models.length > 5000) fail('response_invalid');
        }
        const cursor = format === 'gemini' ? value.nextPageToken : format === 'anthropic' && value.has_more ? value.last_id : null;
        if (!cursor) {
            if (format === 'anthropic' && value.has_more) fail('response_invalid');
            const result = { status: 'reachable', models: [...new Map(models.map(model => [model.remoteModelId, model])).values()], provenance };
            if (secret && JSON.stringify(result).includes(secret)) fail('response_invalid');
            return result;
        }
        if (typeof cursor !== 'string' || cursor.length > 4096 || cursors.has(cursor)) fail('response_invalid');
        cursors.add(cursor); url.searchParams.set(format === 'gemini' ? 'pageToken' : 'after_id', cursor);
    }
    fail('response_invalid');
}
