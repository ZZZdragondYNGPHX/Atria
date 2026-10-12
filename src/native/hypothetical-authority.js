import { createHash } from 'node:crypto';
import { fields, assertJsonDeclaration } from '../../public/shared/native-values.js';
import { informationDefinition, projectInformation, assertInformationAnchor } from '../../public/shared/native-information-runtime.js';
import { prepareAuthorityTransaction, createAuthorityPublicationBudget, prepareAuthorityPublications } from './authority-transaction.js';
import { prepareWorldSimulation } from './simulation-authority.js';
import { createTaskWorld } from './task-authority.js';
import { hashNativeDocument } from './repositories/common.js';
import { immutable } from './model-prompt-runtime/execution-utils.js';

const hash = hashNativeDocument;
const snapshotHash = base => hash({ session: base.session, revision: base.revision, manifest: base.manifest, states: base.states, timeline: base.timeline, variants: base.variants ?? [] });
const byteHash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHash = installed => hash({ files: [...installed.sourceFiles].map(([path, bytes]) => [path, byteHash(bytes)]).sort(),
    assets: [...installed.assets].map(([id, bytes]) => [id, byteHash(bytes)]).sort() });
const scopeEpochs = base => Object.fromEntries(Object.entries(base.states.atri_lifecycle.scopes).map(([id, scope]) => [id, { status: scope.status, epoch: scope.epoch }]));
function display(base, viewId) {
    const view = informationDefinition(base)?.views.find(view => view.id === viewId);
    if (view?.audience !== 'player' || !view.exposure.includes('display')) throw new TypeError('Hypothetical player view denied');
    if (view.sources.some(id => base.states.atri_lifecycle.scopes[informationDefinition(base).sources.find(source => source.id === id)?.scopeId]?.status !== 'active')) throw new TypeError('Hypothetical view scope unavailable');
    const projection = projectInformation(base, viewId, { purpose: 'display', includeRollups: false });
    if (projection.availability.some(item => !item.available)) throw new TypeError('Hypothetical Actor unavailable');
    return projection;
}
function noTasks(base, candidate) {
    if (hash(base.states.atri_lifecycle.outbox) !== hash(candidate.states.atri_lifecycle.outbox)
        || hash(base.states.atri_task_results ?? null) !== hash(candidate.states.atri_task_results ?? null)) throw new TypeError('Hypothetical Task scheduling unsupported');
}

// Server-internal read preparation only. No Core, repository, proof, provider or
// publication callback is accepted; all candidates die inside this function.
export async function prepareHypothetical(base, installed, raw) {
    let request;
    try {
        request = assertJsonDeclaration(raw, 'Hypothetical request', 65536);
        fields(request, ['kind', 'viewId', 'anchor', 'transactionId', 'input', 'commandId', 'ticks'], 'Hypothetical request');
        fields(request.anchor, ['sessionId', 'packageVersionId', 'branchId', 'revisionId', 'scopeEpochs'], 'Hypothetical anchor');
    } catch { throw new TypeError('Hypothetical request invalid'); }
    assertInformationAnchor(base, request.anchor);
    const before = display(base, request.viewId), contract = base.manifest.runtime.experienceContract;
    let candidate, work;
    if (request.kind === 'transaction') {
        if (request.commandId !== undefined || request.ticks !== undefined) throw new TypeError('Hypothetical transaction input denied');
        const budget = await createAuthorityPublicationBudget(base, installed);
        const { logic } = await createTaskWorld(base, installed, null, budget);
        const transaction = logic.transactions.find(tx => tx.id === request.transactionId);
        if (!transaction || transaction.origin === 'simulation' || !transaction.intent.expose || transaction.resolution.kind !== 'deterministic'
            || transaction.effects.some(effect => ['clock.advance', 'workflow.transition', 'task'].includes(effect.kind))) throw new TypeError('Hypothetical deterministic transaction unsupported');
        const prepared = await prepareAuthorityTransaction(base, installed, { transactionId: request.transactionId, input: request.input,
            anchor: { sessionId: request.anchor.sessionId, packageVersionId: request.anchor.packageVersionId,
                branchId: request.anchor.branchId, revisionId: request.anchor.revisionId }, playerMessageId: base.timeline.at(-1)?.messageId });
        candidate = prepared.candidate; work = prepared.work;
    } else if (request.kind === 'clock.advance') {
        if (request.transactionId !== undefined || request.input !== undefined) throw new TypeError('Hypothetical clock input denied');
        const advance = contract.lifecycleRuntime.advances.find(item => item.id === request.commandId), simulation = contract.simulationRuntime;
        if (!advance || advance.clockId !== simulation?.clockId || !Number.isSafeInteger(request.ticks) || request.ticks < 1 || request.ticks > advance.maxTicks) throw new TypeError('Hypothetical declared simulation advance required');
        const budget = await createAuthorityPublicationBudget(base, installed);
        const { logic } = await createTaskWorld(base, installed, null, budget);
        if (simulation.jobs.some(job => job.action.kind === 'transaction'
            && logic.transactions.find(tx => tx.id === job.action.transactionId)?.resolution.kind !== 'deterministic')) {
            throw new TypeError('Hypothetical deterministic simulation unsupported');
        }
        budget.effect({ kind: 'clock.advance', commandId: request.commandId, ticks: request.ticks });
        candidate = await prepareWorldSimulation(base, installed, base.states.atri_lifecycle.clocks[advance.clockId] + request.ticks, budget, { admit: false });
        const prepared = await prepareAuthorityPublications(candidate, installed, budget);
        candidate = prepared.candidate; work = prepared.work;
    } else throw new TypeError('Hypothetical operation unsupported');
    noTasks(base, candidate);
    const projection = display(candidate, request.viewId), previous = new Map(before.items.map(item => [item.id, item]));
    const current = new Map(projection.items.map(item => [item.id, item]));
    const delta = [...new Set([...previous.keys(), ...current.keys()])].filter(id => hash(previous.get(id) ?? null) !== hash(current.get(id) ?? null))
        .map(id => ({ id, before: previous.get(id) ?? null, after: current.get(id) ?? null }));
    return immutable(assertJsonDeclaration({ schemaVersion: 1, kind: 'hypothetical', mode: 'deterministic', baseAnchor: before.anchor,
        operation: request.kind, viewId: request.viewId, snapshotHash: snapshotHash(base), declarationHash: hash(installed.manifest),
        sourceHash: sourceHash(installed),
        inputHash: hash(request), scopeHash: hash(scopeEpochs(base)), projection, delta, work,
        assumptions: ['Declared deterministic rules applied to this exact snapshot; no model Tasks are executed.', 'Only the selected player display view is projected.'],
        uncertainty: { modelPrediction: 'not_used', realOutcome: 'not_observed', truncated: before.truncated || projection.truncated } }, 'Hypothetical artifact', 65536));
}

// Freshness is not a publication capability. Selecting an action must still
// re-enter the original authority and obtain its own current preparation proof.
export function hypotheticalCurrent(base, installed, artifact) {
    try {
        if (artifact?.kind !== 'hypothetical' || artifact.mode !== 'deterministic') return false;
        assertInformationAnchor(base, artifact.baseAnchor);
        display(base, artifact.viewId);
        return artifact.snapshotHash === snapshotHash(base) && artifact.declarationHash === hash(installed.manifest)
            && artifact.scopeHash === hash(scopeEpochs(base))
            && artifact.sourceHash === sourceHash(installed);
    } catch { return false; }
}
