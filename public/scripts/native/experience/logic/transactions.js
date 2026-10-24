import { resourcePath } from '../../../../shared/native-frontend-contract.js';
import { SUBJECT_ID_SCHEMA, subjectKind } from '../../../../shared/native-subject-contract.js';
import { assertRunTransactions } from '../../../../shared/native-run-contract.js';
import { LIFETIME_OPERATIONS } from '../../../../shared/native-lifetime-contract.js';
import { HISTORY_OPERATIONS } from '../../../../shared/native-history-contract.js';
import { assertSimulationTransactions } from '../../../../shared/native-simulation-contract.js';
import { compileComputationSchema } from '../../../../shared/native-computation-schema.js';
import { fields, json, text, assertJsonDeclaration } from '../../../../shared/native-values.js';
import { taskId } from '../../../../shared/native-task-contract.js';
import { assertNativeExperienceContract } from '../../../../shared/native-experience-contract.js';
import { AUTHORITY_LIMITS as LIMITS, authorityInteger as integer, authorityList as list,
    authorityReference as reference } from '../../../../shared/native-authority-contract.js';
import { BLOCKED, emptySchema, objectSchema, predicate, template, recordSelector, reads, readContext } from './bound-expressions.js';

function validators(raw, context) {
    list(raw, LIMITS.validators, validator => {
        fields(validator, ['id', 'formula', 'error'], 'Transaction validator');
        taskId(validator.id); predicate(validator.formula, context);
        if (!text(validator.error, 512)) throw new TypeError('Transaction validator requires a static error');
        return validator;
    }, 'validators');
}
function resolution(raw, context) {
    fields(raw, ['kind', 'cases', 'fallback', 'sides'], 'Transaction Resolution');
    if (!['deterministic', 'bounded_fortune'].includes(raw.kind)) throw new TypeError('Unknown Transaction Resolution policy');
    const properties = {};
    if (raw.kind === 'bounded_fortune') {
        integer(raw.sides, 2, 1000, 'Fortune sides'); properties.roll = { type: 'integer', minimum: 1, maximum: raw.sides };
    } else if (raw.sides !== undefined) throw new TypeError('Deterministic Resolution cannot declare Fortune');
    const during = { ...context, resolution: { ...emptySchema(), properties } };
    list(raw.cases, LIMITS.resolutionCases, item => {
        fields(item, ['id', 'when', 'outcome'], 'Transaction Resolution case');
        taskId(item.id); taskId(item.outcome); predicate(item.when, during); return item;
    }, 'Resolution cases');
    taskId(raw.fallback);
    properties.outcome = { type: 'string', maxLength: 64, enum: [...new Set([...raw.cases.map(item => item.outcome), raw.fallback])] };
    return { ...emptySchema(), properties };
}
function effect(raw, context, lifecycle, reducers, authority, publication = false) {
    const guard = ['when'];
    if (raw?.when !== undefined) predicate(raw.when, context);
    switch (raw?.kind) {
        case 'timeline.speech': {
            if (publication) throw new TypeError('Derived publication cannot speak');
            fields(raw, ['kind', 'subjectId', 'displayName', 'content', ...guard], 'Transaction speech');
            template(raw.subjectId, SUBJECT_ID_SCHEMA, context);
            // Public speech uses the same explicit input/public outcome boundary
            // as safe receipts; private reads and artifacts are not disclosure.
            const publicContext = { args: context.args, resolution: context.resolution };
            template(raw.displayName, { type: 'string', minLength: 1, maxLength: 256 }, publicContext);
            template(raw.content, { type: 'string', minLength: 1, maxLength: 2048 }, publicContext); break;
        }
        case 'world.event': {
            if (publication) throw new TypeError('Derived publication only supports typed App Commands');
            fields(raw, ['kind', 'type', 'payload', ...guard], 'Transaction World Event');
            if (typeof raw.type !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(raw.type) || BLOCKED.has(raw.type)) throw new TypeError('Invalid Transaction World Event type');
            const reducer = reducers.find(item => item.type === raw.type);
            if (!reducer) throw new TypeError('Unknown Transaction World Event reducer');
            template(raw.payload, objectSchema(reducer.payloadSchema), context); break;
        }
        case 'app.command': {
            fields(raw, ['kind', 'domainId', 'commandId', 'recordId', 'args', ...guard], 'Transaction App Command');
            const domain = reference(lifecycle?.domains, raw.domainId, 'effect domain');
            const command = reference(domain.commands, raw.commandId, 'App Command');
            recordSelector(raw.recordId, context); template(raw.args, objectSchema(command.argsSchema), context); break;
        }
        case 'clock.advance': {
            if (publication) throw new TypeError('Derived publication cannot advance clocks');
            fields(raw, ['kind', 'commandId', 'ticks', 'attention', ...guard], 'Transaction clock advance');
            const advance = reference(lifecycle?.advances, raw.commandId, 'clock advance');
            if (!authority.canonicalClockId || advance.clockId !== authority.canonicalClockId) throw new TypeError('Transaction requires the declared canonical clock');
            template(raw.ticks, { type: 'integer', minimum: 1, maximum: advance.maxTicks }, context); if (raw.attention !== undefined) template(raw.attention, { type: 'boolean' }, context); break;
        }
        case 'workflow.transition': {
            if (publication) throw new TypeError('Derived publication cannot transition workflows');
            fields(raw, ['kind', 'workflowId', 'transitionId', ...guard], 'Transaction workflow transition');
            const workflow = reference(lifecycle?.workflows, raw.workflowId, 'workflow');
            reference(workflow.transitions, raw.transitionId, 'workflow transition'); break;
        }
        default: throw new TypeError('Unsupported Transaction effect kind');
    }
}
function effects(raw, context, lifecycle, reducers, authority, publication = false) {
    if (!Array.isArray(raw) || raw.length > LIMITS.effects) throw new TypeError('Transaction effect list limit');
    raw.forEach(item => effect(item, context, lifecycle, reducers, authority, publication));
    return raw;
}
function budget(grants, effects, authority) {
    integer(grants, 0, authority.policy.maxReadGrants, 'read grants');
    integer(effects.length, 0, authority.policy.maxEffects, 'total effects');
    for (const [kind, max] of [['world.event', authority.policy.maxWorldEvents], ['app.command', authority.policy.maxAppCommands],
        ['clock.advance', LIMITS.clockAdvances], ['workflow.transition', LIMITS.workflowTransitions], ['timeline.speech', 8]]) {
        integer(effects.filter(item => item.kind === kind).length, 0, max, kind);
    }
}

function subjects(raw = [], context, lifecycle) {
    const properties = {};
    list(raw, 16, item => {
        fields(item, ['id', 'kind', 'worldId', 'subjectId', 'actorId', 'localRef', 'when', 'perspective'], 'Transaction Subject');
        taskId(item.id); subjectKind(item.kind);
        if (item.perspective !== undefined) taskId(item.perspective);
        if (item.worldId !== undefined && item.worldId !== null && !/^world_[a-f0-9]{32}$/.test(item.worldId)) throw new TypeError('Invalid Subject World');
        if (item.actorId !== undefined && item.actorId !== null && !/^actor_[a-f0-9]{32}$/.test(item.actorId)) throw new TypeError('Invalid Subject Actor');
        if (item.when !== undefined) predicate(item.when, context);
        if (item.subjectId !== undefined) template(item.subjectId, SUBJECT_ID_SCHEMA, context);
        if (item.localRef !== undefined) {
            fields(item.localRef, ['domainId', 'recordId'], 'Subject local reference');
            reference(lifecycle?.domains, item.localRef.domainId, 'Subject domain');
            recordSelector(item.localRef.recordId, context);
        }
        properties[item.id] = SUBJECT_ID_SCHEMA;
        return item;
    }, 'Subjects');
    return { ...emptySchema(), properties };
}

// Declaration-only IR. Nothing here reads Session state, evaluates mechanics,
// invokes commands, publishes derived records, or installs transaction handlers.
export function compileTransactionDeclarations(raw, options) {
    const contract = assertNativeExperienceContract(options.experienceContract);
    if (!contract.authorityRuntime) throw new TypeError('Game Logic v3 requires authority-transaction capability and authorityRuntime');
    const authority = contract.authorityRuntime; const lifecycle = contract.lifecycleRuntime;
    const publications = list(raw.derivedPublications, LIMITS.publications, publication => {
        fields(publication, ['id', 'reads', 'effects'], 'Derived publication'); taskId(publication.id);
        const grants = reads(publication.reads, lifecycle);
        if (!grants.length) throw new TypeError('Derived publication requires dependency reads');
        effects(publication.effects, { reads: readContext(grants) }, lifecycle, raw.reducers ?? [], authority, true);
        if (!publication.effects.length) throw new TypeError('Derived publication requires typed output');
        budget(grants.length, publication.effects, authority);
        return publication;
    }, 'derived publications');
    // A bounded single layer of rebuildable read models: no cycles, chained
    // shadow authorities or two publishers racing to own one output domain.
    const outputs = publications.flatMap(item => [...new Set(item.effects.map(effect => effect.domainId))]);
    if (new Set(outputs).size !== outputs.length) throw new TypeError('Derived publication output has multiple owners');
    if (publications.some(item => item.reads.some(read => outputs.includes(read.domainId)))) throw new TypeError('Derived publication cannot read another derived output');
    // Count the entire hook, not just each publication in isolation.
    budget(publications.reduce((sum, item) => sum + item.reads.length, 0), publications.flatMap(item => item.effects), authority);
    const transactions = list(raw.transactions, LIMITS.transactions, transaction => {
        fields(transaction, ['id', 'origin', 'verb', 'inputSchema', 'intent', 'reads', 'validators', 'resolution', 'effects', 'derivedPublications', 'receipt', 'history', 'lifetimes', 'computation', 'artifacts', 'savePointBefore', 'coalesceInput', 'subjects'], 'Transaction');
        if (transaction.savePointBefore !== undefined && typeof transaction.savePointBefore !== 'boolean') throw new TypeError('Invalid pre-choice SavePoint declaration');
        if (transaction.coalesceInput !== undefined && typeof transaction.coalesceInput !== 'boolean') throw new TypeError('Invalid input coalescing declaration');
        if (transaction.coalesceInput && (transaction.intent?.expose !== false || transaction.origin || transaction.savePointBefore)) throw new TypeError('Input coalescing requires a hidden player Transaction without pre-choice SavePoint');
        taskId(transaction.id); taskId(transaction.verb);
        if (transaction.origin !== undefined && (transaction.origin !== 'simulation' || !contract.simulationRuntime)) throw new TypeError('Unknown or undeclared Transaction origin');
        if (transaction.origin === 'simulation' && transaction.intent?.expose !== false) throw new TypeError('Simulation Transaction cannot be player-exposed');
        const input = objectSchema(transaction.inputSchema);
        fields(transaction.intent, ['expose', 'description'], 'Transaction intent');
        if (typeof transaction.intent.expose !== 'boolean' || !text(transaction.intent.description, 1024)) throw new TypeError('Invalid Transaction intent metadata');
        const grants = reads(transaction.reads, lifecycle, input);
        const artifactProperties = {};
        if (transaction.artifacts !== undefined) list(transaction.artifacts, 16, grant => {
            fields(grant, ['id', 'taskId', 'variantId', 'usageId', 'invocationId'], 'Transaction artifact');
            taskId(grant.id); taskId(grant.taskId); taskId(grant.variantId); taskId(grant.usageId);
            const task = contract.taskRuntime?.tasks.find(item => item.id === grant.taskId);
            const variant = task?.variants.find(item => item.id === grant.variantId);
            if (!variant || !task.resultPolicy.uses?.some(use => use.id === grant.usageId && ['rule_input', 'operation_proposal'].includes(use.purpose))) throw new TypeError('Undeclared Transaction artifact use');
            template(grant.invocationId, { type: 'string', maxLength: 128 }, { args: input });
            artifactProperties[grant.id] = variant.outputSchema;
            return grant;
        }, 'Transaction artifacts');
        const before = { args: input, reads: readContext(grants), artifacts: { ...emptySchema(), properties: artifactProperties } };
        validators(transaction.validators, before);
        let computed = {};
        if (transaction.computation !== undefined) {
            fields(transaction.computation, ['source', 'precondition', 'outputSchema', 'invariantSource', 'invariantContext', 'invariantReads'], 'Transaction computation');
            if (transaction.computation.precondition !== undefined && typeof transaction.computation.precondition !== 'boolean') throw new TypeError('Invalid computation precondition declaration');
            if (transaction.computation.invariantReads !== undefined) {
                list(transaction.computation.invariantReads, LIMITS.readGrants, selection => {
                    fields(selection, ['id', 'fields'], 'Invariant read selection');
                    const original = grants.find(grant => grant.id === selection.id);
                    const declaration = transaction.reads.find(grant => grant.id === selection.id);
                    if (!original || !Array.isArray(selection.fields) || selection.fields.some(field =>
                        typeof field !== 'string' || !declaration.fields.some(allowed => field === allowed || field.startsWith(allowed + '.')))) throw new TypeError('Invariant read outside original grant');
                    reads([{ ...declaration, fields: selection.fields }], lifecycle, input);
                    return selection;
                }, 'invariant reads');
            }
            if (transaction.computation.invariantContext !== undefined) {
                const allowed = ['args', 'beforeReads', 'computed', 'resolution', 'seed', 'artifacts', 'reads'];
                const selected = transaction.computation.invariantContext;
                if (!Array.isArray(selected) || selected.length > allowed.length || new Set(selected).size !== selected.length
                    || selected.some(key => !allowed.includes(key))) throw new TypeError('Invalid computation invariant context');
            }
            resourcePath(transaction.computation.source);
            if (!/\.(js|ts)$/.test(transaction.computation.source)) throw new TypeError('Computation requires exact JS/TS source');
            if (transaction.computation.invariantSource !== undefined) {
                resourcePath(transaction.computation.invariantSource);
                if (!/\.(js|ts)$/.test(transaction.computation.invariantSource)) throw new TypeError('Invariant requires exact JS/TS source');
            }
            computed = { computed: compileComputationSchema(transaction.computation.outputSchema) };
        }
        const result = resolution(transaction.resolution, { ...before, ...computed });
        const resolved = { ...before, ...computed, resolution: result };
        const context = { ...resolved, subjects: subjects(transaction.subjects, resolved, lifecycle) };
        if (transaction.subjects?.length && !transaction.effects.length) throw new TypeError('Subject admission requires Domain effects');
        if (transaction.history !== undefined) {
            if (!Array.isArray(transaction.history) || transaction.history.length > 8) throw new TypeError('History commands');
            for (const h of transaction.history) {
                fields(h, ['operation', 'input', 'when'], 'History command');
                if (!lifecycle.history || !HISTORY_OPERATIONS[h.operation] || transaction.origin === 'simulation') throw new TypeError('History command unavailable');
                template(h.input, HISTORY_OPERATIONS[h.operation], { args: input, resolution: result });
                if (h.when !== undefined) predicate(h.when, { args: input, resolution: result });
            }
        }
        if (transaction.lifetimes !== undefined) {
            if (!Array.isArray(transaction.lifetimes) || transaction.lifetimes.length > 24) throw new TypeError('Lifetime commands');
            for (const h of transaction.lifetimes) {
                fields(h, ['operation', 'input', 'when'], 'Lifetime command');
                if (!lifecycle.lifetimes || !LIFETIME_OPERATIONS[h.operation] || transaction.origin === 'simulation') throw new TypeError('Lifetime command unavailable');
                template(h.input, LIFETIME_OPERATIONS[h.operation], { args: input, resolution: result });
                if (h.when !== undefined) predicate(h.when, { args: input, resolution: result });
            }
        }
        effects(transaction.effects, context, lifecycle, raw.reducers ?? [], authority);
        if (transaction.origin === 'simulation' && transaction.effects.some(effect => effect.kind === 'timeline.speech')) throw new TypeError('Offscreen communication must use its declared Domain');
        const clockIndex = transaction.effects.findIndex(effect => effect.kind === 'clock.advance');
        if (contract.simulationRuntime && clockIndex >= 0 && transaction.effects.slice(clockIndex + 1).some(effect => effect.kind === 'world.event')) throw new TypeError('Simulation clock must follow the player World effects');
        if (transaction.effects.some(item => item.kind === 'app.command' && outputs.includes(item.domainId))) throw new TypeError('Transaction cannot write derived publication output directly');
        const selected = list(transaction.derivedPublications, LIMITS.publications, id => reference(publications, id, 'derived publication'), 'publication references');
        // A declared dependency must refresh even when an effect is conditional.
        const changed = transaction.effects.filter(item => item.kind === 'app.command').map(item => item.domainId);
        if (publications.some(item => item.reads.some(read => changed.includes(read.domainId)) && !selected.includes(item))) throw new TypeError('Transaction omits an affected derived publication');
        // Reserve for the whole hook: ordinary Lifecycle effects can also trigger
        // it. C2 must enforce these same ceilings on actual expanded execution.
        // Preconditions and compute share the same captured reads. Invariants
        // read after effects and again after simulation/publication, each using
        // the explicit selection when one is declared.
        const invariantReadCount = transaction.computation ? 2 * (transaction.computation.invariantReads?.length ?? grants.length) : 0;
        budget(grants.length + invariantReadCount + publications.reduce((sum, item) => sum + item.reads.length, 0),
            [...transaction.effects, ...publications.flatMap(item => item.effects)], authority);
        fields(transaction.receipt, ['schema', 'projection', 'maxBytes'], 'Transaction safe receipt');
        const schema = objectSchema(transaction.receipt.schema);
        integer(transaction.receipt.maxBytes, 1, authority.policy.maxReceiptBytes, 'receipt bytes');
        // No private reads, World/data root, ambient selectors or arbitrary call
        // can enter this projection. Only explicit input and public Resolution.
        template(transaction.receipt.projection, schema, { args: input, resolution: result });
        if (new TextEncoder().encode(JSON.stringify(transaction.receipt.projection)).byteLength > transaction.receipt.maxBytes) throw new TypeError('Transaction receipt template byte limit');
        return transaction;
    }, 'transactions');
    assertSimulationTransactions(contract.simulationRuntime, transactions, lifecycle);
    assertRunTransactions(contract, transactions);
    if (!transactions.length) throw new TypeError('Game Logic v3 requires Transactions');
    if (new Set(transactions.map(item => item.verb)).size !== transactions.length) throw new TypeError('Duplicate Transaction verb');
    const commandIds = new Set((raw.commands ?? []).map(item => item.id));
    if (transactions.some(item => commandIds.has(item.id) || commandIds.has(item.verb))) throw new TypeError('Transaction collides with ordinary command');
    const eventTypes = (raw.reducers ?? []).map(item => item.type);
    if (new Set(eventTypes).size !== eventTypes.length) throw new TypeError('Ambiguous Transaction World Event reducer');
    return json({ transactions, derivedPublications: publications });
}

export function assertTransactionLogicJson(raw) {
    return assertJsonDeclaration(raw, 'Transaction logic', LIMITS.declarationBytes);
}
