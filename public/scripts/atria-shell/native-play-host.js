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
    stage.dataset.atriaNativePlayMounted = 'true';
    native.sheld.dataset.atriaNativePlayMounted = 'true';

    let mounted = true;

    function assertIntegrity() {
        if (!mounted) return false;
        for (const id of REQUIRED_NATIVE_IDS) {
            if (documentRef.querySelectorAll(`#${id}`).length !== 1) {
                throw new Error(`R7B Native Play Host integrity failure for #${id}`);
            }
        }
        assertNativeHierarchy(native);
        if (native.sheld.parentNode !== root || !stage.contains(root)) {
            throw new Error('R7B Native Play Host lost ownership of the native #sheld subtree');
        }
        if (documentRef.getElementById('chat') !== native.chat
            || documentRef.getElementById('send_form') !== native.sendForm
            || documentRef.getElementById('send_textarea') !== native.sendTextarea) {
            throw new Error('R7B Native Play Host detected replaced native nodes');
        }
        return true;
    }

    assertIntegrity();

    const api = Object.freeze({
        root,
        native: Object.freeze(native),
        assertIntegrity,
        isMounted: () => mounted,
        unmount() {
            if (!mounted) return false;

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
