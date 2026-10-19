import { AgentEvolutionRepository, evolutionHash as hash, sameEvolutionValue as same } from './evolution-repository.js';
import { ContextPort } from '../orchestration/context-port.js';
import { ModelPort } from '../orchestration/model-port.js';
import { readRpOutput } from '../orchestration/rp-output-contracts.js';
import { projectStrategyBase } from './project-strategy.js';
import { ProjectTaskRepository } from './project-task-repository.js';
import { ChatRepo } from '../../storage/repositories/chat-repo.js';
import { isReadOnly } from '../../storage/read-only-mode.js';

export async function prepareEvolutionProject(host, handle, projectId) {
    if (!projectId || !host.persistence?._engine || isReadOnly()) return;
    const repository = new AgentEvolutionRepository({ engine: host.persistence._engine });
    const docs = (await repository.list(handle)).filter(d => d.scope.domain === 'project' && d.subject === projectId);
    if (!docs.length) return;
    const { AgentEvolutionService } = await import('./evolution-service.js');
    const service = new AgentEvolutionService({ host, chatRepo: new ChatRepo({ engine: host.persistence._engine }) });
    for (const d of docs) await service.reconcile(handle, { scope: d.scope, subject: d.subject });
}

// Observations are receipts, never effective configuration or publication authority.
export async function observeEvolutionProject(host, handle, input, result) {
    const repository = new AgentEvolutionRepository({ engine: host.persistence._engine });
    const docs = (await repository.list(handle)).filter(d => d.scope.domain === 'project' && d.subject === input.projectId);
    const task = input.taskId ? await new ProjectTaskRepository({ engine: host.persistence._engine }).get(handle, input.projectId, input.taskId) : null;
    for (const doc of docs) for (const p of doc.publications.filter(p => p.status === 'published' && !p.activation)) {
        let consumed = false, origin = 'host';
        if (p.target.kind === 'project-prompt') consumed = result.snapshot.runtimeRouteId === p.target.runtimeRouteId
            && same(result.snapshot.promptProgramRef, p.desired.projectPromptBindings?.find(b => b.projectId === input.projectId)?.promptProgramRef);
        if (p.target.kind === 'project-strategy' && task?.taskId === p.target.taskId) {
            const actual = projectStrategyBase(task);
            consumed = task.strategyVersions?.activeVersionId === p.candidateId && actual.maxRepairRounds === p.desired.maxRepairRounds
                && JSON.stringify(result.snapshot.promptIr).includes(p.candidateId);
        }
        if (p.target.kind === 'skill') {
            // Skill instructions are composed by the original browser consumer.
            // Keep its provenance even when captured in a Host request snapshot.
            origin = 'client_observation';
            const text = JSON.stringify(result.snapshot.promptIr);
            consumed = text.includes(p.desired) && text.includes(p.target.name);
        }
        if (consumed) await repository.mutate(handle, doc.scope, doc.subject, d => {
            const current = d.publications.find(v => v.id === p.id);
            if (current.status === 'published' && !current.activation) current.activation = { origin, requestId: result.snapshot.requestId, snapshotHash: hash(result.snapshot), observedAt: Date.now() };
        });
    }
}
/** Capture actual Native consumption, then observe only after its original RP output closes. */
export async function prepareEvolutionRpObservation(handle, { contextPort, context, modelPort, result, runId, effectId }) {
    const consumed = await ContextPort.prototype.inspectRpSkillConsumption.call(contextPort, handle, { context });
    if (!consumed) return async () => {};
    const completion = await ModelPort.prototype.inspectResultCompletion.call(modelPort, handle, { result, runId, effectId });
    if (completion.sourceBinding.bindingDigest !== consumed.sourceBindingDigest) throw new TypeError('Native Skill consumption source mismatch');
    const { engine } = modelPort.runs;
    return async () => {
        const output = await engine.withTransaction(handle, async tx => {
            const root = await modelPort.runs.get(handle, runId);
            if (!['completed', 'partial'].includes(root.status) || root.sourceBinding.bindingDigest !== consumed.sourceBindingDigest) return null;
            const saved = await readRpOutput(tx, handle, root);
            return saved?.published.receipt.modelEffectId === effectId ? saved : null;
        });
        if (!output) return;
        const repository = new AgentEvolutionRepository({ engine });
        const docs = (await repository.list(handle)).filter(d => same(d.scope, consumed.scope));
        for (const doc of docs) for (const p of doc.publications.filter(p => p.status === 'published' && !p.activation && p.target.kind === 'skill'
            && p.receipt?.committedAt <= consumed.capturedAt)) {
            if (!consumed.pins.some(pin => pin.name === p.target.name && same(pin.scope, p.target.scope) && pin.version === p.desired)) continue;
            await repository.mutate(handle, doc.scope, doc.subject, d => {
                const current = d.publications.find(v => v.id === p.id);
                if (current?.status === 'published' && !current.activation) current.activation = { origin: 'host', runId, effectId,
                    requestId: result.generated.snapshot.requestId, contextId: consumed.contextId, modelReceiptRef: completion.receiptRef,
                    outputReceiptRef: { runId, receiptId: output.receipt.receiptId }, consumptionHash: hash({ consumed, completion }), observedAt: Date.now() };
            });
        }
    };
}
