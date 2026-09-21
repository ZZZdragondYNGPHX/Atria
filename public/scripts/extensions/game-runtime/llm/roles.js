export const GAME_RUNTIME_ROLES = Object.freeze([
    'narrator',
    'intent_resolver',
    'event_interpreter',
    'orchestrator',
    'studio',
]);

const ROLE_SET = new Set(GAME_RUNTIME_ROLES);
const DEFAULT_ROLE_CONFIGS = Object.freeze({
    narrator: Object.freeze({
        primaryProfile: '',
        fallbackProfiles: Object.freeze([]),
        timeoutMs: 120000,
        retries: 1,
        reasoningPolicy: 'quality',
        requirements: Object.freeze({ tools: false, structuredOutput: false }),
    }),
    intent_resolver: Object.freeze({
        primaryProfile: '',
        fallbackProfiles: Object.freeze([]),
        timeoutMs: 45000,
        retries: 1,
        reasoningPolicy: 'low_variance',
        requirements: Object.freeze({ tools: true, structuredOutput: false }),
    }),
    event_interpreter: Object.freeze({
        primaryProfile: '',
        fallbackProfiles: Object.freeze([]),
        timeoutMs: 45000,
        retries: 1,
        reasoningPolicy: 'low_variance',
        requirements: Object.freeze({ tools: false, structuredOutput: true }),
    }),
    orchestrator: Object.freeze({
        primaryProfile: '',
        fallbackProfiles: Object.freeze([]),
        timeoutMs: 120000,
        retries: 1,
        reasoningPolicy: 'planning',
        requirements: Object.freeze({ tools: true, structuredOutput: false }),
    }),
    studio: Object.freeze({
        primaryProfile: '',
        fallbackProfiles: Object.freeze([]),
        timeoutMs: 120000,
        retries: 1,
        reasoningPolicy: 'coding',
        requirements: Object.freeze({ tools: true, structuredOutput: false }),
    }),
});

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function normalizeName(value) {
    return String(value || '').trim();
}

function normalizeFallbacks(value) {
    const source = Array.isArray(value) ? value : [];
    return [...new Set(source.map(normalizeName).filter(Boolean))].slice(0, 8);
}

function normalizeRequirements(raw, defaults) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return Object.freeze({
        tools: source.tools === undefined ? defaults.tools : source.tools === true,
        structuredOutput: source.structuredOutput === undefined
            ? defaults.structuredOutput
            : source.structuredOutput === true,
    });
}

export function normalizeRuntimeRoleConfig(role, raw = {}) {
    const id = normalizeName(role);
    if (!ROLE_SET.has(id)) throw new Error(`Unknown Game Runtime role '${id}'`);

    const defaults = DEFAULT_ROLE_CONFIGS[id];
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const timeoutMs = source.timeoutMs === undefined ? defaults.timeoutMs : Number(source.timeoutMs);
    const retries = source.retries === undefined ? defaults.retries : Number(source.retries);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) {
        throw new Error(`Runtime role '${id}' timeoutMs must be an integer between 1000 and 600000`);
    }
    if (!Number.isInteger(retries) || retries < 0 || retries > 5) {
        throw new Error(`Runtime role '${id}' retries must be an integer between 0 and 5`);
    }

    const primaryProfile = normalizeName(source.primaryProfile ?? defaults.primaryProfile);
    const fallbackProfiles = normalizeFallbacks(source.fallbackProfiles ?? defaults.fallbackProfiles)
        .filter(name => name !== primaryProfile);

    return Object.freeze({
        role: id,
        primaryProfile,
        fallbackProfiles: Object.freeze(fallbackProfiles),
        timeoutMs,
        retries,
        reasoningPolicy: normalizeName(source.reasoningPolicy || defaults.reasoningPolicy),
        requirements: normalizeRequirements(source.requirements, defaults.requirements),
    });
}

export function getDefaultRuntimeRoleConfigs() {
    return Object.fromEntries(
        GAME_RUNTIME_ROLES.map(role => [role, normalizeRuntimeRoleConfig(role, DEFAULT_ROLE_CONFIGS[role])]),
    );
}

export function normalizeRuntimeRoleConfigs(raw = {}) {
    return Object.freeze(Object.fromEntries(
        GAME_RUNTIME_ROLES.map(role => [
            role,
            normalizeRuntimeRoleConfig(role, raw?.[role] || {}),
        ]),
    ));
}

function errorChain(error) {
    const out = [];
    const seen = new Set();
    let cursor = error;
    while (cursor && typeof cursor === 'object' && !seen.has(cursor) && out.length < 6) {
        out.push(cursor);
        seen.add(cursor);
        cursor = cursor.cause;
    }
    return out;
}

export function isRuntimeRoleFallbackEligible(error) {
    for (const item of errorChain(error)) {
        const code = normalizeName(item?.code).toLowerCase();
        if ([
            'invalid_input',
            'invalid_schema',
            'validation_failed',
            'aborted',
            'aborterror',
        ].includes(code)) return false;
        if ([
            'timeout',
            'network_error',
            'rate_limited',
            'provider_error',
            'service_unavailable',
        ].includes(code)) return true;

        const status = Number(item?.status ?? item?.details?.status);
        if (status === 429 || status >= 500) return true;
    }

    const message = errorChain(error)
        .map(item => String(item?.message || ''))
        .join(' ')
        .toLowerCase();
    if (/invalid (input|schema|tool)|validation|aborted|aborterror/.test(message)) return false;
    return /timeout|timed out|network|fetch failed|rate.?limit|service unavailable|overload|\b429\b|\b5\d\d\b/.test(message);
}

function validateRequestRequirements(config, request) {
    if (config.requirements.tools && (!Array.isArray(request?.tools) || request.tools.length === 0)) {
        throw Object.assign(
            new Error(`Runtime role '${config.role}' requires tool calling`),
            { code: 'invalid_input' },
        );
    }
    if (config.requirements.structuredOutput && !request?.jsonSchema) {
        throw Object.assign(
            new Error(`Runtime role '${config.role}' requires structured output`),
            { code: 'invalid_input' },
        );
    }
}

function combineAbortSignals(parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timer = null;
    const onAbort = () => {
        if (!controller.signal.aborted) controller.abort(parentSignal?.reason);
    };
    if (parentSignal?.aborted) {
        onAbort();
    } else {
        parentSignal?.addEventListener?.('abort', onAbort, { once: true });
    }
    if (timeoutMs > 0) {
        timer = setTimeout(() => {
            if (!controller.signal.aborted) {
                controller.abort(Object.assign(new Error('Runtime role request timed out'), {
                    code: 'timeout',
                }));
            }
        }, timeoutMs);
    }
    return {
        signal: controller.signal,
        dispose() {
            if (timer) clearTimeout(timer);
            parentSignal?.removeEventListener?.('abort', onAbort);
        },
    };
}

function routeQueue(config) {
    return [...new Set([
        config.primaryProfile,
        ...config.fallbackProfiles,
    ].map(normalizeName).filter(Boolean))];
}

export function createRuntimeRoleRouter(options = {}) {
    const generateTask = options.generateTask;
    if (typeof generateTask !== 'function') {
        throw new Error('Runtime Role Router requires generateTask()');
    }
    const getRoleConfig = typeof options.getRoleConfig === 'function'
        ? options.getRoleConfig
        : role => normalizeRuntimeRoleConfig(role, options.roleConfigs?.[role] || {});

    return Object.freeze({
        getConfig(role) {
            return normalizeRuntimeRoleConfig(role, getRoleConfig(role));
        },

        async execute(role, request = {}, executionOptions = {}) {
            const config = normalizeRuntimeRoleConfig(role, getRoleConfig(role));
            validateRequestRequirements(config, request);

            const queue = routeQueue(config);
            const routes = queue.length > 0 ? queue : [''];
            const attempts = [];
            let lastError = null;

            for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
                const apiPresetName = routes[routeIndex];
                for (let retry = 0; retry <= config.retries; retry += 1) {
                    const linked = combineAbortSignals(
                        executionOptions.abortSignal || request.abortSignal,
                        config.timeoutMs,
                    );
                    try {
                        const result = await generateTask({
                            ...clone(request),
                            apiPresetName,
                            abortSignal: linked.signal,
                        });
                        attempts.push({
                            apiPresetName,
                            retry,
                            status: 'success',
                        });
                        return Object.freeze({
                            role: config.role,
                            apiPresetName,
                            fallbackUsed: routeIndex > 0,
                            attempts: Object.freeze(attempts),
                            result,
                        });
                    } catch (error) {
                        lastError = error;
                        attempts.push({
                            apiPresetName,
                            retry,
                            status: 'failed',
                            code: normalizeName(error?.code),
                            message: String(error?.message || error),
                        });
                        if (linked.signal.aborted && executionOptions.abortSignal?.aborted) {
                            throw error;
                        }
                        const eligible = isRuntimeRoleFallbackEligible(error);
                        if (!eligible) {
                            error.runtimeRoleTrace = clone(attempts);
                            throw error;
                        }
                        if (retry < config.retries) continue;
                        break;
                    } finally {
                        linked.dispose();
                    }
                }
            }

            if (lastError && typeof lastError === 'object') {
                lastError.runtimeRoleTrace = clone(attempts);
            }
            throw lastError || new Error(`Runtime role '${config.role}' exhausted routes`);
        },
    });
}
