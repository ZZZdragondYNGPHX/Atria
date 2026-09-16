import { compilePreset } from './preset-compiler.js';
import { runEnginePlan } from './runtime-bridge.js';
import { assertOutputAuthorized } from './output-adapter.js';
import { effectiveCapabilities } from '../../../lib/orchestration-engine/capabilities.js';
import { createFirstChunkBarrier } from '../dispatch-barrier.js';
import { resolveOrchestrationAgentApiPresetName, resolveOrchestrationAgentPromptPresetName } from '../agent-resolution.js';
import { throwIfAborted } from '../abort-utils.js';

export async function runSpecEngine({ context, payload, messages, profile, runtime, settings,
    runWorkerNode, runReviewNode, normalizeNodeSpec, resolveReviewTargetEntries, createStageOutputSnapshot }) {
    const plan = compilePreset({ ...profile, spec: runtime.spec }, { mode: profile.source === 'single' ? 'single' : 'spec', settings });
    const runId = `${runtime.runId}/engine`;
    const barriers = new Map();
    const previousOutputs = (inputs, stageIndex, nodeIndex, sameStage) => {
        const map = new Map();
        for (const result of inputs) {
            const node = plan.nodes.find(node => node.nodeId === result.nodeId);
            const meta = node?.metadata;
            if (!meta?.nodeSpec || meta.nodeSpec.type === 'review') continue;
            if (sameStage ? meta.stageIndex === stageIndex && meta.nodeIndex < nodeIndex : meta.stageIndex < stageIndex) map.set(meta.nodeSpec.id, result.value);
        }
        return map;
    };
    const execute = async request => {
        throwIfAborted(request.signal);
        const node = plan.nodes.find(node => node.nodeId === request.payload.nodeId);
        const { stageIndex, nodeIndex, stageId, nodeSpec: raw, isFinalStage } = node.metadata;
        const nodeSpec = normalizeNodeSpec(raw), preset = profile.presets[nodeSpec.preset] || {};
        const prior = previousOutputs(request.payload.inputs, stageIndex, nodeIndex, false);
        const current = previousOutputs(request.payload.inputs, stageIndex, nodeIndex, true);
        const localRuntime = { ...runtime, reviewRerunCount: request.payload.reviewRerunCount,
            approvedReviewFeedbackEntries: request.payload.reviewFeedback.map(item => ({
                ...item.metadata, nodeId: item.metadata.nodeSpec.id, feedback: item.feedback,
            })) };
        const options = { engineNode: true, engineParentRunId: request.parentRunId, engineCapabilities: effectiveCapabilities(plan, node),
            runtimeRunId: request.runId, runtimeAgentId: node.agentId, stageIndex, nodeIndex, stageId, isFinalStage,
            runtime: localRuntime, defaultTools: runtime.specDefaultTools,
            rerunReason: request.payload.rerunReason ?? undefined };
        if (nodeSpec.type === 'review') {
            const decision = await runReviewNode(context, payload, profile, nodeSpec, preset, messages, prior, current, request.signal, options);
            const targetSlotIds = decision.action === 'rerun'
                ? resolveReviewTargetEntries(runtime.stages, stageIndex, nodeIndex, decision.targetNodeIds).map(entry => `stage:${entry.stageIndex}/node:${entry.nodeIndex}`) : [];
            return { engineResult: true, status: 'completed', value: null, structured: { ...decision, targetSlotIds } };
        }
        for (const [id, value] of current) prior.set(id, value);
        if (!barriers.has(stageIndex)) barriers.set(stageIndex, createFirstChunkBarrier());
        const prompt = resolveOrchestrationAgentPromptPresetName(settings, preset)?.name || '';
        const key = context.isStreamingPresetEnabled?.(prompt) ? resolveOrchestrationAgentApiPresetName(settings, preset)?.name || '' : '';
        const slot = barriers.get(stageIndex).acquire(key);
        try {
            if (slot.role === 'follower') await slot.wait;
            throwIfAborted(request.signal);
            return await runWorkerNode(context, payload, nodeSpec, preset, messages, prior, request.signal,
                { ...options, onFirstChunk: slot.role === 'lead' ? slot.signalFirstChunk : null });
        } finally { slot.release(); }
    };
    const result = await runEnginePlan({ plan, runId, context, signal: payload?.signal, panelRunId: runtime.runId,
        onEvent: runtime.onRuntimeEvent, branchPort: { execute, resume: execute } });
    if (result.state.status !== 'completed') throw new Error(result.state.error || `Engine ${result.state.status}`);
    assertOutputAuthorized({ plan, state: result.state, generation: result.state.generation });
    const latest = new Map(result.state.policyState.results.map(result => [result.nodeId, result]));
    const previousNodeOutputs = new Map();
    const stageOutputs = runtime.stages.map((stage, stageIndex) => {
        const outputs = new Map();
        stage.nodes.forEach((raw, nodeIndex) => {
            const spec = normalizeNodeSpec(raw);
            const result = latest.get(`stage:${stageIndex}/node:${nodeIndex}`);
            if (spec.type !== 'review' && result) { outputs.set(spec.id, result.value); previousNodeOutputs.set(spec.id, result.value); }
        });
        return createStageOutputSnapshot(stage, outputs);
    });
    return { stageOutputs, previousNodeOutputs, reviewRerunCount: result.state.policyState.reviewRerunCount };
}
