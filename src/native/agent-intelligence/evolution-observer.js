import { AgentEvolutionRepository, evolutionHash as hash, sameEvolutionValue as same } from './evolution-repository.js';
import { AgentEvidenceRepository } from './evidence-repository.js';
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
export async function observeEvolutionRp(engine, handle, evidenceId) {
    const evidence = await new AgentEvidenceRepository({ engine }).get(handle, evidenceId);
    if (!evidence || evidence.status !== 'completed' || evidence.scope.domain !== 'rp_chat' || !evidence.outputRef) return;
    const repository = new AgentEvolutionRepository({ engine });
    const docs = (await repository.list(handle)).filter(d => same(d.scope, evidence.scope));
    for (const doc of docs) for (const p of doc.publications.filter(p => p.status === 'published' && !p.activation)) {
        const version = p.target.kind === 'skill' ? p.desired : p.candidateId;
        const consumed = evidence.trace.events.some(e => e.type === 'version.consumed' && e.runId === evidence.rootRunId && e.targetKind === p.target.kind && e.versionId === version
            && (p.target.kind === 'skill' ? e.skillName === p.target.name && e.skillScopeKind === p.target.scope.kind && e.characterFile === p.target.scope.characterFile : e.presetId === p.target.presetId));
        if (consumed) await repository.mutate(handle, doc.scope, doc.subject, d => {
            const current = d.publications.find(v => v.id === p.id);
            if (current.status === 'published' && !current.activation) current.activation = { origin: 'client_observation', evidenceId, evidenceHash: hash(evidence), runId: evidence.rootRunId, observedAt: Date.now() };
        });
    }
}
