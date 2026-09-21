export const ATRIA_PRIMARY_DOMAINS = Object.freeze([
    Object.freeze({ id: 'play', label: 'Play', icon: 'fa-solid fa-play' }),
    Object.freeze({ id: 'library', label: 'Library', icon: 'fa-solid fa-layer-group' }),
    Object.freeze({ id: 'studio', label: 'Studio', icon: 'fa-solid fa-pen-ruler' }),
    Object.freeze({ id: 'agents', label: 'Agents', icon: 'fa-solid fa-diagram-project' }),
    Object.freeze({ id: 'runtime', label: 'Runtime', icon: 'fa-solid fa-gauge-high' }),
]);

export const ATRIA_GLOBAL_UTILITIES = Object.freeze([
    Object.freeze({ id: 'command', label: 'Command', icon: 'fa-solid fa-magnifying-glass' }),
    Object.freeze({ id: 'diagnostics', label: 'Diagnostics', icon: 'fa-solid fa-stethoscope' }),
    Object.freeze({ id: 'plugins', label: 'Plugins', icon: 'fa-solid fa-puzzle-piece' }),
    Object.freeze({ id: 'settings', label: 'Settings', icon: 'fa-solid fa-gear' }),
    Object.freeze({ id: 'account', label: 'Account', icon: 'fa-solid fa-user' }),
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
 * - Medium: navigation rail + one primary surface.
 * - Expanded: rail + primary surface + persistent context dock.
 */
export const ATRIA_SHELL_BREAKPOINTS = Object.freeze({
    compactMax: 719,
    mediumMax: 1179,
});

export const ATRIA_SHELL_PREVIEW_QUERY_KEY = 'atriaShell';
export const ATRIA_SHELL_PREVIEW_STORAGE_KEY = 'atria.shell.preview';

export const ATRIA_COMMAND_SHORTCUT = Object.freeze({
    key: 'k',
    mac: 'Meta',
    other: 'Control',
});

export const ATRIA_ROUTE_QUERY_KEY = 'atriaRoute';
export const ATRIA_ROUTE_CHILD_QUERY_KEY = 'atriaChild';
