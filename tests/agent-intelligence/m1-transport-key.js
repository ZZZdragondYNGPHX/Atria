// An explicit user-reported server configuration change starts a new failure
// window. Prior stopped windows and all billing/quota records remain intact.
export function m1TransportKey(url, model, epochs = {}) {
    const epoch = epochs[model];
    if (!epoch) return url + ':' + model;
    if (!/^[a-f0-9-]{36}$/.test(epoch.revision) || epoch.reason !== 'user_reported_server_group_change'
        || !Number.isSafeInteger(epoch.authorizedAt) || epoch.authorizedAt < 0) throw new Error('invalid_transport_epoch');
    return url + ':' + model + ':server-config:' + epoch.revision;
}
