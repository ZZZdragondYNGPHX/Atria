import { informationDefinition, projectInformation } from './native-information-runtime.js';
import { projectParticipants } from './native-frontend-host.js';
import { historyPolicy } from './native-history-contract.js';
import { readChronicle } from './native-chronicle-host.js';

// Play reads existing player grants and public history at one selected revision.
// Subjects, Actor templates and non-player perspectives are never an archive.
export function worldRecordSections(snapshot) {
    const definition = informationDefinition(snapshot);
    const policy = historyPolicy(snapshot);
    return {
        get participants() { return projectParticipants(snapshot); },
        views: (definition?.views ?? []).filter(view => view.audience === 'player' && view.exposure.includes('display')).map(view => view.id),
        history: policy ? { clockId: policy.clockId, tick: snapshot.states.atri_lifecycle.clocks[policy.clockId],
            sources: policy.sources.filter(source => source.public).map(source => ({ id: source.id, label: source.label })) } : null,
    };
}

export function readPlayerWorldRecords(snapshot, viewId) {
    const view = informationDefinition(snapshot)?.views.find(view => view.id === viewId && view.audience === 'player' && view.exposure.includes('display'));
    if (!view) throw new TypeError('Player display grant unavailable');
    return projectInformation(snapshot, view.id, { purpose: 'display', includeRollups: false });
}

export function readPublicWorldHistory(snapshot, query = {}) {
    const policy = historyPolicy(snapshot);
    if (!policy || (query.key !== undefined && !policy.sources.some(source => source.id === query.key && source.public))) throw new TypeError('Public history source unavailable');
    return readChronicle(snapshot, query);
}
