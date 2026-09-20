# Immersive Provider API

Atria immersive mode is a presentation layer over the existing chat runtime. Extensions may enrich that presentation without owning messages, generation, swipe state, World Info, Memory OS, LoreState, MVU, or CardApp state.

## Register a provider

```js
const handle = Atria.immersive.registerProvider({
    id: 'example-extension',
    priority: 50,
    getState() {
        return {
            identity: { speaker: 'Alice' },
            scene: { id: 'inn-night', background: '/assets/inn-night.webp' },
            visual: { portrait: '/assets/alice-half.webp', accent: '#b78b61' },
            hud: {
                primary: [{ label: 'Location', value: 'The Inn' }],
                secondary: [{ label: 'Time', value: 'Night' }],
                ambient: [{ label: 'Weather', value: 'Rain' }],
                transient: [{ value: 'Quest updated' }],
                details: [{ label: 'Quest', value: 'Wait for dawn' }],
            },
            actions: [{ id: 'inspect-room', label: 'Inspect room' }],
        };
    },
    async runAction(id) {
        if (id === 'inspect-room') {
            // Route through the extension's existing runtime.
        }
    },
});

// Refresh after the provider's authoritative state changes.
await handle.refresh();

// Unregister and run provider cleanup.
handle.dispose();
```

Providers may also call `Atria.immersive.refreshProviders(id)` or `Atria.immersive.unregisterProvider(id)`.

## Contract

- Higher numeric `priority` wins individual `identity`, `scene`, and `visual` fields.
- HUD summary has a fixed budget: one primary, two secondary, two ambient items. Overflow is moved to Details.
- A portrait is used only when a provider explicitly returns `visual.portrait`. Atria never promotes an arbitrary image to portrait by image dimensions.
- Provider exceptions are isolated. A broken provider must not prevent chat, generation, or exiting immersive mode.
- Provider state is presentation input only. Do not duplicate Atria chat/message/generation persistence.
- Extensions that do not register a provider keep running normally; their existing controls remain available through the native tools surface.
