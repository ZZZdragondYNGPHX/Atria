export const ATRIA_PRIMARY_DOMAINS = Object.freeze([
    Object.freeze({ id: 'play', label: 'Play', icon: 'fa-solid fa-play', glyph: 'play' }),
    Object.freeze({ id: 'library', label: 'Library', icon: 'fa-solid fa-layer-group', glyph: 'library' }),
    Object.freeze({ id: 'build', label: 'Build', icon: 'fa-solid fa-hammer', glyph: 'build' }),
    Object.freeze({ id: 'agents', label: 'Agents', icon: 'fa-solid fa-diagram-project', glyph: 'agents' }),
    Object.freeze({ id: 'runtime', label: 'Runtime', icon: 'fa-solid fa-gauge-high', glyph: 'runtime' }),
]);

export const ATRIA_GLOBAL_UTILITIES = Object.freeze([
    Object.freeze({ id: 'learning', label: 'Learning center', icon: 'fa-solid fa-book-open', glyph: 'library' }),
    Object.freeze({ id: 'command', label: 'Command', icon: 'fa-solid fa-magnifying-glass', glyph: 'search' }),
    Object.freeze({ id: 'diagnostics', label: 'Diagnostics', icon: 'fa-solid fa-stethoscope', glyph: 'diagnostics' }),
    Object.freeze({ id: 'plugins', label: 'Plugins', icon: 'fa-solid fa-puzzle-piece', glyph: 'plugins' }),
    Object.freeze({ id: 'settings', label: 'Settings', icon: 'fa-solid fa-gear', glyph: 'settings' }),
    Object.freeze({ id: 'account', label: 'Account', icon: 'fa-solid fa-user', glyph: 'account' }),
]);

export const ATRIA_VIEWPORT_MODES = Object.freeze({
    COMPACT: 'compact',
    MEDIUM: 'medium',
    EXPANDED: 'expanded',
});

/**
 * R7 shell breakpoints are derived from the minimum useful host composition,
 * not from the old "1000px means mobile" rule:
 * - Compact: one primary surface + bottom navigation.
 * - Medium: icon rail + one primary surface (inspector floats).
 * - Expanded: sidebar + primary surface + optional inspector.
 */
export const ATRIA_SHELL_BREAKPOINTS = Object.freeze({
    compactMax: 719,
    mediumMax: 1179,
});

export const ATRIA_SHELL_RECOVERY_QUERY_KEY = 'atriaShellRecovery';

export const ATRIA_COMMAND_SHORTCUT = Object.freeze({
    key: 'k',
    mac: 'Meta',
    other: 'Control',
});

export const ATRIA_ROUTE_QUERY_KEY = 'atriaRoute';
export const ATRIA_ROUTE_CHILD_QUERY_KEY = 'atriaChild';
