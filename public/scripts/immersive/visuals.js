function safeImageUrl(value) {
    const source = String(value || '').trim();
    if (!source) return '';
    return source.replace(/["\\\r\n]/g, '');
}

function prefersReducedMotion(windowRef) {
    try {
        return Boolean(windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    } catch {
        return false;
    }
}

export function createImmersiveVisuals({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
} = {}) {
    const root = documentRef.createElement('div');
    root.id = 'atriaImmersiveStage';
    root.className = 'atria-immersive-stage';
    root.setAttribute('aria-hidden', 'true');
    root.hidden = true;

    const background = documentRef.createElement('div');
    background.className = 'atria-immersive-scene-background';
    const wash = documentRef.createElement('div');
    wash.className = 'atria-immersive-scene-wash';
    const portrait = documentRef.createElement('img');
    portrait.className = 'atria-immersive-portrait';
    portrait.alt = '';
    portrait.draggable = false;
    portrait.hidden = true;
    root.append(background, wash, portrait);
    documentRef.body.prepend(root);

    let enabled = false;
    let settings = {};
    let lastSceneKey = '';
    let transitionTimer = null;

    const setEnabled = nextEnabled => {
        enabled = Boolean(nextEnabled);
        root.hidden = !enabled;
    };

    const render = (snapshot = {}, nextSettings = settings) => {
        settings = nextSettings || {};
        const scene = snapshot.scene && typeof snapshot.scene === 'object' ? snapshot.scene : {};
        const visual = snapshot.visual && typeof snapshot.visual === 'object' ? snapshot.visual : {};
        const backgroundUrl = safeImageUrl(visual.background ?? scene.background);
        const portraitUrl = settings.visualMode === 'text' ? '' : safeImageUrl(visual.portrait);
        const accent = String(visual.accent ?? scene.accent ?? '').trim();

        background.style.backgroundImage = backgroundUrl ? `url("${backgroundUrl}")` : '';
        if (portraitUrl) {
            portrait.src = portraitUrl;
            portrait.hidden = false;
        } else {
            portrait.removeAttribute('src');
            portrait.hidden = true;
        }

        if (accent) documentRef.body.style.setProperty('--atria-immersive-accent', accent);
        else documentRef.body.style.removeProperty('--atria-immersive-accent');

        const sceneKey = String(scene.id ?? scene.key ?? backgroundUrl ?? scene.title ?? '');
        const reducedMotion = settings.reducedMotion === true || prefersReducedMotion(windowRef);
        root.classList.toggle('atria-immersive-reduced-motion', reducedMotion);
        if (enabled && sceneKey && sceneKey !== lastSceneKey && !reducedMotion) {
            clearTimeout(transitionTimer);
            root.classList.add('atria-immersive-scene-changing');
            transitionTimer = setTimeout(() => root.classList.remove('atria-immersive-scene-changing'), 240);
        } else {
            root.classList.remove('atria-immersive-scene-changing');
        }
        lastSceneKey = sceneKey;

        root.dataset.hasScene = String(Boolean(backgroundUrl));
        root.dataset.hasPortrait = String(Boolean(portraitUrl));
    };

    return {
        setEnabled,
        render,
        hasPortrait: () => !portrait.hidden,
        dispose() {
            clearTimeout(transitionTimer);
            documentRef.body.style.removeProperty('--atria-immersive-accent');
            root.remove();
        },
    };
}
