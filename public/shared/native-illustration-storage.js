import { assertIllustrationState, assertIllustrationImage } from './native-illustration-contract.js';
import { visualObject, visualHash, visualId, visualError, visualFingerprint } from './native-visual-contract.js';

export const IMAGE_VERSION_NAMESPACE = 'atri_visual_image';
// Immutable ImageVersions are separate content-addressed Native resources.
// A Branch presentation manifest stores identities/hashes and mutable choices,
// never another copy of every Provider request/Workflow in each state revision.
export function illustrationManifest(value) {
    const state = assertIllustrationState(value);
    return { schemaVersion: 2, annotations: state.annotations, references: state.references,
        imageRefs: state.images.map(image => ({ imageVersionId: image.imageVersionId, head: visualFingerprint(image) })) };
}
export function assertIllustrationManifest(value) {
    visualObject(value, ['schemaVersion', 'annotations', 'imageRefs', 'references']);
    if (value.schemaVersion !== 2 || !Array.isArray(value.annotations) || !Array.isArray(value.imageRefs) || value.imageRefs.length > 8192) visualError('schema_cutover_required');
    const ids = new Set();
    for (const ref of value.imageRefs) {
        visualObject(ref, ['imageVersionId', 'head']); visualId(ref.imageVersionId, 'imgv'); visualHash(ref.head);
        if (ids.has(ref.imageVersionId)) visualError('image_identity_duplicate'); ids.add(ref.imageVersionId);
    }
    if (JSON.stringify(value).length > 8 * 1024 * 1024) visualError('manifest_limit');
    return structuredClone(value);
}
export function materializeIllustrations(value, imageLookup) {
    const manifest = assertIllustrationManifest(value);
    const images = manifest.imageRefs.map(ref => {
        const image = assertIllustrationImage(imageLookup(ref.head));
        if (image.imageVersionId !== ref.imageVersionId || visualFingerprint(image) !== ref.head) visualError('image_artifact_integrity');
        return image;
    });
    return assertIllustrationState({ schemaVersion: 2, annotations: manifest.annotations, images, references: manifest.references });
}
