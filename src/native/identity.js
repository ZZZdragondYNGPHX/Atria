import { randomUUID } from 'node:crypto';

export const NATIVE_ID_FAMILIES = Object.freeze({
    package: 'pkg',
    packageVersion: 'pkgv',
    actor: 'actor',
    entryPoint: 'entry',
    project: 'project',
    session: 'ses',
    branch: 'br',
    message: 'msg',
    variant: 'var',
    revision: 'rev',
    savePoint: 'save',
    asset: 'asset',
    world: 'world',
    worldRevision: 'worldv',
    knowledgeBase: 'kb',
    knowledgeRevision: 'kbv',
    knowledgeEntry: 'kentry',
    knowledgeBinding: 'kbind',
    connectionProfile: 'conn',
    modelProfile: 'model',
    generationProfile: 'genprof',
    promptModule: 'pmod',
    promptProgram: 'pprog',
    runtimeRoute: 'route',
});

const FAMILY_BY_PREFIX = Object.freeze(Object.fromEntries(
    Object.entries(NATIVE_ID_FAMILIES).map(([kind, prefix]) => [prefix, kind]),
));

const UUID_HEX_RE = /^[a-f0-9]{32}$/;

function requireKind(kind) {
    const prefix = NATIVE_ID_FAMILIES[kind];
    if (!prefix) {
        throw new TypeError(`Unknown Native ID kind '${String(kind)}'`);
    }
    return prefix;
}

export function createNativeId(kind, uuidFactory = randomUUID) {
    const prefix = requireKind(kind);
    if (typeof uuidFactory !== 'function') {
        throw new TypeError('Native ID uuidFactory must be a function');
    }
    const raw = String(uuidFactory()).replaceAll('-', '').toLowerCase();
    if (!UUID_HEX_RE.test(raw)) {
        throw new Error('Native ID uuidFactory must return a UUID-shaped value');
    }
    return `${prefix}_${raw}`;
}

export function parseNativeId(value) {
    if (typeof value !== 'string') return null;
    const separator = value.indexOf('_');
    if (separator <= 0) return null;
    const prefix = value.slice(0, separator);
    const opaque = value.slice(separator + 1);
    const kind = FAMILY_BY_PREFIX[prefix];
    if (!kind || !UUID_HEX_RE.test(opaque)) return null;
    return Object.freeze({ kind, prefix, opaque });
}

export function isNativeId(value, kind = null) {
    const parsed = parseNativeId(value);
    if (!parsed) return false;
    return kind == null ? true : parsed.kind === kind;
}

export function assertNativeId(value, kind, field = `${kind}Id`) {
    requireKind(kind);
    if (!isNativeId(value, kind)) {
        throw new TypeError(`${field} must be an opaque ${NATIVE_ID_FAMILIES[kind]}_* Native ID`);
    }
    return value;
}
