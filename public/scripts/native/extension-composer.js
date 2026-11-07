// Versioned access to the existing Play composer, shared by all extensions.
import { captureExtensionInput, applyExtensionInput, onExtensionInput, clearExtensionInput, submitExtensionInput } from './extension-inputs.js';
export function createExtensionComposer({ context, assertCurrent, own, document: doc }) {
    const product = () => globalThis.Atria?.shell?.getPlayHost?.()?.product;
    let includeCards = false;
    const capture = (options = {}) => {
        assertCurrent();
        if (options.includeCards !== undefined) includeCards = Boolean(options.includeCards);
        const card = includeCards && !context.historical ? captureExtensionInput() : null;
        if (card) return { ...card, sessionId: context.sessionId };
        const value = product(), draft = value?.composerApi?.captureDraft();
        if (!draft || context.sessionId !== draft.sessionId || context.historical) return null;
        return { ...draft, selectionStart: value.textarea.selectionStart, selectionEnd: value.textarea.selectionEnd,
            disabled: value.textarea.disabled, composing: value.composerApi.isComposing() };
    };
    return Object.freeze({
        capture,
        apply(text, captured, { selection = false } = {}) {
            const current = capture();
            if (!current || current.disabled || current.composing || !captured) return false;
            const value = selection ? captured.value.slice(0, captured.selectionStart) + text + captured.value.slice(captured.selectionEnd) : text;
            if (captured.surfaceId) { const { sessionId, ...card } = captured; return sessionId === context.sessionId && applyExtensionInput(value, card); }
            const accepted = product().composerApi.applyDraft(value, captured);
            if (accepted) product().composerApi.focus();
            return accepted;
        },
        subscribe(callback) {
            assertCurrent();
            const changed = event => { if (event.target === product()?.textarea) { clearExtensionInput(); callback(capture()); } };
            const unsubscribe = onExtensionInput(() => { if (includeCards) callback(capture()); });
            for (const event of ['input', 'select', 'compositionstart', 'compositionend', 'focusin']) doc.addEventListener(event, changed, true);
            return own(() => { unsubscribe(); for (const event of ['input', 'select', 'compositionstart', 'compositionend', 'focusin']) doc.removeEventListener(event, changed, true); });
        },
        async submit() {
            const current = capture();
            if (!current || current.disabled || current.composing) throw new Error('Composer is unavailable');
            if (current.surfaceId) return submitExtensionInput();
            return product().composerApi.submit();
        },
        cancel() { assertCurrent(); return globalThis.Atria?.getContext?.()?.stopGeneration?.(); },
    });
}
