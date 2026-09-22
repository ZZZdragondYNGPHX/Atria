import { mountNativePlayControls } from '../native/play-controls.js';

const REQUIRED_NATIVE_IDS = Object.freeze([
    'sheld',
    'chat',
    'form_sheld',
    'send_form',
    'send_textarea',
]);

function requireUniqueNode(documentRef, id) {
    const nodes = documentRef.querySelectorAll(`#${id}`);
    if (nodes.length !== 1) {
        throw new Error(`R7B Native Play Host requires exactly one #${id}; found ${nodes.length}`);
    }
    return nodes[0];
}

function assertNativeHierarchy({ sheld, chat, formSheld, sendForm, sendTextarea }) {
    if (chat.parentNode !== sheld) {
        throw new Error('R7B Native Play Host requires #chat to remain a direct child of #sheld');
    }
    if (formSheld.parentNode !== sheld) {
        throw new Error('R7B Native Play Host requires #form_sheld to remain a direct child of #sheld');
    }
    if (sendForm.parentNode !== formSheld) {
        throw new Error('R7B Native Play Host requires #send_form to remain a direct child of #form_sheld');
    }
    if (!sendForm.contains(sendTextarea)) {
        throw new Error('R7B Native Play Host requires #send_textarea to remain inside #send_form');
    }
}

function restoreAttribute(element, name, previousValue) {
    if (previousValue === null) element.removeAttribute(name);
    else element.setAttribute(name, previousValue);
}

/**
 * Move the one real Native Conversation host into the Shell Play Stage.
 *
 * This deliberately reparents #sheld as one subtree instead of moving or
 * recreating #chat / #send_form separately. That preserves native node
 * identity, delegated listeners, jQuery data, file/autocomplete surfaces,
 * message actions, and the existing generation/message state machines.
 */
export function mountNativePlayHost({
    document: documentRef = globalThis.document,
    stage,
} = {}) {
    if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
        throw new Error('R7B Native Play Host requires a document');
    }
    if (!stage || typeof stage.appendChild !== 'function') {
        throw new Error('R7B Native Play Host requires the Shell Stage');
    }
    if (documentRef.getElementById('atria-native-play-host')) {
        throw new Error('R7B Native Play Host is already mounted');
    }

    const native = {
        sheld: requireUniqueNode(documentRef, 'sheld'),
        chat: requireUniqueNode(documentRef, 'chat'),
        formSheld: requireUniqueNode(documentRef, 'form_sheld'),
        sendForm: requireUniqueNode(documentRef, 'send_form'),
        sendTextarea: requireUniqueNode(documentRef, 'send_textarea'),
    };
    assertNativeHierarchy(native);

    const originalParent = native.sheld.parentNode;
    if (!originalParent) {
        throw new Error('R7B Native Play Host cannot mount a detached #sheld');
    }
    const originalNextSibling = native.sheld.nextSibling;
    const originalStageChildren = [...stage.childNodes];
    const origin = documentRef.createComment('atria-native-play-host-origin');
    const previousSheldMarker = native.sheld.getAttribute('data-atria-native-play-mounted');
    const previousStageMarker = stage.getAttribute('data-atria-native-play-mounted');

    originalParent.insertBefore(origin, native.sheld);

    const root = documentRef.createElement('div');
    root.id = 'atria-native-play-host';
    root.className = 'atria-native-play-host';
    root.dataset.atriaPlayHost = 'native-conversation';
    root.dataset.atriaTimelineHost = 'native';
    root.dataset.atriaComposerHost = 'native';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Play');

    stage.replaceChildren(root);
    root.appendChild(native.sheld);
    const productControls = mountNativePlayControls({ document: documentRef, root });
    stage.dataset.atriaNativePlayMounted = 'true';
    native.sheld.dataset.atriaNativePlayMounted = 'true';

    let mounted = true;
    const nativeComponentMounts = new Map();
    let stageOwnership = null;

    function resolveNativeComponent(componentId) {
        if (componentId === 'conversation') return native.chat;
        if (componentId === 'composer') return native.sendForm;
        return null;
    }

    function mountNativeComponent(componentId, slot) {
        if (!mounted) throw new Error('R7C Native Play Host is not mounted');
        const id = String(componentId || '').trim();
        const node = resolveNativeComponent(id);
        if (!node) {
            throw new Error(`Unknown native Game UI component '${id}'`);
        }
        if (!slot || typeof slot.appendChild !== 'function') {
            throw new Error(`Native component '${id}' requires a valid slot`);
        }
        if (nativeComponentMounts.has(id)) {
            throw new Error(`Native component '${id}' is already mounted`);
        }
        if (node.contains?.(slot)) {
            throw new Error(`Native component '${id}' cannot mount inside itself`);
        }

        const originalParent = node.parentNode;
        if (!originalParent) {
            throw new Error(`Native component '${id}' is detached`);
        }
        const originalNextSibling = node.nextSibling;
        slot.appendChild(node);

        let active = true;
        const handle = Object.freeze({
            id,
            node,
            slot,
            restore() {
                if (!active) return false;
                active = false;
                nativeComponentMounts.delete(id);
                if (
                    originalNextSibling
                    && originalNextSibling.parentNode === originalParent
                    && typeof originalParent.insertBefore === 'function'
                ) {
                    originalParent.insertBefore(node, originalNextSibling);
                } else {
                    originalParent.appendChild(node);
                }
                assertIntegrity();
                return true;
            },
        });
        nativeComponentMounts.set(id, handle);
        assertIntegrity();
        return handle;
    }

    function restoreNativeComponents() {
        for (const handle of [...nativeComponentMounts.values()].reverse()) {
            handle.restore();
        }
    }

    function acquireStageOwnership(ownerId) {
        if (!mounted) throw new Error('R7C Native Play Host is not mounted');
        const owner = String(ownerId || '').trim();
        if (!owner) throw new Error('R7C Stage ownership requires an owner id');
        if (stageOwnership) {
            throw new Error(`Atria Stage is already owned by '${stageOwnership.owner}'`);
        }

        const previousDisplay = root.style.display;
        const previousAriaHidden = root.getAttribute('aria-hidden');
        const previousSuppressedBy = root.getAttribute('data-atria-stage-suppressed-by');
        const previousStageOwner = stage.getAttribute('data-atria-stage-owner');

        root.style.display = 'none';
        root.setAttribute('aria-hidden', 'true');
        root.dataset.atriaStageSuppressedBy = owner;
        stage.dataset.atriaStageOwner = owner;

        let active = true;
        const handle = Object.freeze({
            owner,
            release() {
                if (!active) return false;
                active = false;
                if (stageOwnership !== handle) return false;

                root.style.display = previousDisplay;
                restoreAttribute(root, 'aria-hidden', previousAriaHidden);
                restoreAttribute(root, 'data-atria-stage-suppressed-by', previousSuppressedBy);
                restoreAttribute(stage, 'data-atria-stage-owner', previousStageOwner);
                stageOwnership = null;
                assertIntegrity();
                return true;
            },
        });
        stageOwnership = handle;
        assertIntegrity();
        return handle;
    }

    function assertIntegrity() {
        if (!mounted) return false;
        for (const id of REQUIRED_NATIVE_IDS) {
            if (documentRef.querySelectorAll(`#${id}`).length !== 1) {
                throw new Error(`R7C Native Play Host integrity failure for #${id}`);
            }
        }
        if (native.formSheld.parentNode !== native.sheld) {
            throw new Error('R7C Native Play Host requires #form_sheld to remain inside #sheld');
        }
        if (!native.sendForm.contains(native.sendTextarea)) {
            throw new Error('R7C Native Play Host requires #send_textarea to remain inside #send_form');
        }

        const conversationMount = nativeComponentMounts.get('conversation');
        if (conversationMount) {
            if (native.chat.parentNode !== conversationMount.slot) {
                throw new Error('R7C Native Play Host lost composed Conversation ownership');
            }
        } else if (native.chat.parentNode !== native.sheld) {
            throw new Error('R7C Native Play Host requires #chat to restore under #sheld');
        }

        const composerMount = nativeComponentMounts.get('composer');
        if (composerMount) {
            if (native.sendForm.parentNode !== composerMount.slot) {
                throw new Error('R7C Native Play Host lost composed Composer ownership');
            }
        } else if (native.sendForm.parentNode !== native.formSheld) {
            throw new Error('R7C Native Play Host requires #send_form to restore under #form_sheld');
        }

        if (native.sheld.parentNode !== root || !stage.contains(root)) {
            throw new Error('R7C Native Play Host lost ownership of the native #sheld subtree');
        }
        if (documentRef.getElementById('chat') !== native.chat
            || documentRef.getElementById('send_form') !== native.sendForm
            || documentRef.getElementById('send_textarea') !== native.sendTextarea) {
            throw new Error('R7C Native Play Host detected replaced native nodes');
        }
        return true;
    }

    assertIntegrity();

    const api = Object.freeze({
        root,
        native: Object.freeze(native),
        assertIntegrity,
        isMounted: () => mounted,
        mountNativeComponent,
        restoreNativeComponents,
        getActiveNativeComponents: () => [...nativeComponentMounts.keys()],
        acquireStageOwnership,
        getStageOwner: () => stageOwnership?.owner || null,
        productControls,
        unmount() {
            if (!mounted) return false;

            restoreNativeComponents();
            productControls.dispose();
            stageOwnership?.release();
            stageOwnership = null;

            if (origin.parentNode) {
                origin.parentNode.insertBefore(native.sheld, origin);
                origin.remove();
            } else if (originalParent.isConnected) {
                const reference = originalNextSibling?.parentNode === originalParent
                    ? originalNextSibling
                    : null;
                originalParent.insertBefore(native.sheld, reference);
            } else {
                throw new Error('R7B Native Play Host cannot restore #sheld because its original parent is gone');
            }

            restoreAttribute(native.sheld, 'data-atria-native-play-mounted', previousSheldMarker);
            restoreAttribute(stage, 'data-atria-native-play-mounted', previousStageMarker);
            stage.replaceChildren(...originalStageChildren);
            root.remove();
            mounted = false;
            return true;
        },
    });

    return api;
}
