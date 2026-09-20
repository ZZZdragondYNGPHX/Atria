import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

import { backendLogStore } from './store.js';
import { redactText, redactValue } from './redact.js';

export const DEFAULT_STARTUP_SESSION_CAPACITY = 20;
export const STARTUP_SESSION_SCHEMA_VERSION = 1;
export const serverBootId = randomUUID();

const PROCESS_STARTED_AT_MS = Date.now() - Math.floor(process.uptime() * 1000);
const serverMilestones = [];
const serverPhases = [];

function clampList(list, limit) {
    return list.length > limit ? list.slice(list.length - limit) : list;
}

export function normalizeClientTiming(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0
        ? Math.round(number * 10) / 10
        : null;
}

export function diffClientTiming(timings, start, end) {
    const a = normalizeClientTiming(timings?.[start]);
    const b = normalizeClientTiming(timings?.[end]);
    return a !== null && b !== null && b >= a
        ? Math.round((b - a) * 10) / 10
        : null;
}

export function extractExtensionActivationTimings(durations, { limit = Number.POSITIVE_INFINITY } = {}) {
    const totalPrefix = 'extensionActivate:';
    const phasePrefixes = {
        localeMs: 'extensionLocale:',
        scriptMs: 'extensionScript:',
        styleMs: 'extensionStyle:',
        hookMs: 'extensionHook:',
    };

    const entries = Object.entries(durations || {})
        .filter(([name]) => name.startsWith(totalPrefix))
        .map(([name, value]) => {
            const extensionName = redactText(name.slice(totalPrefix.length, totalPrefix.length + 160));
            const item = {
                name: extensionName,
                totalMs: normalizeClientTiming(value),
            };
            for (const [field, prefix] of Object.entries(phasePrefixes)) {
                item[field] = normalizeClientTiming(durations?.[`${prefix}${extensionName}`]);
            }
            return item;
        })
        .filter(item => item.name && item.totalMs !== null)
        .sort((a, b) => b.totalMs - a.totalMs);

    const normalizedLimit = Number.isFinite(Number(limit))
        ? Math.max(0, Math.floor(Number(limit)))
        : entries.length;
    return entries.slice(0, normalizedLimit);
}

export function summarizeExtensionActivationTimings(durations) {
    return extractExtensionActivationTimings(durations, { limit: 8 }).map(item => ({
        name: item.name,
        ms: item.totalMs,
        localeMs: item.localeMs,
        scriptMs: item.scriptMs,
        styleMs: item.styleMs,
        hookMs: item.hookMs,
    }));
}

export function summarizeClientStartupTimings({ timings = {}, durations = {}, navigation = {} } = {}) {
    const initJsStart = normalizeClientTiming(timings.initJsStart);
    const responseEnd = normalizeClientTiming(navigation.responseEnd);
    return {
        navResponseEndMs: responseEnd,
        htmlToInitJsMs: initJsStart !== null && responseEnd !== null && initJsStart >= responseEnd
            ? Math.round((initJsStart - responseEnd) * 10) / 10
            : null,
        libImportMs: diffClientTiming(timings, 'libImportStart', 'libImportEnd'),
        appImportMs: diffClientTiming(timings, 'appImportStart', 'appImportEnd'),
        initModuleMs: diffClientTiming(timings, 'initJsStart', 'initModuleEnd'),
        initToFirstLoadMs: diffClientTiming(timings, 'initJsStart', 'firstLoadStart'),
        csrfMs: diffClientTiming(timings, 'firstLoadStart', 'csrfDone'),
        bootstrapToSettingsMs: diffClientTiming(timings, 'csrfDone', 'getSettingsDone'),
        settingsToVisibleMs: diffClientTiming(timings, 'getSettingsDone', 'loaderHidden'),
        visibleTotalMs: diffClientTiming(timings, 'firstLoadStart', 'loaderHidden'),
        visibleToBatch1Ms: diffClientTiming(timings, 'loaderHidden', 'batch1Done'),
        welcomeScreenMs: normalizeClientTiming(durations.welcomeScreen),
        batch2Ms: diffClientTiming(timings, 'batch1Done', 'batch2Done'),
        batch2TasksMs: diffClientTiming(timings, 'batch2TasksStart', 'batch2TasksDone'),
        b2TextGenModelSelectsMs: normalizeClientTiming(durations.batch2TextGenModelSelects),
        b2SystemMessagesMs: normalizeClientTiming(durations.batch2SystemMessages),
        b2AnnouncementsMs: normalizeClientTiming(durations.batch2Announcements),
        b2InitExtensionsMs: normalizeClientTiming(durations.batch2InitExtensions),
        b2BootstrapExtensionsMs: normalizeClientTiming(durations.batch2BootstrapExtensions),
        b2ExtensionSlashCommandsMs: normalizeClientTiming(durations.batch2ExtensionSlashCommands),
        b2ToolSlashCommandsMs: normalizeClientTiming(durations.batch2ToolSlashCommands),
        b2TokenizersMs: normalizeClientTiming(durations.batch2Tokenizers),
        b2PersonasMs: normalizeClientTiming(durations.batch2Personas),
        b2SlashCommandAutocompleteMs: normalizeClientTiming(durations.batch2SlashCommandAutocomplete),
        b2MacroAutocompleteMs: normalizeClientTiming(durations.batch2MacroAutocomplete),
        extFirstLoadEventMs: normalizeClientTiming(durations.extensionsFirstLoadEvent),
        extDiscoverMs: normalizeClientTiming(durations.extensionsDiscover),
        extManifestsMs: normalizeClientTiming(durations.extensionsManifests),
        extAutoUpdateMs: normalizeClientTiming(durations.extensionsAutoUpdate),
        extPrewarmMs: normalizeClientTiming(durations.extensionsPrewarm),
        extActivateMs: normalizeClientTiming(durations.extensionsActivate),
        extSlow: summarizeExtensionActivationTimings(durations),
        extSettingsLoadedEventMs: normalizeClientTiming(durations.extensionsSettingsLoadedEvent),
        batch3Ms: diffClientTiming(timings, 'batch2Done', 'batch3Done'),
        firstLoadTotalMs: diffClientTiming(timings, 'firstLoadStart', 'appReady'),
        domInteractiveMs: normalizeClientTiming(navigation.domInteractive),
        loadEventEndMs: normalizeClientTiming(navigation.loadEventEnd),
    };
}

function normalizeTimingObject(input) {
    const output = {};
    if (!input || typeof input !== 'object') return output;
    for (const [key, value] of Object.entries(input).slice(0, 300)) {
        const normalized = normalizeClientTiming(value);
        if (normalized !== null) output[redactText(key).slice(0, 180)] = normalized;
    }
    return output;
}

function normalizeNavigation(input) {
    const source = input && typeof input === 'object' ? input : {};
    const output = {};
    for (const key of ['responseStart', 'responseEnd', 'domInteractive', 'domContentLoadedEventEnd', 'loadEventEnd']) {
        const value = normalizeClientTiming(source[key]);
        if (value !== null) output[key] = value;
    }
    return output;
}

function normalizeClientRuntime(input) {
    const source = input && typeof input === 'object' ? input : {};
    return redactValue({
        userAgent: String(source.userAgent || '').slice(0, 500),
        platform: String(source.platform || '').slice(0, 120),
        language: String(source.language || '').slice(0, 64),
        online: typeof source.online === 'boolean' ? source.online : null,
        connectionType: String(source.connectionType || '').slice(0, 64),
        memoryGB: Number.isFinite(Number(source.memoryGB)) ? Number(source.memoryGB) : null,
        hardwareConcurrency: Number.isFinite(Number(source.hardwareConcurrency)) ? Number(source.hardwareConcurrency) : null,
        viewport: source.viewport && typeof source.viewport === 'object'
            ? {
                width: Number.isFinite(Number(source.viewport.width)) ? Number(source.viewport.width) : null,
                height: Number.isFinite(Number(source.viewport.height)) ? Number(source.viewport.height) : null,
                devicePixelRatio: Number.isFinite(Number(source.viewport.devicePixelRatio)) ? Number(source.viewport.devicePixelRatio) : null,
            }
            : null,
    }, { maxDepth: 3, maxStringLength: 600 });
}

export function normalizeStartupClientReport(input = {}) {
    const timings = normalizeTimingObject(input.timings);
    const durations = normalizeTimingObject(input.durations);
    const navigation = normalizeNavigation(input.navigation);
    const stage = input.stage === 'visible' ? 'visible' : 'ready';
    const startupSessionId = redactText(String(input.startupSessionId || '')).slice(0, 160);
    return {
        startupSessionId,
        stage,
        timings,
        durations,
        navigation,
        runtime: normalizeClientRuntime(input.runtime),
        summary: summarizeClientStartupTimings({ timings, durations, navigation }),
        extensions: extractExtensionActivationTimings(durations, { limit: 200 }),
    };
}

export function recordServerStartupMilestone({ name, elapsedMs, details = '', timestamp = Date.now() } = {}) {
    const item = {
        name: redactText(String(name || 'unknown')).slice(0, 180),
        elapsedMs: normalizeClientTiming(elapsedMs),
        timestamp: Math.max(0, Math.floor(Number(timestamp) || Date.now())),
        ...(details ? { details: redactText(String(details)).slice(0, 500) } : {}),
    };
    serverMilestones.push(item);
    if (serverMilestones.length > 200) serverMilestones.splice(0, serverMilestones.length - 200);
    return structuredClone(item);
}

export function recordServerStartupPhase({ name, durationMs, details = '', timestamp = Date.now() } = {}) {
    const item = {
        name: redactText(String(name || 'unknown')).slice(0, 180),
        durationMs: normalizeClientTiming(durationMs),
        timestamp: Math.max(0, Math.floor(Number(timestamp) || Date.now())),
        ...(details ? { details: redactText(String(details)).slice(0, 500) } : {}),
    };
    serverPhases.push(item);
    if (serverPhases.length > 200) serverPhases.splice(0, serverPhases.length - 200);
    return structuredClone(item);
}

export function getCurrentServerStartupSnapshot() {
    return {
        serverBootId,
        createdAt: PROCESS_STARTED_AT_MS,
        elapsedMs: Math.max(0, Date.now() - PROCESS_STARTED_AT_MS),
        runtime: {
            node: process.version,
            platform: process.platform,
            arch: process.arch,
        },
        milestones: structuredClone(serverMilestones),
        phases: structuredClone(serverPhases),
    };
}

function defaultPersistencePath() {
    const root = globalThis.DATA_ROOT;
    return root ? path.join(root, '_diagnostics', 'startup-sessions.json') : null;
}

function sanitizeLoadedSession(value) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string') return null;
    return redactValue(value, {
        maxDepth: 10,
        maxArrayLength: 500,
        maxObjectKeys: 500,
        maxStringLength: 12000,
    });
}

function buildLinkedLogWindow(logStore, bootCreatedAt, previousWindow = null) {
    try {
        const entries = logStore?.query?.({ startTime: bootCreatedAt, limit: 5000 })?.entries || [];
        const firstId = entries.length ? entries[0].id : Number(previousWindow?.fromId || 0);
        const lastId = entries.length ? entries[entries.length - 1].id : Number(previousWindow?.toId || 0);
        return {
            fromId: Number(firstId || 0),
            toId: Number(lastId || 0),
        };
    } catch {
        return {
            fromId: Number(previousWindow?.fromId || 0),
            toId: Number(previousWindow?.toId || 0),
        };
    }
}

export class StartupSessionStore {
    #capacity;
    #filePath;
    #sessions = [];
    #drafts = new Map();
    #loaded = false;
    #logStore;
    #serverSnapshotProvider;

    constructor({
        capacity = DEFAULT_STARTUP_SESSION_CAPACITY,
        filePath = undefined,
        logStore = backendLogStore,
        serverSnapshotProvider = getCurrentServerStartupSnapshot,
    } = {}) {
        this.#capacity = Math.max(1, Math.floor(Number(capacity) || DEFAULT_STARTUP_SESSION_CAPACITY));
        this.#filePath = filePath;
        this.#logStore = logStore;
        this.#serverSnapshotProvider = serverSnapshotProvider;
    }

    #resolveFilePath() {
        return this.#filePath === undefined ? defaultPersistencePath() : this.#filePath;
    }

    #ensureLoaded() {
        if (this.#loaded) return;
        this.#loaded = true;
        const filePath = this.#resolveFilePath();
        if (!filePath) return;
        try {
            if (!fs.existsSync(filePath)) return;
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const source = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
            this.#sessions = clampList(source.map(sanitizeLoadedSession).filter(Boolean), this.#capacity);
        } catch {
            this.#sessions = [];
        }
    }

    #persist() {
        const filePath = this.#resolveFilePath();
        if (!filePath) return false;
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
            const payload = JSON.stringify({
                schemaVersion: STARTUP_SESSION_SCHEMA_VERSION,
                sessions: this.#sessions,
            });
            fs.writeFileSync(tempPath, payload, 'utf8');
            fs.renameSync(tempPath, filePath);
            return true;
        } catch {
            return false;
        }
    }

    recordClientReport({ report, user = '', version = {} } = {}) {
        this.#ensureLoaded();
        const normalized = report?.summary ? report : normalizeStartupClientReport(report);
        const id = normalized.startupSessionId || randomUUID();
        const server = this.#serverSnapshotProvider();
        const previous = this.#drafts.get(id);
        const linkedLogWindow = buildLinkedLogWindow(this.#logStore, server.createdAt, previous?.linkedLogWindow);
        const now = Date.now();
        const base = {
            id,
            serverBootId: server.serverBootId,
            user: redactText(String(user || '')).slice(0, 160),
            createdAt: previous?.createdAt || now,
            stage: normalized.stage,
            appVersion: redactText(String(version?.pkgVersion || version?.appVersion || '')).slice(0, 80),
            revision: redactText(String(version?.gitRevision || version?.revision || '')).slice(0, 160),
            branch: redactText(String(version?.gitBranch || version?.branch || '')).slice(0, 160),
            runtime: {
                server: server.runtime,
                client: normalized.runtime,
            },
            server: {
                elapsedMs: server.elapsedMs,
                milestones: server.milestones,
                phases: server.phases,
            },
            client: {
                timings: normalized.timings,
                durations: normalized.durations,
                navigation: normalized.navigation,
                summary: normalized.summary,
            },
            extensions: normalized.extensions,
            linkedLogWindow,
        };

        if (normalized.stage !== 'ready') {
            this.#drafts.set(id, base);
            return structuredClone(base);
        }

        const completed = {
            ...base,
            completedAt: now,
            stage: 'ready',
        };
        this.#drafts.delete(id);
        const existingIndex = this.#sessions.findIndex(session => session.id === id);
        if (existingIndex >= 0) this.#sessions.splice(existingIndex, 1);
        this.#sessions.push(completed);
        this.#sessions = clampList(this.#sessions, this.#capacity);
        this.#persist();
        return structuredClone(completed);
    }

    list({ user = null, limit = this.#capacity } = {}) {
        this.#ensureLoaded();
        const normalizedUser = user === null ? null : String(user);
        const source = normalizedUser === null
            ? this.#sessions
            : this.#sessions.filter(session => session.user === normalizedUser);
        return source.slice(-Math.max(1, Math.floor(Number(limit) || this.#capacity)))
            .map(session => structuredClone(session))
            .reverse();
    }

    get(id, { user = null } = {}) {
        this.#ensureLoaded();
        const entry = this.#sessions.find(session => session.id === id && (user === null || session.user === String(user)));
        return entry ? structuredClone(entry) : null;
    }

    getDraft(id) {
        const entry = this.#drafts.get(id);
        return entry ? structuredClone(entry) : null;
    }

    clearCompleted() {
        this.#ensureLoaded();
        this.#sessions.length = 0;
        this.#persist();
    }

    get size() {
        this.#ensureLoaded();
        return this.#sessions.length;
    }
}

function numericDelta(current, previous) {
    const a = Number(current);
    const b = Number(previous);
    return Number.isFinite(a) && Number.isFinite(b)
        ? Math.round((a - b) * 10) / 10
        : null;
}

export function compareStartupSessions(current, previous) {
    if (!current || !previous) return null;
    const keys = new Set([
        ...Object.keys(current?.client?.summary || {}),
        ...Object.keys(previous?.client?.summary || {}),
    ]);
    const clientDeltas = {};
    for (const key of keys) {
        if (key === 'extSlow') continue;
        clientDeltas[key] = numericDelta(current?.client?.summary?.[key], previous?.client?.summary?.[key]);
    }
    const previousExtensions = new Map((previous.extensions || []).map(item => [item.name, item]));
    const extensionDeltas = (current.extensions || []).map(item => ({
        name: item.name,
        totalMs: item.totalMs,
        deltaMs: numericDelta(item.totalMs, previousExtensions.get(item.name)?.totalMs),
    }));
    return {
        currentId: current.id,
        previousId: previous.id,
        clientDeltas,
        extensionDeltas,
    };
}

export const startupSessionStore = new StartupSessionStore();
