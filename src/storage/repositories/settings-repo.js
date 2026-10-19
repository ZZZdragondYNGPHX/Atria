import { NotFoundError } from '../errors.js';
import { assertWritable } from '../read-only-mode.js';
import { applyJsonPatch } from './json-patch.js';
import { withNativeResourceWrite } from '../../native/repositories/common.js';

function currentSettings(doc) {
    if (!doc) return doc;
    const next = structuredClone(doc);
    if (next.atri_capabilities) delete next.atri_capabilities.orchestrator;
    return next;
}
function assertCurrentSettings(doc) {
    if (Object.hasOwn(doc?.atri_capabilities ?? {}, 'orchestrator'))
        throw Object.assign(new TypeError('Retired orchestration settings are unsupported'), { code: 'native_orchestration_legacy_unsupported' });
}

export class SettingsRepo {
    constructor({ engine }) { this._engine = engine; }
    _key(handle) { return { kind: 'settings', handle }; }

    async get(handle) {
        return this._engine.withTransaction(handle, async tx => currentSettings(await tx.getResource(this._key(handle))));
    }

    async save(handle, doc) {
        assertWritable();
        await withNativeResourceWrite(handle, 'settings', () => this._engine.withTransaction(handle, async tx => {
            assertCurrentSettings(doc);
            const next = structuredClone(doc);
            await tx.putResource(this._key(handle), { doc: next });
        }));
    }

    async patch(handle, ops) {
        assertWritable();
        return withNativeResourceWrite(handle, 'settings', () => this._engine.withTransaction(handle, async (tx) => {
            const existing = await tx.getResource(this._key(handle));
            if (existing == null) throw new NotFoundError('settings', { handle });
            const next = applyJsonPatch(currentSettings(existing), ops);
            assertCurrentSettings(next);
            await tx.putResource(this._key(handle), { doc: next });
            return next;
        }));
    }
}
