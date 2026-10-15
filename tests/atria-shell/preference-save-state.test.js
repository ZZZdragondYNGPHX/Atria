import { expect, test } from '@jest/globals';
import { getPreferenceSaveState, resetPreferenceSaveStates, savePreferenceWithReceipt } from '../../public/scripts/atria-shell/preference-save-state.js';

test('a late failure cannot overwrite a newer success and account reset isolates old receipts', async () => {
    resetPreferenceSaveStates();
    let finish;
    const first = savePreferenceWithReceipt('font_scale', () => new Promise(resolve => { finish = resolve; }), null);
    await savePreferenceWithReceipt('font_scale', async () => true, null);
    finish(false); await expect(first).rejects.toThrow('Could not save');
    expect(getPreferenceSaveState('font_scale').status).toBe('saved');
    let finishOldAccount;
    const old = savePreferenceWithReceipt('font_scale', () => new Promise(resolve => { finishOldAccount = resolve; }), null);
    resetPreferenceSaveStates();
    finishOldAccount(true); await old;
    expect(getPreferenceSaveState('font_scale').status).toBe('synced');
});
