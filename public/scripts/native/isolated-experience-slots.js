import { translateShellText as t } from '../atria-shell/localization.js';

// Preview and remote Shared mounts must never fall back to the live private
// conversation/composer DOM. Their Host supplies explicit, isolated slots.
export function createIsolatedExperienceSlots(document, shared = false) {
    return { mountNativeComponent(id, slot) {
        if (!['conversation', 'composer'].includes(id)) throw new Error('Unknown Native slot');
        const node = document.createElement('p');
        node.textContent = t(shared ? (id === 'conversation' ? 'Shared conversation uses granted projections.' : 'Use the shared input form to submit your turn.')
            : (id === 'conversation' ? 'Conversation preview' : 'Composer preview'));
        node.dataset.atriaIsolatedSlot = id; slot.append(node);
        return { node, restore() { node.remove(); return true; } };
    } };
}
