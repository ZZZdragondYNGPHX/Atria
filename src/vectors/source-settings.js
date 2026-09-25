// Provider configuration is resolved by the authenticated Native Retrieval boundary.
export function getSourceSettings(source, request) {
    if (!request.nativeRetrieval || request.nativeRetrieval.profile.source !== source) {
        throw new TypeError('An exact Native Retrieval resource is required');
    }
    return request.nativeRetrieval.settings;
}
