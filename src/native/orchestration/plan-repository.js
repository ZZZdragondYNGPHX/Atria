import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { withRuntimeWrite } from '../model-prompt-runtime/runtime-write.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { createNativeId, assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable, withNativeResourceWrites } from '../repositories/common.js';
import { assertPlanDefinition, assertSourceSelector, assertPlanRef, assertDigest, assertCounter, assertObject } from '../../../public/shared/native-orchestration-contracts.js';

const key = (kind, handle, fields) => ({ kind, handle, ...fields });
export const planDefinitionHash = (definition, dependencyPins) => hashNativeDocument({ schemaVersion: 1, definition, dependencyPins });
export const validationDigest = report => hashNativeDocument(Object.fromEntries(Object.entries(report).filter(([field]) => field !== 'checkedAt')));

/** Reject corruption before it can become a fresh, apparently valid CAS write. */
export async function checkedRecord(tx, resourceKey) {
    const record = await tx.getResource(resourceKey);
    if (record && hashNativeDocument(record.doc) !== record.integrity) {
        const error = new Error('Native orchestration resource integrity mismatch');
        error.code = 'native_orchestration_integrity_mismatch';
        throw error;
    }
    return record;
}

/** Same original immutable Plan authority for publication and execution pins. */
export async function readPlanRevision(tx, handle, planRef) {
    assertPlanRef(planRef);
    const record = await checkedRecord(tx, key(K.orchestrationRevision, handle, { planId: planRef.planId, planRevisionId: planRef.planRevisionId }));
    if (!record) throw new NotFoundError('orchestration_plan_revision');
    const doc = record.doc;
    assertObject(doc, ['schemaVersion', 'planId', 'planRevisionId', 'definition', 'dependencyPins', 'definitionHash', 'authorRef', 'validationDigest', 'publishedAt'], 'PlanRevision');
    assertObject(doc.authorRef, ['handle'], 'authorRef');
    if (doc.authorRef.handle !== handle) throw new TypeError('PlanRevision author mismatch');
    assertDigest(doc.validationDigest, 'validationDigest'); assertCounter(doc.publishedAt, 'publishedAt');
    if (doc.schemaVersion !== 1 || doc.planId !== planRef.planId || doc.planRevisionId !== planRef.planRevisionId
        || doc.definitionHash !== planRef.definitionHash || doc.definitionHash !== planDefinitionHash(doc.definition, doc.dependencyPins)) throw new ConflictError('native_orchestration_revision_mismatch');
    assertPlanDefinition(doc.definition, doc.dependencyPins);
    return doc;
}

/** Host-only repository; original authority adapters are mandatory, never permissive defaults. */
export class PlanRepository {
    constructor({ engine, authorize, validateDependencies, assertWriter, now = Date.now }) {
        for (const [name, callback] of Object.entries({ authorize, validateDependencies, assertWriter, now })) {
            if (typeof callback !== 'function') throw new TypeError('PlanRepository requires ' + name);
        }
        this.engine = engine;
        this.authorize = authorize;
        this.validateDependencies = validateDependencies;
        this.assertWriter = assertWriter;
        this.now = now;
    }

    async #command(handle, commandId, operation, body, resourceIds, apply) {
        assertWritable();
        assertNativeId(commandId, 'orchestrationCommand');
        const request = cloneNativeDocument({ operation, body });
        const payloadHash = hashNativeDocument(request);
        const commandKey = key(K.orchestrationCommand, handle, { commandId });
        return withRuntimeWrite(handle, () => withNativeResourceWrites(handle, [commandId, ...resourceIds], () => this.engine.withTransaction(handle, async tx => {
            assertWritable();
            await this.assertWriter(handle, tx);
            await this.authorize({ handle, operation, body: request.body, tx });
            const previous = await checkedRecord(tx, commandKey);
            if (previous) {
                if (previous.doc.payloadHash !== payloadHash) throw new ConflictError('native_orchestration_command_conflict');
                return cloneNativeDocument(previous.doc.outcome);
            }
            const outcome = await apply(tx, request.body);
            assertWritable();
            await putImmutable(tx, commandKey, { schemaVersion: 1, commandId, payloadHash, operation, target: resourceIds, outcome });
            return outcome;
        })));
    }

    async create(handle, commandId, body) {
        assertObject(body, ['definition', 'dependencyPins', 'viewState'], 'create');
        cloneNativeDocument(body);
        assertPlanDefinition(body.definition, body.dependencyPins, { draft: true });
        const planId = createNativeId('orchestrationPlan'), timestamp = this.now();
        return this.#command(handle, commandId, 'plans.create', body, [], async (tx, input) => {
            const root = {
                schemaVersion: 1, planId, ownerRef: { handle }, draftVersion: 0,
                basePlanRevisionId: null, definition: input.definition, dependencyPins: input.dependencyPins,
                definitionHash: planDefinitionHash(input.definition, input.dependencyPins), currentPlanRevisionId: null,
                viewState: input.viewState, archived: false, createdAt: timestamp, updatedAt: timestamp,
            };
            await putMutable(tx, key(K.orchestrationPlan, handle, { planId }), root, { expectedIntegrity: null });
            return root;
        });
    }

    async save(handle, commandId, body) {
        assertObject(body, ['planId', 'expectedDraftVersion', 'expectedDefinitionHash', 'definition', 'dependencyPins', 'viewState'], 'save');
        assertNativeId(body.planId, 'orchestrationPlan');
        assertCounter(body.expectedDraftVersion, 'expectedDraftVersion'); assertDigest(body.expectedDefinitionHash, 'expectedDefinitionHash');
        cloneNativeDocument(body); assertPlanDefinition(body.definition, body.dependencyPins, { draft: true });
        const timestamp = this.now();
        return this.#command(handle, commandId, 'plans.save', body, [body.planId], async (tx, input) => {
            const resourceKey = key(K.orchestrationPlan, handle, { planId: input.planId });
            const record = await this.#root(tx, resourceKey);
            const root = record.doc;
            this.#expected(root, input);
            const next = { ...root, definition: input.definition, dependencyPins: input.dependencyPins, viewState: input.viewState,
                definitionHash: planDefinitionHash(input.definition, input.dependencyPins), draftVersion: root.draftVersion + 1, updatedAt: timestamp };
            assertCounter(next.draftVersion, 'draftVersion');
            await putMutable(tx, resourceKey, next, { expectedIntegrity: record.integrity });
            return next;
        });
    }

    async validate(handle, { planId, expectedDraftVersion, expectedDefinitionHash }) {
        assertNativeId(planId, 'orchestrationPlan');
        assertCounter(expectedDraftVersion, 'expectedDraftVersion'); assertDigest(expectedDefinitionHash, 'expectedDefinitionHash');
        return this.engine.withTransaction(handle, async tx => {
            await this.authorize({ handle, operation: 'plans.validate', body: { planId }, tx });
            const { doc } = await this.#root(tx, key(K.orchestrationPlan, handle, { planId }));
            this.#expected(doc, { expectedDraftVersion, expectedDefinitionHash });
            return this.#validate(handle, tx, doc);
        });
    }

    async publish(handle, commandId, body) {
        assertObject(body, ['planId', 'expectedDraftVersion', 'expectedDefinitionHash', 'validationDigest'], 'publish');
        assertNativeId(body.planId, 'orchestrationPlan'); assertCounter(body.expectedDraftVersion, 'expectedDraftVersion');
        assertDigest(body.expectedDefinitionHash, 'expectedDefinitionHash'); assertDigest(body.validationDigest, 'validationDigest');
        const planRevisionId = createNativeId('orchestrationRevision'), timestamp = this.now();
        return this.#command(handle, commandId, 'plans.publish', body, [body.planId], async (tx, input) => {
            const resourceKey = key(K.orchestrationPlan, handle, { planId: input.planId });
            const record = await this.#root(tx, resourceKey), root = record.doc;
            this.#expected(root, input);
            const report = await this.#validate(handle, tx, root), digest = validationDigest(report);
            if (report.status !== 'valid' || digest !== input.validationDigest) throw new ConflictError('native_orchestration_validation_stale', { report });
            const revision = { schemaVersion: 1, planId: root.planId, planRevisionId, definition: root.definition, dependencyPins: root.dependencyPins,
                definitionHash: root.definitionHash, authorRef: { handle }, validationDigest: digest, publishedAt: timestamp };
            await putImmutable(tx, key(K.orchestrationRevision, handle, { planId: root.planId, planRevisionId }), revision);
            const next = { ...root, currentPlanRevisionId: planRevisionId, basePlanRevisionId: planRevisionId, draftVersion: root.draftVersion + 1, updatedAt: timestamp };
            assertCounter(next.draftVersion, 'draftVersion');
            await putMutable(tx, resourceKey, next, { expectedIntegrity: record.integrity });
            return { planRef: { planId: root.planId, planRevisionId, definitionHash: root.definitionHash }, draftVersion: next.draftVersion };
        });
    }

    async get(handle, planId) {
        assertNativeId(planId, 'orchestrationPlan');
        return this.engine.withTransaction(handle, async tx => {
            await this.authorize({ handle, operation: 'plans.get', body: { planId }, tx });
            return cloneNativeDocument((await this.#root(tx, key(K.orchestrationPlan, handle, { planId }))).doc);
        });
    }

    async list(handle, { cursor = null, limit = 50 } = {}) {
        return this.#page(handle, K.orchestrationPlan, null, cursor, limit);
    }

    async listRevisions(handle, planId, { cursor = null, limit = 50 } = {}) {
        assertNativeId(planId, 'orchestrationPlan');
        return this.#page(handle, K.orchestrationRevision, planId, cursor, limit);
    }

    async #page(handle, kind, planId, cursor, limit) {
        assertCounter(limit, 'limit', 1);
        if (limit > 100) throw new TypeError('limit must be <= 100');
        let after = '';
        if (cursor !== null) {
            try {
                if (typeof cursor !== 'string' || cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new TypeError();
                const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
                assertObject(value, ['handle', 'kind', 'planId', 'after'], 'cursor');
                if (value.handle !== handle || value.kind !== kind || value.planId !== planId) throw new TypeError();
                assertNativeId(value.after, kind === K.orchestrationPlan ? 'orchestrationPlan' : 'orchestrationRevision');
                after = value.after;
            } catch { throw new TypeError('Invalid authoring page cursor'); }
        }
        return this.engine.withTransaction(handle, async tx => {
            await this.authorize({ handle, operation: planId ? 'plans.revisions' : 'plans.list', body: { planId }, tx });
            if (planId) await this.#root(tx, key(K.orchestrationPlan, handle, { planId }));
            const idField = planId ? 'planRevisionId' : 'planId';
            const records = await tx.listResources({ kind, handle, ...(planId ? { planId } : {}) });
            records.sort((left, right) => left.key[idField].localeCompare(right.key[idField]));
            const remaining = records.filter(record => record.key[idField] > after), selected = remaining.slice(0, limit);
            const items = [];
            for (const record of selected) {
                const doc = planId ? await this.#revision(tx, handle, { planId, planRevisionId: record.key.planRevisionId, definitionHash: record.doc.definitionHash })
                    : (await this.#root(tx, record.key)).doc;
                items.push(cloneNativeDocument(doc));
            }
            return { items, cursor: remaining.length > limit ? Buffer.from(JSON.stringify({ handle, kind, planId, after: selected.at(-1).key[idField] })).toString('base64url') : null };
        });
    }

    async getRevision(handle, planRef) {
        assertPlanRef(planRef);
        return this.engine.withTransaction(handle, async tx => {
            await this.authorize({ handle, operation: 'plans.revision', body: { planRef }, tx });
            return cloneNativeDocument(await this.#revision(tx, handle, planRef));
        });
    }

    async saveBinding(handle, commandId, body) {
        assertObject(body, ['sourceSelector', 'planRef', 'expectedVersion'], 'binding');
        cloneNativeDocument(body); assertSourceSelector(body.sourceSelector); assertPlanRef(body.planRef);
        if (body.expectedVersion !== null) assertCounter(body.expectedVersion, 'expectedVersion');
        const bindingId = hashNativeDocument(body.sourceSelector), timestamp = this.now();
        return this.#command(handle, commandId, 'bindings.save', body, [bindingId, body.planRef.planId], async (tx, input) => {
            await this.#revision(tx, handle, input.planRef);
            const resourceKey = key(K.orchestrationBinding, handle, { bindingId });
            const record = await checkedRecord(tx, resourceKey);
            if ((record?.doc.version ?? null) !== input.expectedVersion) throw new ConflictError('native_orchestration_binding_conflict');
            const next = { schemaVersion: 1, bindingId, sourceSelector: input.sourceSelector, planRef: input.planRef, version: record ? record.doc.version + 1 : 0, changedBy: { handle }, changedAt: timestamp };
            assertCounter(next.version, 'binding.version');
            await putMutable(tx, resourceKey, next, { expectedIntegrity: record?.integrity ?? null });
            return next;
        });
    }

    async getBinding(handle, sourceSelector) {
        cloneNativeDocument(sourceSelector); assertSourceSelector(sourceSelector);
        return this.engine.withTransaction(handle, async tx => {
            await this.authorize({ handle, operation: 'bindings.get', body: { sourceSelector }, tx });
            const record = await checkedRecord(tx, key(K.orchestrationBinding, handle, { bindingId: hashNativeDocument(sourceSelector) }));
            return record ? cloneNativeDocument(record.doc) : null;
        });
    }

    async #root(tx, resourceKey) {
        const record = await checkedRecord(tx, resourceKey);
        if (!record) throw new NotFoundError('orchestration_plan');
        const root = record.doc;
        assertObject(root, ['schemaVersion', 'planId', 'ownerRef', 'draftVersion', 'basePlanRevisionId', 'definition', 'dependencyPins', 'definitionHash', 'currentPlanRevisionId', 'viewState', 'archived', 'createdAt', 'updatedAt'], 'PlanRoot');
        assertObject(root.ownerRef, ['handle'], 'ownerRef');
        if (typeof root.archived !== 'boolean') throw new TypeError('PlanRoot.archived must be boolean');
        for (const field of ['createdAt', 'updatedAt']) assertCounter(root[field], field);
        for (const field of ['basePlanRevisionId', 'currentPlanRevisionId']) if (root[field] !== null) assertNativeId(root[field], 'orchestrationRevision');
        if (root.schemaVersion !== 1 || root.planId !== resourceKey.planId || root.ownerRef?.handle !== resourceKey.handle
            || root.definitionHash !== planDefinitionHash(root.definition, root.dependencyPins)) throw new TypeError('Invalid PlanRoot');
        assertCounter(root.draftVersion, 'draftVersion');
        assertPlanDefinition(root.definition, root.dependencyPins, { draft: true });
        return record;
    }

    #expected(root, input) {
        if (root.archived || root.draftVersion !== input.expectedDraftVersion || root.definitionHash !== input.expectedDefinitionHash) throw new ConflictError('native_orchestration_draft_conflict');
    }

    async #revision(tx, handle, planRef) {
        return readPlanRevision(tx, handle, planRef);
    }

    async #validate(handle, tx, root) {
        try { assertPlanDefinition(root.definition, root.dependencyPins); } catch (error) {
            if (!(error instanceof TypeError)) throw error;
            return { schemaVersion: 1, planId: root.planId, draftVersion: root.draftVersion, definitionHash: root.definitionHash,
                dependencyDigest: hashNativeDocument(root.dependencyPins), status: 'invalid', checkedAt: this.now(),
                issues: [{ code: 'native_orchestration_graph_invalid', severity: 'blocking', fieldPath: error.fieldPath ?? 'definition',
                    ...(error.nodeId ? { nodeId: error.nodeId } : {}), ...(error.edgeId ? { edgeId: error.edgeId } : {}), message: error.message }] };
        }
        // This adapter is a pure original-authority read/check. It must not
        // call Providers, Tools, Secrets or wait for approvals inside the tx.
        const evidence = cloneNativeDocument(await this.validateDependencies({ handle, tx, definition: root.definition, dependencyPins: root.dependencyPins }));
        assertObject(evidence, ['status', 'issues', 'dependencyDigest'], 'dependency validation');
        if (!['valid', 'invalid', 'unknown'].includes(evidence.status) || !Array.isArray(evidence.issues)) throw new TypeError('Invalid dependency validation');
        assertDigest(evidence.dependencyDigest, 'dependencyDigest');
        if (evidence.status === 'valid' && evidence.issues.some(issue => issue.severity !== 'warning')) throw new TypeError('Valid report contains blocking issues');
        return { schemaVersion: 1, planId: root.planId, draftVersion: root.draftVersion, definitionHash: root.definitionHash,
            dependencyDigest: evidence.dependencyDigest, status: evidence.status, issues: evidence.issues, checkedAt: this.now() };
    }
}
