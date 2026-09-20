function createButton(documentRef, { id, label, title, icon }) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 'atria-immersive-composer-button';
    button.setAttribute('aria-label', title || label);
    button.title = title || label;
    if (icon) {
        const iconElement = documentRef.createElement('i');
        iconElement.className = icon;
        iconElement.setAttribute('aria-hidden', 'true');
        button.append(iconElement);
    }
    if (label) {
        const text = documentRef.createElement('span');
        text.className = 'atria-immersive-button-label';
        text.textContent = label;
        button.append(text);
    }
    return button;
}

export function createImmersiveComposer({
    document: documentRef = globalThis.document,
    translate = value => value,
    actions = {},
    onWake = () => {},
} = {}) {
    const form = documentRef?.getElementById('send_form');
    const formItems = documentRef?.getElementById('nonQRFormItems');
    const textarea = documentRef?.getElementById('send_textarea');
    if (!form || !formItems || !textarea) {
        return {
            setEnabled() {},
            generationStarted() {},
            generationEnded() {},
            generationStopped() {},
            dismissInterrupt() { return false; },
            getState: () => 'quiet',
            dispose() {},
        };
    }

    const root = documentRef.createElement('div');
    root.id = 'atriaImmersiveComposerControls';
    root.className = 'atria-immersive-composer-controls';
    root.hidden = true;

    const toolsButton = createButton(documentRef, {
        id: 'atriaImmersiveTools',
        label: '+',
        title: translate('More tools'),
    });
    toolsButton.setAttribute('data-i18n', '[title]More tools;[aria-label]More tools');
    const status = documentRef.createElement('span');
    status.id = 'atriaImmersiveGenerationStatus';
    status.className = 'atria-immersive-generation-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const sendButton = createButton(documentRef, {
        id: 'atriaImmersiveSend',
        title: translate('Send message'),
        icon: 'fa-solid fa-arrow-up',
    });
    sendButton.setAttribute('data-i18n', '[title]Send message;[aria-label]Send message');
    const stopButton = createButton(documentRef, {
        id: 'atriaImmersiveStop',
        title: translate('Stop response'),
        icon: 'fa-solid fa-stop',
    });
    stopButton.setAttribute('data-i18n', '[title]Stop response;[aria-label]Stop response');

    root.append(toolsButton, status, sendButton, stopButton);
    formItems.append(root);

    const interrupt = documentRef.createElement('div');
    interrupt.id = 'atriaImmersiveInterruptBar';
    interrupt.className = 'atria-immersive-interrupt';
    interrupt.hidden = true;
    const interruptText = documentRef.createElement('span');
    interruptText.textContent = translate('Response stopped');
    interruptText.setAttribute('data-i18n', 'Response stopped');
    const continueButton = createButton(documentRef, {
        id: 'atriaImmersiveContinue',
        label: translate('Continue'),
        title: translate('Continue response'),
    });
    const rewriteButton = createButton(documentRef, {
        id: 'atriaImmersiveRewrite',
        label: translate('Rewrite'),
        title: translate('Rewrite response'),
    });
    const keepButton = createButton(documentRef, {
        id: 'atriaImmersiveKeep',
        label: translate('Keep'),
        title: translate('Keep partial response'),
    });
    continueButton.setAttribute('data-i18n', 'Continue;[title]Continue response;[aria-label]Continue response');
    rewriteButton.setAttribute('data-i18n', 'Rewrite;[title]Rewrite response;[aria-label]Rewrite response');
    keepButton.setAttribute('data-i18n', 'Keep;[title]Keep partial response;[aria-label]Keep partial response');
    interrupt.append(interruptText, continueButton, rewriteButton, keepButton);
    form.prepend(interrupt);

    const originalPlaceholder = textarea.getAttribute('placeholder');
    const originalAriaLabel = textarea.getAttribute('aria-label');
    let enabled = false;
    let state = 'quiet';
    let interrupted = false;
    let blurTimer = null;

    const setState = nextState => {
        state = nextState;
        form.dataset.atriaImmersiveComposerState = nextState;
        const generating = nextState === 'generating';
        stopButton.hidden = !generating;
        sendButton.hidden = generating;
        status.hidden = !generating;
        if (!generating) {
            status.textContent = '';
        }
    };

    const dismissInterrupt = () => {
        if (interrupt.hidden) return false;
        interrupt.hidden = true;
        interrupted = false;
        if (enabled && state !== 'generating') {
            setState(documentRef.activeElement === textarea ? 'input' : 'quiet');
        }
        return true;
    };

    const wake = () => {
        onWake();
        if (!enabled || state === 'generating') return;
        setState('input');
    };

    const scheduleQuiet = () => {
        clearTimeout(blurTimer);
        blurTimer = setTimeout(() => {
            if (!enabled || state === 'generating' || !interrupt.hidden) return;
            if (documentRef.activeElement !== textarea) setState('quiet');
        }, 180);
    };

    toolsButton.addEventListener('click', () => {
        onWake();
        actions.openTools?.();
    });
    sendButton.addEventListener('click', () => {
        onWake();
        actions.send?.();
    });
    stopButton.addEventListener('click', () => {
        onWake();
        actions.stop?.();
    });
    continueButton.addEventListener('click', () => {
        dismissInterrupt();
        actions.continue?.();
    });
    rewriteButton.addEventListener('click', () => {
        dismissInterrupt();
        actions.rewrite?.();
    });
    keepButton.addEventListener('click', () => {
        dismissInterrupt();
        actions.keep?.();
    });

    textarea.addEventListener('focus', wake);
    textarea.addEventListener('input', wake);
    textarea.addEventListener('blur', scheduleQuiet);

    const setEnabled = nextEnabled => {
        enabled = Boolean(nextEnabled);
        root.hidden = !enabled;
        form.classList.toggle('atria-immersive-composer', enabled);
        if (enabled) {
            textarea.setAttribute('placeholder', translate('Say something…'));
            textarea.setAttribute('aria-label', translate('Message input'));
            setState(documentRef.activeElement === textarea ? 'input' : 'quiet');
            return;
        }
        dismissInterrupt();
        delete form.dataset.atriaImmersiveComposerState;
        if (originalPlaceholder === null) textarea.removeAttribute('placeholder');
        else textarea.setAttribute('placeholder', originalPlaceholder);
        if (originalAriaLabel === null) textarea.removeAttribute('aria-label');
        else textarea.setAttribute('aria-label', originalAriaLabel);
    };

    const generationStarted = type => {
        if (!enabled) return;
        interrupted = false;
        interrupt.hidden = true;
        setState('generating');
        status.textContent = type === 'continue'
            ? translate('The scene is continuing…')
            : translate('The character is responding…');
    };

    const generationEnded = () => {
        if (!enabled || interrupted) return;
        setState(documentRef.activeElement === textarea ? 'input' : 'quiet');
    };

    const generationStopped = () => {
        if (!enabled) return;
        interrupted = true;
        setState('quiet');
        interrupt.hidden = false;
        continueButton.focus({ preventScroll: true });
    };

    const dispose = () => {
        clearTimeout(blurTimer);
        textarea.removeEventListener('focus', wake);
        textarea.removeEventListener('input', wake);
        textarea.removeEventListener('blur', scheduleQuiet);
        root.remove();
        interrupt.remove();
        form.classList.remove('atria-immersive-composer');
        delete form.dataset.atriaImmersiveComposerState;
    };

    return {
        setEnabled,
        generationStarted,
        generationEnded,
        generationStopped,
        dismissInterrupt,
        getState: () => state,
        dispose,
    };
}
