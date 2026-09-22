import { ATRIA_PACKAGE_CAPABILITIES } from './contracts.js';
import { assertNativeId } from './identity.js';

export const ATRIA_AUTHORING_SCHEMA_VERSION = 1;
export const ATRIA_EXPERIENCE_MODES = Object.freeze(['text', 'component', 'hybrid', 'full']);
export const ATRIA_COMPONENT_MODEL_VERSION = 1;
export const ATRIA_RESOURCE_GRAPH_MODE = 'derived-readonly';
export const ATRIA_RESOURCE_AUTHORITIES = Object.freeze(['project-source', 'native-library', 'plugin-source']);
export const ATRIA_RESOURCE_CAPABILITIES = Object.freeze([
    'create',
    'read',
    'update',
    'delete',
    'attach',
    'fork',
    'publish',
    'validate',
    'generate',
    'preview',
]);
export const ATRIA_AUTHORING_ORIGINS = Object.freeze(['human', 'agent', 'plugin']);
export const ATRIA_CHANGESET_VALIDATION_STATES = Object.freeze(['pending', 'passed', 'failed']);
export const ATRIA_PROJECT_CONFLICT_CODE = 'project_revision_conflict';
export const ATRIA_RUNTIME_DESCRIPTOR_FORMAT = 'atria-native-runtime-descriptor';
export const ATRIA_RUNTIME_DESCRIPTOR_SCHEMA_VERSION = 1;
export const ATRIA_PLUGIN_FORMAT = 'atria-plugin';
export const ATRIA_PLUGIN_SCHEMA_VERSION = 1;
export const ATRIA_PLUGIN_API_VERSION = 1;
export const ATRIA_PACKAGE_RUNTIME_FORMAT = 'atria-package-runtime';
export const ATRIA_PACKAGE_RUNTIME_VERSION = 1;
export const ATRIA_NATIVE_SKILL_SCOPES = Object.freeze(['global', 'project', 'package']);

const HASH_RE = /^[a-f0-9]{64}$/;
const IDENTIFIER_RE = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9][a-z0-9_-]*)+$/;
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const JS_PATH_RE = /(?:^|[\\/])[^\\/]+\.m?js(?:$|[?#])/i;
const JS_URI_RE = /^\s*javascript:/i;
const EXECUTABLE_PACKAGE_KEYS = new Set([
    'script',
    'scripts',
    'javascript',
    'code',
    'sourceCode',
    'module',
    'modulePath',
    'entryPoint',
    'entrypoint',
    'imports',
    'import',
    'require',
    'eval',
    'worker',
]);
const RETIRED_AUTHORING_KEYS = new Set([
    'charId',
    'characterId',
    'charDir',
    'charaFilename',
    'selected_world_info',
    'swipeId',
    'swipe_id',
    'gameManifest',
    'GAME_MANIFEST_PATH',
]);

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

function string(value, field, maxLength = 4096) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(field + ' must be a non-empty string');
    }
    if (value.length > maxLength) throw new TypeError(field + ' is too long');
    return value;
}

function namespaced(value, field) {
    string(value, field, 192);
    if (!IDENTIFIER_RE.test(value)) {
        throw new TypeError(field + ' must be a namespaced lowercase identifier');
    }
    return value;
}

function token(value, field) {
    string(value, field, 256);
    if (!TOKEN_RE.test(value)) throw new TypeError(field + ' must be an opaque token');
    return value;
}

function digest(value, field) {
    if (typeof value !== 'string' || !HASH_RE.test(value)) {
        throw new TypeError(field + ' must be a lowercase SHA-256 digest');
    }
    return value;
}

function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(field + ' must be a non-negative epoch-millisecond integer');
    }
    return value;
}

function projectPath(value, field) {
    const input = string(value, field, 512);
    if (
        input.includes('\\')
        || input.includes('\0')
        || input.startsWith('/')
        || /^[A-Za-z]:/.test(input)
        || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(input)
        || input.split('/').some(segment => !segment || segment === '.' || segment === '..')
    ) {
        throw new TypeError(field + ' must be a safe project-relative path');
    }
    return input;
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
        for (const [key, item] of Object.entries(value)) {
            json(item, field + '.' + key, seen);
        }
    }
    seen.delete(value);
    return value;
}

function clone(value, field) {
    json(value, field);
    return structuredClone(value);
}

function unique(values, field, validator) {
    if (!Array.isArray(values)) throw new TypeError(field + ' must be an array');
    const output = values.map((item, index) => validator(item, field + '[' + index + ']'));
    if (new Set(output).size !== output.length) throw new TypeError(field + ' must not contain duplicates');
    return Object.freeze(output);
}

function rejectRetiredAuthority(value, field, seen = new Set()) {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => rejectRetiredAuthority(item, field + '[' + index + ']', seen));
    } else {
        for (const [key, item] of Object.entries(value)) {
            if (RETIRED_AUTHORING_KEYS.has(key)) {
                throw new TypeError(`${field} must not use retired authoring authority field '${key}'`);
            }
            rejectRetiredAuthority(item, field + '.' + key, seen);
        }
    }
    seen.delete(value);
}

function rejectExecutablePackagePayload(value, field, seen = new Set()) {
    if (typeof value === 'string') {
        if (JS_URI_RE.test(value) || JS_PATH_RE.test(value)) {
            throw new TypeError(field + ' must not reference executable JavaScript in package-runtime v1');
        }
        return;
    }
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => rejectExecutablePackagePayload(item, field + '[' + index + ']', seen));
    } else {
        for (const [key, item] of Object.entries(value)) {
            if (EXECUTABLE_PACKAGE_KEYS.has(key)) {
                throw new TypeError(`${field} must not contain executable package-runtime field '${key}'`);
            }
            rejectExecutablePackagePayload(item, field + '.' + key, seen);
        }
    }
    seen.delete(value);
}

function assertOrigin(value, field) {
    object(value, field);
    only(value, ['kind', 'id'], field);
    if (!ATRIA_AUTHORING_ORIGINS.includes(value.kind)) {
        throw new TypeError(field + '.kind is unsupported');
    }
    return Object.freeze({
        kind: value.kind,
        ...(value.id == null ? {} : { id: token(value.id, field + '.id') }),
    });
}

function assertProvider(value) {
    object(value, 'ResourceDescriptor.provider');
    only(value, ['kind', 'pluginId'], 'ResourceDescriptor.provider');
    if (value.kind === 'core') {
        if (value.pluginId !== undefined) {
            throw new TypeError('Core ResourceDescriptor provider must not carry pluginId');
        }
        return Object.freeze({ kind: 'core' });
    }
    if (value.kind !== 'plugin') {
        throw new TypeError('ResourceDescriptor.provider.kind must be core or plugin');
    }
    return Object.freeze({
        kind: 'plugin',
        pluginId: namespaced(value.pluginId, 'ResourceDescriptor.provider.pluginId'),
    });
}

function assertOperationTarget(value) {
    object(value, 'AuthoringOperation.target');
    only(value, ['resourceType', 'resourceId', 'path'], 'AuthoringOperation.target');
    const output = {};
    if (value.resourceType !== undefined) {
        output.resourceType = namespaced(value.resourceType, 'AuthoringOperation.target.resourceType');
    }
    if (value.resourceId !== undefined) {
        output.resourceId = token(value.resourceId, 'AuthoringOperation.target.resourceId');
    }
    if (value.path !== undefined) output.path = projectPath(value.path, 'AuthoringOperation.target.path');
    if (Object.keys(output).length === 0) {
        throw new TypeError('AuthoringOperation.target must identify a resource or source path');
    }
    return Object.freeze(output);
}

function assertContribution(value, field) {
    object(value, field);
    only(value, ['id', 'type', 'config'], field);
    return Object.freeze({
        id: namespaced(value.id, field + '.id'),
        type: namespaced(value.type, field + '.type'),
        config: value.config === undefined
            ? {}
            : clone(object(value.config, field + '.config'), field + '.config'),
    });
}

export function assertExperienceContract(value) {
    object(value, 'Experience');
    only(value, ['mode', 'componentModelVersion'], 'Experience');
    if (!ATRIA_EXPERIENCE_MODES.includes(value.mode)) {
        throw new TypeError('Experience.mode must be one of: ' + ATRIA_EXPERIENCE_MODES.join(', '));
    }
    if (value.mode === 'text') {
        if (value.componentModelVersion !== undefined) {
            throw new TypeError('Text Experience must not own the shared Component Model');
        }
        return Object.freeze({ mode: 'text' });
    }
    if (value.componentModelVersion !== ATRIA_COMPONENT_MODEL_VERSION) {
        throw new TypeError('Experience.componentModelVersion must be 1 for ' + value.mode);
    }
    return Object.freeze({
        mode: value.mode,
        componentModelVersion: ATRIA_COMPONENT_MODEL_VERSION,
    });
}

export function assertResourceDescriptor(value) {
    object(value, 'ResourceDescriptor');
    only(
        value,
        ['resourceType', 'displayName', 'provider', 'authority', 'capabilities', 'schema', 'editor', 'metadata'],
        'ResourceDescriptor',
    );
    rejectRetiredAuthority(value, 'ResourceDescriptor');
    if (!ATRIA_RESOURCE_AUTHORITIES.includes(value.authority)) {
        throw new TypeError('ResourceDescriptor.authority is unsupported');
    }
    const capabilities = unique(
        value.capabilities || [],
        'ResourceDescriptor.capabilities',
        (item, field) => {
            string(item, field, 128);
            if (!ATRIA_RESOURCE_CAPABILITIES.includes(item)) throw new TypeError(field + ' is unsupported');
            return item;
        },
    );
    return Object.freeze({
        resourceType: namespaced(value.resourceType, 'ResourceDescriptor.resourceType'),
        displayName: string(value.displayName, 'ResourceDescriptor.displayName', 256),
        provider: assertProvider(value.provider),
        authority: value.authority,
        capabilities,
        schema: clone(object(value.schema, 'ResourceDescriptor.schema'), 'ResourceDescriptor.schema'),
        ...(value.editor == null
            ? {}
            : { editor: clone(object(value.editor, 'ResourceDescriptor.editor'), 'ResourceDescriptor.editor') }),
        metadata: value.metadata === undefined
            ? {}
            : clone(object(value.metadata, 'ResourceDescriptor.metadata'), 'ResourceDescriptor.metadata'),
    });
}

export function assertResourceRegistryContract(value) {
    object(value, 'ResourceRegistry');
    only(value, ['schemaVersion', 'graphMode', 'descriptors'], 'ResourceRegistry');
    if (value.schemaVersion !== ATRIA_AUTHORING_SCHEMA_VERSION) {
        throw new TypeError('ResourceRegistry.schemaVersion must be 1');
    }
    if (value.graphMode !== ATRIA_RESOURCE_GRAPH_MODE) {
        throw new TypeError('ResourceRegistry.graphMode must be \'derived-readonly\'');
    }
    if (!Array.isArray(value.descriptors)) throw new TypeError('ResourceRegistry.descriptors must be an array');
    const descriptors = value.descriptors.map(assertResourceDescriptor);
    if (new Set(descriptors.map(item => item.resourceType)).size !== descriptors.length) {
        throw new TypeError('ResourceRegistry resourceType values must be unique');
    }
    return Object.freeze({
        schemaVersion: ATRIA_AUTHORING_SCHEMA_VERSION,
        graphMode: ATRIA_RESOURCE_GRAPH_MODE,
        descriptors: Object.freeze(descriptors),
    });
}

export function assertAuthoringOperation(value) {
    object(value, 'AuthoringOperation');
    only(value, ['operationId', 'operationType', 'target', 'input', 'origin'], 'AuthoringOperation');
    rejectRetiredAuthority(value, 'AuthoringOperation');
    return Object.freeze({
        operationId: token(value.operationId, 'AuthoringOperation.operationId'),
        operationType: namespaced(value.operationType, 'AuthoringOperation.operationType'),
        target: assertOperationTarget(value.target),
        input: value.input === undefined
            ? {}
            : clone(object(value.input, 'AuthoringOperation.input'), 'AuthoringOperation.input'),
        origin: assertOrigin(value.origin, 'AuthoringOperation.origin'),
    });
}

export function assertProjectRevision(value) {
    object(value, 'ProjectRevision');
    only(value, ['projectId', 'revision', 'parentRevision', 'createdAt'], 'ProjectRevision');
    return Object.freeze({
        projectId: assertNativeId(value.projectId, 'project', 'ProjectRevision.projectId'),
        revision: digest(value.revision, 'ProjectRevision.revision'),
        parentRevision: value.parentRevision == null
            ? null
            : digest(value.parentRevision, 'ProjectRevision.parentRevision'),
        ...(value.createdAt == null ? {} : { createdAt: timestamp(value.createdAt, 'ProjectRevision.createdAt') }),
    });
}

export function assertProjectRevisionConflict(value) {
    object(value, 'ProjectRevisionConflict');
    only(value, ['code', 'projectId', 'expectedRevision', 'actualRevision'], 'ProjectRevisionConflict');
    if (value.code !== ATRIA_PROJECT_CONFLICT_CODE) {
        throw new TypeError('ProjectRevisionConflict.code must be \'project_revision_conflict\'');
    }
    const expectedRevision = digest(value.expectedRevision, 'ProjectRevisionConflict.expectedRevision');
    const actualRevision = digest(value.actualRevision, 'ProjectRevisionConflict.actualRevision');
    if (expectedRevision === actualRevision) {
        throw new TypeError('ProjectRevisionConflict requires different expected and actual revisions');
    }
    return Object.freeze({
        code: ATRIA_PROJECT_CONFLICT_CODE,
        projectId: assertNativeId(value.projectId, 'project', 'ProjectRevisionConflict.projectId'),
        expectedRevision,
        actualRevision,
    });
}

export function assertAuthoringWorkspace(value) {
    object(value, 'AuthoringWorkspace');
    only(value, ['workspaceId', 'projectId', 'baseRevision', 'origin', 'operations', 'createdAt'], 'AuthoringWorkspace');
    if (!Array.isArray(value.operations)) throw new TypeError('AuthoringWorkspace.operations must be an array');
    const operations = value.operations.map(assertAuthoringOperation);
    if (new Set(operations.map(item => item.operationId)).size !== operations.length) {
        throw new TypeError('AuthoringWorkspace operationId values must be unique');
    }
    return Object.freeze({
        workspaceId: token(value.workspaceId, 'AuthoringWorkspace.workspaceId'),
        projectId: assertNativeId(value.projectId, 'project', 'AuthoringWorkspace.projectId'),
        baseRevision: digest(value.baseRevision, 'AuthoringWorkspace.baseRevision'),
        origin: assertOrigin(value.origin, 'AuthoringWorkspace.origin'),
        operations: Object.freeze(operations),
        ...(value.createdAt == null ? {} : { createdAt: timestamp(value.createdAt, 'AuthoringWorkspace.createdAt') }),
    });
}

export function assertAuthoringChangeSet(value) {
    object(value, 'ChangeSet');
    only(
        value,
        ['changeSetId', 'workspaceId', 'projectId', 'baseRevision', 'operations', 'validation', 'resultingRevision'],
        'ChangeSet',
    );
    if (!Array.isArray(value.operations) || value.operations.length === 0) {
        throw new TypeError('ChangeSet.operations must contain at least one AuthoringOperation');
    }
    const operations = value.operations.map(assertAuthoringOperation);
    if (new Set(operations.map(item => item.operationId)).size !== operations.length) {
        throw new TypeError('ChangeSet operationId values must be unique');
    }
    object(value.validation, 'ChangeSet.validation');
    only(value.validation, ['status', 'diagnostics'], 'ChangeSet.validation');
    if (!ATRIA_CHANGESET_VALIDATION_STATES.includes(value.validation.status)) {
        throw new TypeError('ChangeSet.validation.status is unsupported');
    }
    if (!Array.isArray(value.validation.diagnostics)) {
        throw new TypeError('ChangeSet.validation.diagnostics must be an array');
    }
    const diagnostics = value.validation.diagnostics.map((item, index) => {
        const field = 'ChangeSet.validation.diagnostics[' + index + ']';
        object(item, field);
        only(item, ['severity', 'code', 'message', 'resourceType', 'resourceId', 'path'], field);
        if (!['info', 'warning', 'error'].includes(item.severity)) {
            throw new TypeError(field + '.severity is unsupported');
        }
        return Object.freeze({
            severity: item.severity,
            code: namespaced(item.code, field + '.code'),
            message: string(item.message, field + '.message'),
            ...(item.resourceType == null
                ? {}
                : { resourceType: namespaced(item.resourceType, field + '.resourceType') }),
            ...(item.resourceId == null ? {} : { resourceId: token(item.resourceId, field + '.resourceId') }),
            ...(item.path == null ? {} : { path: projectPath(item.path, field + '.path') }),
        });
    });
    const resultingRevision = value.resultingRevision == null
        ? null
        : digest(value.resultingRevision, 'ChangeSet.resultingRevision');
    if (value.validation.status !== 'passed' && resultingRevision !== null) {
        throw new TypeError('Only a passed ChangeSet may publish a resultingRevision');
    }
    return Object.freeze({
        changeSetId: token(value.changeSetId, 'ChangeSet.changeSetId'),
        workspaceId: token(value.workspaceId, 'ChangeSet.workspaceId'),
        projectId: assertNativeId(value.projectId, 'project', 'ChangeSet.projectId'),
        baseRevision: digest(value.baseRevision, 'ChangeSet.baseRevision'),
        operations: Object.freeze(operations),
        validation: Object.freeze({
            status: value.validation.status,
            diagnostics: Object.freeze(diagnostics),
        }),
        resultingRevision,
    });
}

export function assertNativeRuntimeDescriptor(value) {
    object(value, 'RuntimeDescriptor');
    only(
        value,
        [
            'format',
            'schemaVersion',
            'packageId',
            'packageVersionId',
            'packageContentHash',
            'entryPointId',
            'experience',
            'capabilities',
            'resources',
            'plugins',
            'skills',
        ],
        'RuntimeDescriptor',
    );
    rejectRetiredAuthority(value, 'RuntimeDescriptor');
    if (value.format !== ATRIA_RUNTIME_DESCRIPTOR_FORMAT) {
        throw new TypeError('RuntimeDescriptor.format is invalid');
    }
    if (value.schemaVersion !== ATRIA_RUNTIME_DESCRIPTOR_SCHEMA_VERSION) {
        throw new TypeError('RuntimeDescriptor.schemaVersion must be 1');
    }
    const capabilities = unique(value.capabilities || [], 'RuntimeDescriptor.capabilities', (item, field) => {
        string(item, field, 128);
        if (!ATRIA_PACKAGE_CAPABILITIES.includes(item)) throw new TypeError(field + ' is not a Package capability');
        return item;
    });
    if (!Array.isArray(value.resources) || !Array.isArray(value.plugins) || !Array.isArray(value.skills)) {
        throw new TypeError('RuntimeDescriptor resources/plugins/skills must be arrays');
    }
    const resources = value.resources.map((item, index) => {
        const field = 'RuntimeDescriptor.resources[' + index + ']';
        object(item, field);
        only(item, ['resourceType', 'resourceId', 'revision'], field);
        return Object.freeze({
            resourceType: namespaced(item.resourceType, field + '.resourceType'),
            resourceId: token(item.resourceId, field + '.resourceId'),
            ...(item.revision == null ? {} : { revision: token(item.revision, field + '.revision') }),
        });
    });
    return Object.freeze({
        format: ATRIA_RUNTIME_DESCRIPTOR_FORMAT,
        schemaVersion: ATRIA_RUNTIME_DESCRIPTOR_SCHEMA_VERSION,
        packageId: assertNativeId(value.packageId, 'package', 'RuntimeDescriptor.packageId'),
        packageVersionId: assertNativeId(value.packageVersionId, 'packageVersion', 'RuntimeDescriptor.packageVersionId'),
        packageContentHash: digest(value.packageContentHash, 'RuntimeDescriptor.packageContentHash'),
        entryPointId: assertNativeId(value.entryPointId, 'entryPoint', 'RuntimeDescriptor.entryPointId'),
        experience: assertExperienceContract(value.experience),
        capabilities,
        resources: Object.freeze(resources),
        plugins: unique(value.plugins, 'RuntimeDescriptor.plugins', namespaced),
        skills: unique(value.skills, 'RuntimeDescriptor.skills', token),
    });
}

export function assertPackageRuntimeV1(value) {
    object(value, 'PackageRuntimeV1');
    only(value, ['format', 'version', 'execution', 'capabilities', 'contributions', 'config'], 'PackageRuntimeV1');
    if (value.format !== ATRIA_PACKAGE_RUNTIME_FORMAT) throw new TypeError('PackageRuntimeV1.format is invalid');
    if (value.version !== ATRIA_PACKAGE_RUNTIME_VERSION) throw new TypeError('PackageRuntimeV1.version must be 1');
    if (value.execution !== 'declarative') {
        throw new TypeError('PackageRuntimeV1.execution must be \'declarative\'');
    }
    if (!Array.isArray(value.contributions)) throw new TypeError('PackageRuntimeV1.contributions must be an array');
    rejectExecutablePackagePayload(value, 'PackageRuntimeV1');
    return Object.freeze({
        format: ATRIA_PACKAGE_RUNTIME_FORMAT,
        version: ATRIA_PACKAGE_RUNTIME_VERSION,
        execution: 'declarative',
        capabilities: unique(value.capabilities || [], 'PackageRuntimeV1.capabilities', namespaced),
        contributions: Object.freeze(
            value.contributions.map((item, index) => assertContribution(item, 'PackageRuntimeV1.contributions[' + index + ']')),
        ),
        config: value.config === undefined
            ? {}
            : clone(object(value.config, 'PackageRuntimeV1.config'), 'PackageRuntimeV1.config'),
    });
}

export function assertAtriaPluginContract(value) {
    object(value, 'AtriaPlugin');
    only(
        value,
        [
            'format',
            'schemaVersion',
            'apiVersion',
            'pluginId',
            'displayName',
            'version',
            'permissions',
            'host',
            'packageRuntime',
            'contributions',
            'metadata',
        ],
        'AtriaPlugin',
    );
    rejectRetiredAuthority(value, 'AtriaPlugin');
    if (
        value.format !== ATRIA_PLUGIN_FORMAT
        || value.schemaVersion !== ATRIA_PLUGIN_SCHEMA_VERSION
        || value.apiVersion !== ATRIA_PLUGIN_API_VERSION
    ) {
        throw new TypeError('AtriaPlugin format/schema/api version is unsupported');
    }
    if (!Array.isArray(value.contributions)) throw new TypeError('AtriaPlugin.contributions must be an array');
    let host;
    if (value.host != null) {
        object(value.host, 'AtriaPlugin.host');
        only(value.host, ['entrypoint', 'capabilities'], 'AtriaPlugin.host');
        host = Object.freeze({
            entrypoint: projectPath(value.host.entrypoint, 'AtriaPlugin.host.entrypoint'),
            capabilities: unique(value.host.capabilities || [], 'AtriaPlugin.host.capabilities', namespaced),
        });
    }
    const packageRuntime = value.packageRuntime == null
        ? undefined
        : assertPackageRuntimeV1(value.packageRuntime);
    const contributions = value.contributions.map(
        (item, index) => assertContribution(item, 'AtriaPlugin.contributions[' + index + ']'),
    );
    if (!host && !packageRuntime && contributions.length === 0) {
        throw new TypeError('AtriaPlugin must provide host runtime, package runtime, or contributions');
    }
    return Object.freeze({
        format: ATRIA_PLUGIN_FORMAT,
        schemaVersion: ATRIA_PLUGIN_SCHEMA_VERSION,
        apiVersion: ATRIA_PLUGIN_API_VERSION,
        pluginId: namespaced(value.pluginId, 'AtriaPlugin.pluginId'),
        displayName: string(value.displayName, 'AtriaPlugin.displayName', 256),
        version: string(value.version, 'AtriaPlugin.version', 128),
        permissions: unique(value.permissions || [], 'AtriaPlugin.permissions', namespaced),
        ...(host ? { host } : {}),
        ...(packageRuntime ? { packageRuntime } : {}),
        contributions: Object.freeze(contributions),
        metadata: value.metadata === undefined
            ? {}
            : clone(object(value.metadata, 'AtriaPlugin.metadata'), 'AtriaPlugin.metadata'),
    });
}

export function assertNativeSkillScope(value) {
    object(value, 'NativeSkillScope');
    only(value, ['skillId', 'scope', 'projectId', 'packageId', 'packageVersionId'], 'NativeSkillScope');
    if (!ATRIA_NATIVE_SKILL_SCOPES.includes(value.scope)) {
        throw new TypeError('NativeSkillScope.scope is unsupported');
    }
    const base = {
        skillId: token(value.skillId, 'NativeSkillScope.skillId'),
        scope: value.scope,
    };
    if (value.scope === 'global') {
        if (
            value.projectId !== undefined
            || value.packageId !== undefined
            || value.packageVersionId !== undefined
        ) {
            throw new TypeError('Global NativeSkillScope must not carry project/package identity');
        }
        return Object.freeze(base);
    }
    if (value.scope === 'project') {
        if (value.packageId !== undefined || value.packageVersionId !== undefined) {
            throw new TypeError('Project NativeSkillScope must not carry package identity');
        }
        return Object.freeze({
            ...base,
            projectId: assertNativeId(value.projectId, 'project', 'NativeSkillScope.projectId'),
        });
    }
    if (value.projectId !== undefined) {
        throw new TypeError('Package NativeSkillScope must not carry project identity');
    }
    return Object.freeze({
        ...base,
        packageId: assertNativeId(value.packageId, 'package', 'NativeSkillScope.packageId'),
        packageVersionId: assertNativeId(
            value.packageVersionId,
            'packageVersion',
            'NativeSkillScope.packageVersionId',
        ),
    });
}
