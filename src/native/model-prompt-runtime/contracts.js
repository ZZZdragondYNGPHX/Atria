import { validatePromptParameters } from '../../../public/shared/prompt-parameters.js';
import { assertNativeId } from '../identity.js';

export const ATRIA_MODEL_PROMPT_SCHEMA_VERSION = 1;
export const ATRIA_CAPABILITY_STATES = Object.freeze(['supported', 'unsupported', 'unknown']);
export const ATRIA_CAPABILITY_PROVENANCE_KINDS = Object.freeze([
    'adapter-metadata',
    'provider-discovery',
    'provider-endpoint',
    'user-override',
]);
export const ATRIA_RESOURCE_REF_SCOPES = Object.freeze(['project', 'library', 'package']);
export const ATRIA_RUNTIME_ROUTE_SCOPES = Object.freeze(['player', 'session']);
export const ATRIA_CONTEXT_SOURCE_KINDS = Object.freeze(['session', 'studio', 'task']);
export const ATRIA_PACKAGE_MODEL_PROMPT_FIELD = 'modelPrompt';

const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const NAMESPACED_RE = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9][a-z0-9_-]*)+$/;
const SECRET_KEY_RE = /^(?:api[_-]?key|secret|secretvalue|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|authorization|credentials?|private[_-]?key|bearer)$/i;
const RESOURCE_KIND_BY_TYPE = Object.freeze({
    'core.generation-profile': 'generationProfile',
    'core.prompt-module': 'promptModule',
    'core.prompt-program': 'promptProgram',
});

function object(value, field) {
    if (
        !value
        || typeof value !== 'object'
        || Array.isArray(value)
        || Object.prototype.toString.call(value) !== '[object Object]'
    ) {
        throw new TypeError(field + ' must be a plain object');
    }
    return value;
}

function only(value, keys, field) {
    const allowed = new Set(keys);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new TypeError(`${field} contains unsupported field '${key}'`);
    }
}

function text(value, field, maxLength = 4096, { allowEmpty = false } = {}) {
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
        throw new TypeError(field + ' must be a ' + (allowEmpty ? 'string' : 'non-empty string'));
    }
    if (value.length > maxLength) throw new TypeError(field + ' is too long');
    return value;
}

function token(value, field) {
    text(value, field, 256);
    if (!TOKEN_RE.test(value)) throw new TypeError(field + ' must be an opaque token');
    return value;
}

function namespaced(value, field) {
    text(value, field, 192);
    if (!NAMESPACED_RE.test(value)) throw new TypeError(field + ' must be a namespaced lowercase identifier');
    return value;
}

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new TypeError(field + ' must be an integer in range ' + min + '..' + max);
    }
    return value;
}

function json(value, field, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object') throw new TypeError(field + ' must contain JSON values only');
    if (seen.has(value)) throw new TypeError(field + ' must not contain cycles');
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => json(item, field + '[' + index + ']', seen));
    } else {
        object(value, field);
        for (const [key, item] of Object.entries(value)) json(item, field + '.' + key, seen);
    }
    seen.delete(value);
    return value;
}

function clone(value, field) {
    json(value, field);
    return structuredClone(value);
}

function freezeArray(value) {
    return Object.freeze(value);
}

function uniqueStrings(value, field, { namespacedValues = false } = {}) {
    if (!Array.isArray(value)) throw new TypeError(field + ' must be an array');
    const out = value.map((item, index) => namespacedValues
        ? namespaced(item, field + '[' + index + ']')
        : token(item, field + '[' + index + ']'));
    if (new Set(out).size !== out.length) throw new TypeError(field + ' must not contain duplicates');
    return freezeArray(out);
}

export function assertNoSecretMaterial(value, field, seen = new Set()) {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertNoSecretMaterial(item, field + '[' + index + ']', seen));
    } else {
        for (const [key, item] of Object.entries(value)) {
            if (SECRET_KEY_RE.test(key) && !['secretRef', 'secretId'].includes(key)) {
                throw new TypeError(`${field} must not serialize secret material in field '${key}'`);
            }
            assertNoSecretMaterial(item, field + '.' + key, seen);
        }
    }
    seen.delete(value);
}

function assertSecretRef(value, field) {
    object(value, field);
    only(value, ['secretId', 'scope'], field);
    if (value.scope !== 'player') throw new TypeError(field + '.scope must be \'player\'');
    return Object.freeze({
        secretId: token(value.secretId, field + '.secretId'),
        scope: 'player',
    });
}

function assertPlayerProfileRef(value, kind, idField, field) {
    object(value, field);
    only(value, [idField, 'scope'], field);
    if (value.scope !== 'player') throw new TypeError(field + '.scope must be \'player\'');
    return Object.freeze({
        [idField]: assertNativeId(value[idField], kind, field + '.' + idField),
        scope: 'player',
    });
}

function assertScopedOwner(value, scope, field) {
    const output = {};
    if (scope === 'project') {
        only(value, ['resourceType', 'resourceId', 'revision', 'scope', 'projectId'], field);
        output.projectId = assertNativeId(value.projectId, 'project', field + '.projectId');
        return output;
    }
    if (scope === 'package') {
        only(value, ['resourceType', 'resourceId', 'revision', 'scope', 'packageId', 'packageVersionId'], field);
        output.packageId = assertNativeId(value.packageId, 'package', field + '.packageId');
        output.packageVersionId = assertNativeId(
            value.packageVersionId,
            'packageVersion',
            field + '.packageVersionId',
        );
        return output;
    }
    only(value, ['resourceType', 'resourceId', 'revision', 'scope'], field);
    return output;
}

export function assertExactResourceRef(value, expectedResourceType = null, field = 'ResourceRef') {
    object(value, field);
    const resourceType = namespaced(value.resourceType, field + '.resourceType');
    if (expectedResourceType && resourceType !== expectedResourceType) {
        throw new TypeError(field + '.resourceType must be ' + expectedResourceType);
    }
    const kind = RESOURCE_KIND_BY_TYPE[resourceType];
    if (!kind) throw new TypeError(field + '.resourceType is not a P0 model/prompt resource type');
    if (!ATRIA_RESOURCE_REF_SCOPES.includes(value.scope)) {
        throw new TypeError(field + '.scope is unsupported');
    }
    const owner = assertScopedOwner(value, value.scope, field);
    return Object.freeze({
        resourceType,
        resourceId: assertNativeId(value.resourceId, kind, field + '.resourceId'),
        revision: token(value.revision, field + '.revision'),
        scope: value.scope,
        ...owner,
    });
}

export function assertCapabilityDecision(value, field = 'CapabilityDecision') {
    object(value, field);
    only(value, ['capability', 'state', 'provenance'], field);
    const capability = namespaced(value.capability, field + '.capability');
    if (!ATRIA_CAPABILITY_STATES.includes(value.state)) {
        throw new TypeError(field + '.state must be supported, unsupported, or unknown');
    }
    return Object.freeze({ capability, state: value.state, provenance: assertDecisionProvenance(value.provenance, field) });
}

function assertDecisionProvenance(value, field) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new TypeError(field + '.provenance must contain at least one source');
    }
    const provenance = value.map((entry, index) => {
        const entryField = field + '.provenance[' + index + ']';
        object(entry, entryField);
        only(entry, ['kind', 'source', 'observedAt'], entryField);
        if (!ATRIA_CAPABILITY_PROVENANCE_KINDS.includes(entry.kind)) {
            throw new TypeError(entryField + '.kind is unsupported');
        }
        return Object.freeze({
            kind: entry.kind,
            source: text(entry.source, entryField + '.source', 512),
            ...(entry.observedAt === undefined
                ? {}
                : { observedAt: integer(entry.observedAt, entryField + '.observedAt') }),
        });
    });
    return freezeArray(provenance);
}

function assertCapabilityList(value, field) {
    if (!Array.isArray(value)) throw new TypeError(field + ' must be an array');
    const out = value.map((entry, index) => assertCapabilityDecision(entry, field + '[' + index + ']'));
    const keys = out.map(item => item.capability);
    if (new Set(keys).size !== keys.length) throw new TypeError(field + ' must not contain duplicate capabilities');
    return freezeArray(out);
}

export function assertConnectionProfile(value) {
    object(value, 'ConnectionProfile');
    only(value, [
        'schemaVersion',
        'connectionProfileId',
        'scope',
        'displayName',
        'providerAdapter',
        'transport',
        'endpoint',
        'networkPolicy',
        'secretRef',
        'options',
    ], 'ConnectionProfile');
    if (value.schemaVersion !== ATRIA_MODEL_PROMPT_SCHEMA_VERSION) {
        throw new TypeError('ConnectionProfile.schemaVersion must be 1');
    }
    if (value.scope !== 'player') throw new TypeError('ConnectionProfile.scope must be \'player\'');
    const endpoint = text(value.endpoint, 'ConnectionProfile.endpoint', 2048);
    let url;
    try {
        url = new URL(endpoint);
    } catch {
        throw new TypeError('ConnectionProfile.endpoint must be an absolute URL');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new TypeError('ConnectionProfile.endpoint must use http or https');
    }
    const networkPolicy = value.networkPolicy === undefined
        ? {}
        : clone(object(value.networkPolicy, 'ConnectionProfile.networkPolicy'), 'ConnectionProfile.networkPolicy');
    const options = value.options === undefined
        ? {}
        : clone(object(value.options, 'ConnectionProfile.options'), 'ConnectionProfile.options');
    assertNoSecretMaterial(networkPolicy, 'ConnectionProfile.networkPolicy');
    assertNoSecretMaterial(options, 'ConnectionProfile.options');
    return Object.freeze({
        schemaVersion: 1,
        connectionProfileId: assertNativeId(
            value.connectionProfileId,
            'connectionProfile',
            'ConnectionProfile.connectionProfileId',
        ),
        scope: 'player',
        displayName: text(value.displayName, 'ConnectionProfile.displayName', 256),
        providerAdapter: namespaced(value.providerAdapter, 'ConnectionProfile.providerAdapter'),
        transport: namespaced(value.transport, 'ConnectionProfile.transport'),
        endpoint: url.toString(),
        networkPolicy,
        secretRef: assertSecretRef(value.secretRef, 'ConnectionProfile.secretRef'),
        options,
    });
}

export function assertModelProfile(value) {
    object(value, 'ModelProfile');
    only(value, [
        'schemaVersion',
        'modelProfileId',
        'scope',
        'displayName',
        'connectionProfileRef',
        'remoteModelId',
        'capabilities',
        'limits',
        'limitProvenance',
        'tokenizer',
        'messageFormat',
        'providerHints',
    ], 'ModelProfile');
    if (value.schemaVersion !== 1) throw new TypeError('ModelProfile.schemaVersion must be 1');
    if (value.scope !== 'player') throw new TypeError('ModelProfile.scope must be \'player\'');
    object(value.limits, 'ModelProfile.limits');
    only(value.limits, ['contextTokens', 'outputTokens'], 'ModelProfile.limits');
    let limitProvenance;
    if (value.limitProvenance !== undefined) {
        object(value.limitProvenance, 'ModelProfile.limitProvenance');
        only(value.limitProvenance, ['contextTokens', 'outputTokens'], 'ModelProfile.limitProvenance');
        limitProvenance = Object.freeze(Object.fromEntries(Object.entries(value.limitProvenance)
            .map(([key, entries]) => [key, assertDecisionProvenance(entries, 'ModelProfile.limitProvenance.' + key)])));
    }
    const tokenizer = value.tokenizer === undefined
        ? {}
        : clone(object(value.tokenizer, 'ModelProfile.tokenizer'), 'ModelProfile.tokenizer');
    const providerHints = value.providerHints === undefined
        ? {}
        : clone(object(value.providerHints, 'ModelProfile.providerHints'), 'ModelProfile.providerHints');
    assertNoSecretMaterial(tokenizer, 'ModelProfile.tokenizer');
    assertNoSecretMaterial(providerHints, 'ModelProfile.providerHints');
    return Object.freeze({
        schemaVersion: 1,
        modelProfileId: assertNativeId(value.modelProfileId, 'modelProfile', 'ModelProfile.modelProfileId'),
        scope: 'player',
        displayName: text(value.displayName, 'ModelProfile.displayName', 256),
        connectionProfileRef: assertPlayerProfileRef(
            value.connectionProfileRef,
            'connectionProfile',
            'connectionProfileId',
            'ModelProfile.connectionProfileRef',
        ),
        remoteModelId: text(value.remoteModelId, 'ModelProfile.remoteModelId', 512),
        capabilities: assertCapabilityList(value.capabilities || [], 'ModelProfile.capabilities'),
        limits: Object.freeze({
            contextTokens: integer(value.limits.contextTokens, 'ModelProfile.limits.contextTokens', { min: 1 }),
            outputTokens: integer(value.limits.outputTokens, 'ModelProfile.limits.outputTokens', { min: 1 }),
        }),
        ...(limitProvenance === undefined ? {} : { limitProvenance }),
        tokenizer,
        messageFormat: value.messageFormat === undefined
            ? {}
            : clone(object(value.messageFormat, 'ModelProfile.messageFormat'), 'ModelProfile.messageFormat'),
        providerHints,
    });
}

function assertRevisionedResourceBase(value, label, kind, idField) {
    if (value.schemaVersion !== 1) throw new TypeError(label + '.schemaVersion must be 1');
    return {
        schemaVersion: 1,
        [idField]: assertNativeId(value[idField], kind, label + '.' + idField),
        revision: token(value.revision, label + '.revision'),
        displayName: text(value.displayName, label + '.displayName', 256),
    };
}

export function assertGenerationProfile(value) {
    object(value, 'GenerationProfile');
    only(value, [
        'schemaVersion',
        'generationProfileId',
        'revision',
        'displayName',
        'sampling',
        'output',
        'reasoning',
        'stop',
        'cache',
        'streaming',
        'toolChoice',
        'providerExtensions',
        'provenance',
    ], 'GenerationProfile');
    const base = assertRevisionedResourceBase(
        value,
        'GenerationProfile',
        'generationProfile',
        'generationProfileId',
    );
    const sections = {};
    for (const key of ['sampling', 'output', 'reasoning', 'stop', 'cache', 'streaming', 'toolChoice']) {
        sections[key] = value[key] === undefined
            ? {}
            : clone(object(value[key], 'GenerationProfile.' + key), 'GenerationProfile.' + key);
        assertNoSecretMaterial(sections[key], 'GenerationProfile.' + key);
    }
    const providerExtensions = value.providerExtensions === undefined
        ? {}
        : clone(object(value.providerExtensions, 'GenerationProfile.providerExtensions'), 'GenerationProfile.providerExtensions');
    assertNoSecretMaterial(providerExtensions, 'GenerationProfile.providerExtensions');
    return Object.freeze({
        ...base,
        ...sections,
        providerExtensions,
        provenance: value.provenance === undefined
            ? []
            : freezeArray(clone(value.provenance, 'GenerationProfile.provenance')),
    });
}

const PARAMETER_TYPES = Object.freeze(['string', 'number', 'boolean', 'json']);

function assertParameterDefinitions(value, field) {
    if (value === undefined) return Object.freeze({});
    object(value, field);
    const out = {};
    for (const [name, definition] of Object.entries(value)) {
        token(name, field + ' parameter name');
        object(definition, field + '.' + name);
        only(definition, ['type', 'required', 'default', 'label', 'description', 'options'], field + '.' + name);
        if (!PARAMETER_TYPES.includes(definition.type)) {
            throw new TypeError(field + '.' + name + '.type is unsupported');
        }
        out[name] = Object.freeze({
            type: definition.type,
            required: Boolean(definition.required),
            ...Object.fromEntries(['label', 'description', 'options'].filter(key => definition[key] !== undefined).map(key => [key, clone(definition[key], field + '.' + name + '.' + key)])),
            ...(definition.default === undefined ? {} : { default: clone(definition.default, field + '.' + name + '.default') }),
        });
    }
    validatePromptParameters(out);
    return Object.freeze(out);
}

function assertCondition(value, field, depth = 0) {
    if (value === undefined || value === null) return null;
    if (depth > 16) throw new TypeError(field + ' exceeds condition depth');
    object(value, field);
    only(value, ['op', 'path', 'value', 'all', 'any', 'not'], field);
    if (['op', 'all', 'any', 'not'].filter(key => value[key] !== undefined).length !== 1) {
        throw new TypeError(field + ' must define exactly one condition');
    }
    if (value.op !== undefined) {
        only(value, ['op', 'path', 'value'], field);
        if (!['eq', 'neq', 'in', 'exists', 'gt', 'gte', 'lt', 'lte', 'contains'].includes(value.op)) throw new TypeError(field + '.op is unsupported');
        if (value.op !== 'exists' && value.value === undefined) throw new TypeError(field + '.value is required');
        return Object.freeze({
            op: value.op,
            path: text(value.path, field + '.path', 256),
            ...(value.value === undefined ? {} : { value: clone(value.value, field + '.value') }),
        });
    }
    for (const key of ['all', 'any']) {
        if (value[key] !== undefined) {
            only(value, [key], field);
            if (!Array.isArray(value[key]) || value[key].length === 0 || value[key].length > 64) {
                throw new TypeError(field + '.' + key + ' must be a non-empty array');
            }
            return Object.freeze({
                [key]: freezeArray(value[key].map((item, index) => assertCondition(item, field + '.' + key + '[' + index + ']', depth + 1))),
            });
        }
    }
    if (value.not !== undefined) {
        only(value, ['not'], field);
        return Object.freeze({ not: assertCondition(value.not, field + '.not', depth + 1) });
    }
    throw new TypeError(field + ' must define op, all, any, or not');
}

export function assertPromptModule(value) {
    object(value, 'PromptModule');
    only(value, [
        'schemaVersion',
        'promptModuleId',
        'revision',
        'displayName',
        'target',
        'stages',
        'priority',
        'condition',
        'parameters',
        'body',
        'provenance',
    ], 'PromptModule');
    const base = assertRevisionedResourceBase(value, 'PromptModule', 'promptModule', 'promptModuleId');
    const stages = uniqueStrings(value.stages || [], 'PromptModule.stages', { namespacedValues: true });
    if (stages.length === 0) throw new TypeError('PromptModule.stages must contain at least one stage');
    return Object.freeze({
        ...base,
        target: namespaced(value.target, 'PromptModule.target'),
        stages,
        priority: integer(value.priority ?? 0, 'PromptModule.priority', { min: -100000, max: 100000 }),
        condition: assertCondition(value.condition, 'PromptModule.condition'),
        parameters: assertParameterDefinitions(value.parameters, 'PromptModule.parameters'),
        body: text(value.body, 'PromptModule.body', 1024 * 1024, { allowEmpty: true }),
        provenance: value.provenance === undefined ? [] : freezeArray(clone(value.provenance, 'PromptModule.provenance')),
    });
}

function assertArtifactDefinitions(value) {
    object(value, 'PromptProgram.artifacts');
    const out = {};
    for (const [name, definition] of Object.entries(value)) {
        token(name, 'artifact name');
        object(definition, 'artifact');
        only(definition, ['type', 'stageId'], 'artifact');
        if (!PARAMETER_TYPES.includes(definition.type)) throw new TypeError('Unsupported artifact type');
        out[name] = Object.freeze({ type: definition.type, stageId: namespaced(definition.stageId, 'artifact.stageId') });
    }
    return Object.freeze(out);
}

function assertProgramStage(value, field) {
    object(value, field);
    only(value, ['stageId', 'targets', 'moduleRefs', 'condition', 'consumes'], field);
    if (!Array.isArray(value.moduleRefs)) throw new TypeError(field + '.moduleRefs must be an array');
    return Object.freeze({
        stageId: namespaced(value.stageId, field + '.stageId'),
        targets: uniqueStrings(value.targets || [], field + '.targets', { namespacedValues: true }),
        moduleRefs: freezeArray(value.moduleRefs.map(
            (item, index) => assertExactResourceRef(item, 'core.prompt-module', field + '.moduleRefs[' + index + ']'),
        )),
        condition: assertCondition(value.condition, field + '.condition'),
        ...(value.consumes === undefined ? {} : { consumes: uniqueStrings(value.consumes, field + '.consumes') }),
    });
}

function assertDeriveOperation(value, field) {
    object(value, field);
    only(value, ['op', 'moduleId', 'replacementRef', 'config'], field);
    if (!['add', 'disable', 'replace', 'configure'].includes(value.op)) {
        throw new TypeError(field + '.op is unsupported');
    }
    const output = {
        op: value.op,
        moduleId: assertNativeId(value.moduleId, 'promptModule', field + '.moduleId'),
    };
    if (value.op === 'replace' || value.op === 'add') {
        output.replacementRef = assertExactResourceRef(
            value.replacementRef,
            'core.prompt-module',
            field + '.replacementRef',
        );
    }
    if (value.op === 'configure') {
        output.config = clone(object(value.config, field + '.config'), field + '.config');
    }
    return Object.freeze(output);
}

export function assertPromptProgram(value) {
    object(value, 'PromptProgram');
    only(value, [
        'schemaVersion',
        'promptProgramId',
        'revision',
        'displayName',
        'parameters',
        'parentRef',
        'stages',
        'derive',
        'responseDirective',
        'provenance',
        'locals',
        'artifacts',
        'exclusiveTargets',
    ], 'PromptProgram');
    const base = assertRevisionedResourceBase(value, 'PromptProgram', 'promptProgram', 'promptProgramId');
    if (!Array.isArray(value.stages) || value.stages.length === 0) {
        throw new TypeError('PromptProgram.stages must contain at least one ordered stage');
    }
    const stages = value.stages.map((item, index) => assertProgramStage(item, 'PromptProgram.stages[' + index + ']'));
    const stageIds = stages.map(item => item.stageId);
    if (new Set(stageIds).size !== stageIds.length) throw new TypeError('PromptProgram.stageId values must be unique');
    return Object.freeze({
        ...base,
        parameters: assertParameterDefinitions(value.parameters, 'PromptProgram.parameters'),
        ...(value.locals === undefined ? {} : { locals: assertParameterDefinitions(value.locals, 'PromptProgram.locals') }),
        ...(value.artifacts === undefined ? {} : { artifacts: assertArtifactDefinitions(value.artifacts) }),
        ...(value.exclusiveTargets === undefined ? {} : {
            exclusiveTargets: uniqueStrings(value.exclusiveTargets, 'PromptProgram.exclusiveTargets', { namespacedValues: true }),
        }),
        parentRef: value.parentRef == null
            ? null
            : assertExactResourceRef(value.parentRef, 'core.prompt-program', 'PromptProgram.parentRef'),
        stages: freezeArray(stages),
        derive: value.derive === undefined
            ? []
            : freezeArray(value.derive.map((item, index) => assertDeriveOperation(item, 'PromptProgram.derive[' + index + ']'))),
        responseDirective: value.responseDirective === undefined
            ? {}
            : clone(object(value.responseDirective, 'PromptProgram.responseDirective'), 'PromptProgram.responseDirective'),
        provenance: value.provenance === undefined ? [] : freezeArray(clone(value.provenance, 'PromptProgram.provenance')),
    });
}

function assertRouteRef(value, routeScope, sessionId, field) {
    object(value, field);
    only(value, ['runtimeRouteId', 'scope', 'sessionId'], field);
    if (!ATRIA_RUNTIME_ROUTE_SCOPES.includes(value.scope)) throw new TypeError(field + '.scope is unsupported');
    if (routeScope === 'player' && value.scope !== 'player') {
        throw new TypeError(field + ' cannot make a player route depend on a session route');
    }
    if (value.scope === 'session') {
        const refSessionId = assertNativeId(value.sessionId, 'session', field + '.sessionId');
        if (sessionId && refSessionId !== sessionId) throw new TypeError(field + ' must reference the same session');
    } else if (value.sessionId !== undefined) {
        throw new TypeError(field + ' player ref must not carry sessionId');
    }
    return Object.freeze({
        runtimeRouteId: assertNativeId(value.runtimeRouteId, 'runtimeRoute', field + '.runtimeRouteId'),
        scope: value.scope,
        ...(value.scope === 'session' ? { sessionId: value.sessionId } : {}),
    });
}

export function assertRuntimeRoute(value) {
    object(value, 'RuntimeRoute');
    only(value, [
        'schemaVersion',
        'runtimeRouteId',
        'scope',
        'sessionId',
        'displayName',
        'role',
        'modelProfileRef',
        'connectionProfileRef',
        'generationProfileRef',
        'promptProgramRef',
        'fallbackRouteRefs',
        'promptParameters',
        'policy',
        'requirements',
    ], 'RuntimeRoute');
    if (value.schemaVersion !== 1) throw new TypeError('RuntimeRoute.schemaVersion must be 1');
    if (!ATRIA_RUNTIME_ROUTE_SCOPES.includes(value.scope)) throw new TypeError('RuntimeRoute.scope is unsupported');
    const sessionId = value.scope === 'session'
        ? assertNativeId(value.sessionId, 'session', 'RuntimeRoute.sessionId')
        : null;
    if (value.scope === 'player' && value.sessionId !== undefined) {
        throw new TypeError('Player RuntimeRoute must not carry sessionId');
    }
    object(value.policy, 'RuntimeRoute.policy');
    only(value.policy, ['timeoutMs', 'maxRetries', 'maxFallbackAttempts'], 'RuntimeRoute.policy');
    const runtimeRouteId = assertNativeId(value.runtimeRouteId, 'runtimeRoute', 'RuntimeRoute.runtimeRouteId');
    const fallbacks = (value.fallbackRouteRefs || []).map(
        (item, index) => assertRouteRef(item, value.scope, sessionId, 'RuntimeRoute.fallbackRouteRefs[' + index + ']'),
    );
    if (fallbacks.some(item => item.runtimeRouteId === runtimeRouteId)) {
        throw new TypeError('RuntimeRoute must not fall back to itself');
    }
    return Object.freeze({
        schemaVersion: 1,
        runtimeRouteId,
        scope: value.scope,
        ...(sessionId ? { sessionId } : {}),
        displayName: text(value.displayName, 'RuntimeRoute.displayName', 256),
        role: namespaced(value.role, 'RuntimeRoute.role'),
        modelProfileRef: assertPlayerProfileRef(
            value.modelProfileRef,
            'modelProfile',
            'modelProfileId',
            'RuntimeRoute.modelProfileRef',
        ),
        connectionProfileRef: assertPlayerProfileRef(
            value.connectionProfileRef,
            'connectionProfile',
            'connectionProfileId',
            'RuntimeRoute.connectionProfileRef',
        ),
        generationProfileRef: assertExactResourceRef(
            value.generationProfileRef,
            'core.generation-profile',
            'RuntimeRoute.generationProfileRef',
        ),
        promptProgramRef: assertExactResourceRef(
            value.promptProgramRef,
            'core.prompt-program',
            'RuntimeRoute.promptProgramRef',
        ),
        fallbackRouteRefs: freezeArray(fallbacks),
        ...(value.promptParameters === undefined ? {} : { promptParameters: clone(object(value.promptParameters, 'RuntimeRoute.promptParameters'), 'RuntimeRoute.promptParameters') }),
        policy: Object.freeze({
            timeoutMs: integer(value.policy.timeoutMs, 'RuntimeRoute.policy.timeoutMs', { min: 1 }),
            maxRetries: integer(value.policy.maxRetries, 'RuntimeRoute.policy.maxRetries', { min: 0, max: 20 }),
            maxFallbackAttempts: integer(
                value.policy.maxFallbackAttempts,
                'RuntimeRoute.policy.maxFallbackAttempts',
                { min: 0, max: 20 },
            ),
        }),
        requirements: uniqueStrings(value.requirements || [], 'RuntimeRoute.requirements', { namespacedValues: true }),
    });
}

function assertContextSource(value) {
    object(value, 'RequestContextPlan.source');
    if (!ATRIA_CONTEXT_SOURCE_KINDS.includes(value.kind)) {
        throw new TypeError('RequestContextPlan.source.kind is unsupported');
    }
    if (value.kind === 'session') {
        only(value, ['kind', 'sessionId', 'branchId', 'revisionId'], 'RequestContextPlan.source');
        return Object.freeze({
            kind: 'session',
            sessionId: assertNativeId(value.sessionId, 'session', 'RequestContextPlan.source.sessionId'),
            branchId: assertNativeId(value.branchId, 'branch', 'RequestContextPlan.source.branchId'),
            revisionId: assertNativeId(value.revisionId, 'revision', 'RequestContextPlan.source.revisionId'),
        });
    }
    only(value, ['kind', 'projectId', 'revision', 'taskId'], 'RequestContextPlan.source');
    return Object.freeze({
        kind: value.kind,
        projectId: assertNativeId(value.projectId, 'project', 'RequestContextPlan.source.projectId'),
        revision: token(value.revision, 'RequestContextPlan.source.revision'),
        ...(value.kind === 'task' ? { taskId: token(value.taskId, 'RequestContextPlan.source.taskId') } : {}),
    });
}

function assertProvenance(value, field) {
    if (!Array.isArray(value)) throw new TypeError(field + ' must be an array');
    return freezeArray(value.map((item, index) => {
        const entryField = field + '[' + index + ']';
        object(item, entryField);
        only(item, ['source', 'ref'], entryField);
        return Object.freeze({
            source: namespaced(item.source, entryField + '.source'),
            ...(item.ref === undefined ? {} : { ref: text(item.ref, entryField + '.ref', 512) }),
        });
    }));
}

export function assertRequestContextPlan(value) {
    object(value, 'RequestContextPlan');
    only(value, ['schemaVersion', 'requestId', 'source', 'items', 'budget', 'provenance'], 'RequestContextPlan');
    if (value.schemaVersion !== 1) throw new TypeError('RequestContextPlan.schemaVersion must be 1');
    if (!Array.isArray(value.items)) throw new TypeError('RequestContextPlan.items must be an array');
    object(value.budget, 'RequestContextPlan.budget');
    only(value.budget, ['maxTokens', 'reservedOutputTokens'], 'RequestContextPlan.budget');
    const items = value.items.map((item, index) => {
        const field = 'RequestContextPlan.items[' + index + ']';
        object(item, field);
        only(item, ['kind', 'id', 'content', 'provenance'], field);
        return Object.freeze({
            kind: namespaced(item.kind, field + '.kind'),
            ...(item.id === undefined ? {} : { id: token(item.id, field + '.id') }),
            content: clone(item.content, field + '.content'),
            provenance: assertProvenance(item.provenance || [], field + '.provenance'),
        });
    });
    return Object.freeze({
        schemaVersion: 1,
        requestId: token(value.requestId, 'RequestContextPlan.requestId'),
        source: assertContextSource(value.source),
        items: freezeArray(items),
        budget: Object.freeze({
            maxTokens: integer(value.budget.maxTokens, 'RequestContextPlan.budget.maxTokens', { min: 1 }),
            reservedOutputTokens: integer(
                value.budget.reservedOutputTokens,
                'RequestContextPlan.budget.reservedOutputTokens',
                { min: 0 },
            ),
        }),
        provenance: assertProvenance(value.provenance || [], 'RequestContextPlan.provenance'),
    });
}

export function assertPromptIR(value) {
    object(value, 'PromptIR');
    only(value, [
        'schemaVersion',
        'requestId',
        'directives',
        'contextSlots',
        'history',
        'input',
        'responseDirectives',
        'tools',
        'outputContract',
        'prefill',
        'compilation',
        'provenance',
    ], 'PromptIR');
    if (value.schemaVersion !== 1) throw new TypeError('PromptIR.schemaVersion must be 1');
    const directives = Array.isArray(value.directives)
        ? value.directives.map((item, index) => text(item, 'PromptIR.directives[' + index + ']', 1024 * 1024, { allowEmpty: true }))
        : [];
    const contextSlots = Array.isArray(value.contextSlots)
        ? value.contextSlots.map((item, index) => clone(item, 'PromptIR.contextSlots[' + index + ']'))
        : [];
    const history = Array.isArray(value.history)
        ? value.history.map((item, index) => clone(item, 'PromptIR.history[' + index + ']'))
        : [];
    const tools = Array.isArray(value.tools)
        ? value.tools.map((item, index) => clone(item, 'PromptIR.tools[' + index + ']'))
        : [];
    const outputContract = value.outputContract == null
        ? null
        : clone(object(value.outputContract, 'PromptIR.outputContract'), 'PromptIR.outputContract');
    assertNoSecretMaterial(contextSlots, 'PromptIR.contextSlots');
    assertNoSecretMaterial(history, 'PromptIR.history');
    assertNoSecretMaterial(tools, 'PromptIR.tools');
    assertNoSecretMaterial(outputContract, 'PromptIR.outputContract');
    return Object.freeze({
        schemaVersion: 1,
        requestId: token(value.requestId, 'PromptIR.requestId'),
        directives: freezeArray(directives),
        contextSlots: freezeArray(contextSlots),
        history: freezeArray(history),
        input: text(value.input ?? '', 'PromptIR.input', 4 * 1024 * 1024, { allowEmpty: true }),
        responseDirectives: Array.isArray(value.responseDirectives)
            ? freezeArray(value.responseDirectives.map(
                (item, index) => text(item, 'PromptIR.responseDirectives[' + index + ']', 1024 * 1024, { allowEmpty: true }),
            ))
            : Object.freeze([]),
        tools: freezeArray(tools),
        outputContract,
        ...(value.prefill === undefined
            ? {}
            : { prefill: text(value.prefill, 'PromptIR.prefill', 1024 * 1024, { allowEmpty: true }) }),
        provenance: assertProvenance(value.provenance || [], 'PromptIR.provenance'),
        ...(value.compilation === undefined ? {} : { compilation: clone(object(value.compilation, 'PromptIR.compilation'), 'PromptIR.compilation') }),
    });
}

export function assertEffectiveRequestSnapshot(value) {
    object(value, 'EffectiveRequestSnapshot');
    only(value, [
        'schemaVersion',
        'requestId',
        'runtimeRouteId',
        'modelProfileId',
        'connectionProfileId',
        'generationProfileRef',
        'promptProgramRef',
        'capabilities',
        'contextPlan',
        'promptIr',
        'createdAt',
        'diagnostics',
    ], 'EffectiveRequestSnapshot');
    if (value.schemaVersion !== 1) throw new TypeError('EffectiveRequestSnapshot.schemaVersion must be 1');
    assertNoSecretMaterial(value, 'EffectiveRequestSnapshot');
    const snapshot = {
        schemaVersion: 1,
        requestId: token(value.requestId, 'EffectiveRequestSnapshot.requestId'),
        runtimeRouteId: assertNativeId(value.runtimeRouteId, 'runtimeRoute', 'EffectiveRequestSnapshot.runtimeRouteId'),
        modelProfileId: assertNativeId(value.modelProfileId, 'modelProfile', 'EffectiveRequestSnapshot.modelProfileId'),
        connectionProfileId: assertNativeId(
            value.connectionProfileId,
            'connectionProfile',
            'EffectiveRequestSnapshot.connectionProfileId',
        ),
        generationProfileRef: assertExactResourceRef(
            value.generationProfileRef,
            'core.generation-profile',
            'EffectiveRequestSnapshot.generationProfileRef',
        ),
        promptProgramRef: assertExactResourceRef(
            value.promptProgramRef,
            'core.prompt-program',
            'EffectiveRequestSnapshot.promptProgramRef',
        ),
        capabilities: assertCapabilityList(value.capabilities || [], 'EffectiveRequestSnapshot.capabilities'),
        contextPlan: assertRequestContextPlan(value.contextPlan),
        promptIr: assertPromptIR(value.promptIr),
        createdAt: integer(value.createdAt, 'EffectiveRequestSnapshot.createdAt'),
        diagnostics: value.diagnostics === undefined
            ? {}
            : clone(object(value.diagnostics, 'EffectiveRequestSnapshot.diagnostics'), 'EffectiveRequestSnapshot.diagnostics'),
    };
    assertNoSecretMaterial(snapshot, 'EffectiveRequestSnapshot');
    return Object.freeze(snapshot);
}

export function serializeEffectiveRequestSnapshot(value) {
    return JSON.stringify(assertEffectiveRequestSnapshot(value));
}

function assertPackageExactRef(value, expectedType, field, packageId, packageVersionId) {
    const ref = assertExactResourceRef(value, expectedType, field);
    if (ref.scope !== 'package') throw new TypeError(field + '.scope must be \'package\'');
    if (packageId && ref.packageId !== packageId) throw new TypeError(field + ' must reference the enclosing package');
    if (packageVersionId && ref.packageVersionId !== packageVersionId) {
        throw new TypeError(field + ' must reference the enclosing PackageVersion');
    }
    return ref;
}

export function assertPackageModelPromptRuntimeMetadata(value, {
    packageId = null,
    packageVersionId = null,
} = {}) {
    object(value, 'Package.runtime.modelPrompt');
    only(value, ['schemaVersion', 'roles'], 'Package.runtime.modelPrompt');
    if (value.schemaVersion !== 1) throw new TypeError('Package.runtime.modelPrompt.schemaVersion must be 1');
    if (!Array.isArray(value.roles)) throw new TypeError('Package.runtime.modelPrompt.roles must be an array');
    const roles = value.roles.map((role, index) => {
        const field = 'Package.runtime.modelPrompt.roles[' + index + ']';
        object(role, field);
        only(role, [
            'role',
            'requiredCapabilities',
            'optionalCapabilities',
            'promptProgramRef',
            'generationProfileRef',
        ], field);
        return Object.freeze({
            role: namespaced(role.role, field + '.role'),
            requiredCapabilities: uniqueStrings(
                role.requiredCapabilities || [],
                field + '.requiredCapabilities',
                { namespacedValues: true },
            ),
            optionalCapabilities: uniqueStrings(
                role.optionalCapabilities || [],
                field + '.optionalCapabilities',
                { namespacedValues: true },
            ),
            ...(role.promptProgramRef == null ? {} : {
                promptProgramRef: assertPackageExactRef(
                    role.promptProgramRef,
                    'core.prompt-program',
                    field + '.promptProgramRef',
                    packageId,
                    packageVersionId,
                ),
            }),
            ...(role.generationProfileRef == null ? {} : {
                generationProfileRef: assertPackageExactRef(
                    role.generationProfileRef,
                    'core.generation-profile',
                    field + '.generationProfileRef',
                    packageId,
                    packageVersionId,
                ),
            }),
        });
    });
    if (new Set(roles.map(item => item.role)).size !== roles.length) {
        throw new TypeError('Package.runtime.modelPrompt role values must be unique');
    }
    return Object.freeze({
        schemaVersion: 1,
        roles: freezeArray(roles),
    });
}
