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

export function experienceComponentPath(source) {
    const experience = experienceFromProject(source);
    return experience?.mode === 'text' ? null : (experience.component || null);
}

export function flattenComponentTree(root) {
    const output = [];
    function visit(node, parentId = null, depth = 0, index = 0) {
        if (!node || typeof node !== 'object') return;
        output.push({ node, id: node.id, parentId, depth, index });
        const children = Array.isArray(node.children) ? node.children : [];
        children.forEach((child, childIndex) => visit(child, node.id, depth + 1, childIndex));
    }
    visit(root);
    return output;
}

export function updateComponentNode(root, componentId, updater) {
    const next = cloneJson(root);
    let found = false;
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.id === componentId) {
            const replacement = updater(cloneJson(node));
            for (const key of Object.keys(node)) delete node[key];
            Object.assign(node, cloneJson(replacement));
            found = true;
            return;
        }
        for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
    }
    visit(next);
    if (!found) throw new Error(formatProductText('Component not found: ${0}', [componentId]));
    return next;
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
