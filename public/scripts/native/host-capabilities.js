// Device support is Host-owned. A declared fallback never grants authority.
export function detectPresentationCapabilities(doc = globalThis.document, win = globalThis.window) {
    const nav = win?.navigator;
    return { fullscreen: Boolean(doc?.fullscreenEnabled && doc.documentElement?.requestFullscreen), focus: Boolean(doc?.documentElement?.focus),
        gamepad: typeof nav?.getGamepads === 'function', responsive: Boolean(win), 'reduced-motion': typeof win?.matchMedia === 'function',
        speech: Boolean(win?.speechSynthesis && win?.SpeechSynthesisUtterance), audio: Boolean(doc?.createElement('audio').canPlayType), video: Boolean(doc?.createElement('video').canPlayType) };
}

export function presentationNegotiation(definition, doc, win) {
    const supported = detectPresentationCapabilities(doc, win);
    return (definition?.host ?? []).map(item => ({ ...item, supported: supported[item.id],
        status: supported[item.id] ? 'ready' : item.required ? 'blocked' : 'degraded' }));
}
