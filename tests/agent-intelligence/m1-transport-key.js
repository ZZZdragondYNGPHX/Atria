// An explicit user-reported server configuration change starts a new failure
// window. Prior stopped windows and all billing/quota records remain intact.
export function m1TransportKey(url, model, epochs = {}, extractionOutputTokens = null) {
    if (extractionOutputTokens !== null && extractionOutputTokens !== 8000) throw new Error('invalid_extraction_output');
    const suffix = extractionOutputTokens === 8000 ? ':extraction-output:8000' : '';
    const epoch = epochs[model];
    if (!epoch) return url + ':' + model + suffix;
    if (!/^[a-f0-9-]{36}$/.test(epoch.revision) || epoch.reason !== 'user_reported_server_group_change'
        || !Number.isSafeInteger(epoch.authorizedAt) || epoch.authorizedAt < 0) throw new Error('invalid_transport_epoch');
    if (epoch.graderOutputTokens !== undefined && (!Number.isSafeInteger(epoch.graderOutputTokens) || epoch.graderOutputTokens < 1 || epoch.graderOutputTokens > 8192)) throw new Error('invalid_transport_epoch');
    return url + ':' + model + ':server-config:' + epoch.revision + (epoch.graderOutputTokens ? ':grader-output:' + epoch.graderOutputTokens : '') + suffix;
}
