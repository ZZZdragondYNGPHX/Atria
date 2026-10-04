import { extensionsRequest } from './extensions-client.js';
import { emptyIllustrations } from '../../shared/native-illustration-contract.js';
import { readIllustrationSelection, setIllustrationSelectionMode, repaintIllustrationSurfaces, onIllustrationSurfacesChanged, illustrationToolbarInset } from './illustration-surfaces.js';

export const illustrationSettingsClient = Object.freeze({
    read: () => extensionsRequest('/official/illustration'),
    save: (value, expectedRevision) => extensionsRequest('/official/illustration', { method: 'PUT', body: { value, expectedRevision } }),
});

export function createIllustrationExtensionApi({ runtime, document: doc }) {
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
        snapshot: () => structuredClone({ revisionId: runtime.snapshot?.revision?.revisionId, state: runtime.snapshot?.illustrations ?? emptyIllustrations(), head: runtime.snapshot?.session?.illustrationHead ?? null }),
        toolbarInset: scope => illustrationToolbarInset(doc, scope),
        selection: scope => readIllustrationSelection(doc, scope),
        selectionMode: (scope, enabled) => setIllustrationSelectionMode(doc, scope, enabled),
        subscribe: onIllustrationSurfacesChanged,
        command(scope, command, input, signal) {
            const captured = structuredClone(input);
            const result = queue.catch(() => {}).then(() => execute(scope, command, captured, signal));
            queue = result; return result;
        },
    });
}
