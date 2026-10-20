import { createNativeId } from './identity.js';
import { initialWorldState, selectedWorlds } from './session-worlds.js';
import { initialSubjects } from './subject-authority.js';
import { initialLifecycle } from './lifecycle-authority.js';
import { resolveSessionKnowledge } from './session-knowledge.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { worldRecordSections, readPlayerWorldRecords } from '../../public/shared/native-world-records.js';
import { fields } from '../../public/shared/native-values.js';

const snapshots = new WeakMap();
async function startingSnapshot(preview) {
    if (!snapshots.has(preview)) snapshots.set(preview, (async () => {
        const manifest = preview.manifest, entryPoint = manifest.entryPoints.find(entry => entry.entryPointId === preview.entryPointId);
        const base = { manifest, entryPoint, session: { sessionId: createNativeId('session'), packageId: manifest.packageId,
            packageVersionId: manifest.packageVersionId, entryPointId: entryPoint.entryPointId },
        revision: { revisionId: createNativeId('revision'), branchId: createNativeId('branch') }, timeline: [], variants: [], graph: [],
        states: { atri_world_state: initialWorldState(manifest, entryPoint) },
        knowledge: await resolveSessionKnowledge({ manifest, entryPoint }) };
        base.worlds = selectedWorlds(base.states, manifest, entryPoint);
        base.states.atri_subjects = initialSubjects(base, base.worlds);
        const lifecycle = initialLifecycle(manifest.runtime?.experienceContract?.lifecycleRuntime);
        if (lifecycle) base.states.atri_lifecycle = lifecycle;
        return base;
    })());
    return snapshots.get(preview);
}

// Detached reads share the actual startup/Information/Context authorities. They
// have no Session repository, provider, initializer actions or publication path.
export async function readStudioWorldPreview(preview, input = {}) {
    fields(input, ['audience', 'search'], 'Starting world preview');
    const audience = input.audience ?? 'narrator', search = input.search ?? '';
    if (typeof audience !== 'string' || audience.length > 128 || typeof search !== 'string' || search.length > 128) throw new TypeError('Invalid preview audience');
    const base = await startingSnapshot(preview);
    const actors = base.manifest.actors.filter(actor => base.entryPoint.actorIds.includes(actor.actorId)).map(actor => ({ value: 'actor:' + actor.actorId, label: actor.displayName ?? actor.actorId }));
    const subjects = base.states.atri_subjects.subjects.filter(subject => subject.perspective).map(subject => ({ value: 'actor:' + subject.subjectId, label: subject.origin.definitionId }));
    const all = [{ value: 'narrator', label: 'Narrator' }, { value: 'player', label: 'Player' }, ...actors, ...subjects];
    const selected = all.find(item => item.value === audience);
    if (!selected) throw new TypeError('Starting perspective unavailable');
    const matched = all.filter(item => !search || item.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    const audiences = matched.slice(0, 128);
    if (!audiences.some(item => item.value === audience)) audiences.unshift(selected);
    const result = { previewId: preview.previewId, entryPointId: base.entryPoint.entryPointId, entryPointName: base.entryPoint.displayName,
        audience, audiences, audiencesTruncated: matched.length > 128, phase: 'before_initialization_actions', items: [], truncated: false };
    // Author-only coverage inspector; separate from audience Context items.
    const logicPath = base.entryPoint.runtime?.game?.logic ?? base.manifest.runtime?.game?.logic;
    result.lawCoverage = []; result.lawCoverageTruncated = false;
    let coverageCharacters = 0;
    coverage: for (const world of base.worlds) for (const note of world.revision.annotations ?? []) {
        if (note.context.usage !== 'law') continue;
        const quote = note.quote.slice(0, 1200);
        if (result.lawCoverage.length >= 128 || coverageCharacters + quote.length > 32768) { result.lawCoverageTruncated = true; break coverage; }
        coverageCharacters += quote.length;
        result.lawCoverage.push({ worldId: world.world.worldId, passageId: note.id, quote,
            status: !note.execution ? 'text_only' : note.execution.logicPath === logicPath ? 'linked_action' : 'other_start',
            ...(note.execution ? { transactionId: note.execution.transactionId, logicPath: note.execution.logicPath } : {}) });
    }
    if (audience === 'player') {
        let characters = 0;
        for (const view of worldRecordSections(base).views) {
            const projected = readPlayerWorldRecords(base, view);
            result.truncated ||= projected.truncated;
            for (const item of projected.items) {
                characters += JSON.stringify(item.data).length;
                if (characters > 32768) { result.truncated = true; break; }
                result.items.push({ id: item.id, label: item.semantic, data: item.data, source: { viewId: view, sourceId: item.sourceId } });
            }
            if (characters > 32768) break;
        }
    } else {
        const target = audience === 'narrator' ? { kind: 'narrator' } : { kind: 'actor', id: audience.slice(6) };
        const plan = await compileNativeContextPlan(base, { target, modelContextLimit: 32768, responseReserve: 0, countTokens: text => text.length });
        result.items = plan.included.map(item => ({ id: item.contextItemId, label: item.lane, content: item.content, source: item.sourceRefs }));
        result.truncated = plan.rejected.some(item => ['budget', 'lane_cap'].includes(item.reason));
    }
    return structuredClone(result);
}
