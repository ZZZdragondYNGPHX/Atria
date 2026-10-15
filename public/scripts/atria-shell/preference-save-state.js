// Request status only; preference values and persistence remain owned by power-user/settings.
const states = new Map();
let epoch = 0;
export const getPreferenceSaveState = key => states.get(key) || { status: 'synced', revision: 0 };
export function resetPreferenceSaveStates() { epoch++; states.clear(); }
export async function savePreferenceWithReceipt(key, save, doc = globalThis.document) {
    const revision = getPreferenceSaveState(key).revision + 1, account = epoch;
    const update = status => {
        if (account !== epoch || getPreferenceSaveState(key).revision > revision) return;
        states.set(key, { status, revision });
        doc?.dispatchEvent(new CustomEvent('atria-preference-save', { detail: { key } }));
    };
    update('saving');
    let ok = false;
    try { ok = await save(); } catch { /* Retain the intended value for retry. */ }
    update(ok ? 'saved' : 'error');
    if (!ok) throw new Error('Could not save this setting. Your change is still applied; retry to save it.');
    return true;
}
