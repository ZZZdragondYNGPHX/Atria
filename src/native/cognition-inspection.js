import { informationDefinition, projectInformation, assertInformationAnchor } from '../../public/shared/native-information-runtime.js';
import { hashNativeDocument } from './repositories/common.js';

const denied = () => { throw Object.assign(new TypeError('Cognition inspection denied'), { code: 'native_cognition_inspection_denied' }); };

/** The original ProjectStore remains the authoring authority. Exclude only the
 * grant to avoid a self-referential hash; view/source definitions stay bound. */
export function cognitionAuthorSourceHash(source) {
    const selected = structuredClone(source);
    const information = selected.package?.runtime?.experienceContract?.informationRuntime;
    if (information) delete information.inspection;
    return hashNativeDocument(selected);
}

/** A player read never inherits a narrator/Actor/inspector display grant. */
export function cognitionDisclosure(snapshot, expectedAnchor) {
    if (expectedAnchor) assertInformationAnchor(snapshot, expectedAnchor);
    const definition = informationDefinition(snapshot);
    const views = definition?.views.filter(view => view.audience === 'player' && view.exposure.includes('display')
        && (!definition.narration || view.id === definition.narration.disclosureViewId)) ?? [];
    return { schemaVersion: 1, projection: Object.fromEntries(views.map(view => [view.id,
        projectInformation(snapshot, view.id, { includeRollups: false })])) };
}

/** Inspection is a bounded read, never a mutation or a portable capability. */
export async function inspectCognition(snapshot, principal, projectStore, { viewId, expectedAnchor } = {}) {
    const definition = informationDefinition(snapshot), policy = definition?.inspection;
    if (!policy || !policy.viewIds.includes(viewId) || !projectStore) denied();
    const source = await projectStore.get(principal, policy.projectId);
    if (!source || source.project.packageId !== snapshot.session.packageId
        || cognitionAuthorSourceHash(source) !== policy.sourceHash
        || hashNativeDocument(source.package.runtime?.experienceContract?.informationRuntime ?? null) !== hashNativeDocument(definition)) denied();
    if (expectedAnchor) assertInformationAnchor(snapshot, expectedAnchor);
    return projectInformation(snapshot, viewId, { purpose: 'display', includeRollups: false });
}

export async function cognitionCatalog(snapshot, principal, projectStore) {
    const disclosure = cognitionDisclosure(snapshot), views = Object.entries(disclosure.projection).map(([viewId, projection]) => ({ viewId, kind: 'player', anchor: projection.anchor }));
    for (const viewId of informationDefinition(snapshot)?.inspection?.viewIds ?? []) {
        try {
            const projection = await inspectCognition(snapshot, principal, projectStore, { viewId });
            views.push({ viewId, kind: 'inspection', anchor: projection.anchor });
        } catch (error) { if (error.code !== 'native_cognition_inspection_denied') throw error; }
    }
    return { schemaVersion: 1, views, contextExposureGrantsDisplay: false };
}
