import { prepareLifetimes, validateLifetimes } from './lifetime-authority.js';
import { lifetimePolicy } from '../../public/shared/native-lifetime-contract.js';
import { prepareHistory, historySources, validateHistory } from './history-authority.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { assertJsonDeclaration, fields } from '../../public/shared/native-values.js';
import { assertTaskValue, taskId } from '../../public/shared/native-task-contract.js';
import { compileDataSchema } from '../../public/shared/native-data-schema.js';
import { simulationInstantSchema } from '../../public/shared/native-simulation-contract.js';
import { AUTHORITY_LIMITS, authorityPublicRefusal } from '../../public/shared/native-authority-contract.js';
import { projectInformation, assertInformationAnchor } from '../../public/shared/native-information-runtime.js';
import { compileFormula, evaluateFormulaAst } from '../../public/scripts/native/experience/logic/formula.js';
import { createDeterministicRng } from '../../public/scripts/native/experience/logic/rng.js';
import { createRulesEngine } from '../../public/scripts/native/experience/logic/rules.js';
import { assertNativeId } from './identity.js';
import { hashNativeDocument } from './repositories/common.js';
import { createTaskWorld } from './task-authority.js';
import { prepareLifecycle, validateLifecycle } from './lifecycle-authority.js';

// Internal preparation API only. No repository, provider, scheduler or commit
// handle is accepted. SessionCore remains the sole eventual publication owner.
export const AUTHORITY_EXECUTION_LIMITS = Object.freeze({
    valueBytes: 65536, totalValueBytes: 1048576, readBytes: 262144,
    recordScans: 4096, ruleEvaluations: 256, steps: 1024,
});
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
}
function bounded(value, maxBytes = AUTHORITY_EXECUTION_LIMITS.valueBytes) {
    return assertJsonDeclaration(value, 'Authority value', maxBytes);
}
function contractFor(base, installed = null) {
    const contract = assertNativeExperienceContract(base.manifest.runtime?.experienceContract);
    if (!contract.authorityRuntime || !contract.capabilities.some(item => item.id === 'authority-transaction' && item.version === 1)) {
        throw new TypeError('Authority capability required');
    }
    if (installed && (installed.manifest.packageId !== base.session.packageId
        || installed.manifest.packageVersionId !== base.session.packageVersionId
        || installed.entryPoint.entryPointId !== base.session.entryPointId
        || hashNativeDocument(installed.entryPoint) !== hashNativeDocument(installed.manifest.entryPoints.find(item => item.entryPointId === base.session.entryPointId))
        || hashNativeDocument(installed.manifest) !== hashNativeDocument(base.manifest))) throw new TypeError('Authority Package pin mismatch');
    return contract;
}
function snapshotAnchor(base) {
    assertNativeId(base.session.sessionId, 'session'); assertNativeId(base.session.packageVersionId, 'packageVersion');
    assertNativeId(base.revision.revisionId, 'revision'); assertNativeId(base.revision.branchId, 'branch');
    return { sessionId: base.session.sessionId, packageVersionId: base.session.packageVersionId,
        branchId: base.revision.branchId, revisionId: base.revision.revisionId };
}
function validateCandidate(base, contract) {
    for (const domain of contract.lifecycleRuntime?.domains ?? []) {
        const records = base.states.atri_lifecycle?.domains[domain.id]?.records;
        if (!Array.isArray(records) || records.some(record => record.scopeId !== domain.scopeId)) throw new TypeError('Authority record scope mismatch');
    }
    validateLifecycle({ ...base, manifest: { ...base.manifest,
        runtime: { ...base.manifest.runtime, experienceContract: contract } } });
}
function failure(operation, refusal = null) {
    // Never attach underlying formula/schema errors, private values or a cause.
    const error = new TypeError('Authority ' + operation + ' failed');
    error.code = 'AUTHORITY_PREPARATION_FAILED'; if (refusal) error.publicRefusal = refusal; return error;
}

export function buildAuthorityObservation(base) {
    try {
        const contract = contractFor(base); validateCandidate(base, contract);
        const policy = contract.authorityRuntime.intentObservation;
        const result = { schemaVersion: 1, anchor: snapshotAnchor(base), items: [], truncated: false };
        let scanned = 0;
        for (const viewId of policy.viewIds) {
            const projection = projectInformation(base, viewId, { purpose: 'display', includeRollups: false,
                onScan: count => { scanned += count; if (scanned > AUTHORITY_EXECUTION_LIMITS.recordScans) throw new TypeError('Observation scan limit'); } });
            result.truncated ||= projection.truncated;
            for (const item of projection.items) {
                const safe = bounded({ viewId, ...item });
                if (result.items.length >= policy.maxItems) { result.truncated = true; continue; }
                result.items.push(safe);
                if (bytes(result) > policy.maxBytes) { result.items.pop(); result.truncated = true; }
            }
        }
        return bounded(result, policy.maxBytes);
    } catch { throw failure('observation'); }
}

function expression(source, context) {
    return evaluateFormulaAst(compileFormula(source, { roots: Object.keys(context), strings: true }), context);
}
export function template(raw, context) {
    if (raw && typeof raw === 'object') {
        if (Object.hasOwn(raw, 'formula')) return expression(raw.formula, context);
        if (Array.isArray(raw)) return raw.map(item => template(item, context));
        return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, template(value, context)]));
    }
    return raw;
}
export function predicate(source, context) {
    const value = expression(source, context);
    if (typeof value !== 'boolean') throw new TypeError('Authority predicate must be boolean');
    return value;
}
function budgetFor(policy, rngSeed) {
    const counts = { effects: 0, worldEvents: 0, appCommands: 0, clockAdvances: 0, workflowTransitions: 0,
        readGrants: 0, readBytes: 0, valueBytes: 0, recordScans: 0, ruleEvaluations: 0, steps: 0 };
    const add = (key, amount, max) => { counts[key] += amount; if (counts[key] > max) throw new TypeError('Authority work limit'); };
    const protectedDomains = new Set();
    const context = {
        rngSeed, counts, protectedDomains, publication: false,
        step() { add('steps', 1, AUTHORITY_EXECUTION_LIMITS.steps); },
        rule() { context.step(); add('ruleEvaluations', 1, AUTHORITY_EXECUTION_LIMITS.ruleEvaluations); },
        value(value) { const safe = bounded(value); add('valueBytes', bytes(safe), AUTHORITY_EXECUTION_LIMITS.totalValueBytes); return safe; },
        effect(effect) {
            context.step(); context.value(effect); add('effects', 1, policy.maxEffects);
            const families = { 'world.event': ['worldEvents', policy.maxWorldEvents], 'app.command': ['appCommands', policy.maxAppCommands],
                'clock.advance': ['clockAdvances', AUTHORITY_LIMITS.clockAdvances], 'workflow.transition': ['workflowTransitions', AUTHORITY_LIMITS.workflowTransitions] };
            if (families[effect.kind]) add(families[effect.kind][0], 1, families[effect.kind][1]);
            else if (!['world.command', 'task'].includes(effect.kind)) throw new TypeError('Unsupported expanded authority effect');
            if (effect.kind === 'app.command' && protectedDomains.has(effect.domainId) && !context.publication) throw new TypeError('Derived output is not authority');
        },
        typed(value, schema) { return assertTaskValue(context.value(value), compileDataSchema(schema)); },
        read(records) { add('readGrants', 1, policy.maxReadGrants); add('recordScans', records, AUTHORITY_EXECUTION_LIMITS.recordScans); },
        readValue(value) { add('readBytes', bytes(context.value(value)), AUTHORITY_EXECUTION_LIMITS.readBytes); },
        validateEvents(drafts, reducers) {
            if (!Array.isArray(drafts) || counts.worldEvents + drafts.length > policy.maxWorldEvents
                || counts.effects + drafts.length > policy.maxEffects) throw new TypeError('Expanded World Event limit');
            for (const draft of drafts) {
                context.step();
                const reducer = reducers.find(item => item.type === draft.type);
                if (!reducer?.payloadSchema) throw new TypeError('Typed World Event required');
                assertTaskValue(bounded(draft.payload), compileDataSchema(reducer.payloadSchema));
            }
        },
    };
    return context;
}
export function privateReads(candidate, contract, grants, args, budget) {
    const result = {};
    for (const grant of grants) {
        const domain = contract.lifecycleRuntime.domains.find(item => item.id === grant.domainId);
        const state = candidate.states.atri_lifecycle;
        if (state.scopes[domain.scopeId]?.status !== 'active') throw new TypeError('Private read scope inactive');
        const id = taskId(template(grant.recordId, { args }));
        const records = state.domains[domain.id].records;
        budget.read(records.length);
        const record = records.find(item => item.id === id);
        if (!record || record.scopeId !== domain.scopeId) throw new TypeError('Private read unavailable');
        const selected = {};
        for (const field of grant.fields) {
            const parts = field.split('.'); let value = record.value; let output = selected;
            for (const part of parts) {
                if (!value || !Object.hasOwn(value, part)) throw new TypeError('Private field unavailable');
                value = value[part];
            }
            for (const part of parts.slice(0, -1)) { output[part] ??= {}; output = output[part]; }
            output[parts.at(-1)] = structuredClone(value);
        }
        budget.readValue(selected); result[grant.id] = selected;
    }
    return freeze(result);
}
async function applyLifecycle(candidate, installed, action, budget) {
    const prepared = await prepareLifecycle(candidate, installed, action, budget);
    Object.assign(candidate.states, prepared.states);
}
async function publications(candidate, installed, contract, logic, budget) {
    // One bounded acyclic layer, refreshed as a whole. This also accepts ordinary
    // Lifecycle/background candidates without inventing a player Transaction.
    for (const publication of logic.derivedPublications) {
        const reads = privateReads(candidate, contract, publication.reads, {}, budget);
        budget.publication = true;
        try {
            for (const effect of publication.effects) {
                if (effect.when !== undefined && !predicate(effect.when, { reads })) continue;
                const action = { kind: effect.kind, domainId: effect.domainId, commandId: effect.commandId,
                    recordId: taskId(template(effect.recordId, { reads })), args: template(effect.args, { reads }) };
                await applyLifecycle(candidate, installed, action, budget);
            }
        } finally { budget.publication = false; }
    }
}
function protectOutputs(logic, budget) {
    for (const publication of logic.derivedPublications) for (const effect of publication.effects) budget.protectedDomains.add(effect.domainId);
}

export async function createAuthorityPublicationBudget(base, installed) {
    const contract = contractFor(base, installed);
    const budget = budgetFor(contract.authorityRuntime.policy, 'derived-publication');
    const { logic } = await createTaskWorld(base, installed, null, budget);
    protectOutputs(logic, budget);
    return budget;
}

export async function prepareAuthorityPublications(base, installed, authority = null) {
    try {
        const contract = contractFor(base, installed); validateCandidate(base, contract);
        const budget = authority ?? budgetFor(contract.authorityRuntime.policy, 'derived-publication');
        const { candidate, logic } = await createTaskWorld(base, installed, null, budget);
        protectOutputs(logic, budget);
        await publications(candidate, installed, contract, logic, budget);
        validateCandidate(candidate, contract);
        return freeze({ candidate, work: { ...budget.counts } });
    } catch { throw failure('publication preparation'); }
}

async function executeTransaction(candidate, installed, contract, logic, world, transaction, input, budget, identity) {
    const args = budget.typed(input, transaction.inputSchema);
    const reads = privateReads(candidate, contract, transaction.reads, args, budget);
    for (const validator of transaction.validators) if (!predicate(validator.formula, { args, reads })) throw new TypeError('Transaction validator rejected');
    const rng = createDeterministicRng(identity);
    const resolution = transaction.resolution.kind === 'bounded_fortune' ? { roll: rng.int(1, transaction.resolution.sides) } : {};
    // Cases see only the public die, not a partially assigned outcome.
    const selected = transaction.resolution.cases.find(item => predicate(item.when, { args, reads, resolution }));
    resolution.outcome = selected?.outcome ?? transaction.resolution.fallback;
    const context = freeze({ args, reads, resolution });
    const rules = createRulesEngine(logic.rules, { onEvaluation: () => budget.rule() });
    for (const effect of transaction.effects) {
        if (effect.when !== undefined && !predicate(effect.when, context)) continue;
        if (effect.kind === 'world.event') {
            const draft = { type: effect.type, payload: template(effect.payload, context), meta: { authorityId: identity } };
            const ruled = await rules.process([draft], { beforeState: world.getState(),
                project: events => world.simulateEventsInternal(events),
                context: { transactionId: identity, args, command: { id: transaction.id }, rng } });
            await world.commitEventsInternal(ruled.events);
        } else {
            let action;
            if (effect.kind === 'app.command') action = { kind: effect.kind, domainId: effect.domainId, commandId: effect.commandId,
                recordId: taskId(template(effect.recordId, context)), args: template(effect.args, context) };
            else if (effect.kind === 'clock.advance') action = { kind: effect.kind, commandId: effect.commandId, ticks: template(effect.ticks, context), ...(effect.attention === undefined ? {} : { attention: template(effect.attention, context) }) };
            else action = { kind: effect.kind, workflowId: effect.workflowId, transitionId: effect.transitionId };
            await applyLifecycle(candidate, installed, action, budget);
        }
    }

    return resolution;
}

export async function prepareAuthorityTransaction(base, installed, rawRequest) {
    try {
        const contract = contractFor(base, installed); validateCandidate(base, contract); validateLifetimes(base, { complete: true }); validateHistory(base);
        if (contract.lifecycleRuntime && !base.states.atri_lifecycle.ready) throw new TypeError('Experience Ready Barrier required');
        const request = bounded(rawRequest);
        fields(request, ['transactionId', 'input', 'anchor', 'playerMessageId', 'ordinal'], 'Authority request');
        fields(request.anchor, ['sessionId', 'packageVersionId', 'branchId', 'revisionId'], 'Authority anchor');
        snapshotAnchor(base); assertInformationAnchor(base, request.anchor); taskId(request.transactionId);
        assertNativeId(request.playerMessageId, 'message');
        const player = base.timeline.at(-1);
        if (player?.role !== 'user' || player.messageId !== request.playerMessageId) throw new TypeError('Player anchor required');
        const ordinal = request.ordinal ?? 0;
        if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal > 63) throw new TypeError('Authority ordinal limit');
        const identity = 'at:' + hashNativeDocument({ version: 1, ...snapshotAnchor(base), entryPointId: base.session.entryPointId,
            playerMessageId: player.messageId, playerVariantId: player.activeVariantId ?? null,
            transactionId: request.transactionId, ordinal });
        // Intent/provider retries must not seed mechanics from regenerated input.
        // Keep the input fingerprint separate for C3 idempotency/conflict checks.
        const inputHash = hashNativeDocument(request.input);
        const budget = budgetFor(contract.authorityRuntime.policy, identity);
        const { candidate, logic, world } = await createTaskWorld(base, installed, null, budget);
        const transaction = logic.transactions?.find(item => item.id === request.transactionId);
        if (!transaction || transaction.origin === 'simulation') throw new TypeError('Unknown player Transaction');
        const life = base.states.atri_lifecycle?.lifetimes;
        if (life?.people[base.manifest.actors[0].actorId]?.status.kind === 'absent' && !transaction.lifetimes) throw new TypeError('Protagonist must return before acting');
        protectOutputs(logic, budget);
        const lifetimePolicyValue = lifetimePolicy(base);
        if (life && lifetimePolicyValue.actorSource) for (const effect of transaction.effects) {
            if (effect.domainId !== lifetimePolicyValue.actorSource.domainId || typeof effect.recordId !== 'string') continue;
            const binding = lifetimePolicyValue.people.find(p => p.sourceRecordId === effect.recordId);
            const person = binding && (life.people[binding.id] ?? life.archive[binding.id]);
            // A legacy action may retain historical records, but cannot re-enact a
            // living role after its holder has retired, disappeared or died.
            if (person && person.status.kind !== 'active' && effect.args?.alive !== false) throw new TypeError('Historical actor cannot resume active role');
        }
        const args = request.input;
        const resolution = await executeTransaction(candidate, installed, contract, logic, world, transaction, args, budget, identity);
        // Existing clock validation does not pump. Drain bounded due work privately
        // before projections; never dispatch queued Model Tasks in preparation.
        if (candidate.states.atri_lifecycle?.ready) await applyLifecycle(candidate, installed, { kind: 'pump' }, budget);
        const histories = (transaction.history ?? []).filter(h => h.when === undefined || predicate(h.when, { args, resolution }));
        if (histories.length > 1) throw new TypeError('Ambiguous history operation');
        const history = histories[0];
        const operation = history ? { operation: history.operation, input: template(history.input, { args, resolution }) } : null;
        const lifetimeCommands = (transaction.lifetimes ?? []).filter(h => h.when === undefined || predicate(h.when, { args, resolution }));
        if (lifetimeCommands.length > 1 || (operation && lifetimeCommands.length)) throw new TypeError('Ambiguous lifetime operation');
        const lifetime = lifetimeCommands[0];
        prepareLifetimes(base, candidate, lifetime ? { operation: lifetime.operation, input: template(lifetime.input, { args, resolution }) } : null);
        prepareHistory(base, candidate, transaction, resolution, operation);
        if (contract.lifecycleRuntime?.history) {
            const policy = contract.lifecycleRuntime.history, domains = candidate.states.atri_lifecycle.domains;
            budget.counts.historySources = historySources(candidate).length;
            budget.counts.lifetimeEvents = candidate.states.atri_lifecycle.lifetimes?.work.events ?? 0;
            budget.counts.lifetimeActors = candidate.states.atri_lifecycle.lifetimes?.work.actors ?? 0;
            budget.counts.historyRecordScans = budget.counts.historySources - policy.sources.length + policy.meaningfulDomains.reduce((n, id) => n + domains[id].records.length, 0)
                + policy.sources.reduce((n, source) => n + domains[source.domainId].records.length, 0);
            budget.counts.historyLogicalBytes = bytes(candidate.states.atri_lifecycle.history);
        }
        await publications(candidate, installed, contract, logic, budget);
        validateCandidate(candidate, contract);
        const projection = budget.typed(template(transaction.receipt.projection, { args, resolution }), transaction.receipt.schema);
        const receipt = bounded({ schemaVersion: 1, authorityId: identity, transactionId: transaction.id, verb: transaction.verb,
            anchor: request.anchor, playerMessageId: player.messageId, result: projection }, transaction.receipt.maxBytes);
        return freeze({ candidate, receipt, identity, inputHash, outcome: resolution.outcome, work: { ...budget.counts } });
    } catch (error) { throw failure('transaction preparation', authorityPublicRefusal(error)); }
}

// Server-internal system entrypoint. No caller-selected transaction or invented
// timeline entry; the required simulation declaration owns all targets/input.
export async function prepareSimulationStep(base, installed, jobId, tick, budget, targetTick = tick, requestedTick = targetTick) {
    try {
        const contract = contractFor(base, installed); validateCandidate(base, contract);
        const simulation = contract.simulationRuntime;
        const job = simulation?.jobs.find(item => item.id === jobId);
        if (!budget || !job || job.action.kind !== 'transaction' || !base.states.atri_lifecycle.ready
            || base.states.atri_lifecycle.clocks[simulation.clockId] !== tick) throw new TypeError('Invalid simulation invocation');
        const { candidate, logic, world } = await createTaskWorld(base, installed, null, budget);
        protectOutputs(logic, budget);
        const reads = privateReads(candidate, contract, job.reads, {}, budget);
        budget.typed(targetTick, simulationInstantSchema);
        budget.typed(requestedTick, simulationInstantSchema);
        if (targetTick < tick || requestedTick < targetTick) throw new TypeError('Invalid simulation target');
        const context = freeze({ reads, clock: { tick, targetTick, requestedTick } });
        if (!predicate(job.enabled, context) || budget.typed(template(job.due, context), simulationInstantSchema) > tick) throw new TypeError('Stale simulation job');
        const transaction = logic.transactions.find(item => item.id === job.action.transactionId);
        if (!transaction || transaction.origin !== 'simulation') throw new TypeError('Invalid system Transaction');
        const input = budget.typed(template(job.action.input, context), transaction.inputSchema);
        const identity = 'sim:' + hashNativeDocument({ ...snapshotAnchor(base), jobId, tick, input });
        await executeTransaction(candidate, installed, contract, logic, world, transaction, input, budget, identity);
        validateCandidate(candidate, contract);
        return candidate;
    } catch { throw failure('simulation step'); }
}
