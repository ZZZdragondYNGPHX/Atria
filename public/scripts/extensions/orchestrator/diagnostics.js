import { createLogger } from '../../logging/logger.js';
import { captureFrontendIncident } from '../../logging/incident-reporter.js';

const logger = createLogger('orchestrator');

function extractCorrelation(payload, trace, panelRunId) {
    const generationId = String(
        payload?.atria?.generation_id
        || payload?.atri_generation_id
        || payload?.generationId
        || payload?.generation_id
        || '',
    ).trim();
    const requestId = String(payload?.requestId || payload?.request_id || generationId || '').trim();
    return {
        orchestrationRunId: String(trace?.runId || panelRunId || '').trim(),
        ...(generationId ? { generationId } : {}),
        ...(requestId ? { requestId } : {}),
    };
}

function projectAttempt(attempt) {
    if (!attempt || typeof attempt !== 'object') return null;
    return {
        attemptId: attempt.attemptId,
        stageIndex: attempt.stageIndex,
        stageId: attempt.stageId,
        nodeIndex: attempt.nodeIndex,
        nodeId: attempt.nodeId,
        preset: attempt.preset,
        nodeType: attempt.nodeType,
        runKind: attempt.runKind,
        round: attempt.round,
        status: attempt.status,
        action: attempt.action,
        reason: attempt.reason,
        rerunReason: attempt.rerunReason,
        targetNodeIds: Array.isArray(attempt.targetNodeIds) ? attempt.targetNodeIds : [],
        error: attempt.error,
    };
}

function projectEvent(event) {
    if (!event || typeof event !== 'object') return null;
    const output = {};
    for (const key of [
        'seq', 'at', 'type', 'status', 'stageIndex', 'stageId', 'nodeIndex', 'nodeId',
        'agentId', 'round', 'action', 'reason', 'error', 'toolName', 'name',
        'primaryApiPresetName', 'fallbackApiPresetName', 'runId',
    ]) {
        if (event[key] !== undefined) output[key] = event[key];
    }
    return output;
}

export function buildOrchestrationFailureDiagnostic({ mode, trace, payload, error, panelRunId = '', profileName = '' } = {}) {
    const attempts = (trace?.attempts || []).map(projectAttempt).filter(Boolean);
    const failedAttempt = [...attempts].reverse().find(attempt => attempt.status === 'failed') || attempts.at(-1) || null;
    const events = (trace?.events || []).map(projectEvent).filter(Boolean);
    const fallbackHistory = events.filter(event => /fallback/i.test(String(event.type || '')));
    const correlation = extractCorrelation(payload, trace, panelRunId);
    const stageParts = [String(mode || 'orchestration'), failedAttempt?.stageId, failedAttempt?.nodeId].filter(Boolean);

    return {
        type: 'orchestration_failure',
        severity: 'error',
        primaryModule: 'orchestrator',
        stage: stageParts.join('.') || 'orchestration.run',
        summary: `${String(mode || 'Orchestration')} failed: ${String(error?.message || error || 'Unknown failure')}`,
        failure: error,
        correlation,
        retryHistory: attempts.slice(-40),
        fallbackHistory: fallbackHistory.slice(-20),
        timeline: events.slice(-80),
        safeConfigSnapshot: {
            orchestrationProfile: String(profileName || ''),
            featureToggles: { agentRuntimeV2: payload?.agentRuntimeV2 !== false },
        },
        environment: {
            mode: String(mode || ''),
            panelRunId: String(panelRunId || ''),
            runtimeRunId: String(trace?.runId || ''),
            reviewRerunCount: Number(trace?.reviewRerunCount || 0),
            failedAttempt,
        },
    };
}

export function reportOrchestrationFailure(input = {}) {
    const error = input.error;
    if (input.payload?.__atriaSimulate || input.payload?.signal?.aborted || error?.name === 'AbortError') return null;
    const diagnostic = buildOrchestrationFailureDiagnostic(input);
    logger.error('run.failed', diagnostic.summary, {
        stage: diagnostic.stage,
        failedAttempt: diagnostic.environment.failedAttempt,
        retryCount: diagnostic.retryHistory.length,
        fallbackCount: diagnostic.fallbackHistory.length,
    }, { category: 'runtime', correlation: diagnostic.correlation });
    void captureFrontendIncident(diagnostic);
    return diagnostic;
}
