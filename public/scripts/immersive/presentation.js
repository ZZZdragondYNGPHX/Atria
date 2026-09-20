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

export function createImmersivePresentation({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
    isMobile = () => false,
} = {}) {
    let enabled = false;
    let profile = 'desktop';
    let settings = normalizeImmersiveSettings();

    const resolveProfile = () => resolveImmersiveProfile({
        mobile: Boolean(isMobile?.()),
        width: Number(windowRef?.innerWidth || 1280),
    });

    const applyProfile = () => {
        profile = resolveProfile();
        if (!enabled) return;
        documentRef.body.dataset.atriaImmersiveProfile = profile;
    };

    const refreshSettings = nextSettings => {
        settings = normalizeImmersiveSettings(nextSettings);
        if (!enabled) return;
        documentRef.body.dataset.atriaImmersiveVisual = settings.visualMode;
        documentRef.body.dataset.atriaImmersiveHud = settings.hudMode;
        documentRef.body.classList.toggle('atria-immersive-story-focus', settings.storyFocus);
        documentRef.body.classList.toggle('atria-immersive-extensions-enabled', settings.extensionsEnabled);
    };

    const setEnabled = nextEnabled => {
        enabled = Boolean(nextEnabled);
        documentRef.body.classList.toggle('atria-immersive-mode', enabled);
        if (!enabled) {
            delete documentRef.body.dataset.atriaImmersiveProfile;
            delete documentRef.body.dataset.atriaImmersiveVisual;
            delete documentRef.body.dataset.atriaImmersiveHud;
            documentRef.body.classList.remove('atria-immersive-story-focus', 'atria-immersive-extensions-enabled');
            return;
        }
        applyProfile();
        refreshSettings(settings);
    };

    const resizeHandler = () => applyProfile();
    windowRef?.addEventListener?.('resize', resizeHandler, { passive: true });

    return {
        setEnabled,
        refreshSettings,
        getProfile: () => profile,
        getSettings: () => ({ ...settings }),
        dispose() {
            windowRef?.removeEventListener?.('resize', resizeHandler);
            setEnabled(false);
        },
    };
}
