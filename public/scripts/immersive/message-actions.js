function dispatchClick(element) {
    if (!(element instanceof Element)) return false;
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: globalThis.window }));
    return true;
}

function createActionButton(documentRef, { action, label, icon }) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'atria-immersive-message-action';
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    button.title = label;
    if (icon) {
        const i = documentRef.createElement('i');
        i.className = icon;
        i.setAttribute('aria-hidden', 'true');
        button.append(i);
    }
    const text = documentRef.createElement('span');
    text.textContent = label;
    button.append(text);
    return button;
}

export function createImmersiveMessageActions({
    document: documentRef = globalThis.document,
    translate = value => value,
    rewrite = () => {},
    onWake = () => {},
} = {}) {
    const chat = documentRef?.getElementById('chat');
    if (!chat) {
        return { setEnabled() {}, close: () => false, refresh() {}, hasOpen: () => false, dispose() {} };
    }

    const toolbar = documentRef.createElement('div');
    toolbar.id = 'atriaImmersiveMessageActions';
    toolbar.className = 'atria-immersive-message-actions';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', translate('Message actions'));
    toolbar.hidden = true;

    const copyButton = createActionButton(documentRef, { action: 'copy', label: translate('Copy'), icon: 'fa-solid fa-copy' });
    const editButton = createActionButton(documentRef, { action: 'edit', label: translate('Edit'), icon: 'fa-solid fa-pencil' });
    const rewriteButton = createActionButton(documentRef, { action: 'rewrite', label: translate('Rewrite'), icon: 'fa-solid fa-repeat' });
    const moreButton = createActionButton(documentRef, { action: 'more', label: translate('More'), icon: 'fa-solid fa-ellipsis' });
    moreButton.setAttribute('aria-expanded', 'false');
    toolbar.append(copyButton, editButton, rewriteButton, moreButton);

    let enabled = false;
    let activeMessage = null;
    let longPressTimer = null;
    let suppressTouchClickUntil = 0;
    const originalTabIndex = new WeakMap();
    const originalAriaLabel = new WeakMap();

    const close = ({ restoreFocus = false } = {}) => {
        if (!activeMessage) return false;
        const previous = activeMessage;
        previous.classList.remove('atria-immersive-message-active', 'atria-immersive-native-actions-open');
        moreButton.setAttribute('aria-expanded', 'false');
        toolbar.hidden = true;
        toolbar.remove();
        activeMessage = null;
        if (restoreFocus) {
            previous.querySelector('.mes_block')?.focus({ preventScroll: true });
        }
        return true;
    };

    const isAssistantLastMessage = message => (
        message?.classList.contains('last_mes')
        && message.getAttribute('is_user') !== 'true'
        && message.getAttribute('is_system') !== 'true'
    );

    const open = message => {
        if (!enabled || !(message instanceof HTMLElement)) return;
        if (activeMessage === message) return;
        close();
        activeMessage = message;
        message.classList.add('atria-immersive-message-active');
        const block = message.querySelector('.mes_block') || message;
        block.append(toolbar);
        toolbar.hidden = false;
        rewriteButton.hidden = !isAssistantLastMessage(message);
        moreButton.setAttribute('aria-expanded', 'false');
        onWake();
        copyButton.focus({ preventScroll: true });
    };

    const refresh = () => {
        for (const message of chat.querySelectorAll('.mes')) {
            const block = message.querySelector('.mes_block');
            if (!(block instanceof HTMLElement)) continue;
            if (enabled) {
                if (!originalTabIndex.has(block)) originalTabIndex.set(block, block.getAttribute('tabindex'));
                if (!originalAriaLabel.has(block)) originalAriaLabel.set(block, block.getAttribute('aria-label'));
                block.tabIndex = 0;
                const speaker = message.querySelector('.name_text')?.textContent?.trim() || translate('message');
                block.setAttribute('aria-label', translate('Message from') + ' ' + speaker);
            } else {
                const previousTab = originalTabIndex.get(block);
                const previousLabel = originalAriaLabel.get(block);
                if (previousTab === null || previousTab === undefined) block.removeAttribute('tabindex');
                else block.setAttribute('tabindex', previousTab);
                if (previousLabel === null || previousLabel === undefined) block.removeAttribute('aria-label');
                else block.setAttribute('aria-label', previousLabel);
            }
        }
    };

    toolbar.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button || !activeMessage) return;
        const action = button.dataset.action;
        if (action === 'copy') {
            dispatchClick(activeMessage.querySelector('.mes_copy'));
            close({ restoreFocus: true });
        } else if (action === 'edit') {
            dispatchClick(activeMessage.querySelector('.mes_edit'));
            close();
        } else if (action === 'rewrite') {
            close();
            rewrite();
        } else if (action === 'more') {
            const expanded = !activeMessage.classList.contains('atria-immersive-native-actions-open');
            activeMessage.classList.toggle('atria-immersive-native-actions-open', expanded);
            moreButton.setAttribute('aria-expanded', String(expanded));
        }
    });

    const interactiveTarget = target => target.closest('a, button, input, textarea, select, summary, .mes_button, .mes_edit_buttons');

    chat.addEventListener('click', event => {
        if (!enabled || Date.now() < suppressTouchClickUntil) return;
        const message = event.target.closest('.mes');
        if (!message || interactiveTarget(event.target)) return;
        if (!event.target.closest('.mes_text, .mes_block')) return;
        open(message);
    });

    chat.addEventListener('keydown', event => {
        if (!enabled || (event.key !== 'Enter' && event.key !== ' ')) return;
        const block = event.target.closest('.mes_block');
        if (!block || event.target !== block) return;
        event.preventDefault();
        open(block.closest('.mes'));
    });

    chat.addEventListener('pointerdown', event => {
        if (!enabled || event.pointerType !== 'touch') return;
        const message = event.target.closest('.mes');
        if (!message || interactiveTarget(event.target)) return;
        clearTimeout(longPressTimer);
        suppressTouchClickUntil = Date.now() + 700;
        longPressTimer = setTimeout(() => open(message), 460);
    }, { passive: true });

    for (const name of ['pointerup', 'pointercancel', 'pointermove']) {
        chat.addEventListener(name, () => clearTimeout(longPressTimer), { passive: true });
    }

    const setEnabled = nextEnabled => {
        enabled = Boolean(nextEnabled);
        if (!enabled) close();
        refresh();
    };

    return {
        setEnabled,
        close,
        refresh,
        hasOpen: () => Boolean(activeMessage),
        dispose() {
            clearTimeout(longPressTimer);
            close();
            toolbar.remove();
        },
    };
}
