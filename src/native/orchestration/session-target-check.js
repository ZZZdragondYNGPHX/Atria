import { ConflictError } from '../../storage/errors.js';
import { sessionAgentGraphProfile } from './session-agent-graph-profile.js';

const refuse = code => { throw new ConflictError(code); };

/** Target-specific requirements, checked only when a library Plan is applied to
 * a Session. Drafting and saving a Plan never depend on any target. */
export async function checkSessionTarget({ plans, sessionCore, handle, sourceSelector, planRef }) {
    const base = await sessionCore.observe(handle, sourceSelector.sessionId);
    const turn = base.manifest.runtime?.experienceContract?.taskRuntime?.turn;
    if (!turn || turn.policy !== 'authority-first' || turn.stages?.length || turn.narratorTaskId || turn.interpreterTaskId)
        refuse('native_orchestration_target_work_unsupported');
    const plan = await plans.getRevision(handle, planRef), graph = plan.definition;
    const models = graph.nodes.filter(node => ['agent', 'planner', 'judge', 'review'].includes(node.kind));
    if (graph.outputContract.kind !== 'rp_narration') refuse('native_orchestration_target_output_unsupported');
    if (models.length > 1 || graph.nodes.some(node => ['fanout', 'join'].includes(node.kind))) {
        let profile = null;
        try { profile = sessionAgentGraphProfile(plan); } catch { profile = null; }
        if (!profile) refuse('native_orchestration_target_plan_unsupported');
    }
}
