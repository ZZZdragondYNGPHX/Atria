import { describe, expect, test } from '@jest/globals';

import { classifyOperationalFailure, sanitizeDiagnosticUrl } from '../../src/logging/failure-classifier.js';
import { attributeFrontendOwnership } from '../../public/scripts/logging/ownership.js';
import { buildOrchestrationFailureDiagnostic } from '../../public/scripts/extensions/orchestrator/diagnostics.js';

describe('L08 diagnostic attribution fixtures', () => {
    test('B: extension network failures distinguish DNS, TLS, connect and filesystem stages', () => {
        expect(classifyOperationalFailure(Object.assign(new Error('getaddrinfo ENOTFOUND host'), { code: 'ENOTFOUND' }), { stage: 'clone' }))
            .toMatchObject({ stage: 'clone.dns', probableOwner: 'network-environment' });
        expect(classifyOperationalFailure(Object.assign(new Error('certificate verify failed'), { code: 'CERT_HAS_EXPIRED' }), { stage: 'clone' }))
            .toMatchObject({ stage: 'clone.tls', probableOwner: 'network-environment' });
        expect(classifyOperationalFailure(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), { stage: 'clone' }))
            .toMatchObject({ stage: 'clone.connect', probableOwner: 'network-environment' });
        expect(classifyOperationalFailure(Object.assign(new Error('permission denied'), { code: 'EACCES' }), { stage: 'prepare-fs' }))
            .toMatchObject({ stage: 'prepare-fs.filesystem', probableOwner: 'local-environment' });
        expect(sanitizeDiagnosticUrl('https://user:pass@example.com/repo.git?token=SECRET#x')).toBe('https://example.com/repo.git');
    });

    test('C: third-party throw site wins only when it is the first application frame', () => {
        const thirdParty = attributeFrontendOwnership({
            stack: 'Error: boom\n    at run (https://host/scripts/extensions/third-party/foo/main.js:1:2)\n    at boundary (https://host/scripts/logging/error-adapter.js:1:2)',
        });
        expect(thirdParty).toMatchObject({ probableOwner: 'third-party-extension', ownerName: 'foo' });
        expect(thirdParty.stack.firstAtriaFrame.raw).toContain('error-adapter.js');

        const atria = attributeFrontendOwnership({
            stack: 'Error: boom\n    at api (https://host/scripts/extensions/orchestrator/main.js:1:2)\n    at plugin (https://host/scripts/extensions/third-party/foo/main.js:1:2)',
        });
        expect(atria).toMatchObject({ probableOwner: 'atria', ownerName: 'Atria' });
        expect(atria.stack.firstThirdPartyFrame.ownerName).toBe('foo');
    });

    test('A: orchestration failure package retains run/agent/round/retry/fallback without conversation text', () => {
        const diagnostic = buildOrchestrationFailureDiagnostic({
            mode: 'spec',
            panelRunId: 'panel-1',
            profileName: 'builtin-agenda',
            payload: { atri_generation_id: 'gen-1', agentRuntimeV2: true },
            error: Object.assign(new Error('tool schema failed'), { code: 'SCHEMA' }),
            trace: {
                runId: 'orch-1',
                reviewRerunCount: 1,
                attempts: [{
                    attemptId: 2,
                    stageId: 'review',
                    nodeId: 'continuity_critic',
                    preset: 'critic',
                    runKind: 'worker',
                    round: 3,
                    status: 'failed',
                    error: 'tool schema failed',
                    conversation: { messages: [{ content: 'PRIVATE PROMPT' }] },
                }],
                events: [{
                    seq: 4,
                    type: 'api_fallback.started',
                    primaryApiPresetName: 'primary',
                    fallbackApiPresetName: 'fallback',
                    error: 'provider down',
                    prompt: 'PRIVATE PROMPT',
                }],
            },
        });
        expect(diagnostic.correlation).toMatchObject({ orchestrationRunId: 'orch-1', generationId: 'gen-1' });
        expect(diagnostic.environment.failedAttempt).toMatchObject({ nodeId: 'continuity_critic', round: 3, preset: 'critic' });
        expect(diagnostic.fallbackHistory[0]).toMatchObject({ type: 'api_fallback.started', primaryApiPresetName: 'primary', fallbackApiPresetName: 'fallback' });
        expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE PROMPT');
    });
});
