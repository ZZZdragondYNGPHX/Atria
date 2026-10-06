import { cloneNativeDocument, hashNativeDocument } from '../repositories/common.js';
import { assertNativeId } from '../identity.js';

export class EvidenceSourceError extends Error {
    constructor(status, code) {
        super(code);
        this.name = 'EvidenceSourceError';
        this.status = status;
        this.code = code;
    }
}

export function fields(value, keys, field) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]'
        || Object.keys(value).some(key => !keys.includes(key))
        || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError(`${field}: invalid fields`);
}

export function text(value, field) {
    if (typeof value !== 'string' || !value.trim() || value.length > 512) throw new TypeError(`${field}: invalid text`);
    return value;
}

function segment(value, field, allowEmpty = false) {
    if (allowEmpty && value === '') return;
    text(value, field);
    if (/[\\/\x00-\x1f]/.test(value) || value === '.' || value === '..') throw new TypeError(`${field}: unsafe segment`);
}

export function assertEvidenceScope(value) {
    const scope = cloneNativeDocument(value, 'Evidence scope');
    if (scope.domain === 'rp_chat') {
        fields(scope, ['domain', 'charDir', 'name', 'isGroup', 'groupId'], 'Chat scope');
        if (typeof scope.isGroup !== 'boolean') throw new TypeError('Chat scope: isGroup must be boolean');
        segment(scope.name, 'Chat name');
        segment(scope.charDir, 'Character directory', scope.isGroup);
        segment(scope.groupId, 'Group identity', !scope.isGroup);
        if (scope.isGroup ? scope.charDir !== '' : scope.groupId !== '') throw new TypeError('Chat scope: inconsistent group identity');
    } else if (scope.domain === 'rp_session') {
        fields(scope, ['domain', 'sessionId'], 'Session scope');
        assertNativeId(scope.sessionId, 'session');
    } else if (scope.domain === 'project') {
        fields(scope, ['domain', 'projectId'], 'Project scope');
        assertNativeId(scope.projectId, 'project');
    } else throw new TypeError('Unsupported evidence domain');
    return scope;
}

export function assertEvidenceSelector(value, scope) {
    const selector = cloneNativeDocument(value, 'Evidence selector');
    if (scope.domain === 'rp_chat') {
        fields(selector, ['kind', 'messageId', 'floor'], 'Chat selector');
        if (selector.kind !== 'message' || !Number.isSafeInteger(selector.floor) || selector.floor < 0) throw new TypeError('Invalid chat selector');
        text(selector.messageId, 'Message identity');
    } else if (scope.domain === 'rp_session' && selector.kind === 'message') {
        fields(selector, ['kind', 'messageId'], 'Session message selector');
        assertNativeId(selector.messageId, 'message');
    } else if (scope.domain === 'rp_session' && selector.kind === 'artifact') {
        fields(selector, ['kind', 'invocationId', 'grant'], 'Artifact selector');
        text(selector.invocationId, 'Invocation identity');
        fields(selector.grant, ['taskId', 'variantId', 'usageId'], 'Artifact grant');
        Object.values(selector.grant).forEach(value => text(value, 'Artifact grant identity'));
    } else if (scope.domain === 'project') {
        fields(selector, ['kind', 'taskId'], 'Project selector');
        if (selector.kind !== 'task') throw new TypeError('Invalid project selector');
        text(selector.taskId, 'Task identity');
    } else throw new TypeError('Unsupported evidence selector');
    return selector;
}

function assertAnchor(anchor, scope, selector) {
    if (scope.domain === 'rp_chat') {
        fields(anchor, ['variantId'], 'Chat anchor');
        if (!Number.isSafeInteger(anchor.variantId) || anchor.variantId < 0) throw new TypeError('Invalid chat variant');
    } else if (scope.domain === 'rp_session') {
        const keys = ['branchId', 'revisionId', 'packageVersionId'];
        fields(anchor, [...keys, ...(selector.kind === 'message' ? ['variantId'] : ['productionRevisionId'])], 'Session anchor');
        assertNativeId(anchor.branchId, 'branch');
        assertNativeId(anchor.revisionId, 'revision');
        assertNativeId(anchor.packageVersionId, 'packageVersion');
        if (selector.kind === 'message') assertNativeId(anchor.variantId, 'variant');
        else assertNativeId(anchor.productionRevisionId, 'revision');
    } else {
        fields(anchor, ['baseRevision', 'revision', 'taskHash'], 'Project anchor');
        text(anchor.baseRevision, 'Project base revision');
        text(anchor.revision, 'Project revision');
        if (!/^[a-f0-9]{64}$/.test(anchor.taskHash)) throw new TypeError('Invalid task hash');
    }
}

export function assertEvidenceSet(value) {
    const set = cloneNativeDocument(value, 'EvidenceSet');
    if (Buffer.byteLength(JSON.stringify(set)) > 65536) throw new TypeError('EvidenceSet exceeds metadata limit');
    fields(set, ['schemaVersion', 'owner', 'scope', 'references', 'integrity'], 'EvidenceSet');
    if (set.schemaVersion !== 1) throw new TypeError('Unsupported EvidenceSet schema');
    text(set.owner, 'Evidence owner');
    set.scope = assertEvidenceScope(set.scope);
    if (!Array.isArray(set.references) || !set.references.length || set.references.length > 32) throw new TypeError('EvidenceSet requires 1–32 sources');
    for (const ref of set.references) {
        fields(ref, ['selector', 'anchor', 'contentHash'], 'Evidence reference');
        ref.selector = assertEvidenceSelector(ref.selector, set.scope);
        assertAnchor(ref.anchor, set.scope, ref.selector);
        if (!/^[a-f0-9]{64}$/.test(ref.contentHash)) throw new TypeError('Invalid evidence content hash');
    }
    const identities = set.references.map(ref => hashNativeDocument(ref.selector));
    if (new Set(identities).size !== identities.length) throw new TypeError('Duplicate evidence source');
    const { integrity, ...content } = set;
    if (integrity !== hashNativeDocument(content)) throw new TypeError('EvidenceSet integrity mismatch');
    return set;
}

export function evidenceSet(owner, scope, references) {
    const content = { schemaVersion: 1, owner, scope, references };
    return assertEvidenceSet({ ...content, integrity: hashNativeDocument(content) });
}

export function evidenceBudget(value) {
    fields(value, ['maxSources', 'maxBytes', 'maxScanMessages'], 'Evidence budget');
    for (const [key, limit] of Object.entries({ maxSources: 32, maxBytes: 131072, maxScanMessages: 8192 })) {
        if (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > limit) throw new TypeError(`Invalid evidence budget ${key}`);
    }
    let scans = 0;
    let bytes = 0;
    return {
        maxSources: value.maxSources,
        scan(count) {
            scans += count;
            if (scans > value.maxScanMessages) throw new EvidenceSourceError('budget_blocked', 'evidence_scan_budget');
        },
        expand(content) {
            const size = Buffer.byteLength(JSON.stringify(content));
            if (bytes + size > value.maxBytes) throw new EvidenceSourceError('budget_blocked', 'evidence_expansion_budget');
            bytes += size;
        },
        usage: () => ({ expandedBytes: bytes, scannedMessages: scans }),
    };
}
