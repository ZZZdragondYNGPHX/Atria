import { nativeProductClient as client } from './product-client.js';
import { normalizeSessionTitle } from './session-title-contract.js';
import { field, action, disclosure, feedback } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function sessionTitleField(doc, root) {
    const input = field(doc, root, 'Session name (optional)'); input.maxLength = 256; return input;
}

export function mountSessionRename({ document: doc, root, session, onSaved }) {
    const section = disclosure(doc, root, 'Rename Session'); section.dataset.atriaSessionRename = session.sessionId;
    const input = field(doc, section, 'Session name', session.displayTitle || ''); input.maxLength = 256;
    let expected = session.displayTitle ?? null;
    action(doc, section, 'Save name', async () => {
        normalizeSessionTitle(input.value);
        try {
            const saved = await client.renameSession(session.sessionId, input.value, expected);
            expected = saved.displayTitle ?? null; input.value = saved.displayTitle || '';
            await globalThis.Atria?.nativeSessionRuntime?.applySessionMetadata?.(saved);
            void globalThis.Atria?.shell?.getWorkspaceHost?.()?.refreshSearch?.();
            feedback(doc, section, tl('Session name saved.')); await onSaved?.(saved);
        } catch (error) {
            if (error.code === 'native_session_title_conflict' && !section.querySelector('[data-atria-reload-session-name]')) {
                const reload = action(doc, section, 'Reload current name', async () => {
                    const current = (await client.listSessions()).find(item => item.sessionId === session.sessionId);
                    if (!current) throw new Error(tl('This Session is no longer available.'));
                    expected = current.displayTitle ?? null; input.value = current.displayTitle || ''; reload.remove();
                    feedback(doc, section, tl('Current name loaded. Edit it and save again.'));
                }); reload.dataset.atriaReloadSessionName = 'true';
            }
            throw error;
        }
    });
    return section;
}
