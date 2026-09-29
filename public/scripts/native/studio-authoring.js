import { formatShellText as formatProductText } from '../atria-shell/localization.js';
function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function defaultIdFactory() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    const random = Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32);
    return random.slice(0, 8) + '-' + random.slice(8, 12) + '-4' + random.slice(13, 16)
        + '-8' + random.slice(17, 20) + '-' + random.slice(20, 32);
}

function compactUuid(idFactory = defaultIdFactory) {
    return String(idFactory()).replaceAll('-', '').toLowerCase();
}

export function createStudioToken(prefix, idFactory = defaultIdFactory) {
    return prefix + '_' + compactUuid(idFactory);
}

export function createStudioNativeId(prefix, idFactory = defaultIdFactory) {
    return prefix + '_' + compactUuid(idFactory);
}

export function createHumanOrigin(id = 'atria.studio') {
    return Object.freeze({ kind: 'human', id });
}

export function createAuthoringOperation({
    operationType,
    target,
    input = {},
    origin = createHumanOrigin(),
    idFactory = defaultIdFactory,
}) {
    return Object.freeze({
        operationId: createStudioToken('operation', idFactory),
        operationType,
        target: cloneJson(target),
        input: cloneJson(input),
        origin: cloneJson(origin),
    });
}

export function createStudioWorkspace({
    projectId,
    baseRevision,
    operations,
    origin = createHumanOrigin(),
    idFactory = defaultIdFactory,
}) {
    if (!projectId || !baseRevision) throw new TypeError(formatProductText('Studio workspace requires projectId and baseRevision'));
    if (!Array.isArray(operations) || operations.length === 0) {
        throw new TypeError(formatProductText('Studio workspace requires at least one operation'));
    }
    return Object.freeze({
        workspaceId: createStudioToken('workspace', idFactory),
        projectId,
        baseRevision,
        origin: cloneJson(origin),
        operations: Object.freeze(operations.map(operation => Object.freeze({
            ...cloneJson(operation),
            origin: cloneJson(origin),
        }))),
    });
}

export function projectSaveOperation(projectId, source, options = {}) {
    return createAuthoringOperation({
        operationType: 'project.save',
        target: { resourceType: 'core.project', resourceId: projectId },
        input: { source: cloneJson(source) },
        ...options,
    });
}

export function sourceWriteOperation(path, content, { encoding = 'utf8', ...options } = {}) {
    return createAuthoringOperation({
        operationType: 'source.write',
        target: { path },
        input: { content, encoding },
        ...options,
    });
}

export function sourceDeleteOperation(path, options = {}) {
    return createAuthoringOperation({
        operationType: 'source.delete',
        target: { path },
        input: {},
        ...options,
    });
}

export function patchProjectSource(source, mutator) {
    const next = cloneJson(source);
    mutator(next);
    return next;
}

export function experienceFromProject(source) {
    const entryPoint = source?.package?.entryPoints?.[0] || null;
    return entryPoint?.runtime?.experience || source?.package?.runtime?.experience || { mode: 'text' };
}

export function resourceReferenceForNode(node) {
    if (!node?.resourceType || !node?.resourceId) return null;
    const scope = String(node.scope || '').split('/');
    return {
        resourceType: node.resourceType,
        resourceId: node.resourceId,
        ...(node.revision == null ? {} : { revision: node.revision }),
        ...(scope[0] === 'library' ? { scope: 'library' } : {}),
        ...(scope[0] === 'project' ? { scope: 'project', projectId: node.projectId || scope[1] } : {}),
        ...(scope[0] === 'package' ? { scope: 'package', packageId: node.packageId || scope[1], packageVersionId: node.packageVersionId || scope[2] } : {}),
    };
}
