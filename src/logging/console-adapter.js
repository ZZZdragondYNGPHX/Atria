import util from 'node:util';

import { redactValue } from './redact.js';
import { backendLogStore } from './store.js';

const WRAPPED_ORIGINAL = Symbol.for('atria.logging.console.original');
const CONSOLE_LEVELS = Object.freeze(['trace', 'debug', 'log', 'info', 'warn', 'error']);
let suppressCaptureDepth = 0;

function stripAnsiArtifacts(input) {
    return String(input)
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/(?:^|[\s])\[(?:\d{1,3}(?:;\d{1,3})*)m/g, match => match.startsWith(' ') ? ' ' : '')
        .replace(/\[(?:\d{1,3}(?:;\d{1,3})*)m(?=[^\s])/g, '');
}

function safeSerialize(value) {
    if (typeof value === 'string') return stripAnsiArtifacts(value);
    try {
        return stripAnsiArtifacts(util.inspect(redactValue(value), {
            depth: 6,
            maxArrayLength: 100,
            maxStringLength: 4000,
            breakLength: 140,
            compact: 2,
        }));
    } catch {
        return stripAnsiArtifacts(String(value));
    }
}

function getBaseMethod(level, consoleObject = globalThis.console) {
    const method = consoleObject?.[level];
    if (typeof method !== 'function') return () => {};
    if (Object.prototype.hasOwnProperty.call(method, WRAPPED_ORIGINAL)) {
        return method[WRAPPED_ORIGINAL];
    }
    return method.bind(consoleObject);
}

export function inferConsoleModule(message) {
    const value = String(message || '').trim().toLowerCase();
    const rules = [
        [/^\[(?:startup|startup-client)/, 'startup'],
        [/^\[(?:ws-delivery|websocket)/, 'websocket'],
        [/^\[storage(?::|\])/, 'storage'],
        [/^\[(?:generation|atria-generation)/, 'generation'],
        [/^\[dispatch/, 'dispatch'],
        [/^\[(?:orchestrator|orchestration)/, 'orchestrator'],
        [/^\[(?:memory|memory-graph)/, 'memory'],
        [/^\[(?:worldbook|world-info)/, 'worldbook'],
        [/^\[sync/, 'sync'],
        [/^\[backup/, 'backup'],
        [/^\[(?:extension|extensions)/, 'extensions'],
        [/^\[(?:plugin|plugins)/, 'plugins'],
        [/^\[(?:http|request)/, 'http'],
    ];
    return rules.find(([pattern]) => pattern.test(value))?.[1] || 'uncategorized';
}

export function captureConsoleEntry(level, args, { store = backendLogStore } = {}) {
    try {
        const message = (Array.isArray(args) ? args : [args]).map(safeSerialize).join(' ');
        return store.append({
            side: 'backend',
            level,
            module: inferConsoleModule(message),
            category: 'compatibility',
            event: 'console.' + level,
            message,
            data: {},
            correlation: {},
            source: 'console',
        });
    } catch {
        return null;
    }
}

export function emitConsoleOutput(level, args, { consoleObject = globalThis.console } = {}) {
    try {
        const normalizedLevel = CONSOLE_LEVELS.includes(level) ? level : 'log';
        const method = consoleObject?.[normalizedLevel];
        if (typeof method !== 'function') return;
        suppressCaptureDepth++;
        try {
            method(...(Array.isArray(args) ? args : [args]));
        } finally {
            suppressCaptureDepth--;
        }
    } catch {
        // Logging must never alter business control flow.
    }
}

export function installConsoleAdapter({ store = backendLogStore, consoleObject = globalThis.console } = {}) {
    if (!consoleObject) return;
    for (const level of CONSOLE_LEVELS) {
        const current = consoleObject[level];
        if (typeof current === 'function' && Object.prototype.hasOwnProperty.call(current, WRAPPED_ORIGINAL)) continue;
        const base = getBaseMethod(level, consoleObject);
        const wrapped = (...args) => {
            if (suppressCaptureDepth === 0) {
                captureConsoleEntry(level, args, { store });
            }
            try {
                base('[' + new Date().toISOString() + ']', ...args);
            } catch {
                // Preserve the invariant that logging cannot break callers.
            }
        };
        Object.defineProperty(wrapped, WRAPPED_ORIGINAL, { value: base });
        consoleObject[level] = wrapped;
    }
}

export const __consoleAdapterTestUtils = Object.freeze({
    WRAPPED_ORIGINAL,
});
