import { createImmersivePresentation, normalizeImmersiveSettings } from './presentation.js';
import { createImmersiveComposer } from './composer.js';
import { createImmersiveMessageActions } from './message-actions.js';

function callSafely(fn, ...args) {
    try {
        return fn?.(...args);
    } catch (error) {
        console.warn('[immersive] host integration failed', error);
        return undefined;
    }
}

function setPropertyIfPossible(target, name, descriptor) {
    if (!target) return;
    try {
        Object.defineProperty(target, name, descriptor);
    } catch {
        // Some WebView implementations expose non-configurable Fullscreen members.
    }
}

function replaceMethodIfPossible(target, name, replacement) {
    if (!target || typeof replacement !== 'function') return;
    try {
        Object.defineProperty(target, name, {
            configurable: true,
            writable: true,
            value: replacement,
        });
    } catch {
        // Leave the platform implementation intact when it cannot be replaced.
    }
}

export function createImmersiveController({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
    getSettings = () => ({}),
    saveSettings = () => {},
    isMobile = () => false,
    translate = value => value,
    shouldDeferEscape = () => false,
    onBeforeExit = () => false,
    eventSource = null,
    eventTypes = {},
    hostActions = {},
} = {}) {
    if (!documentRef?.body) {
        throw new Error('Immersive controller requires a document with a body.');
    }

    const presentation = createImmersivePresentation({
        document: documentRef,
        window: windowRef,
        isMobile,
    });

    const wake = () => documentRef.body.classList.remove('atria-immersive-resting');
    const composer = createImmersiveComposer({
        document: documentRef,
        translate,
        actions: {
            openTools: () => callSafely(hostActions.openTools),
            send: () => callSafely(hostActions.send),
            stop: () => callSafely(hostActions.stop),
            continue: () => callSafely(hostActions.continue),
            rewrite: () => callSafely(hostActions.rewrite),
            keep: () => callSafely(hostActions.keep),
        },
        onWake: wake,
    });
    const messageActions = createImmersiveMessageActions({
        document: documentRef,
        window: windowRef,
        translate,
        rewrite: () => callSafely(hostActions.rewrite),
        onWake: wake,
    });
    const subscriptions = [];

    const bindEvent = (name, handler) => {
        const eventName = eventTypes?.[name];
        if (!eventName || typeof eventSource?.on !== 'function') return;
        eventSource.on(eventName, handler);
        subscriptions.push([eventName, handler]);
    };

    bindEvent('GENERATION_STARTED', (type, _params, isDryRun) => {
        if (isDryRun) return;
        composer.generationStarted(type);
        wake();
    });
    bindEvent('GENERATION_STOPPED', () => {
        composer.generationStopped();
        presentation.refreshNarrative();
        messageActions.refresh();
    });
    bindEvent('GENERATION_ENDED', () => {
        composer.generationEnded();
        presentation.refreshNarrative();
        messageActions.refresh();
    });
    for (const name of [
        'MESSAGE_SENT',
        'MESSAGE_RECEIVED',
        'MESSAGE_EDITED',
        'MESSAGE_UPDATED',
        'MESSAGE_DELETED',
        'MESSAGE_SWIPED',
        'MORE_MESSAGES_LOADED',
        'USER_MESSAGE_RENDERED',
        'CHARACTER_MESSAGE_RENDERED',
    ]) {
        bindEvent(name, () => {
            presentation.refreshNarrative();
            messageActions.refresh();
        });
    }
    for (const name of ['CHAT_CHANGED', 'CHAT_LOADED']) {
        bindEvent(name, () => {
            messageActions.close();
            presentation.refreshNarrative();
            messageActions.refresh();
        });
    }

    let enabled = false;
    let fullscreenOwned = false;
    let androidFullscreenElement = null;
    let androidFullscreenShimInstalled = false;

    const getAndroidBridge = () => {
        const bridge = windowRef?.AtriaAndroid;
        return bridge && typeof bridge === 'object' ? bridge : null;
    };

    const isAndroidHost = () => Boolean(getAndroidBridge());

    const syncNativeImmersive = (nextEnabled, source = 'immersive') => {
        const bridge = getAndroidBridge();
        if (!bridge || typeof bridge.setImmersiveModeEnabled !== 'function') return;
        try {
            if (typeof bridge.setImmersiveModeEnabledWithSource === 'function') {
                bridge.setImmersiveModeEnabledWithSource(Boolean(nextEnabled), String(source || 'immersive'));
            } else {
                bridge.setImmersiveModeEnabled(Boolean(nextEnabled));
            }
        } catch (error) {
            console.warn('[immersive] failed to sync Android system UI', error);
        }
    };

    const getFullscreenElement = () => {
        if (isAndroidHost()) return androidFullscreenElement;
        return documentRef.fullscreenElement
            || documentRef.webkitFullscreenElement
            || documentRef.mozFullScreenElement
            || documentRef.msFullscreenElement
            || null;
    };

    const canUseFullscreenApi = () => {
        if (isAndroidHost()) return false;
        const root = documentRef.documentElement;
        return Boolean(
            documentRef.fullscreenEnabled
            || documentRef.webkitFullscreenEnabled
            || documentRef.mozFullScreenEnabled
            || documentRef.msFullscreenEnabled
            || typeof root?.requestFullscreen === 'function'
            || typeof root?.webkitRequestFullscreen === 'function'
            || typeof root?.mozRequestFullScreen === 'function'
            || typeof root?.msRequestFullscreen === 'function'
        );
    };

    const requestFullscreen = async () => {
        if (!canUseFullscreenApi() || getFullscreenElement()) return false;
        const root = documentRef.documentElement;
        const request = root?.requestFullscreen
            || root?.webkitRequestFullscreen
            || root?.mozRequestFullScreen
            || root?.msRequestFullscreen;
        if (typeof request !== 'function') return false;
        try {
            await request.call(root);
            fullscreenOwned = Boolean(getFullscreenElement());
            return fullscreenOwned;
        } catch (error) {
            fullscreenOwned = false;
            console.debug('[immersive] fullscreen request rejected; presentation remains active', error);
            return false;
        }
    };

    const exitFullscreen = async () => {
        if (!fullscreenOwned || !getFullscreenElement()) {
            fullscreenOwned = false;
            return;
        }
        const exit = documentRef.exitFullscreen
            || documentRef.webkitExitFullscreen
            || documentRef.mozCancelFullScreen
            || documentRef.msExitFullscreen;
        if (typeof exit !== 'function') {
            fullscreenOwned = false;
            return;
        }
        try {
            await exit.call(documentRef);
        } catch (error) {
            console.debug('[immersive] fullscreen exit rejected', error);
        } finally {
            fullscreenOwned = false;
        }
    };

    const updateToggleUi = () => {
        const toggle = documentRef.getElementById('immersive_mode_toggle');
        const icon = documentRef.getElementById('immersiveModeIcon');
        const label = documentRef.getElementById('immersiveModeLabel');
        const translationKey = enabled ? 'Exit immersive mode' : 'Enter immersive mode';
        const title = translate(translationKey);

        if (toggle) {
            toggle.setAttribute('data-i18n', `[title]${translationKey}`);
            toggle.setAttribute('title', title);
            toggle.setAttribute('aria-pressed', String(enabled));
        }
        if (icon) {
            icon.classList.toggle('fa-expand', !enabled);
            icon.classList.toggle('fa-compress', enabled);
            icon.setAttribute('title', title);
        }
        if (label) {
            label.setAttribute('data-i18n', translationKey);
            label.textContent = title;
        }
    };

    const refreshSettings = () => {
        const settings = normalizeImmersiveSettings(getSettings());
        presentation.refreshSettings(settings);
        return settings;
    };

    const setEnabled = async (nextEnabled, {
        useFullscreen = true,
        persist = true,
        source = 'user',
        syncNative = true,
    } = {}) => {
        const shouldEnable = Boolean(nextEnabled);
        const settings = refreshSettings();
        enabled = shouldEnable;
        presentation.setEnabled(shouldEnable);
        composer.setEnabled(shouldEnable);
        messageActions.setEnabled(shouldEnable);

        if (syncNative) {
            syncNativeImmersive(shouldEnable, source === 'fullscreen_api' ? source : 'immersive');
        }

        if (persist && settings.rememberState) {
            const rawSettings = getSettings();
            if (rawSettings.immersive_mode_last_state !== shouldEnable) {
                rawSettings.immersive_mode_last_state = shouldEnable;
                callSafely(saveSettings);
            }
        }

        updateToggleUi();

        if (shouldEnable) {
            if (useFullscreen) {
                await requestFullscreen();
            }
            return true;
        }

        if (useFullscreen) {
            await exitFullscreen();
        } else {
            fullscreenOwned = false;
        }
        return false;
    };

    const toggle = options => setEnabled(!enabled, options);

    const onFullscreenChanged = () => {
        // Fullscreen is an optional capability. Losing it must never tear down
        // the immersive presentation state.
        if (!getFullscreenElement()) {
            fullscreenOwned = false;
        }
        updateToggleUi();
    };

    const installAndroidFullscreenApiShim = () => {
        if (!isAndroidHost() || androidFullscreenShimInstalled) return;
        androidFullscreenShimInstalled = true;
        const doc = documentRef;
        const elementProto = windowRef?.Element?.prototype || globalThis.Element?.prototype;

        const dispatchFullscreenChange = () => {
            for (const name of ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']) {
                doc.dispatchEvent(new Event(name));
            }
        };
        const setAndroidFullscreenState = (nextEnabled, element = null) => {
            const next = nextEnabled ? (element || doc.documentElement) : null;
            if (androidFullscreenElement === next) return;
            androidFullscreenElement = next;
            dispatchFullscreenChange();
        };
        const requestShim = function () {
            setAndroidFullscreenState(true, this);
            // Generic Fullscreen API consumers only receive native system-bar
            // fullscreen. They do not implicitly enter the Atria story layer.
            syncNativeImmersive(true, 'fullscreen_api');
            return Promise.resolve();
        };
        const exitShim = function () {
            setAndroidFullscreenState(false, null);
            syncNativeImmersive(false, 'fullscreen_api');
            return Promise.resolve();
        };

        replaceMethodIfPossible(elementProto, 'requestFullscreen', requestShim);
        replaceMethodIfPossible(elementProto, 'webkitRequestFullscreen', requestShim);
        replaceMethodIfPossible(elementProto, 'mozRequestFullScreen', requestShim);
        replaceMethodIfPossible(elementProto, 'msRequestFullscreen', requestShim);
        replaceMethodIfPossible(doc, 'exitFullscreen', exitShim);
        replaceMethodIfPossible(doc, 'webkitExitFullscreen', exitShim);
        replaceMethodIfPossible(doc, 'mozCancelFullScreen', exitShim);
        replaceMethodIfPossible(doc, 'msExitFullscreen', exitShim);
        for (const propertyName of ['fullscreenEnabled', 'webkitFullscreenEnabled', 'mozFullScreenEnabled', 'msFullscreenEnabled']) {
            setPropertyIfPossible(doc, propertyName, { configurable: true, get: () => true });
        }
        for (const propertyName of ['fullscreenElement', 'webkitFullscreenElement', 'mozFullScreenElement', 'msFullscreenElement']) {
            setPropertyIfPossible(doc, propertyName, { configurable: true, get: () => androidFullscreenElement });
        }
    };

    const dismissTransientLayer = () => {
        if (messageActions.close({ restoreFocus: true })) return true;
        if (composer.dismissInterrupt()) return true;
        return false;
    };

    const handleEscape = () => {
        if (!enabled) return false;
        if (callSafely(shouldDeferEscape)) return false;
        if (dismissTransientLayer()) return true;
        if (callSafely(onBeforeExit) === true) return true;
        void setEnabled(false, { useFullscreen: true, source: 'escape' });
        return true;
    };

    const keydownHandler = event => {
        if (event.key !== 'Escape' || !enabled) return;
        if (!handleEscape()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };

    documentRef.addEventListener('fullscreenchange', onFullscreenChanged);
    documentRef.addEventListener('webkitfullscreenchange', onFullscreenChanged);
    documentRef.addEventListener('keydown', keydownHandler, true);
    presentation.refreshSettings(normalizeImmersiveSettings(getSettings()));
    updateToggleUi();

    const dispose = () => {
        documentRef.removeEventListener('fullscreenchange', onFullscreenChanged);
        documentRef.removeEventListener('webkitfullscreenchange', onFullscreenChanged);
        documentRef.removeEventListener('keydown', keydownHandler, true);
        for (const [eventName, handler] of subscriptions) {
            eventSource?.off?.(eventName, handler);
        }
        messageActions.dispose();
        composer.dispose();
        presentation.dispose();
    };

    return {
        setEnabled,
        toggle,
        isEnabled: () => enabled,
        refreshSettings,
        installAndroidFullscreenApiShim,
        syncNativeImmersive,
        dismissTransientLayer,
        handleEscape,
        dispose,
        getState: () => ({
            enabled,
            fullscreenOwned,
            profile: presentation.getProfile(),
            settings: presentation.getSettings(),
            composer: composer.getState(),
            messageActionsOpen: messageActions.hasOpen(),
        }),
    };
}
