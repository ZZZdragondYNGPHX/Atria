import { NATIVE_RESOURCE_KINDS } from '../contracts.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument, putMutable, withNativeResourceWrite } from '../repositories/common.js';
import { assertGoal } from './goal-contracts.js';
import { text } from './contracts.js';

const key = (handle, goalId) => ({ kind: NATIVE_RESOURCE_KINDS.agentGoal, handle, goalId });
export class AgentGoalRepository {
    constructor({ engine }) { if (!engine) throw new TypeError('Goal repository requires StorageEngine'); this.engine = engine; }
    _document(record) {
        const doc = assertGoal(record.doc);
        if (doc.goalId !== record.key.goalId) throw new TypeError('Goal key mismatch');
        return doc;
    }
    async get(handle, goalId) {
        text(handle, 'Authenticated owner');
        const record = await this.engine.withTransaction(handle, tx => tx.getResource(key(handle, goalId)));
        return record ? this._document(record) : null;
    }
    async list(handle) {
        text(handle, 'Authenticated owner');
        const records = await this.engine.withTransaction(handle, tx => tx.listResources({ kind: NATIVE_RESOURCE_KINDS.agentGoal, handle }));
        return records.map(record => this._document(record));
    }
    async save(handle, value, expectedIntegrity) {
        assertWritable(); text(handle, 'Authenticated owner');
        const doc = assertGoal(value);
        if (expectedIntegrity !== null && !/^[a-f0-9]{64}$/.test(expectedIntegrity)) throw new TypeError('Goal requires integrity CAS');
        return withNativeResourceWrite(handle, 'goal:' + doc.goalId, () => this.engine.withTransaction(handle, async tx => {
            assertWritable();
            const resourceKey = key(handle, doc.goalId), record = await tx.getResource(resourceKey);
            if ((record?.integrity ?? null) !== expectedIntegrity) throw new ConflictError('goal_write_conflict');
            const previous = record ? this._document(record) : null;
            if (doc.sequence !== (previous ? previous.sequence + 1 : 0)) throw new ConflictError('goal_sequence_conflict');
            if (previous && ['subject', 'scope', 'intent', 'criteria', 'invariants', 'budget', 'createdAt']
                .some(field => hashNativeDocument(previous[field]) !== hashNativeDocument(doc[field]))) throw new ConflictError('goal_definition_conflict');
            if (previous?.execution && hashNativeDocument(previous.execution) !== hashNativeDocument(doc.execution)) throw new ConflictError('goal_execution_binding_conflict');
            return putMutable(tx, resourceKey, doc, { expectedIntegrity });
        }));
    }
}
