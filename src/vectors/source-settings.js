// Provider configuration is resolved by the authenticated Native Retrieval boundary.
export function getSourceSettings(source, request) {
    if (!request.nativeRetrieval || request.nativeRetrieval.profile.source !== source) {
        throw new TypeError('An exact Native Retrieval resource is required');
    }
    return request.nativeRetrieval.settings;
}
import { assertRetrievalHeaders } from '../../public/scripts/native/retrieval-contracts.js';


export function nativeRetrievalHeaders(request) {
    return request?.nativeRetrieval ? assertRetrievalHeaders(request.nativeRetrieval.profile?.headers) : {};
}
