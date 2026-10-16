import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { withRuntimeWrite } from '../model-prompt-runtime/runtime-write.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { createNativeId, assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable, withNativeResourceWrites } from '../repositories/common.js';
import { assertPlanDefinition, assertSourceSelector, assertPlanRef, assertDigest, assertCounter, assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { assertPlanStrategyTarget, assertPlanEvolutionMetadata, planBindingIdentity, planStrategyField, planDeclarationKey, planEvolutionCommandId } from './plan-evolution-contracts.js';

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

    async #strategySource(tx, handle, target) {
        assertPlanStrategyTarget(target);
        const binding = (await checkedRecord(tx, key(K.orchestrationBinding, handle, { bindingId: target.bindingId })))?.doc;
        if (!binding) throw new NotFoundError('orchestration_binding');
        assertSourceSelector(binding.sourceSelector);
        if (binding.bindingId !== target.bindingId || hashNativeDocument(binding.sourceSelector) !== target.bindingId || binding.changedBy?.handle !== handle)
            throw new TypeError('Invalid native Plan binding identity');
        await this.authorize({ handle, operation: 'bindings.get', body: { sourceSelector: binding.sourceSelector }, tx });
        const plan = await this.#revision(tx, handle, target.planRef);
        if (!plan.definition.nodes.some(node => node.nodeId === target.nodeId)) throw new TypeError('Plan target node is missing');
        return { binding, plan };
    }

    async captureStrategy(handle, target) {
        return this.engine.withTransaction(handle, async tx => {
            const { binding, plan } = await this.#strategySource(tx, handle, target);
            if (binding.version !== target.expectedBindingVersion || hashNativeDocument(binding.planRef) !== hashNativeDocument(target.planRef))
                throw new ConflictError('native_orchestration_evolution_binding_stale');
            const { doc } = await this.#root(tx, key(K.orchestrationPlan, handle, { planId: target.planRef.planId }));
            const declaration = doc.evolution?.declarations.find(item => planDeclarationKey(item.target) === planDeclarationKey(target)) ?? null;
            const report = await this.#validate(handle, tx, { ...doc, definition: plan.definition, dependencyPins: plan.dependencyPins, definitionHash: plan.definitionHash });
            if (report.status !== 'valid') throw new ConflictError('native_orchestration_evolution_dependency_stale');
            return { target: cloneNativeDocument(target), base: planBindingIdentity(binding), declaration,
                body: plan.definition.limits[planStrategyField(target)], field: target.fieldPath, mechanismDigest: report.dependencyDigest };
        });
    }

    async strategyBinding(handle, target) {
        return this.engine.withTransaction(handle, async tx => planBindingIdentity((await this.#strategySource(tx, handle, target)).binding));
    }

    async declareStrategy(handle, target) {
        const capture = await this.captureStrategy(handle, target), commandId = planEvolutionCommandId('declare', hashNativeDocument(target));
        return this.#command(handle, commandId, 'plans.evolution.declare', { target }, [target.planRef.planId], async (tx, { target }) => {
            const current = await this.captureStrategy(handle, target);
            if (hashNativeDocument(current.base) !== hashNativeDocument(capture.base)) throw new ConflictError('native_orchestration_evolution_binding_stale');
            const resourceKey = key(K.orchestrationPlan, handle, { planId: target.planRef.planId }), record = await this.#root(tx, resourceKey);
            const declaration = { target, binding: current.base }, evolution = cloneNativeDocument(record.doc.evolution ?? { declarations: [], candidates: [] });
            evolution.declarations = [...evolution.declarations.filter(item => planDeclarationKey(item.target) !== planDeclarationKey(target)), declaration];
            assertPlanEvolutionMetadata(evolution);
            await putMutable(tx, resourceKey, { ...record.doc, evolution }, { expectedIntegrity: record.integrity }); return declaration;
        });
    }

    async prepareStrategy(handle, target, value) {
        const capture = await this.captureStrategy(handle, target), field = planStrategyField(target);
        assertCounter(value, 'candidate limit', ['maxSteps', 'maxAttempts', 'deadlineMs'].includes(field) ? 1 : 0);
        if (value >= capture.body || hashNativeDocument(capture.declaration) !== hashNativeDocument({ target, binding: capture.base }))
            throw new ConflictError('native_orchestration_evolution_declaration_required');
        const seed = { schemaVersion: 1, target, baseBinding: capture.base,
            diff: { field: target.fieldPath, before: capture.body, after: value }, declarationDigest: hashNativeDocument(capture.declaration) };
        const candidateId = hashNativeDocument(seed), commandId = planEvolutionCommandId('prepare', candidateId);
        return this.#command(handle, commandId, 'plans.evolution.prepare', { target, value }, [target.planRef.planId], async (tx) => {
            const current = await this.captureStrategy(handle, target);
            if (hashNativeDocument(current) !== hashNativeDocument(capture)) throw new ConflictError('native_orchestration_evolution_binding_stale');
            const resourceKey = key(K.orchestrationPlan, handle, { planId: target.planRef.planId }), record = await this.#root(tx, resourceKey);
            const base = await this.#revision(tx, handle, target.planRef), definition = cloneNativeDocument(base.definition);
            definition.limits[field] = value;
            const definitionHash = planDefinitionHash(definition, base.dependencyPins), planRevisionId = 'oprev_' + candidateId.slice(0, 32);
            const report = await this.#validate(handle, tx, { ...record.doc, definition, dependencyPins: base.dependencyPins, definitionHash });
            if (report.status !== 'valid') throw new ConflictError('native_orchestration_validation_stale');
            const revision = { schemaVersion: 1, planId: base.planId, planRevisionId, definition, dependencyPins: base.dependencyPins,
                definitionHash, authorRef: { handle }, validationDigest: validationDigest(report), publishedAt: this.now() };
            const candidate = { ...seed, candidateId, planRef: { planId: base.planId, planRevisionId, definitionHash } };
            const evolution = { ...record.doc.evolution, candidates: [...record.doc.evolution.candidates, candidate] };
            assertPlanEvolutionMetadata(evolution);
            await putImmutable(tx, key(K.orchestrationRevision, handle, { planId: base.planId, planRevisionId }), revision);
            await putMutable(tx, resourceKey, { ...record.doc, evolution }, { expectedIntegrity: record.integrity }); return candidate;
        });
    }

    async checkStrategy(handle, target, candidateId, { rollback = false } = {}) {
        return this.engine.withTransaction(handle, async tx => {
            const { binding, plan } = await this.#strategySource(tx, handle, target);
            const record = await this.#root(tx, key(K.orchestrationPlan, handle, { planId: target.planRef.planId }));
            const candidate = record.doc.evolution?.candidates.find(item => item.candidateId === candidateId);
            if (!candidate || hashNativeDocument(candidate.target) !== hashNativeDocument(target)) throw new NotFoundError('orchestration_plan_candidate');
            const declaration = record.doc.evolution.declarations.find(item => planDeclarationKey(item.target) === planDeclarationKey(target));
            if (!rollback && hashNativeDocument(declaration ?? null) !== candidate.declarationDigest) throw new ConflictError('native_orchestration_evolution_declaration_required');
            const expected = cloneNativeDocument(plan.definition); expected.limits[planStrategyField(target)] = candidate.diff.after;
            const revision = await this.#revision(tx, handle, candidate.planRef);
            if (!rollback) {
                const report = await this.#validate(handle, tx, { ...record.doc, definition: revision.definition, dependencyPins: revision.dependencyPins, definitionHash: revision.definitionHash });
                if (report.status !== 'valid') throw new ConflictError('native_orchestration_evolution_dependency_stale');
            }
            if (candidate.diff.before !== plan.definition.limits[planStrategyField(target)]
                || hashNativeDocument(expected) !== hashNativeDocument(revision.definition)
                || hashNativeDocument(plan.dependencyPins) !== hashNativeDocument(revision.dependencyPins)
                || hashNativeDocument(candidate.baseBinding) !== hashNativeDocument({ ...planBindingIdentity(binding), planRef: target.planRef, version: target.expectedBindingVersion }))
                throw new TypeError('Invalid native Plan candidate closure');
            const base = candidate.baseBinding, desired = { ...base, planRef: candidate.planRef, version: base.version + 1 }, current = planBindingIdentity(binding);
            const rolledBack = (await checkedRecord(tx, key(K.orchestrationCommand, handle, { commandId: planEvolutionCommandId('rollback', candidateId) })))?.doc;
            const ownedRollback = rolledBack?.operation === 'bindings.save' && rolledBack.payloadHash === hashNativeDocument({ operation: 'bindings.save', body: {
                sourceSelector: base.sourceSelector, planRef: base.planRef, expectedVersion: desired.version } })
                && hashNativeDocument(planBindingIdentity(rolledBack.outcome)) === hashNativeDocument(current);
            if (![hashNativeDocument(base), hashNativeDocument(desired)].includes(hashNativeDocument(current)) && !ownedRollback)
                throw new ConflictError('native_orchestration_evolution_binding_stale');
            return { candidate, base, desired, previous: base, actual: ownedRollback ? base : current, rolledBack: Boolean(ownedRollback) };
        });
    }

    async writeStrategy(handle, target, candidateId, { rollback = false, beforeCommit = async () => {} } = {}) {
        return withRuntimeWrite(handle, async () => {
            const checked = await this.checkStrategy(handle, target, candidateId, { rollback });
            if (checked.rolledBack && !rollback) throw new ConflictError('native_orchestration_evolution_candidate_consumed');
            const expected = rollback ? checked.desired : checked.base, desired = rollback ? checked.base : checked.desired;
            if (hashNativeDocument(checked.actual) === hashNativeDocument(desired)) return checked;
            // The original Evolution journal accepts its publication gate
            // before the bounded original Binding CAS; it is not a new grant.
            await beforeCommit();
            const current = await this.checkStrategy(handle, target, candidateId, { rollback });
            if (hashNativeDocument(current.actual) !== hashNativeDocument(expected)) throw new ConflictError('native_orchestration_evolution_binding_stale');
            return this.saveBinding(handle, planEvolutionCommandId(rollback ? 'rollback' : 'apply', candidateId), {
                sourceSelector: expected.sourceSelector, planRef: desired.planRef, expectedVersion: expected.version });
        });
    }

    async discardStrategy(handle, target, candidateId) {
        await this.strategyBinding(handle, target);
        // Published immutable revisions remain original history/GC roots.
        // Discard only removes future eligibility, never deletes a Run's Plan.
        return this.#command(handle, planEvolutionCommandId('discard', candidateId), 'plans.evolution.discard', { target, candidateId }, [target.planRef.planId], async tx => {
            await this.#strategySource(tx, handle, target);
            const current = await this.checkStrategy(handle, target, candidateId, { rollback: true });
            if (hashNativeDocument(current.actual) === hashNativeDocument(current.desired)) throw new ConflictError('native_orchestration_evolution_candidate_active');
            const resourceKey = key(K.orchestrationPlan, handle, { planId: target.planRef.planId }), record = await this.#root(tx, resourceKey);
            const evolution = { ...record.doc.evolution, candidates: record.doc.evolution.candidates.filter(item => item.candidateId !== candidateId) };
            await putMutable(tx, resourceKey, { ...record.doc, evolution }, { expectedIntegrity: record.integrity }); return { discarded: true };
        });
    }

    async #root(tx, resourceKey) {
        const record = await checkedRecord(tx, resourceKey);
        if (!record) throw new NotFoundError('orchestration_plan');
        const root = record.doc;
        assertObject(root, ['schemaVersion', 'planId', 'ownerRef', 'draftVersion', 'basePlanRevisionId', 'definition', 'dependencyPins', 'definitionHash', 'currentPlanRevisionId', 'viewState', 'archived', 'createdAt', 'updatedAt',
            ...Object.hasOwn(root, 'evolution') ? ['evolution'] : []], 'PlanRoot');
        if (Object.hasOwn(root, 'evolution')) assertPlanEvolutionMetadata(root.evolution);
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
