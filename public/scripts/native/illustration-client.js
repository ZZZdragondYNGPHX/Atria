import { extensionsRequest } from './extensions-client.js';
import { runtimeRequest } from './runtime-client.js';
import { emptyIllustrations } from '../../shared/native-illustration-contract.js';
import { readIllustrationSelection, setIllustrationSelectionMode, repaintIllustrationSurfaces, onIllustrationSurfacesChanged, illustrationToolbarInset } from './illustration-surfaces.js';

export const illustrationSettingsClient = Object.freeze({
    read: () => extensionsRequest('/official/illustration'),
    save: (value, expectedRevision) => extensionsRequest('/official/illustration', { method: 'PUT', body: { value, expectedRevision } }),
});

export function createIllustrationExtensionApi({ runtime, document: doc, generationRequest = runtimeRequest }) {
    let queue = Promise.resolve();
    const execute = async (scope, command, input, signal) => {
        if (signal?.aborted) throw new Error('atri_extension_disposed');
        if (!['createAnnotation', 'updateAnnotation', 'deleteAnnotation', 'selectImageVersion'].includes(command)) throw new TypeError('Unknown illustration command');
        runtime.assertWritable();
        if (runtime.snapshot.session.sessionId !== scope.sessionId || runtime.snapshot.revision.branchId !== scope.branchId) throw new Error('atri_extension_disposed');
        let result;
        try { result = await runtime.request('illustrations/' + command, { ...input, expectedHead: input.expectedHead === undefined ? runtime.snapshot.session.illustrationHead ?? null : input.expectedHead, sessionId: scope.sessionId, branchId: scope.branchId }); } catch (error) {
            if (error.status !== 409 || runtime.snapshot?.session?.sessionId !== scope.sessionId || runtime.snapshot.revision.branchId !== scope.branchId || runtime.history) throw error;
            const latest = await runtime.request('load', { sessionId: scope.sessionId });
            if (latest.revision.branchId !== scope.branchId) throw error;
            result = { state: latest.illustrations, head: latest.session.illustrationHead ?? null };
            if (runtime.snapshot?.session?.sessionId === scope.sessionId && runtime.snapshot.revision.branchId === scope.branchId && !runtime.history) {
                runtime.snapshot.illustrations = result.state; runtime.snapshot.session.illustrationHead = result.head; repaintIllustrationSurfaces(scope, result.state);
            }
            throw error;
        }
        if (runtime.snapshot?.session?.sessionId !== scope.sessionId || runtime.snapshot.revision.branchId !== scope.branchId || runtime.history) return result;
        // Update presentation only. Streaming and narrative authority keep their identity.
        runtime.snapshot.illustrations = result.state;
        runtime.snapshot.session.illustrationHead = result.head;
        runtime.snapshot.session.illustrationHeads = { ...runtime.snapshot.session.illustrationHeads, [scope.branchId]: result.head };
        repaintIllustrationSurfaces(scope, result.state);
        return result;
    };
    return Object.freeze({
        settings: illustrationSettingsClient,
        configuration: () => generationRequest('/configuration'),
        snapshot: () => structuredClone({ revisionId: runtime.snapshot?.revision?.revisionId, state: runtime.snapshot?.illustrations ?? emptyIllustrations(), head: runtime.snapshot?.session?.illustrationHead ?? null }),
        toolbarInset: scope => illustrationToolbarInset(doc, scope),
        selection: scope => readIllustrationSelection(doc, scope),
        selectionMode: (scope, enabled) => setIllustrationSelectionMode(doc, scope, enabled),
        subscribe: onIllustrationSurfacesChanged,
        async prompt(scope, action, input, signal, step = 'prompts') {
            if (signal?.aborted || runtime.snapshot?.session.sessionId !== scope.sessionId
                || runtime.snapshot.revision.branchId !== scope.branchId || runtime.history) throw new Error('atri_extension_disposed');
            if (action === 'start' || action === 'cancel') runtime.assertWritable();
            let result;
            if (!['prompts', 'images'].includes(step)) throw new TypeError('Unknown illustration step');
            const path = '/illustration-' + step;
            if (action === 'start') result = await generationRequest(path, { method: 'POST', body: { sessionId: scope.sessionId, branchId: scope.branchId, annotationId: input.annotationId,
                ...(step === 'images' ? { expectedHead: input.expectedHead } : {}) }, signal });
            else if (action === 'list') result = await generationRequest(path + '?sessionId=' + encodeURIComponent(scope.sessionId) + '&branchId=' + encodeURIComponent(scope.branchId), { signal });
            else if (action === 'status' || action === 'cancel') result = await generationRequest((action === 'status' ? path + '/' : '/operations/') + encodeURIComponent(input.operationId), { method: action === 'cancel' ? 'DELETE' : 'GET', signal });
            else throw new TypeError('Unknown illustration prompt action');
            if (action === 'status') {
                if (result.operation.anchor.sessionId !== scope.sessionId || result.operation.anchor.branchId !== scope.branchId) throw new Error('atri_illustration_operation_mismatch');
                if (result.state && !signal?.aborted && runtime.snapshot?.session.sessionId === scope.sessionId && runtime.snapshot.revision.branchId === scope.branchId && !runtime.history) {
                    // Fetch current presentation after terminal delivery so a slow
                    // status response cannot overwrite a more recent card edit.
                    const refresh = queue.catch(() => {}).then(async () => {
                        if (signal?.aborted) return;
                        const latest = await runtime.request('illustrations/read', { sessionId: scope.sessionId, branchId: scope.branchId });
                        if (!signal?.aborted && runtime.snapshot?.session.sessionId === scope.sessionId && runtime.snapshot.revision.branchId === scope.branchId && !runtime.history) {
                            runtime.snapshot.illustrations = latest.state; runtime.snapshot.session.illustrationHead = latest.head;
                            runtime.snapshot.session.illustrationHeads = { ...runtime.snapshot.session.illustrationHeads, [scope.branchId]: latest.head };
                            repaintIllustrationSurfaces(scope, latest.state);
                            result = { ...result, ...latest };
                        }
                    });
                    queue = refresh; await refresh;
                }
            }
            return result;
        },
        image(scope, action, input, signal) { return this.prompt(scope, action, input, signal, 'images'); },
        command(scope, command, input, signal) {
            const captured = structuredClone(input);
            const result = queue.catch(() => {}).then(() => execute(scope, command, captured, signal));
            queue = result; return result;
        },
    });
}
