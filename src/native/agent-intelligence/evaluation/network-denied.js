// Preserve original protocol constructors while denying direct worker fetch.
export { Headers, Request, Response, FetchError, AbortError, FormData, Blob, File,
    blobFrom, blobFromSync, fileFrom, fileFromSync, isRedirect } from 'node-fetch';
export default async function evaluationNetworkDenied() { throw new Error('evaluation_network_denied'); }
