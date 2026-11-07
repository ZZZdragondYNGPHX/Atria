import { assertNativeId } from '../identity.js';

// Functional roles are jobs inside Atria. They are not story characters and
// not chat message roles. Each role runs on exactly one API preset; one preset
// may serve any number of roles.
export const FUNCTIONAL_ROLES = Object.freeze([
    'role.narrator', 'role.intent_resolver', 'role.event_interpreter', 'role.memory',
    'role.illustration_prompt', 'role.orchestrator', 'role.studio',
]);

export const isFunctionalRole = role => FUNCTIONAL_ROLES.includes(role);

/** Stored shape: { schemaVersion: 1, assignments: { [role]: runtimeRouteId } }. */
export function assertRoleAssignments(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1
        || Object.keys(value).some(key => !['schemaVersion', 'assignments'].includes(key))
        || !value.assignments || typeof value.assignments !== 'object' || Array.isArray(value.assignments)) throw new TypeError('Invalid role assignments');
    const assignments = {};
    for (const [role, id] of Object.entries(value.assignments)) {
        if (!isFunctionalRole(role)) throw new TypeError('Unknown functional role: ' + role);
        assignments[role] = assertNativeId(id, 'runtimeRoute', 'Role assignment');
    }
    return Object.freeze({ schemaVersion: 1, assignments: Object.freeze(assignments) });
}

/**
 * The single answer to "which preset runs this role". Stored choices win while
 * their preset exists. Without a stored document, presets saved before roles
 * were separated keep the role they declared (newest wins). A lone preset
 * serves every role that has no other answer, so a one-model setup just works.
 */
export function effectiveRoleAssignments(stored, routes, legacyRoles = new Map()) {
    const ids = new Set(routes.map(route => route.runtimeRouteId));
    const result = {};
    if (stored) {
        for (const role of FUNCTIONAL_ROLES) if (ids.has(stored.assignments[role])) result[role] = stored.assignments[role];
    } else {
        for (const role of FUNCTIONAL_ROLES) {
            const id = [...legacyRoles].filter(([routeId, legacy]) => legacy === role && ids.has(routeId)).at(-1)?.[0];
            if (id) result[role] = id;
        }
        const primary = result['role.narrator'] ?? routes.at(-1)?.runtimeRouteId;
        if (primary) for (const role of FUNCTIONAL_ROLES) result[role] ??= primary;
    }
    if (routes.length === 1) for (const role of FUNCTIONAL_ROLES) result[role] ??= routes[0].runtimeRouteId;
    return Object.freeze(result);
}

export const assignedRouteRef = (assignments, role) => assignments?.[role] ? { scope: 'player', runtimeRouteId: assignments[role] } : undefined;

/** What a pin or fingerprint names: the preset itself, never the job it ran. */
export const presetIdentity = route => {
    if (!route || route.role === undefined) return route;
    const { role: _role, ...preset } = route;
    return preset;
};
