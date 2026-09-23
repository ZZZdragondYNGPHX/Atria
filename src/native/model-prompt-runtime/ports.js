function object(value, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(field + ' must be an object');
    }
    return value;
}

function functions(value, required, field) {
    object(value, field);
    for (const name of required) {
        if (typeof value[name] !== 'function') {
            throw new TypeError(field + '.' + name + ' must be a function');
        }
    }
    return Object.freeze(value);
}

export const GENERATION_SERVICE_METHODS = Object.freeze(['execute']);
export const ROUTE_RESOLVER_METHODS = Object.freeze(['resolve']);
export const PROVIDER_PORT_METHODS = Object.freeze([
    'resolveCapabilities',
    'countTokens',
    'renderRequest',
    'send',
    'parseStream',
    'normalizeResponse',
]);
export const SECRET_PORT_METHODS = Object.freeze(['resolveSecret']);
export const CONTEXT_PROVIDER_METHODS = Object.freeze(['buildRequestContextPlan']);

export function assertGenerationServicePort(value) {
    return functions(value, GENERATION_SERVICE_METHODS, 'GenerationService');
}

export function assertRouteResolverPort(value) {
    return functions(value, ROUTE_RESOLVER_METHODS, 'RouteResolver');
}

export function assertProviderPort(value) {
    return functions(value, PROVIDER_PORT_METHODS, 'ProviderPort');
}

export function assertSecretPort(value) {
    return functions(value, SECRET_PORT_METHODS, 'SecretPort');
}

export function assertContextProviderPort(value) {
    return functions(value, CONTEXT_PROVIDER_METHODS, 'ContextProvider');
}
