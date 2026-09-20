export const IMMERSIVE_VISUAL_MODES = Object.freeze(['text', 'auto', 'enhanced']);
export const IMMERSIVE_HUD_MODES = Object.freeze(['auto', 'always', 'minimal']);

function includesValue(values, value, fallback) {
    return values.includes(value) ? value : fallback;
}

export function normalizeImmersiveSettings(settings = {}) {
    return {
        rememberState: settings.immersive_mode_remember_state !== false,
        storyFocus: settings.immersive_mode_story_focus !== false,
        extensionsEnabled: settings.immersive_mode_extensions_enabled !== false,
        visualMode: includesValue(IMMERSIVE_VISUAL_MODES, settings.immersive_mode_visual_mode, 'auto'),
        hudMode: includesValue(IMMERSIVE_HUD_MODES, settings.immersive_mode_hud_mode, 'auto'),
    };
}

export function resolveImmersiveProfile({ mobile = false, width = 1280 } = {}) {
    return mobile || Number(width) <= 800 ? 'mobile' : 'desktop';
}

function hasMeaningfulAvatar(message) {
    const image = message?.querySelector?.('.mesAvatarWrapper .avatar img');
    const source = String(image?.getAttribute?.('src') || '').trim();
    if (!source) return false;
    return !/(?:^|\/)(?:ai4|user-default|logo)\.png(?:$|[?#])/i.test(source);
}

export function createImmersivePresentation({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
    isMobile = () => false,
} = {}) {
    let enabled = false;
    let profile = 'desktop';
    let settings = normalizeImmersiveSettings();
    const chat = documentRef.getElementById('chat');

    const resolveProfile = () => resolveImmersiveProfile({
        mobile: Boolean(isMobile?.()),
        width: Number(windowRef?.innerWidth || 1280),
    });

    const applyProfile = () => {
        profile = resolveProfile();
        if (!enabled) return;
        documentRef.body.dataset.atriaImmersiveProfile = profile;
    };

    const updateHistoryReadingState = () => {
        if (!enabled || !chat || !settings.storyFocus) {
            documentRef.body.classList.remove('atria-immersive-history-reading');
            return;
        }
        const distanceFromBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
        const threshold = Math.max(160, chat.clientHeight * 0.18);
        documentRef.body.classList.toggle('atria-immersive-history-reading', distanceFromBottom > threshold);
    };

    const refreshNarrative = () => {
        if (!chat) return;
        const messages = [...chat.querySelectorAll('.mes')].filter(message => message.getAttribute('is_system') !== 'true');
        for (const message of messages) {
            message.classList.remove(
                'atria-immersive-current-response',
                'atria-immersive-previous-turn',
                'atria-immersive-history',
                'atria-immersive-consecutive-speaker',
            );
        }
        if (!enabled || messages.length === 0) return;

        const currentAssistantIndex = messages.findLastIndex(message => message.getAttribute('is_user') !== 'true');
        const currentIndex = currentAssistantIndex >= 0 ? currentAssistantIndex : messages.length - 1;
        messages.forEach((message, index) => {
            if (index === currentIndex) message.classList.add('atria-immersive-current-response');
            else if (index === currentIndex - 1) message.classList.add('atria-immersive-previous-turn');
            else if (index < currentIndex - 1) message.classList.add('atria-immersive-history');
        });

        let previousAssistantName = null;
        for (const message of messages) {
            if (message.getAttribute('is_user') === 'true') {
                previousAssistantName = null;
                continue;
            }
            const name = String(message.getAttribute('ch_name') || '').trim();
            if (name && previousAssistantName === name) {
                message.classList.add('atria-immersive-consecutive-speaker');
            }
            previousAssistantName = name || null;
        }

        const currentMessage = messages[currentIndex];
        let adaptation = 'text';
        if (settings.visualMode !== 'text' && hasMeaningfulAvatar(currentMessage)) {
            adaptation = 'avatar';
        }
        documentRef.body.dataset.atriaImmersiveAdaptation = adaptation;
        updateHistoryReadingState();
    };

    const refreshSettings = nextSettings => {
        settings = normalizeImmersiveSettings(nextSettings);
        if (!enabled) return;
        documentRef.body.dataset.atriaImmersiveVisual = settings.visualMode;
        documentRef.body.dataset.atriaImmersiveHud = settings.hudMode;
        documentRef.body.classList.toggle('atria-immersive-story-focus', settings.storyFocus);
        documentRef.body.classList.toggle('atria-immersive-extensions-enabled', settings.extensionsEnabled);
        refreshNarrative();
    };

    const setEnabled = nextEnabled => {
        enabled = Boolean(nextEnabled);
        documentRef.body.classList.toggle('atria-immersive-mode', enabled);
        if (!enabled) {
            delete documentRef.body.dataset.atriaImmersiveProfile;
            delete documentRef.body.dataset.atriaImmersiveVisual;
            delete documentRef.body.dataset.atriaImmersiveHud;
            delete documentRef.body.dataset.atriaImmersiveAdaptation;
            documentRef.body.classList.remove(
                'atria-immersive-story-focus',
                'atria-immersive-extensions-enabled',
                'atria-immersive-history-reading',
            );
            refreshNarrative();
            return;
        }
        applyProfile();
        refreshSettings(settings);
        refreshNarrative();
    };

    const resizeHandler = () => applyProfile();
    const scrollHandler = () => updateHistoryReadingState();
    windowRef?.addEventListener?.('resize', resizeHandler, { passive: true });
    chat?.addEventListener?.('scroll', scrollHandler, { passive: true });

    const observer = chat && typeof MutationObserver !== 'undefined'
        ? new MutationObserver(records => {
            if (!enabled || !records.some(record => record.type === 'childList')) return;
            refreshNarrative();
        })
        : null;
    observer?.observe(chat, { childList: true });

    return {
        setEnabled,
        refreshSettings,
        refreshNarrative,
        getProfile: () => profile,
        getSettings: () => ({ ...settings }),
        dispose() {
            observer?.disconnect();
            windowRef?.removeEventListener?.('resize', resizeHandler);
            chat?.removeEventListener?.('scroll', scrollHandler);
            setEnabled(false);
        },
    };
}
