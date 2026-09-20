const CLIENT_INTERVALS = Object.freeze([
    ['initJsStart', 'firstLoadStart', 'Module bootstrap'],
    ['firstLoadStart', 'csrfDone', 'CSRF'],
    ['csrfDone', 'getSettingsDone', 'Settings bootstrap'],
    ['getSettingsDone', 'loaderHidden', 'First visible UI'],
    ['loaderHidden', 'batch1Done', 'Batch 1'],
    ['batch1Done', 'batch2Done', 'Batch 2'],
    ['batch2Done', 'batch3Done', 'Batch 3'],
    ['batch3Done', 'appReady', 'APP_READY'],
]);

const EXTENSION_PHASES = Object.freeze([
    ['extensionsFirstLoadEvent', 'First-load event'],
    ['extensionsDiscover', 'Discover'],
    ['extensionsManifests', 'Manifests'],
    ['extensionsAutoUpdate', 'Auto update'],
    ['extensionsPrewarm', 'Prewarm'],
    ['extensionsActivate', 'Activate'],
    ['extensionsSettingsLoadedEvent', 'Settings-loaded event'],
]);

function finiteMs(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function sequentialize(items) {
    let cursor = 0;
    return items.map(item => {
        const durationMs = finiteMs(item.durationMs) ?? 0;
        const row = {
            ...item,
            startMs: cursor,
            endMs: cursor + durationMs,
            durationMs,
        };
        cursor += durationMs;
        return row;
    });
}

export function buildClientStartupSlices(session) {
    const timings = session?.client?.timings || {};
    return CLIENT_INTERVALS.map(([startKey, endKey, label]) => {
        const start = finiteMs(timings[startKey]);
        const end = finiteMs(timings[endKey]);
        if (start === null || end === null || end <= start) return null;
        return {
            id: `client:${startKey}:${endKey}`,
            label,
            durationMs: end - start,
            startKey,
            endKey,
        };
    }).filter(Boolean);
}

export function buildServerStartupSlices(session) {
    return (session?.server?.phases || [])
        .map((phase, index) => {
            const durationMs = finiteMs(phase?.durationMs);
            if (durationMs === null || durationMs <= 0) return null;
            return {
                id: `server:${index}:${String(phase?.name || 'phase')}`,
                label: String(phase?.name || 'Server phase'),
                durationMs,
                timestamp: finiteMs(phase?.timestamp),
            };
        })
        .filter(Boolean);
}

export function buildExtensionStartupSlices(session) {
    const durations = session?.client?.durations || {};
    return EXTENSION_PHASES.map(([key, label]) => {
        const durationMs = finiteMs(durations[key]);
        if (durationMs === null || durationMs <= 0) return null;
        return {
            id: `extensions:${key}`,
            label,
            durationMs,
            key,
        };
    }).filter(Boolean);
}

export function getStartupScopeSlices(session, scope = 'client') {
    if (scope === 'server') return buildServerStartupSlices(session);
    if (scope === 'extensions') return buildExtensionStartupSlices(session);
    return buildClientStartupSlices(session);
}

export function normalizeDonutSlices(slices = []) {
    const valid = slices
        .map(item => ({ ...item, durationMs: finiteMs(item?.durationMs) ?? 0 }))
        .filter(item => item.durationMs > 0);
    const totalMs = valid.reduce((sum, item) => sum + item.durationMs, 0);
    if (!(totalMs > 0)) return { totalMs: 0, slices: [] };

    let cursor = 0;
    const normalized = valid.map((item, index) => {
        const startRatio = cursor / totalMs;
        cursor += item.durationMs;
        const endRatio = index === valid.length - 1 ? 1 : cursor / totalMs;
        return {
            ...item,
            startRatio,
            endRatio,
            ratio: endRatio - startRatio,
            percentage: (endRatio - startRatio) * 100,
        };
    });
    return { totalMs, slices: normalized };
}

export function buildStartupDonut(session, scope = 'client') {
    return normalizeDonutSlices(getStartupScopeSlices(session, scope));
}

export function buildStartupTimeline(session) {
    const serverRaw = buildServerStartupSlices(session);
    const serverStarts = serverRaw.map(item => {
        const end = finiteMs(item.timestamp);
        return end === null ? null : end - item.durationMs;
    }).filter(value => value !== null);
    const serverBase = serverStarts.length ? Math.min(...serverStarts) : null;
    const server = serverRaw.map((item, index) => {
        const end = finiteMs(item.timestamp);
        if (end === null || serverBase === null) {
            return sequentialize(serverRaw)[index];
        }
        const startMs = Math.max(0, end - item.durationMs - serverBase);
        return {
            ...item,
            startMs,
            endMs: startMs + item.durationMs,
        };
    });

    return {
        server,
        client: sequentialize(buildClientStartupSlices(session)),
        extensions: sequentialize(buildExtensionStartupSlices(session)),
    };
}

export function buildSlowStartupItems(session, { limit = 12 } = {}) {
    const server = buildServerStartupSlices(session).map(item => ({ ...item, scope: 'server' }));
    const client = buildClientStartupSlices(session).map(item => ({ ...item, scope: 'client' }));
    const extensions = (session?.extensions || [])
        .map(item => ({
            id: `extension:${String(item?.name || 'unknown')}`,
            label: String(item?.name || 'Unknown extension'),
            durationMs: finiteMs(item?.totalMs) ?? 0,
            scope: 'extension',
        }))
        .filter(item => item.durationMs > 0);

    return [...server, ...client, ...extensions]
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, Math.max(1, Math.floor(Number(limit) || 12)));
}

export function getTimelineExtent(rows = []) {
    return rows.reduce((max, row) => Math.max(max, finiteMs(row?.endMs) ?? 0), 0);
}
