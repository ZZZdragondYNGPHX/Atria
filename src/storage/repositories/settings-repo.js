import { ConflictError, NotFoundError } from '../errors.js';
import { assertWritable } from '../read-only-mode.js';
import { applyJsonPatch } from './json-patch.js';
import { hashNativeDocument, withNativeResourceWrite } from '../../native/repositories/common.js';

const workspace = doc => doc?.atri_capabilities?.orchestrator;
const revision = doc => workspace(doc)?.agentWorkspaceRevision || 0;
const changedWorkspace = (old, next) => hashNativeDocument(workspace(old)?.agentWorkspace || null) !== hashNativeDocument(workspace(next)?.agentWorkspace || null);
function guardWorkspace(old, next, expected = revision(next)) {
    if (changedWorkspace(old, next) && expected !== revision(old)) throw new ConflictError('agent_workspace_write_conflict');
    // Ordinary settings writes cannot reset the Host publication generation.
    if (workspace(next) && revision(old)) workspace(next).agentWorkspaceRevision = revision(old);
}

export class SettingsRepo {
    constructor({ engine }) { this._engine = engine; }
    _key(handle) { return { kind: 'settings', handle }; }

    async get(handle) {
        return this._engine.withTransaction(handle, (tx) => tx.getResource(this._key(handle)));
    }

    async save(handle, doc) {
        assertWritable();
        await withNativeResourceWrite(handle, 'settings', () => this._engine.withTransaction(handle, async tx => {
            const existing = await tx.getResource(this._key(handle));
            const next = structuredClone(doc); guardWorkspace(existing, next);
            await tx.putResource(this._key(handle), { doc: next });
        }));
    }

    async patch(handle, ops, { expectedWorkspaceRevision = 0 } = {}) {
        assertWritable();
        return withNativeResourceWrite(handle, 'settings', () => this._engine.withTransaction(handle, async (tx) => {
            const existing = await tx.getResource(this._key(handle));
            if (existing == null) throw new NotFoundError('settings', { handle });
            const next = applyJsonPatch(existing, ops);
            guardWorkspace(existing, next, expectedWorkspaceRevision);
            await tx.putResource(this._key(handle), { doc: next });
            return next;
        }));
    }

    // A single supported Host writer serializes this with every settings save,
    // patch and restore. The whole original Workspace library is the CAS base.
    async updateWorkspace(handle, expectedLibrary, update) {
        assertWritable();
        return withNativeResourceWrite(handle, 'settings', async () => {
            const doc = await this.get(handle);
            const settings = workspace(doc);
            if (!settings?.agentWorkspace || hashNativeDocument(settings.agentWorkspace) !== hashNativeDocument(expectedLibrary)) throw new ConflictError('agent_workspace_write_conflict');
            const next = structuredClone(doc), target = workspace(next);
            target.agentWorkspace = await update(structuredClone(settings.agentWorkspace));
            target.agentWorkspaceRevision = revision(doc) + 1;
            // The publication gate writes its own durable resource. Do not
            // await that independent transaction inside a SQLite transaction.
            await this._engine.withTransaction(handle, async tx => {
                const actual = await tx.getResource(this._key(handle));
                if (hashNativeDocument(actual) !== hashNativeDocument(doc)) throw new ConflictError('agent_workspace_write_conflict');
                await tx.putResource(this._key(handle), { doc: next });
            });
            return { library: target.agentWorkspace, revision: target.agentWorkspaceRevision };
        });
    }
}
