export const IMMERSIVE_HUD_BUDGET = Object.freeze({
    primary: 1,
    secondary: 2,
    ambient: 2,
});

function asArray(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

function normalizeHudItem(item, fallbackId) {
    if (item === undefined || item === null) return null;
    if (typeof item === 'string' || typeof item === 'number') {
        return { id: fallbackId, label: '', value: String(item) };
    }
    if (typeof item !== 'object') return null;
    const label = String(item.label ?? '').trim();
    const value = String(item.value ?? item.text ?? '').trim();
    if (!label && !value) return null;
    return {
        ...item,
        id: String(item.id || fallbackId),
        label,
        value,
    };
}

function normalizeItems(value, prefix) {
    return asArray(value)
        .map((item, index) => normalizeHudItem(item, `${prefix}-${index}`))
        .filter(Boolean);
}

export function applyHudBudget(hud = {}, budget = IMMERSIVE_HUD_BUDGET) {
    const summary = {};
    const overflow = [];
    for (const tier of ['primary', 'secondary', 'ambient']) {
        const items = normalizeItems(hud[tier], tier);
        const limit = Math.max(0, Number(budget[tier] ?? 0));
        summary[tier] = items.slice(0, limit);
        overflow.push(...items.slice(limit));
    }
    return {
        summary,
        transient: normalizeItems(hud.transient, 'transient'),
        details: [...normalizeItems(hud.details, 'details'), ...overflow],
    };
}

function normalizeProviderState(provider, state = {}) {
    const source = state && typeof state === 'object' ? state : {};
    return {
        identity: source.identity ?? provider.identity ?? null,
        scene: source.scene ?? provider.scene ?? null,
        visual: source.visual ?? provider.visual ?? null,
        hud: source.hud ?? provider.hud ?? null,
        actions: source.actions ?? provider.actions ?? null,
    };
}

function mergeObjectsByPriority(entries, key) {
    const output = {};
    for (const entry of entries) {
        const value = entry.state?.[key];
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        for (const [field, fieldValue] of Object.entries(value)) {
            if (output[field] === undefined && fieldValue !== undefined && fieldValue !== null) {
                output[field] = fieldValue;
            }
        }
    }
    return Object.keys(output).length ? output : null;
}

export function createImmersiveProviderRegistry({
    onChange = () => {},
    onError = error => console.warn('[immersive] provider failed', error),
} = {}) {
    const providers = new Map();
    let sequence = 0;

    const reportError = (error, providerId) => {
        try {
            onError(error, providerId);
        } catch (reportingError) {
            console.warn('[immersive] provider error reporter failed', reportingError);
        }
    };

    const sortedEntries = () => [...providers.values()].sort((a, b) => (
        b.priority - a.priority || a.sequence - b.sequence
    ));

    const buildSnapshot = () => {
        const entries = sortedEntries();
        const hud = { primary: [], secondary: [], ambient: [], transient: [], details: [] };
        const actions = [];
        const seenActions = new Set();

        for (const entry of entries) {
            const sourceHud = entry.state?.hud;
            if (sourceHud && typeof sourceHud === 'object') {
                for (const tier of Object.keys(hud)) {
                    hud[tier].push(...normalizeItems(sourceHud[tier], `${entry.id}-${tier}`).map(item => ({
                        ...item,
                        providerId: entry.id,
                    })));
                }
            }
            for (const action of asArray(entry.state?.actions)) {
                if (!action || typeof action !== 'object') continue;
                const id = String(action.id || '').trim();
                const label = String(action.label || '').trim();
                if (!id || !label || seenActions.has(id)) continue;
                seenActions.add(id);
                actions.push({ ...action, id, label, providerId: entry.id });
            }
        }

        return {
            identity: mergeObjectsByPriority(entries, 'identity'),
            scene: mergeObjectsByPriority(entries, 'scene'),
            visual: mergeObjectsByPriority(entries, 'visual'),
            hud: applyHudBudget(hud),
            actions,
            providers: entries.map(entry => ({ id: entry.id, priority: entry.priority })),
        };
    };

    const emit = () => {
        const snapshot = buildSnapshot();
        try {
            onChange(snapshot);
        } catch (error) {
            console.warn('[immersive] provider change consumer failed', error);
        }
        return snapshot;
    };

    const refreshEntry = async (entry, explicitState) => {
        try {
            const nextState = explicitState !== undefined
                ? explicitState
                : typeof entry.provider.getState === 'function'
                    ? await entry.provider.getState()
                    : entry.provider;
            entry.state = normalizeProviderState(entry.provider, nextState);
            entry.error = null;
        } catch (error) {
            entry.error = error;
            reportError(error, entry.id);
        }
    };

    const unregister = id => {
        const entry = providers.get(String(id));
        if (!entry) return false;
        providers.delete(entry.id);
        try {
            entry.provider.dispose?.();
        } catch (error) {
            reportError(error, entry.id);
        }
        emit();
        return true;
    };

    const register = provider => {
        if (!provider || typeof provider !== 'object') {
            throw new TypeError('Immersive provider must be an object.');
        }
        const id = String(provider.id || '').trim();
        if (!id) throw new TypeError('Immersive provider requires a stable id.');
        if (providers.has(id)) unregister(id);

        const entry = {
            id,
            provider,
            priority: Number.isFinite(Number(provider.priority)) ? Number(provider.priority) : 0,
            sequence: sequence++,
            state: normalizeProviderState(provider, provider.initialState || provider),
            error: null,
        };
        providers.set(id, entry);
        emit();

        return {
            id,
            refresh: async state => {
                const current = providers.get(id);
                if (!current) return buildSnapshot();
                await refreshEntry(current, state);
                return emit();
            },
            dispose: () => unregister(id),
        };
    };

    const refresh = async id => {
        if (id !== undefined && id !== null) {
            const entry = providers.get(String(id));
            if (entry) await refreshEntry(entry);
            return emit();
        }
        await Promise.all(sortedEntries().map(entry => refreshEntry(entry)));
        return emit();
    };

    const invokeAction = async actionId => {
        const snapshot = buildSnapshot();
        const action = snapshot.actions.find(candidate => candidate.id === actionId);
        if (!action) return false;
        const entry = providers.get(action.providerId);
        if (!entry) return false;
        try {
            if (typeof action.run === 'function') {
                await action.run();
                return true;
            }
            if (typeof entry.provider.runAction === 'function') {
                await entry.provider.runAction(action.id, action);
                return true;
            }
            return false;
        } catch (error) {
            reportError(error, entry.id);
            return false;
        }
    };

    return {
        register,
        unregister,
        refresh,
        invokeAction,
        getSnapshot: buildSnapshot,
        dispose() {
            for (const id of [...providers.keys()]) unregister(id);
        },
    };
}
