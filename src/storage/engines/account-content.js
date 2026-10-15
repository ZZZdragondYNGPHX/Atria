import { NATIVE_RESOURCE_KINDS } from '../../native/contracts.js';
import { decodeNativeResourceKey } from './native-resource-key.js';

export const ACCOUNT_CONTENT_TABLES = Object.freeze([
    'native_resources', 'chats', 'chat_states', 'settings', 'presets',
    'preset_states', 'worlds', 'named_docs', 'groups_table', 'stats',
]);

/** Read-only engine primitive; includes unknown native kinds and orphan legacy rows. */
export async function listSqlAccountContent(handle, query) {
    const native = [], legacy = [], errors = [];
    for (const table of ACCOUNT_CONTENT_TABLES) {
        let rows;
        try { rows = await query(table, handle); } catch (error) { errors.push({ source: table, reason: 'unreadable-table', message: error.code || error.message }); continue; }
        for (const row of rows) {
            try {
                const doc = typeof row.doc === 'string' ? JSON.parse(row.doc) : row.doc;
                if (table === 'native_resources') {
                    const known = Object.values(NATIVE_RESOURCE_KINDS).includes(row.kind);
                    const key = known ? decodeNativeResourceKey(row.kind, handle, row.resource_key)
                        : { kind: row.kind, handle, encodedKey: row.resource_key };
                    native.push({ key, doc, integrity: row.integrity, updatedAt: Number(row.updated_at), createdAt: Number(row.created_at) });
                } else {
                    const identity = { ...row }; delete identity.doc; delete identity.updated_at; delete identity.created_at; delete identity.integrity;
                    legacy.push({ identity: { table, ...identity }, doc });
                }
            } catch (error) {
                errors.push({ source: table, reason: 'unreadable-record', message: error.message });
            }
        }
    }
    return { native, legacy, errors };
}
