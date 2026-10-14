import { queryHistory, historyMetrics } from '../../public/shared/native-history-runtime.js';
import { assertNativeId } from './identity.js';
import { assertSessionRevision } from './contracts.js';

// Read-through projections over the existing Session/Chronicle authorities.
// Explicit snapshots prevent Package edit adoption, Run recovery and GC writes.
export class NativeSessionObservation {
    constructor({ core, sessionRepo }) { Object.assign(this, { core, sessionRepo }); }
    async history(handle, { sessionId, revisionId, query = {} }) {
        return queryHistory(await this.core.observe(handle, sessionId, { revisionId }), query);
    }
    async metrics(handle, { sessionId, revisionId }) {
        const snapshot = await this.core.observe(handle, sessionId, { revisionId });
        return { anchor: { sessionId, revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId }, ...historyMetrics(snapshot) };
    }
    async revision(handle, { sessionId, revisionId }) {
        assertNativeId(sessionId, 'session'); assertNativeId(revisionId, 'revision');
        // Observation validates both the requested Revision and its original
        // Package/dependency graph, rather than exposing unchecked raw records.
        const snapshot = await this.core.observe(handle, sessionId, { revisionId });
        return { sessionId, revision: assertSessionRevision(snapshot.revision),
            committed: await this.sessionRepo.isCommittedRevision(handle, sessionId, revisionId),
            references: await this.sessionRepo.getRevisionReferences(handle, sessionId, revisionId) };
    }
}
