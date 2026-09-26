import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { createGameWorldSession } from '../../public/scripts/native/experience/world/session.js';
import { createInterpretationMappingRegistry } from '../../public/scripts/native/experience/logic/interpretations.js';
import { assertSemanticOutcome } from '../../public/shared/native-task-contract.js';
import { assertTaskValue } from '../../public/shared/native-task-contract.js';
import { assertNativeId } from './identity.js';

export function validateTaskRecords(base) {
    const state = base.states.atri_task_results;
    if (!state) return;
    if (state.schemaVersion !== 1 || !Array.isArray(state.records) || state.records.length > 256) throw new TypeError('Invalid Task result state');
    const ids = new Set();
    const tasks = base.manifest.runtime?.experienceContract?.taskRuntime?.tasks ?? [];
    for (const record of state.records) {
        if (typeof record.invocationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(record.invocationId) || ids.has(record.invocationId)) throw new TypeError('Invalid Task invocation');
        ids.add(record.invocationId);
        assertNativeId(record.storedRevisionId, 'revision'); assertNativeId(record.anchorRevisionId, 'revision'); assertNativeId(record.branchId, 'branch');
        if (record.kind === 'turn') {
            if (record.status !== 'applied' || !Array.isArray(record.outcomes)) throw new TypeError('Invalid Turn receipt');
            for (const outcome of record.outcomes) {
                const task = tasks.find(item => item.interpretation?.id === outcome.requestId);
                if (!task) throw new TypeError('Undeclared committed outcome');
                assertSemanticOutcome(outcome, task.interpretation);
            }
        } else if (record.kind === 'task') {
            const task = tasks.find(item => item.id === record.taskId);
            const variant = task?.variants.find(item => item.id === record.variantId);
            if (!variant || task.resultPolicy.resultClass !== record.resultClass || !['draft', 'applied', 'rejected', 'completed'].includes(record.status)) throw new TypeError('Invalid Task result');
            assertTaskValue(record.payload, variant.outputSchema);
            if (task.interpretation) assertSemanticOutcome({ requestId: task.interpretation.id, interpretation: record.payload }, task.interpretation);
        } else throw new TypeError('Unknown Task record');
    }
}

// The existing World/Command/Rule/Reducer engine runs against a private candidate
// snapshot. Only SessionCore may publish its result, with the narrative, in one CAS.
export async function createTaskWorld(base, installed, publish = null) {
    const runtime = { ...installed.manifest.runtime, ...installed.entryPoint.runtime };
    const path = runtime?.game?.logic;
    const bytes = installed.sourceFiles.get(path);
    if (!bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Pinned declarative logic required');
    const data = {};
    for (const ref of installed.manifest.runtime?.experienceContract?.dataResources ?? []) {
        const bytes = installed.assets.get(ref.assetId);
        if (!bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Missing Package Data');
        const keys = ref.resourceId.split('.'); let target = data;
        for (const key of keys.slice(0, -1)) { target[key] ??= {}; target = target[key]; }
        target[keys.at(-1)] = JSON.parse(bytes.toString('utf8'));
    }
    const logic = compileDeclarativeLogic(JSON.parse(bytes.toString('utf8')), { data });
    const candidate = structuredClone(base);
    const statePatch = {};
    const adapter = { active: true, snapshot: candidate, commitStatePatch: async patch => {
        Object.assign(statePatch, patch);
        if (publish) Object.assign(candidate, await publish(patch, candidate.revision.revisionId));
        else Object.assign(candidate.states, patch);
        return candidate;
    } };
    const world = await createGameWorldSession({ nativeRuntime: adapter, packageState: { runtime,
        descriptor: { packageVersionId: base.session.packageVersionId, entryPointId: base.session.entryPointId } }, ...logic });
    return { world, statePatch, logic, candidate };
}

export async function prepareTaskAuthority(base, installed, { outcomes = [], command = null }) {
    const { world, statePatch, logic } = await createTaskWorld(base, installed);
    const mapper = createInterpretationMappingRegistry(logic.interpretations);
    const requests = installed.manifest.runtime?.experienceContract?.taskRuntime?.tasks ?? [];
    for (const raw of outcomes) {
        const task = requests.find(item => item.interpretation?.id === raw.requestId);
        if (!task) throw new TypeError('Undeclared semantic outcome');
        const outcome = assertSemanticOutcome(raw, task.interpretation);
        if (outcome.interpretation.decision === 'no_change') continue;
        const mapped = mapper.map(outcome.interpretation, { world: world.getState(), observation: null, turn: null });
        for (const proposal of mapped.commands) {
            const result = await world.dispatchCommandInternal(proposal.id, proposal.args);
            if (!result.ok) throw new TypeError('Semantic outcome Command rejected');
        }
    }
    if (command) {
        const result = await world.dispatchCommandInternal(command.id, command.args);
        if (!result.ok) throw new TypeError('Proposal Command rejected');
    }
    return statePatch;
}
