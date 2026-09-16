export { projectEngine, sanitizeEngineProjection } from '../orchestration-engine/projection.js';
const fields = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, structuredClone(value[key])]));

/** Project a single selected run; identities never depend on rendered list positions. */
export function workspaceRunView(run, selection = {}) {
    const events = run?.runtime?.events || [];
    const engines = run?.runtime?.runs?.filter(item => item.engine) || [];
    const engine = engines[0]?.engine ? structuredClone(engines[0].engine) : null;
    if (engine) for (const node of engine.nodes) {
        const executions = run.runtime.runs.filter(item => item.agentId === node.agentId);
        if (executions.some(item => !['idle', 'completed', 'failed', 'cancelled'].includes(item.status))) node.status = 'running';
        else if (node.status === 'pending' && executions.length) node.status = executions.at(-1).status;
        node.executions = executions.map(item => fields(item, ['runId', 'status', 'stepId', 'version', 'generation']));
    }
    const nodeId = selection.runId === run?.runId ? selection.nodeId : null;
    const agentId = engine?.nodes.find(node => node.nodeId === nodeId)?.agentId;
    const stepId = selection.runId === run?.runId ? selection.stepId : null;
    const visible = event => (!nodeId || (event.nodeId ? event.nodeId === nodeId : event.agentId === agentId))
        && (!stepId || event.stepId === stepId);
    const recalls = events.filter(event => event.type === 'memory.recall.completed' && visible(event));
    return { runId: run?.runId || null, mode: run?.mode || '', status: run?.status || 'idle', engine,
        nodeId, stepId, recalls, contexts: events.filter(event => event.type === 'context.compiled' && visible(event)),
        timeline: events.filter(event => visible(event) && /^(graph\.|agent\.handoff|parallel\.|result\.|arbitration\.|output\.)/.test(event.type)),
        diagnostics: events.filter(visible),
        memoryUsers: referenceId => events.filter(event => event.type === 'memory.recall.completed'
            && event.references?.some(ref => ref.id === referenceId)).map(event => fields(event, ['runId', 'nodeId', 'agentId', 'stepId'])),
    };
}
