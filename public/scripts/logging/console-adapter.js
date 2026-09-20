import { redactText, redactValue } from './redact.js';
import { frontendLogStore } from './logger.js';

const ALWAYS_VISIBLE_LEVELS = new Set(['error']);
const CONSOLE_LEVELS = Object.freeze(['trace', 'debug', 'log', 'info', 'warn', 'error']);
const WRAPPED_ORIGINAL = Symbol.for('atria.frontend.logging.console.original');
let debugLoggingEnabled = false;
let suppressCaptureDepth = 0;

function normalizeLevel(level) {
    const normalized = String(level || 'log').toLowerCase();
    return CONSOLE_LEVELS.includes(normalized) ? normalized : 'log';
}

function serializeValue(value) {
    if (value instanceof Error) {
        return redactText(value.stack || `${value.name}: ${value.message}`);
    }
    if (typeof value === 'string') return redactText(value);
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    try {
        return JSON.stringify(redactValue(value));
    } catch {
        return redactText(String(value));
    }
}

function inferModule(message) {
    const value = String(message || '').trim().toLowerCase();
    const rules = [
        [/^\[(?:startup|startup-client)/, 'startup'],
        [/^\[(?:generation|atria-generation)/, 'generation'],
        [/^\[(?:orchestrator|orchestration)/, 'orchestrator'],
        [/^\[(?:memory|memory-graph)/, 'memory'],
        [/^\[(?:worldbook|world-info)/, 'worldbook'],
        [/^\[(?:extension|extensions)/, 'extensions'],
        [/^\[(?:regex)/, 'regex'],
        [/^\[(?:editor)/, 'editor'],
        [/^\[(?:studio)/, 'studio'],
        [/^\[(?:storage)/, 'storage'],
        [/^\[(?:settings)/, 'settings'],
    ];
    return rules.find(([pattern]) => pattern.test(value))?.[1] || 'uncategorized';
}

function getBaseMethod(level, consoleObject = globalThis.console) {
    const method = consoleObject?.[level];
    if (typeof method !== 'function') return () => {};
    if (Object.prototype.hasOwnProperty.call(method, WRAPPED_ORIGINAL)) {
        return method[WRAPPED_ORIGINAL];
    }
    return method.bind(consoleObject);
}

function timestampLabel() {
    const now = new Date();
    return `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}]`;
}

export function captureConsoleEntry(level, values, { store = frontendLogStore } = {}) {
    try {
        const normalizedLevel = normalizeLevel(level);
        const message = (Array.isArray(values) ? values : [values]).map(serializeValue).join(' ');
        return store.append({
            level: normalizedLevel,
            module: inferModule(message),
            category: 'compatibility',
            event: `console.${normalizedLevel}`,
            message,
            data: {},
            source: 'console',
        });
    } catch {
        return null;
    }
}

export function emitFrontendConsole(level, args, { consoleObject = globalThis.console } = {}) {
    const normalizedLevel = normalizeLevel(level);
    const method = consoleObject?.[normalizedLevel];
    if (typeof method !== 'function') return;
    suppressCaptureDepth++;
    try {
        method(...(Array.isArray(args) ? args : [args]));
    } catch {
        // Frontend logging must never alter business control flow.
    } finally {
        suppressCaptureDepth--;
    }
}

export function installFrontendConsoleAdapter({ store = frontendLogStore, consoleObject = globalThis.console } = {}) {
    if (!consoleObject) return;
    for (const level of CONSOLE_LEVELS) {
        const current = consoleObject[level];
        if (typeof current === 'function' && Object.prototype.hasOwnProperty.call(current, WRAPPED_ORIGINAL)) continue;
        const base = getBaseMethod(level, consoleObject);
        const wrapped = (...args) => {
            if (suppressCaptureDepth === 0) captureConsoleEntry(level, args, { store });
            if (!ALWAYS_VISIBLE_LEVELS.has(level) && !debugLoggingEnabled) return;
            try {
                base(timestampLabel(), ...args);
            } catch {
                // Compatibility output is best-effort only.
            }
        };
        Object.defineProperty(wrapped, WRAPPED_ORIGINAL, { value: base });
        consoleObject[level] = wrapped;
    }
}

export function setFrontendConsoleDebugLoggingEnabled(enabled, options = {}) {
    const announce = options?.announce === true;
    debugLoggingEnabled = Boolean(enabled);
    if (announce && debugLoggingEnabled) {
        const message = 'Frontend debug logging enabled.';
        frontendLogStore.append({
            level: 'info',
            module: 'system',
            category: 'logging',
            event: 'debug.enabled',
            message,
            source: 'structured',
        });
        emitFrontendConsole('info', [message]);
    }
}

export function isFrontendConsoleDebugLoggingEnabled() {
    return debugLoggingEnabled;
}

export const __frontendConsoleAdapterTestUtils = Object.freeze({
    WRAPPED_ORIGINAL,
});
