import { test, expect, jest } from '@jest/globals';
import { RuntimeProjection, replayRuntimeEvents } from '../../public/scripts/lib/agent-runtime/projection.js';
import { createWorkspaceFactoryPreset, workspaceHostProfile } from '../../public/scripts/agents/orchestrator/workspace/host-presets.js';
import { projectEngine, workspaceRunView } from '../../public/scripts/lib/agent-workspace/projection.js';
import { clearCurrentRun, startRun, finishRun, getCurrentRun, recordRuntimeEvent, recordMemoryRecall,
    bindEngineInspector, inspectEngineNode } from '../../public/scripts/agents/orchestrator/run-state/store.js';
import { runLoopEngine } from '../../public/scripts/agents/orchestrator/engine-v2/loop-adapter.js';
jest.unstable_mockModule('../../public/scripts/agents/orchestrator/agent-resolution.js', () => ({
    resolveOrchestrationAgentApiPresetName: () => null, resolveOrchestrationAgentPromptPresetName: () => null,
}));
const { runSpecEngine } = await import('../../public/scripts/agents/orchestrator/engine-v2/spec-adapter.js');

test('result deltas replay without duplicating bodies or accepting an older generation', () => {
    const projection = new RuntimeProjection();
    const engine = projectEngine(workspaceHostProfile(createWorkspaceFactoryPreset('loop')).orchestrationPlan);
    const event = (version, results, generation = 1) => ({ eventId: `${generation}/${version}`, runId: 'r', version, generation,
        type: 'graph.snapshot', engine: { ...engine, resultsDelta: true, results } });
    projection.append(event(1, [{ resultId:'one',nodeId:'owner',value:'PRIVATE' }]));
    projection.append(event(2, [{ resultId:'two',nodeId:'owner',provenance:[{ resultId:'one',prompt:'PRIVATE' }] }]));
    projection.append(event(3, [{ resultId:'one',nodeId:'owner' }]));
    projection.append(event(9, [{ resultId:'stale',nodeId:'owner' }], 0));
    const snapshot = projection.snapshot();
    expect(snapshot.runs[0].engine.results.map(result => result.resultId)).toEqual(['one','two']);
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE');
    expect(replayRuntimeEvents(snapshot.events)).toEqual(snapshot);
});

test('recall observation joins native node/step identities and rejects cancellation, completion and chat switches', () => {
    clearCurrentRun(); const id = startRun({ mode:'loop',quiet:true });
    const engine = projectEngine(workspaceHostProfile(createWorkspaceFactoryPreset('loop')).orchestrationPlan);
    recordRuntimeEvent({ runId:id,event:{ eventId:'start',runId:'execution',type:'graph.compiled',version:1,generation:0,agentId:'agent:owner',engine } });
    const context = { runId:'execution',effectId:'effect',stepId:'step' };
    expect(recordMemoryRecall(context,{ references:[{ id:'memory',body:'PRIVATE' }],tokens:42 })).toBe(true);
    const event = getCurrentRun().runtime.events.at(-1);
    expect(event).toMatchObject({ nodeId:'owner',agentId:'agent:owner',stepId:'step',relatedEffectId:'effect' });
    expect(event.effectId).toBeUndefined();
    expect(event.references).toEqual([{ id:'memory' }]);
    const controller = new AbortController(); controller.abort();
    expect(recordMemoryRecall({ ...context,effectId:'cancelled',signal:controller.signal },{})).toBe(false);
    finishRun({ runId:id,status:'aborted' });
    expect(recordMemoryRecall({ ...context,effectId:'late' },{})).toBe(false);
    clearCurrentRun(); startRun({ mode:'loop',quiet:true });
    expect(recordMemoryRecall(context,{})).toBe(false);
    clearCurrentRun();
});

test('private inspector returns detached data and cannot follow a new run', () => {
    clearCurrentRun(); const id = startRun({ mode:'loop',quiet:true });
    const data = { results:[{ value:'private output' }] };
    bindEngineInspector(id,'engine',() => data);
    inspectEngineNode(id,'owner').results[0].value = 'changed';
    expect(data.results[0].value).toBe('private output');
    clearCurrentRun(); startRun({ mode:'loop',quiet:true });
    expect(() => inspectEngineNode(id,'owner')).toThrow('selection');
    clearCurrentRun();
});

test('a native graph without stage metadata gets transport slots without changing its definition', () => {
    const preset = createWorkspaceFactoryPreset('single','native');
    for (const node of preset.planTemplate.nodes) delete node.metadata;
    const before = structuredClone(preset);
    const profile = workspaceHostProfile(preset);
    expect(profile.spec.stages).toHaveLength(1);
    expect(profile.orchestrationPlan.nodes[0].metadata.stageIndex).toBe(0);
    expect(preset).toEqual(before);
});

test('native Loop rejects an unadvertised finalize and preserves the admitted agent identity', async () => {
    clearCurrentRun(); const id = startRun({ mode:'loop',quiet:true });
    const preset = createWorkspaceFactoryPreset('loop','native');
    preset.planTemplate.budgets.maxSteps = 1;
    preset.planTemplate.agents[0].tools = [];
    const profile = workspaceHostProfile(preset);
    const result = await runLoopEngine({ context:{},payload:{},profile,deps:{},runId:id,toolContext:{},
        tools:[{ type:'function',function:{ name:'finalize',parameters:{} } }],messages:[],deadline:null,
        refreshRuntimeStateMessage:() => {},sendLlm:async () => ({ assistantText:'partial',toolCalls:[{ id:'f',name:'finalize',args:{ capsule_text:'forbidden' } }] }),
        executeTool:() => {throw new Error('No tool may execute');},record:() => {},resolveToolSource:() => 'builtin',
        isStructuredToolError:() => false,normalizeToolOk:value => value,
        makeErrorToolMessage:(id,error) => ({ role:'tool',tool_call_id:id,content:error.message }),makeOkToolMessage:() => ({}) });
    expect(JSON.stringify(result)).not.toContain('forbidden');
    const run = getCurrentRun();
    expect(run.runtime.events.some(event => event.type === 'capability.denied' && event.toolName === 'finalize')).toBe(true);
    expect(run.runtime.runs[0].agentId).toBe(profile.orchestrationPlan.agents[0].id);
    clearCurrentRun();
});

test('step filtering and live delegate status remain projections of Runtime evidence', () => {
    const engine = projectEngine(workspaceHostProfile(createWorkspaceFactoryPreset('loop')).orchestrationPlan);
    const run = { runId:'panel',runtime:{ runs:[{ engine,agentId:'coordinator' },{ runId:'child',agentId:'agent:owner',status:'waiting_model',stepId:'two' }],events:[
        { type:'memory.recall.completed',nodeId:'owner',agentId:'agent:owner',stepId:'one' },
        { type:'memory.recall.completed',nodeId:'other',agentId:'agent:owner',stepId:'two' },
        { type:'memory.recall.completed',nodeId:'owner',agentId:'agent:owner',stepId:'two' },
    ] } };
    const view = workspaceRunView(run,{ runId:'panel',nodeId:'owner',stepId:'two' });
    expect(view.recalls).toHaveLength(1);
    expect(view.engine.nodes[0].status).toBe('running');
    expect(engine.nodes[0].status).toBe('pending');
});

test('native Spec consumes join results downstream and submits its declared owner', async () => {
    clearCurrentRun(); const runId = startRun({ mode:'spec',quiet:true });
    const preset = createWorkspaceFactoryPreset('single','joined');
    const plan = preset.planTemplate, seed = plan.nodes[0];
    plan.nodes = ['first','joined','last'].map(nodeId => ({ nodeId,agentId:seed.agentId,capabilities:seed.capabilities,
        kind:nodeId === 'joined' ? 'join' : 'agent',...(nodeId === 'joined' ? { inputs:['first'] } : {}) }));
    plan.edges = [{ edgeId:'a',from:'first',to:'joined' },{ edgeId:'b',from:'joined',to:'last' }];
    plan.entryNodeId = 'first'; plan.output.ownerNodeId = 'last'; plan.arbitration = { kind:'merge' };
    const profile = workspaceHostProfile(preset); const inputs = [];
    const result = await runSpecEngine({ context:{},payload:{},messages:[],profile,settings:{},
        runtime:{ runId,spec:profile.spec,stages:profile.spec.stages,specDefaultTools:{} },
        runWorkerNode:async (_ctx,_payload,node,_preset,_messages,prior) => {
            if(node.id === 'last') inputs.push(prior.get('joined'));
            return node.id === 'first' ? 'candidate' : 'finished';
        },runReviewNode:() => {throw new Error('No review');},normalizeNodeSpec:node => node,
        resolveReviewTargetEntries:() => [],createStageOutputSnapshot:() => null });
    expect(inputs).toHaveLength(1);
    expect(JSON.stringify(inputs[0])).toContain('candidate');
    expect(result.engineOutput.ownerNodeId).toBe('last');
    expect(JSON.stringify(result.engineOutput.value)).toContain('finished');
    clearCurrentRun();
});
