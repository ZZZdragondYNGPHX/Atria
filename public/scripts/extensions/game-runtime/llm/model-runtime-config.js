import { cloneGameLlmValue } from './clone.js';
import {
    GAME_RUNTIME_ROLES,
    normalizeRuntimeRoleConfig,
    normalizeRuntimeRoleConfigs,
} from './roles.js';

export const MODEL_RUNTIME_CONFIG_VERSION = 1;

const clone = cloneGameLlmValue;

export function ensureModelRuntimeConfig(settingsRoot) {
    if (!settingsRoot || typeof settingsRoot !== 'object' || Array.isArray(settingsRoot)) {
        throw new Error('Model Runtime configuration requires an extension settings object');
    }

    const current = settingsRoot.modelRuntime;
    const rawRoles = current && typeof current === 'object' && !Array.isArray(current)
        ? current.roles
        : {};
    const roles = normalizeRuntimeRoleConfigs(rawRoles || {});
    settingsRoot.modelRuntime = {
        version: MODEL_RUNTIME_CONFIG_VERSION,
        roles: clone(roles),
    };
    return settingsRoot.modelRuntime;
}

export function getModelRuntimeConfig(settingsRoot) {
    const config = ensureModelRuntimeConfig(settingsRoot);
    return Object.freeze({
        version: MODEL_RUNTIME_CONFIG_VERSION,
        roles: normalizeRuntimeRoleConfigs(config.roles),
    });
}

export function getRuntimeRoleConfig(settingsRoot, role) {
    const config = getModelRuntimeConfig(settingsRoot);
    const id = String(role || '').trim();
    if (!GAME_RUNTIME_ROLES.includes(id)) {
        throw new Error(`Unknown Game Runtime role '${id}'`);
    }
    return config.roles[id];
}

export function setRuntimeRoleConfig(settingsRoot, role, patch = {}) {
    const config = ensureModelRuntimeConfig(settingsRoot);
    const id = String(role || '').trim();
    if (!GAME_RUNTIME_ROLES.includes(id)) {
        throw new Error(`Unknown Game Runtime role '${id}'`);
    }
    const previous = normalizeRuntimeRoleConfig(id, config.roles[id] || {});
    const source = patch && typeof patch === 'object' && !Array.isArray(patch)
        ? patch
        : {};
    const next = normalizeRuntimeRoleConfig(id, {
        ...clone(previous),
        ...clone(source),
        requirements: {
            ...clone(previous.requirements),
            ...(source.requirements && typeof source.requirements === 'object'
                ? clone(source.requirements)
                : {}),
        },
    });
    config.roles[id] = clone(next);
    return next;
}
