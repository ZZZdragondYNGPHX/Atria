import multer from 'multer';
import { createImageRegistry, imageTargetFingerprint } from '../native/image-registry.js';
import { VisualDirector } from '../native/visual-director.js';
import { MediaStudio } from '../native/media-studio.js';
import { VisualGallery, VisualMediaGc } from '../native/visual-gallery.js';
import { PNG } from 'pngjs';
import { VisualContinuity } from '../native/visual-continuity.js';
import { VisualConfiguration } from '../native/visual-configuration.js';
import { describeSessionProtocols } from '../native/session-public-work.js';
import { createSkillRepository } from '../skills/repository.js';
import { SpeechService } from '../native/speech-service.js';
import { McpService } from '../native/mcp-service.js';
import { A2aService } from '../native/a2a-service.js';
import { ExtensionsStore } from '../native/extensions-store.js';
import { getVersionedModelPromptResourceIdentity, VERSIONED_MODEL_PROMPT_RESOURCE_TYPES } from '../native/model-prompt-runtime/resources.js';
import { RouteResolver } from '../native/model-prompt-runtime/route-resolver.js';
import { readPromptControls, validatePromptOverrides } from '../native/model-prompt-runtime/prompt-controls.js';
import { PromptPresetStore } from '../native/model-prompt-runtime/presets.js';
import { PromptCandidateStore } from '../native/model-prompt-runtime/prompt-candidates.js';
import express from 'express';
import { NativeRetrievalPersistence } from '../native/retrieval-persistence.js';
import { admitMemoryCorpusWork, prepareRetrievalCompute } from '../native/retrieval-compute.js';
import { executeProjectSkillWork } from '../native/skill-invocation.js';
import { fields } from '../../public/shared/native-values.js';
import { NATIVE_RETRIEVAL_SCOPE_ERRORS } from '../../public/scripts/native/retrieval-contracts.js';
import { getStorageEngine, getSettingsRepo } from '../storage/index.js';
import { NativeMemoryAuthority } from '../native/memory-authority.js';
import { getUserDirectories } from '../users.js';
import { readSecret, SECRET_KEYS, SecretManager } from './secrets.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { getNativeSessionServices } from './native-session.js';
import { getNativeStudioServices } from './native-studio.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../native/model-prompt-runtime/persistence.js';
import { NativeGenerationHost, selectNativeRuntimeRoute } from '../native/adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from '../native/orchestration/native-turn-orchestration.js';
import { createHttpGenerationProvider } from '../native/adapters/http-generation-provider.js';
import { createResponsesGenerationProvider } from '../native/adapters/responses-generation-provider.js';
import { createNativeMessagesProvider } from '../native/adapters/native-messages-provider.js';
import { assertConnectionProfile, assertExactResourceRef } from '../native/model-prompt-runtime/contracts.js';
import { prepareProviderDiscovery, discoverProviderModels } from '../native/adapters/provider-discovery.js';
import { nativeTaskScheduler } from '../native/task-scheduler.js';
import { IllustrationPromptService } from '../native/illustration-prompt-service.js';
import { IllustrationImageService } from '../native/illustration-image-service.js';
import { PredictionService } from '../native/prediction-service.js';
import { CandidateComparisonService } from '../native/candidate-comparison.js';
import { ProjectComparisonService } from '../native/project-comparison.js';
import { AgentEvidenceRepository } from '../native/agent-intelligence/evidence-repository.js';
import { AgentEvidenceService } from '../native/agent-intelligence/evidence-service.js';
import { AgentGoalService } from '../native/agent-intelligence/goal-service.js';
import { GoalContinuationService } from '../native/agent-intelligence/goal-continuation.js';
import { AgentExperienceService } from '../native/agent-intelligence/experience-service.js';
import { getChatRepo } from '../storage/index.js';
import { observeEvolutionRp } from '../native/agent-intelligence/evolution-observer.js';
import { AgentEvolutionService } from '../native/agent-intelligence/evolution-service.js';
import { CredentialTargetAuthority, createCredentialSecretPort } from '../native/model-prompt-runtime/credential-targets.js';
import { credentialFetch } from '../native/model-prompt-runtime/credential-fetch.js';
import { mountMcpMediaAssets } from '../native/mcp-media-assets.js';
import { hashNativeDocument } from '../native/repositories/common.js';
import { RpEvidenceCaptureService } from '../native/agent-intelligence/rp-capture-service.js';
import { recycleNativeResource } from '../storage/center-instance.js';
import { assertObject } from '../../public/shared/native-orchestration-contracts.js';
import { RpRunControl } from '../native/rp-run-control.js';

function generationFailure(error, fallback = 'native_generation_failed') {
    const code = error.code === 'native_processing_failed' || ['storage_commit_unknown', 'storage_read_only'].includes(error.code)
        || /^(native_generation_|native_credential_|native_orchestration_|generation_)[a-z_]{1,100}$/.test(error.code || '') ? error.code : fallback;
    const orchestration = code.startsWith('native_orchestration_');
    const status = code === 'storage_read_only' || (orchestration && code.endsWith('_unavailable')) ? 503
        : code === 'storage_commit_unknown' || code.includes('conflict') || (orchestration && (error.name === 'ConflictError' || code.endsWith('_stale'))) ? 409 : 400;
    return { code, status };
}

function services() {
    const { core, packageInstaller } = getNativeSessionServices();
    const { studio, agent } = getNativeStudioServices();
    const persistence = new NativeModelPromptPersistence({ engine: getStorageEngine(), lifecycle: recycleNativeResource });
    const credentials = new CredentialTargetAuthority({ persistence });
    const host = new NativeGenerationHost({
        persistence,
        library: new VersionedJsonResourceHandler({ engine: getStorageEngine(), lifecycle: recycleNativeResource }),
        sessionCore: core, packageInstaller, studio, agent,
        skillRepository: handle => createSkillRepository(getUserDirectories(handle).root),
        extensions: new ExtensionsStore({ engine: getStorageEngine(), lifecycle: recycleNativeResource }),
        providers: {
            'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl: credentialFetch }),
            'provider.raw-text': createHttpGenerationProvider({ format: 'raw-text', fetchImpl: credentialFetch }),
            'provider.openai-responses': createResponsesGenerationProvider({ fetchImpl: credentialFetch }),
            'provider.anthropic': createNativeMessagesProvider({ format: 'anthropic', fetchImpl: credentialFetch }),
            'provider.gemini': createNativeMessagesProvider({ format: 'gemini', fetchImpl: credentialFetch }),
        },
        secretPort: createCredentialSecretPort({ authority: credentials, resolveSecret: async (ref, { handle }) => {
            // Native refs identify one exact Secret ID. Never resolve the active key.
            for (const key of Object.values(SECRET_KEYS)) {
                if (key === SECRET_KEYS.ATRIA_SAVE_PASSWORD) continue;
                const value = readSecret(getUserDirectories(handle), key, ref.secretId);
                if (value) return value;
            }
            return '';
        } }),
    });
    host.turnOrchestration = new NativeNarratorOrchestrationAuthority({ engine: persistence._engine, sessionCore: core,
        memoryAuthority: new NativeMemoryAuthority({ core, settingsRepo: getSettingsRepo() }),
        projectAgent: agent, projectRepository: agent._repository,
        modelResolver: new RouteResolver({ persistence: host.persistence, library: host.library, providers: host.providers }) });
    return host;
}

export async function wakeCollectedExperience(handle, result) {
    return new AgentEvolutionService({ host: services(), chatRepo: getChatRepo() }).wake(handle, result.scope, result.subject);
}

export function createNativeGenerationRouter(getHost = services, getChats = getChatRepo) {
    const router = express.Router();
    mountMcpMediaAssets(router, { getHost });
    router.post('/protocols/describe', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'private, no-store');
        try { response.json(await describeSessionProtocols(getHost(), handle, request.body)); } catch (error) {
            const code = /^(native_protocol_|native_generation_|native_run_|native_story_)[a-z_]+$/.test(error.code || '') ? error.code : 'native_protocol_failed';
            response.status(code.includes('conflict') ? 409 : 400).json({ error: code });
        }
    });
    for (const action of ['start', 'status', 'reconnect', 'cancel']) router.post('/a2a/' + action, async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'private, no-store');
        const controller = new AbortController(), abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const result = await new A2aService({ host: getHost() })[action](handle, request.body, action === 'status' ? undefined : controller.signal);
            if (!controller.signal.aborted) response.json(result);
        } catch (error) {
            const code = /^(native_a2a_|native_generation_|operation_)[a-z_]+$/.test(error.code || '') ? error.code : 'native_a2a_failed';
            if (!controller.signal.aborted) response.status(code.includes('conflict') ? 409 : 400).json({ error: code });
        } finally { response.off('close', abort); }
    });
    for (const action of ['start', 'status', 'cancel']) router.post('/mcp/' + action, async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'private, no-store');
        const controller = new AbortController(), abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const result = await new McpService({ host: getHost() })[action](handle, request.body, action === 'start' ? controller.signal : undefined);
            if (!controller.signal.aborted) response.json(result);
        } catch (error) {
            const code = /^(native_mcp_|native_generation_|operation_)[a-z_]+$/.test(error.code || '') ? error.code : 'native_mcp_failed';
            if (!controller.signal.aborted) response.status(code.includes('conflict') ? 409 : 400).json({ error: code });
        } finally { response.off('close', abort); }
    });
    for (const action of ['voices', 'describe', 'describe-observation', 'observe', 'start', 'status', 'cancel']) router.post('/speech/' + action, async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'no-store');
        const controller = new AbortController(), abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const speech = new SpeechService({ host: getHost() });
            const result = action === 'voices' ? await speech.voices(controller.signal)
                : await speech[action === 'describe-observation' ? 'observeDescription' : action](handle, request.body, action === 'start' ? controller.signal : undefined);
            if (!controller.signal.aborted) response.json(result);
        } catch (error) {
            const code = /^(native_speech_|native_generation_|operation_)[a-z_]+$/.test(error.code || '') ? error.code : 'native_speech_failed';
            if (!controller.signal.aborted) response.status(code.includes('conflict') ? 409 : 400).json({ error: code });
        } finally { response.off('close', abort); }
    });
    for (const [path, Consumer, actions] of [
        ['comparison', CandidateComparisonService, ['prepare', 'current', 'feedback']],
        ['project-comparison', ProjectComparisonService, ['prepare', 'current', 'outcome']],
    ]) for (const action of actions) router.post('/' + path + '/' + action, async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'private, no-store');
        const controller = new AbortController();
        const abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const result = await new Consumer({ host: getHost() })[action](handle, request.body, controller.signal);
            if (!controller.signal.aborted) response.json(result);
        } catch (error) {
            const code = /^(native_comparison_|native_project_comparison_|native_generation_|native_studio_restore_)[a-z_]+$/.test(error.code || '')
                ? error.code : 'native_comparison_failed';
            if (!controller.signal.aborted) response.status(code.includes('conflict') ? 409 : 400).json({ error: code });
        } finally { response.off('close', abort); }
    });
    for (const action of ['prepare', 'current']) router.post('/prediction/' + action, async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'private, no-store');
        const controller = new AbortController();
        const abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const result = await new PredictionService({ host: getHost() })[action](handle, request.body, controller.signal);
            if (!controller.signal.aborted) response.json(result);
        } catch (error) {
            const code = /^(native_prediction_|native_generation_|generation_)[a-z_]+$/.test(error.code || '') ? error.code : 'native_prediction_failed';
            if (!controller.signal.aborted) response.status(code.includes('conflict') ? 409 : 400).json({ error: code });
        } finally { response.off('close', abort); }
    });
    for (const action of ['create-preflight', 'create-checked']) router.post('/goals/' + action, async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            const host = getHost(), core = host.sessionCore ? Object.create(host.sessionCore) : null;
            if (core) core.load = (owner, id) => host.sessionCore.observe(owner, id);
            const service = new AgentGoalService({ engine: host.persistence._engine, sessionCore: core, studio: host.studio, agent: host.agent, chatRepo: getChats() });
            if (action === 'create-preflight') return res.json(await service.previewCreate(handle, req.body));
            fields(req.body, ['definition', 'expectedAnchorFingerprint'], 'Reviewed Goal creation');
            if (!/^[a-f0-9]{64}$/.test(req.body.expectedAnchorFingerprint || '')) throw new TypeError('Exact Goal anchor required');
            res.json(await service.create(handle, req.body.definition, { expectedAnchorFingerprint: req.body.expectedAnchorFingerprint }));
        } catch (error) { res.status(error?.name === 'ConflictError' ? 409 : 400).json({ error: 'agent_goal_creation_failed' }); }
    });
    for (const action of ['preflight', 'controlled']) router.post('/goals/' + action, async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            const result = await new GoalContinuationService({ host: getHost(), chatRepo: getChats() })[action](handle, req.body);
            if (result?.completion) { const { completion: _completion, ...ack } = result; return res.json(ack); }
            res.json(result);
        } catch (error) { res.status(error?.name === 'ConflictError' ? 409 : 400).json({ error: 'agent_goal_controlled_failed' }); }
    });
    router.post('/evidence/preflight', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            fields(req.body, ['scope', 'selectors'], 'Evidence preflight');
            const host = getHost(), sessionCore = host.sessionCore ? Object.create(host.sessionCore) : null;
            if (sessionCore) sessionCore.load = (owner, id) => host.sessionCore.observe(owner, id);
            const agent = host.agent ? Object.create(host.agent) : null;
            if (agent) agent.getTask = async (owner, project, task) => {
                const { storedIntegrity: _integrity, ...snapshot } = await host.agent.observeTask(owner, project, task);
                return snapshot;
            };
            const service = new AgentEvidenceService({ chatRepo: getChats(), sessionCore, studio: host.studio, agent });
            res.json(await service.capture(handle, req.body.scope, req.body.selectors, { maxSources: 32, maxBytes: 131072, maxScanMessages: 8192 }));
        } catch { res.status(400).json({ error: 'agent_evidence_preflight_failed' }); }
    });
    for (const action of ['create', 'list', 'get', 'snapshot', 'snapshots', 'control', 'evaluate', 'context', 'associations', 'bind', 'wake', 'pump', 'inspect']) router.post('/goals/' + action, async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            if (action === 'list') fields(req.body, [], 'Goal list');
            const host = getHost();
            if (['snapshot', 'snapshots'].includes(action)) {
                const service = new AgentGoalService({ engine: host.persistence._engine });
                fields(req.body, action === 'snapshot' ? ['goalId'] : [], 'Goal snapshot');
                const document = action === 'snapshot' ? await service.repository.get(handle, req.body.goalId) : await service.repository.list(handle);
                return res.json({ document, validity: 'not_reconciled', observation: 'persisted_snapshot' });
            }
            if (['bind', 'wake', 'pump', 'inspect', 'control'].includes(action)) {
                const continuation = new GoalContinuationService({ host, chatRepo: getChats() });
                const result = await continuation[action](handle, req.body);
                if (result?.completion) { const { completion: _completion, ...ack } = result; return res.json(ack); }
                return res.json(result);
            }
            const goal = new AgentGoalService({ engine: host.persistence._engine, sessionCore: host.sessionCore, studio: host.studio, agent: host.agent, chatRepo: getChats() });
            res.json(await goal[action](handle, req.body));
        } catch (error) {
            res.status(error?.name === 'ConflictError' ? 409 : error?.code === 'storage_read_only' ? 503 : error?.name === 'NotFoundError' ? 404 : 400)
                .json({ error: error?.name === 'ConflictError' ? error.code : 'agent_goal_unavailable' });
        }
    });
    for (const action of ['begin', 'update', 'inspect', 'snapshot', 'delete']) router.post('/evidence/' + action, async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            const host = getHost();
            if (action === 'snapshot') {
                fields(req.body, ['evidenceId'], 'Evidence snapshot');
                return res.json({ document: await new AgentEvidenceRepository({ engine: host.persistence._engine }).get(handle, req.body.evidenceId),
                    validity: 'not_reconciled', observation: 'persisted_snapshot' });
            }
            const repository = new AgentEvidenceRepository({ engine: host.persistence._engine });
            const service = new AgentEvidenceService({ chatRepo: getChats(), sessionCore: host.sessionCore });
            const capture = new RpEvidenceCaptureService({ repository, service, experience: new AgentExperienceService({ engine: host.persistence._engine, chatRepo: getChats(), sessionCore: host.sessionCore }) });
            const result = await capture[action](handle, req.body);
            if (result.collection?.status === 'collected') {
                try { await new AgentEvolutionService({ host, chatRepo: getChats() }).wake(handle, result.collection.scope, result.collection.subject); } catch { result.collection.wake = 'unavailable'; }
            }
            if (action === 'update') await observeEvolutionRp(host.persistence._engine, handle, req.body.evidenceId);
            return res.json(result);
        } catch (error) {
            res.status(error?.name === 'ConflictError' ? 409 : error?.code === 'storage_read_only' ? 503 : 400).json({ error: 'agent_evidence_' + (error?.status || 'unavailable') });
        }
    });
    router.post('/evidence/controlled', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            fields(req.body, ['action', 'input', ...(req.body.expectedSourcesFingerprint === undefined ? [] : ['expectedSourcesFingerprint']),
                ...(req.body.expectedSequence === undefined ? [] : ['expectedSequence']), ...(req.body.expectedRecordFingerprint === undefined ? [] : ['expectedRecordFingerprint'])], 'Controlled Evidence');
            const { action, input } = req.body;
            if (!['begin', 'update', 'inspect', 'delete'].includes(action)) throw new TypeError('Fixed Evidence action required');
            const host = getHost(), repository = new AgentEvidenceRepository({ engine: host.persistence._engine });
            const service = new AgentEvidenceService({ chatRepo: getChats(), sessionCore: host.sessionCore });
            if (action === 'begin' && !/^[a-f0-9]{64}$/.test(req.body.expectedSourcesFingerprint || '')) throw new TypeError('Reviewed source fingerprint required');
            if (action === 'update' && (!Number.isSafeInteger(req.body.expectedSequence) || req.body.expectedSequence < 0)) throw new TypeError('Reviewed sequence required');
            if (action === 'delete' && !/^[a-f0-9]{64}$/.test(req.body.expectedRecordFingerprint || '')) throw new TypeError('Reviewed record fingerprint required');
            const result = await new RpEvidenceCaptureService({ repository, service })[action](handle, input,
                action === 'begin' ? { expectedSourcesFingerprint: req.body.expectedSourcesFingerprint }
                    : action === 'update' ? { expectedSequence: req.body.expectedSequence } : action === 'delete' ? { expectedIntegrity: req.body.expectedRecordFingerprint } : undefined);
            res.json({ result, automaticExperienceCollection: 'suppressed', automaticEvolutionWake: 'suppressed' });
        } catch (error) { res.status(error?.name === 'ConflictError' ? 409 : 400).json({ error: 'agent_evidence_controlled_failed' }); }
    });
    router.post('/experience/controlled', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            fields(req.body, ['action', 'input', ...(req.body.expectedSubject === undefined ? [] : ['expectedSubject']), ...(req.body.expectedSourceSetFingerprint === undefined ? [] : ['expectedSourceSetFingerprint'])], 'Controlled Experience');
            const { action, input } = req.body;
            if (!['target', 'submit', 'outcome', 'collect', 'checkQuality', 'inspect', 'correct', 'withdraw', 'delete', 'diagnose', 'withdrawDiagnosis', 'deleteDiagnosis', 'reflection', 'export', 'exportLearning', 'retention', 'purge', 'purgeSources', 'deleteScope'].includes(action)) throw new TypeError('Fixed Experience action required');
            const host = getHost(), service = new AgentExperienceService({ engine: host.persistence._engine, chatRepo: getChats(), sessionCore: host.sessionCore, studio: host.studio, agent: host.agent });
            const result = action === 'diagnose' ? await service.diagnose(handle, input, { origin: 'model_hypothesis' })
                : action === 'submit' ? await service.submit(handle, input, { expectedSubject: req.body.expectedSubject })
                    : action === 'purgeSources' ? await service.purgeSources(handle, input, { expectedSourceSetFingerprint: req.body.expectedSourceSetFingerprint }) : await service[action](handle, input);
            res.json({ result, automaticEvolutionWake: 'suppressed' });
        } catch (error) { res.status(error?.name === 'ConflictError' ? 409 : 400).json({ error: 'agent_experience_controlled_failed' }); }
    });
    for (const action of ['target', 'submit', 'outcome', 'collect', 'checkQuality', 'inspect', 'observe', 'observeSourceRetention', 'correct', 'withdraw', 'delete', 'diagnose', 'withdrawDiagnosis', 'deleteDiagnosis', 'reflection', 'export', 'export-learning', 'retention', 'purge', 'purgeSources', 'deleteScope']) router.post('/experience/' + action, async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            const host = getHost();
            if (['observe', 'observeSourceRetention'].includes(action)) return res.json(await new AgentExperienceService({ engine: host.persistence._engine,
                chatRepo: getChats(), sessionCore: host.sessionCore, studio: host.studio, agent: host.agent })[action](handle, req.body));
            const evolution = new AgentEvolutionService({ host, chatRepo: getChats() });
            const service = evolution.experience;
            const result = await service[action === 'export-learning' ? 'exportLearning' : action](handle, req.body);
            if (['submit', 'outcome', 'collect', 'checkQuality', 'diagnose'].includes(action) && result?.scope && result?.subject) void evolution.wake(handle, result.scope, result.subject).catch(() => {});
            return res.json(result);
        } catch (error) {
            return res.status(error?.name === 'ConflictError' ? 409 : error?.code === 'storage_read_only' ? 503 : 400).json({ error: 'agent_experience_unavailable' });
        }
    });
    router.post('/evolution/controlled-configure', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            fields(req.body, ['input', 'expectedObservationFingerprint'], 'Controlled Evolution configuration');
            if (!/^[a-f0-9]{64}$/.test(req.body.expectedObservationFingerprint)) throw new TypeError('Exact preflight fingerprint required');
            res.json(await new AgentEvolutionService({ host: getHost(), chatRepo: getChats() }).configure(handle, req.body.input,
                { expectedObservationFingerprint: req.body.expectedObservationFingerprint }));
        } catch (error) { res.status(error?.name === 'ConflictError' ? 409 : 400).json({ error: 'agent_evolution_controlled_configure_failed' }); }
    });
    router.post('/evolution/controlled-rollback', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            fields(req.body, ['scope', 'subject', 'publicationId', 'expectedSequence', 'expectedPublicationFingerprint'], 'Controlled Evolution rollback');
            const { expectedSequence, expectedPublicationFingerprint, ...input } = req.body;
            if (!Number.isSafeInteger(expectedSequence) || expectedSequence < 0 || !/^[a-f0-9]{64}$/.test(expectedPublicationFingerprint)) throw new TypeError('Exact publication and sequence required');
            res.json(await new AgentEvolutionService({ host: getHost(), chatRepo: getChats() }).rollback(handle, input,
                { expectedSequence, expectedPublicationFingerprint }));
        } catch (error) { res.status(error?.name === 'ConflictError' ? 409 : 400).json({ error: 'agent_evolution_controlled_rollback_failed' }); }
    });
    router.post('/evolution/controlled-label', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            const result = await new AgentEvolutionService({ host: getHost(), chatRepo: getChats() }).label(handle, req.body, { suppressAutomaticPublish: true });
            res.json({ ...result, automaticPublication: 'suppressed' });
        } catch (error) { res.status(error?.name === 'ConflictError' ? 409 : 400).json({ error: 'agent_evolution_controlled_label_failed' }); }
    });
    for (const action of ['inspect', 'observe', 'preflight', 'catalog', 'declare', 'budget', 'configure', 'start', 'start-learning', 'mode', 'label', 'publish', 'rollback', 'reconcile', 'export', 'workspace']) router.post('/evolution/' + action, async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { return res.json(await new AgentEvolutionService({ host: getHost(), chatRepo: getChats(), observationOnly: ['observe', 'preflight'].includes(action) })[action === 'start-learning' ? 'startLearning' : action](handle, req.body)); } catch (error) { return res.status(error?.name === 'ConflictError' ? 409 : error?.code === 'storage_read_only' ? 503 : 400).json({ error: error?.name === 'ConflictError' ? error.message : 'agent_evolution_unavailable' }); }
    });
    for (const [domain, actions] of [['mask', ['create', 'find', 'read', 'save', 'freeze']], ['media', ['prepare']], ['gallery', ['query', 'history', 'select', 'mark']], ['reference', ['promote', 'revoke']], ['gc', ['preview', 'mark', 'sweep']]]) {
        for (const action of actions) router.post('/visual/' + domain + '/' + action, async (req, res) => {
            const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
            res.set('Cache-Control', 'private, no-store');
            try {
                const host = getHost(), media = new MediaStudio({ host }), gallery = new VisualGallery({ host }), gc = new VisualMediaGc({ host }), input = req.body;
                let result;
                if (domain === 'mask') result = action === 'create' ? await media.createDraft(handle, input)
                    : action === 'find' ? await (async () => { await media.image(handle, input); return { items: (await media.store.list(handle, 'draft')).filter(draft => draft.source.sessionId === input.sessionId && draft.source.branchId === input.branchId && draft.imageVersionId === input.imageVersionId && Date.now() - draft.updatedAt <= 30 * 86400000).map(draft => ({ draftId: draft.draftId, updatedAt: draft.updatedAt })) }; })() : action === 'read' ? await media.draft(handle, input.draftId, input) : action === 'save' ? await media.saveDraft(handle, input) : await media.freezeMask(handle, input);
                else if (domain === 'media') result = await media.prepare(handle, input);
                else if (domain === 'gallery') result = await gallery[action](handle, input);
                else if (domain === 'reference') result = await gallery[action](handle, input);
                else result = action === 'preview' ? await gc.preview(handle, input) : action === 'mark' ? await gc.mark(handle, input.assetId, input) : await gc.sweep(handle, input.assetId);
                res.json(result);
            } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_visual_media_failed' }); }
        });
    }
    const visualAuthentication = (req, res, next) => req.user?.profile?.handle ? next() : res.sendStatus(401);
    router.post('/visual/mask/checkpoint-with-commands', visualAuthentication, multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 16 * 1024 * 1024, fields: 1, fieldSize: 1024 * 1024 } }).single('checkpoint'), async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        try { res.json(await new MediaStudio({ host: getHost() }).checkpoint(handle, JSON.parse(req.body.metadata), req.file.buffer)); } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_visual_checkpoint_failed' }); }
    });
    router.post('/visual/mask/checkpoint', visualAuthentication, express.raw({ type: 'application/octet-stream', limit: '16mb' }), async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        try { res.json(await new MediaStudio({ host: getHost() }).checkpoint(handle, req.query, req.body)); } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_visual_checkpoint_failed' }); }
    });
    router.get('/visual/mask/raster/:id', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        try {
            const media = new MediaStudio({ host: getHost() }), row = await media.draft(handle, req.params.id, req.query);
            res.set('Cache-Control', 'private, no-store').type('application/octet-stream').send(await media.raster(handle, { ...row.value, commands: [], cursor: 0 }));
        } catch (error) { res.status(400).json({ error: error.code || 'native_visual_mask_failed' }); }
    });
    router.get('/visual/gallery/thumbnail', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        try {
            const media = new MediaStudio({ host: getHost() }), base = await media.image(handle, req.query), asset = await media.assets.read(handle, base.asset.assetId);
            const input = PNG.sync.read(asset.bytes, { checkCRC: true }), scale = Math.min(1, 320 / input.width, 320 / input.height);
            const width = Math.max(1, Math.round(input.width * scale)), height = Math.max(1, Math.round(input.height * scale)), data = Buffer.alloc(width * height * 4);
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const source = (Math.min(input.height - 1, Math.floor(y / scale)) * input.width + Math.min(input.width - 1, Math.floor(x / scale))) * 4; input.data.copy(data, (y * width + x) * 4, source, source + 4); }
            res.set('Cache-Control', 'private, max-age=86400').type('image/png').send(PNG.sync.write({ width, height, data }));
        } catch { res.status(404).json({ error: 'native_visual_thumbnail_unavailable' }); }
    });
    for (const action of ['scan', 'list', 'prepare', 'submit', 'skip', 'analyze']) router.post('/visual/director/' + action, async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            const director = new VisualDirector({ host: getHost() }), input = req.body;
            const result = action === 'scan' ? await director.scan(handle, input.sessionId)
                : action === 'list' ? await director.list(handle, input.sessionId, input.branchId)
                    : action === 'submit' ? await director.submit(handle, input.shotId, input.approval)
                        : action === 'skip' ? await director.skip(handle, input.shotId, input.expectedRevision)
                            : action === 'analyze' ? await director.analyze(handle, input.shotId, AbortSignal.timeout(120000)) : await director.prepare(handle, input.shotId);
            res.json(result);
        } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_visual_director_failed' }); }
    });
    router.post('/visual/state/propose', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        try { res.json(await new VisualContinuity({ host: getHost() }).propose(handle, req.body)); } catch (error) { res.status(400).json({ error: error.code || 'native_visual_state_failed' }); }
    });
    router.post('/visual/targets/describe', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        try {
            const host = getHost(), configuration = new VisualConfiguration({ host });
            const target = (await configuration.resources.getCurrent(handle, 'core.image-target', req.body.imageTargetId))?.snapshot;
            if (!target) throw new TypeError('Target unavailable');
            const connection = await host.persistence.getConnectionProfile(handle, target.connectionProfileId), fingerprint = imageTargetFingerprint(target, connection);
            fields(req.body, ['imageTargetId', 'expectedTargetFingerprint', 'expectedConnectionFingerprint'], 'Image Target description');
            if (req.body.expectedTargetFingerprint !== undefined && req.body.expectedTargetFingerprint !== hashNativeDocument(target)
                || req.body.expectedConnectionFingerprint !== undefined && req.body.expectedConnectionFingerprint !== hashNativeDocument(connection))
                throw Object.assign(new Error('Image Target changed'), { code: 'native_visual_target_conflict' });
            const secret = connection.secretRef && ['provider.sd-webui-image', 'provider.forge-image', 'provider.comfyui-image'].includes(connection.providerAdapter) ? await host.secretPort.resolveSecret(connection.secretRef, { handle, connection }) : null;
            res.json({ targetFingerprint: fingerprint, capabilities: await createImageRegistry({ fetchImpl: credentialFetch }).get(connection.providerAdapter).describe({ target, connection, fingerprint, secret }) });
        } catch (error) { res.status(400).json({ error: error.code || 'native_visual_capability_failed' }); }
    });
    router.get('/visual/configuration', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await new VisualConfiguration({ host: getHost() }).read(handle)); } catch { res.status(400).json({ error: 'native_visual_configuration_failed' }); }
    });
    router.put('/visual/resources', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        try { res.json(await new VisualConfiguration({ host: getHost() }).save(handle, req.body)); } catch (error) { res.status(error.code?.includes('conflict') || error.name === 'ConflictError' ? 409 : 400).json({ error: error.code || 'native_visual_configuration_failed' }); }
    });
    router.put('/visual/budget', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        try { res.json(await new VisualConfiguration({ host: getHost() }).store.configureBudget(handle, req.body.value, req.body.expectedRevision)); } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_visual_budget_failed' }); }
    });
    router.get('/illustration-images', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.json(await new IllustrationImageService({ host: getHost() }).list(handle, req.query)); } catch { res.status(400).json({ error: 'native_illustration_request_invalid' }); }
    });
    router.get('/illustration-image-observations', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await new IllustrationImageService({ host: getHost() }).observeList(handle, req.query)); } catch { res.status(400).json({ error: 'native_illustration_observation_invalid' }); }
    });
    router.get('/illustration-images/:id/observation', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await new IllustrationImageService({ host: getHost() }).observe(handle, { operationId: req.params.id, summary: true })); } catch { res.status(404).json({ error: 'native_illustration_operation_missing' }); }
    });
    router.post('/illustration-images/reconcile', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await new IllustrationImageService({ host: getHost() }).reconcile(handle, req.body)); } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_illustration_reconcile_failed' }); }
    });
    router.post('/illustration-images/prepared/observe', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await new IllustrationImageService({ host: getHost() }).observePrepared(handle, req.body)); } catch { res.status(400).json({ error: 'native_illustration_prepared_observation_invalid' }); }
    });
    router.post('/illustration-images/prepare', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await new IllustrationImageService({ host: getHost() }).prepare(handle, req.body)); } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_visual_prepare_failed' }); }
    });
    router.delete('/illustration-images/:id', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.json(await new IllustrationImageService({ host: getHost() }).cancel(handle, { operationId: req.params.id })); } catch (error) { res.status(400).json({ error: error.code || 'native_visual_cancel_failed' }); }
    });
    router.post('/illustration-images', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.status(202).json(await new IllustrationImageService({ host: getHost() }).start(handle, req.body)); } catch (error) {
            res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_illustration_image_failed' });
        }
    });
    router.get('/illustration-images/:id', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.json(await new IllustrationImageService({ host: getHost() }).status(handle, { operationId: req.params.id, summary: req.query.summary === '1' })); } catch { res.status(404).json({ error: 'native_illustration_operation_missing' }); }
    });
    router.get('/illustration-prompts', (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.json(new IllustrationPromptService({ host: getHost() }).list(handle, req.query)); } catch { res.status(400).json({ error: 'native_illustration_request_invalid' }); }
    });
    router.post('/illustration-prompts', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.status(202).json(await new IllustrationPromptService({ host: getHost() }).start(handle, req.body)); } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_illustration_prompt_failed' }); }
    });
    router.get('/illustration-prompts/:id', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.json(await new IllustrationPromptService({ host: getHost() }).status(handle, { operationId: req.params.id })); } catch { res.status(404).json({ error: 'native_illustration_operation_missing' }); }
    });
    router.get('/operations/:id', (req, res) => {
        if (!req.user?.profile?.handle) return res.sendStatus(401);
        try { res.json(nativeTaskScheduler.project(req.user.profile.handle, req.params.id)); } catch { res.sendStatus(404); }
    });
    router.post('/rp/preflight', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle || req.user.profile.enabled === false) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            const review = await getHost().preflightRp(handle, req.body);
            res.set('X-Atria-Preflight-Fingerprint', hashNativeDocument(review)); res.json(review);
        } catch (error) { const { status, code } = generationFailure(error); res.status(status).json({ error: code }); }
    });
    router.post('/rp/source', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle || req.user.profile.enabled === false) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            assertObject(req.body, ['locator', 'expectedHostBootId'], 'RP source identity');
            const host = getHost(), hostBootId = host.persistence._engine.nativeHostLifecycle.hostBootId;
            if (req.body.expectedHostBootId !== hostBootId || req.get('X-Atria-Host-Boot-Id') !== hostBootId)
                return res.status(409).json({ error: 'native_orchestration_host_changed', hostBootId });
            const control = host.turnOrchestration?.rpControl;
            if (!(control instanceof RpRunControl) || control._engine !== host.persistence._engine)
                throw Object.assign(new Error('Original RP source authority required'), { code: 'native_orchestration_rp_authority_unavailable' });
            res.json({ ...await control.bind(handle, req.body.locator), hostBootId });
        } catch (error) { const { status, code } = generationFailure(error); res.status(status).json({ error: code }); }
    });
    router.post('/rp/start', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle || req.user.profile.enabled === false) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            assertObject(req.body, ['input', 'expectedPreflightFingerprint', 'expectedHostBootId'], 'RP reviewed start');
            const host = getHost(), hostBootId = host.persistence._engine.nativeHostLifecycle.hostBootId;
            if (req.body.expectedHostBootId !== hostBootId || req.get('X-Atria-Host-Boot-Id') !== hostBootId)
                return res.status(409).json({ error: 'native_orchestration_host_changed', hostBootId });
            if (typeof req.body.expectedPreflightFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.expectedPreflightFingerprint))
                throw new TypeError('Exact RP preflight required');
            const operation = await host.startRp(handle, req.body.input, { expectedPreflightFingerprint: req.body.expectedPreflightFingerprint });
            res.status(202).json({ operationId: operation.operationId, hostBootId });
        } catch (error) { const { status, code } = generationFailure(error); res.status(status).json({ error: code }); }
    });
    router.get('/operations/:id/result', (req, res) => {
        if (!req.user?.profile?.handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { res.json(nativeTaskScheduler.result(req.user.profile.handle, req.params.id)); } catch (error) { res.status(error.code === 'operation_not_found' ? 404 : 409).json({ error: error.code }); }
    });
    router.post('/execute/start', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            fields(req.body, ['input', 'approvedReview'], 'Reviewed Native execution');
            fields(req.body.approvedReview, ['snapshotFingerprint', 'configurationFingerprint'], 'Exact generation review');
            if (![req.body.approvedReview.snapshotFingerprint, req.body.approvedReview.configurationFingerprint]
                .every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) throw new TypeError('Exact generation review required');
            await getHost().execute(handle, req.body.input, undefined, chunk => {
                if (!res.headersSent && chunk.operationId) res.status(202).json({ operationId: chunk.operationId, recovery: 'Observe the same Native operation; never resend an unknown Provider request' });
            }, { effectPolicy: 'no-background-model', retainResult: true, approvedReview: req.body.approvedReview });
        } catch (error) {
            if (!res.headersSent) res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: /^(?:native_|generation_|operation_)[a-z_]+$/.test(error.code ?? '') ? error.code : 'native_generation_failed' });
        }
    });
    router.delete('/operations/:id', (req, res) => {
        if (!req.user?.profile?.handle) return res.sendStatus(401);
        try { res.json({ cancelled: nativeTaskScheduler.cancel(req.user.profile.handle, req.params.id) }); } catch { res.sendStatus(404); }
    });
    router.post('/task-bindings/preflight', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.json(await getHost().preflightTaskBindings(handle, req.body)); } catch (error) {
            res.status(400).json({ error: error.code || 'native_task_binding_preflight_failed' });
        }
    });
    router.post('/play/prepare', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.json(await getHost().preparePlay(handle, req.body)); } catch (error) {
            res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_play_prepare_failed' });
        }
    });
    router.post('/lifecycle/prepare', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.json(await getHost().prepareLifecycle(handle, req.body)); } catch (error) {
            res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_lifecycle_preflight_failed' });
        }
    });
    router.post('/lifecycle', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try { res.json(await getHost().executeLifecycle(handle, req.body)); } catch (error) {
            res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_lifecycle_execution_failed' });
        }
    });
    router.post('/execution/preflight', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await getHost().executionPreflight(handle, req.body)); } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_generation_preflight_failed' }); }
    });
    router.post('/turn/controlled/preflight', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { res.json(await getHost().preflightControlledTurn(handle, req.body)); } catch (error) { res.status(error.code?.includes('conflict') ? 409 : 400).json({ error: error.code || 'native_turn_preflight_failed' }); }
    });
    router.post('/turn/controlled/start', async (req, res) => {
        const handle = req.user?.profile?.handle; if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            const result = await getHost().executeControlledTurn(handle, req.body, undefined, chunk => {
                if (!res.headersSent && chunk.operationId) res.status(202).json({ operationId: chunk.operationId });
            });
            if (!res.headersSent) res.json({ sessionId: result.session.sessionId, revisionId: result.revision.revisionId, branchId: result.revision.branchId });
        } catch (error) { if (!res.headersSent) res.status(error.name === 'ConflictError' || error.code?.includes('conflict') || error.code?.includes('stale') ? 409 : 400).json({ error: error.code || 'native_turn_controlled_failed' }); }
    });
    router.post(['/task/start', '/turn/start'], async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        // Explicit detached work survives view closure, but not Host restart.
        // Its final result still enters the existing revision-backed Session.
        try {
            const host = getHost();
            const execute = req.path === '/turn/start' ? host.executeTurn.bind(host) : host.executeTask.bind(host);
            const result = await execute(handle, req.body, undefined, chunk => {
                if (!res.headersSent && chunk.operationId) res.status(202).json({ operationId: chunk.operationId });
            });
            if (!res.headersSent) res.json(result);
        } catch (error) {
            const failure = generationFailure(error, 'native_task_start_failed');
            if (!res.headersSent) res.status(failure.status).json({ error: failure.code });
        }
    });
    const presets = host => new PromptPresetStore({ engine: host.library._engine });
    for (const action of ['inspect', 'declare', 'prepare', 'check', 'checkRollback', 'apply', 'rollback']) router.post('/presets/:id/prompt-candidates/' + action, async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            const store = new PromptCandidateStore({ engine: getHost().library._engine });
            const input = ['check', 'checkRollback', 'apply', 'rollback'].includes(action) ? req.body.candidateId : req.body;
            res.json(await store[action](handle, req.params.id, input));
        } catch (error) {
            res.status(error.name === 'ConflictError' ? 409 : error.name === 'NotFoundError' ? 404 : error.code === 'storage_read_only' ? 503 : 400).json({ error: 'native_prompt_candidate_unavailable' });
        }
    });
    router.get(['/regex-scopes', '/prompt-scope'], async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try {
            if (req.query.routeId !== undefined && typeof req.query.routeId !== 'string') throw new TypeError('Invalid route');
            const host = getHost();
            const route = selectNativeRuntimeRoute(await host.persistence.listRuntimeRoutes(handle), 'role.narrator', req.query.routeId ? { runtimeRouteId: req.query.routeId } : undefined);
            const preset = await presets(host).resolveRegex(handle, route.promptProgramRef);
            res.json({ preset: req.path === '/prompt-scope' && preset ? { presetId: preset.presetId, revision: preset.revision } : preset });
        } catch (error) {
            if (!req.query.routeId && error.code === 'native_generation_route_missing') return res.json({ preset: null });
            res.status(400).json({ error: error.code || 'native_regex_scopes_unavailable' });
        }
    });
    router.delete('/presets/:id', async (req, res) => {
        if (!req.user?.profile?.handle) return res.sendStatus(401);
        try { res.json(await presets(getHost()).delete(req.user.profile.handle, req.params.id, req.body.expectedRevision)); } catch (error) { res.status(error.code === 'native_prompt_preset_conflict' ? 409 : 400).json({ error: error.code || 'native_prompt_preset_delete_failed' }); }
    });
    router.get('/presets', async (req, res) => {
        if (!req.user?.profile?.handle) return res.sendStatus(401);
        try { res.json(await presets(getHost()).list(req.user.profile.handle)); } catch { res.status(400).json({ error: 'native_prompt_presets_unavailable' }); }
    });
    router.get('/presets/:id', async (req, res) => {
        if (!req.user?.profile?.handle) return res.sendStatus(401);
        try { res.json(await presets(getHost()).get(req.user.profile.handle, req.params.id)); } catch { res.status(404).json({ error: 'native_prompt_preset_unavailable' }); }
    });
    for (const method of ['post', 'put']) router[method](method === 'post' ? '/presets' : '/presets/:id', async (req, res) => {
        if (!req.user?.profile?.handle) return res.sendStatus(401);
        try {
            res.json(await presets(getHost()).save(req.user.profile.handle, req.body.preset, { id: req.params.id || null, expectedRevision: req.body.expectedRevision, importing: req.body.importing === true }));
        } catch (error) { res.status(error.code === 'native_prompt_preset_conflict' ? 409 : 400).json({ error: error.code || 'native_prompt_preset_invalid', message: error.message }); }
    });
    const resourceReferences = async (host, handle, ref) => {
        const references = [...await host.studio.getResourceReferences(handle, ref, { reverse: true })].filter(item => !(item.node?.scope === 'library' && item.node.resourceType === ref.resourceType && item.node.resourceId === ref.resourceId));
        for (const route of await host.persistence.listRuntimeRoutes(handle)) {
            if ([route.promptProgramRef, route.generationProfileRef, ...(route.projectPromptBindings || []).map(b => b.promptProgramRef)].some(item => item.scope === 'library' && item.resourceType === ref.resourceType && item.resourceId === ref.resourceId && (!ref.revision || item.revision === ref.revision))) {
                references.push({ node: { displayName: route.displayName, resourceType: 'core.runtime-route', resourceId: route.runtimeRouteId, scope: 'player', metadata: { exactRef: ref } }, owner: 'Runtime', edge: { kind: 'runtime-route-exact', from: route.runtimeRouteId } });
            }
        }
        return references;
    };
    router.post('/resources/delete', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const ref = assertExactResourceRef(request.body); const host = getHost();
            response.json(await host.library.delete(handle, ref, target => resourceReferences(host, handle, target)));
        } catch (error) {
            response.status(error.code === 'native_resource_referenced' ? 409 : 400).json({ error: error.code === 'native_resource_referenced' ? error.code : 'native_resource_delete_failed', details: error.details });
        }
    });
    router.get('/prompt-controls/:id', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try {
            const host = getHost(); const route = await host.persistence.getRuntimeRoute(handle, req.params.id);
            const definitions = await readPromptControls(host, handle, route);
            res.json({ route, definitions });
        } catch { res.status(400).json({ error: 'native_prompt_controls_unavailable' }); }
    });
    router.put('/prompt-controls/:id', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        try {
            const host = getHost();
            const route = await host.persistence.updatePromptParameters(handle, req.params.id, req.body.expected, req.body.parameters,
                async route => validatePromptOverrides(await readPromptControls(host, handle, route), req.body.parameters));
            res.json(route);
        } catch (error) { res.status(409).json({ error: error.code === 'native_prompt_controls_conflict' ? error.code : 'native_prompt_controls_invalid' }); }
    });
    router.get('/retrieval', async (req, res) => {
        if (!req.user?.profile?.handle) return res.sendStatus(401);
        try { res.json(await new NativeRetrievalPersistence({ engine: getStorageEngine() }).list(req.user.profile.handle)); } catch { res.status(500).json({ error: 'native_retrieval_unavailable' }); }
    });
    router.post('/retrieval', async (req, res) => {
        if (!req.user?.profile?.handle) return res.sendStatus(401);
        try { res.json(await new NativeRetrievalPersistence({ engine: getStorageEngine() }).commit(req.user.profile.handle, req.body)); } catch (error) { res.status(error.code === 'native_immutable_conflict' ? 409 : 400).json({ error: error.code === 'storage_read_only' ? error.code : 'native_retrieval_invalid' }); }
    });
    router.post('/retrieval-work', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try {
            fields(req.body, ['computeContext', 'input', 'phase'], 'Memory work');
            const host = getHost();
            res.json(await admitMemoryCorpusWork({ handle, context: req.body.computeContext, input: req.body.input, phase: req.body.phase,
                persistence: host.persistence, core: host.sessionCore, agent: host.agent, studio: host.studio }));
        } catch (error) {
            const code = ['native_generation_budget_exhausted', ...NATIVE_RETRIEVAL_SCOPE_ERRORS].includes(error.code) ? error.code : 'native_retrieval_compute_invalid';
            res.status(code === 'storage_read_only' ? 503 : 400).json({ error: code });
        }
    });
    router.post('/skill-work', async (req, res) => {
        const handle = req.user?.profile?.handle;
        if (!handle) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        const controller = new AbortController();
        res.once('close', () => { if (!res.writableEnded) controller.abort(); });
        try {
            fields(req.body, ['operation', 'input', 'computeContext'], 'Project Skill work');
            if (req.body.computeContext?.kind !== 'project') throw new TypeError('Original Project Task required');
            const host = getHost();
            const compute = await prepareRetrievalCompute({ handle, context: req.body.computeContext, profile: { mode: 'embed', purpose: 'studio.skill.v1' },
                persistence: host.persistence, core: host.sessionCore, agent: host.agent, studio: host.studio });
            const result = await executeProjectSkillWork({ ...req.body, compute, repository: host.skillRepository(handle),
                projectId: req.body.computeContext.projectId, settings: req.body.operation === 'list' ? (await host.extensions.settings(handle)).value : undefined,
                signal: controller.signal });
            if (!res.destroyed) res.json(result);
        } catch (error) {
            const code = ['native_generation_budget_exhausted', 'generation_cancelled', ...NATIVE_RETRIEVAL_SCOPE_ERRORS].includes(error.code) ? error.code : 'native_skill_execution_failed';
            if (!res.destroyed) res.status(code === 'storage_read_only' ? 503 : 400).json({ error: code });
        }
    });
    router.delete('/configuration/:kind/:id', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try { response.json(await getHost().persistence.deleteProfile(handle, request.params.kind, request.params.id)); } catch (error) {
            if (error.code === 'native_runtime_referenced') return response.status(409).json({ error: error.code, details: error.details });
            response.status(error.status || (error.name === 'ConflictError' ? 409 : 400)).json({ error: error.code || 'native_runtime_delete_failed' });
        }
    });
    router.post('/resources/archive', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const { ref, archived } = request.body; const exact = assertExactResourceRef(ref);
            if (exact.scope !== 'library') throw new TypeError('Library owner required');
            const host = getHost(); await host.library.getExact(handle, exact);
            response.json(await host.library.setArchived(handle, exact.resourceType, exact.resourceId, archived));
        } catch { response.status(400).json({ error: 'native_resource_archive_failed' }); }
    });
    router.post('/resources/used-by', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const ref = assertExactResourceRef(request.body); const host = getHost();
            if (ref.scope !== 'library') throw new TypeError('Library owner required');
            const references = [...await host.studio.getResourceReferences(handle, ref, { reverse: true })];
            for (const route of await host.persistence.listRuntimeRoutes(handle)) {
                if ([route.promptProgramRef, route.generationProfileRef, ...(route.projectPromptBindings || []).map(b => b.promptProgramRef)].some(item => item.scope === 'library' && item.resourceType === ref.resourceType && item.resourceId === ref.resourceId && item.revision === ref.revision)) {
                    references.push({ node: { displayName: route.displayName, resourceType: 'core.runtime-route', resourceId: route.runtimeRouteId, scope: 'player', metadata: { exactRef: ref } }, owner: 'Runtime', edge: { kind: 'runtime-route-exact', from: route.runtimeRouteId } });
                }
            }
            response.json(references);
        } catch { response.status(400).json({ error: 'native_resource_references_failed' }); }
    });
    for (const action of ['inspect', 'authorize']) router.post('/connections/credential-target/' + action, async (request, response) => {
        const handle = request.user?.profile?.handle; if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'private, no-store');
        try { response.json(await new CredentialTargetAuthority({ persistence: getHost().persistence })[action](handle, request.body)); } catch (error) { response.status(error?.name === 'ConflictError' ? 409 : 400).json({ error: /^native_credential_[a-z_]+$/.test(error.code || '') ? error.code : 'native_credential_authorization_failed' }); }
    });
    router.post('/connections/probe', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        const controller = new AbortController();
        const abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const host = getHost();
            const connection = assertConnectionProfile(request.body);
            prepareProviderDiscovery(connection);
            // Even injected Hosts must prove that a saved profile's independently
            // approved destination is exact before resolving its credential.
            await new CredentialTargetAuthority({ persistence: host.persistence }).assertConnection(handle, connection);
            const secret = await host.secretPort.resolveSecret(connection.secretRef, { handle, connection });
            if (!secret) throw Object.assign(new Error('Missing Secret'), { code: 'generation_secret_unavailable' });
            response.json(await discoverProviderModels(connection, { secret, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), fetchImpl: credentialFetch }));
        } catch (error) {
            const code = error.code;
            response.status(400).json({ error: typeof code === 'string' && (code.startsWith('native_provider_') || code.startsWith('native_credential_') || code === 'generation_secret_unavailable') ? code : 'native_provider_probe_invalid' });
        } finally { response.off('close', abort); }
    });
    router.get('/secrets', (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            response.json(new SecretManager(getUserDirectories(handle)).listReferences());
        } catch { response.status(500).json({ error: 'native_secret_inventory_unavailable' }); }
    });
    router.post('/secrets', (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            assertWritable();
            const { label, value } = request.body;
            if (typeof label !== 'string' || !label.trim() || label.length > 120
                || typeof value !== 'string' || !value.trim() || value.length > 16384
                || Object.keys(request.body).some(key => !['label', 'value'].includes(key))) throw new Error('Invalid Secret');
            const secretId = new SecretManager(getUserDirectories(handle)).writeSecret(SECRET_KEYS.ATRIA_RUNTIME, value, label.trim(), { activate: false });
            response.status(201).json({ secretId, label: label.trim() });
        } catch { response.status(400).json({ error: 'native_secret_create_failed' }); }
    });
    router.post('/routes/resolve', async (request, response) => {
        const handle = request.user?.profile?.handle; if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'private, no-store');
        try {
            fields(request.body, ['routeRef', 'role', 'requirements'], 'Route resolution');
            const host = getHost(), resolver = new RouteResolver({ persistence: host.persistence, library: host.library, providers: host.providers });
            response.json(await resolver.resolve({ handle, ...request.body }));
        } catch (error) { response.status(400).json({ error: /^generation_[a-z_]+$/.test(error.code || '') ? error.code : 'native_route_resolution_failed' }); }
    });
    router.post('/resources/exact', async (request, response) => {
        const handle = request.user?.profile?.handle; if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'private, no-store');
        try {
            const ref = assertExactResourceRef(request.body);
            if (ref.scope !== 'library' || !VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(ref.resourceType)) throw new TypeError('Exact Library resource required');
            response.json(await getHost().library.getExact(handle, ref));
        } catch { response.status(404).json({ error: 'native_resource_exact_unavailable' }); }
    });
    router.post('/resources/current', async (request, response) => {
        const handle = request.user?.profile?.handle; if (!handle) return response.sendStatus(401);
        response.set('Cache-Control', 'private, no-store');
        try {
            fields(request.body, ['resourceType', 'resourceId'], 'Current Library resource');
            if (!VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(request.body.resourceType)) throw new TypeError('Unsupported resource');
            response.json(await getHost().library.getCurrent(handle, request.body.resourceType, request.body.resourceId));
        } catch { response.status(404).json({ error: 'native_resource_current_unavailable' }); }
    });
    router.post('/resources/revision', async (request, response) => {
        const handle = request.user?.profile?.handle; if (!handle) return response.sendStatus(401);
        try {
            fields(request.body, ['resourceType', 'resource', 'expectedCurrentRevision'], 'Library revision publication');
            const { resourceType, resource, expectedCurrentRevision } = request.body;
            if (!VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(resourceType) || expectedCurrentRevision !== null && typeof expectedCurrentRevision !== 'string') throw new TypeError('Exact current Revision required');
            response.json(await getHost().library.commit(handle, resourceType, resource, { expectedCurrentRevision }));
        } catch (error) { response.status(error?.name === 'ConflictError' ? 409 : 400).json({ error: 'native_resource_revision_conflict' }); }
    });
    router.get('/configuration', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const host = getHost();
            const [connections, models, routes, resources] = await Promise.all([
                host.persistence.listConnectionProfiles(handle), host.persistence.listModelProfiles(handle),
                host.persistence.listRuntimeRoutes(handle), host.library.listWithRevisions(handle),
            ]);
            const profiles = await Promise.all(resources.filter(item => item.resourceType === 'core.generation-profile')
                .map(item => host.library.getCurrent(handle, item.resourceType, item.resourceId)));
            response.json({ connections, models, routes, resources, profiles: profiles.map(item => item.snapshot) });
        } catch { response.status(500).json({ error: 'native_generation_configuration_unavailable' }); }
    });
    // Read-through catalog: exact P1 Library, Project source and installed Package authority.
    router.get('/resources', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const host = getHost();
            const entries = [];
            const append = (resourceType, resource, scope, archived = false, presetOwner = null) => {
                const identity = getVersionedModelPromptResourceIdentity(resourceType, resource);
                entries.push({ ref: { resourceType, resourceId: identity.resourceId, revision: identity.revision, ...scope }, resource, ...(archived ? { archived: true } : {}), ...(presetOwner ? { presetOwner } : {}) });
            };
            for (const item of await host.library.listWithRevisions(handle)) {
                for (const revision of item.revisions) {
                    const exact = await host.library.getExact(handle, { ...item, revision });
                    append(item.resourceType, exact.snapshot, { scope: 'library' }, item.archived, item.presetOwner);
                }
            }
            for (const item of await host.studio.listProjects(handle)) {
                const project = await host.studio.getProject(handle, item.project.projectId);
                for (const entry of project.source.resources || []) append(entry.resourceType, entry.resource, { scope: 'project', projectId: item.project.projectId });
            }
            for (const item of await host.studio.listLibraryResources(handle, { resourceType: 'core.package' })) {
                for (const version of item.revisions) {
                    const opened = await host.packageInstaller.open(handle, item.resourceId, version);
                    for (const entry of opened.manifest.resources || []) append(entry.resourceType, entry.resource, { scope: 'package', packageId: item.resourceId, packageVersionId: version });
                }
            }
            response.json(entries);
        } catch { response.status(500).json({ error: 'native_generation_resources_unavailable' }); }
    });
    router.post('/resources', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const { resourceType, resource } = request.body;
            if (!VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(resourceType)) throw new TypeError('Unsupported resource');
            response.json(await getHost().library.commit(handle, resourceType, resource));
        } catch { response.status(400).json({ error: 'native_generation_resource_invalid' }); }
    });
    router.put('/configuration/:kind', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        try {
            const host = getHost();
            const methods = { connections: 'saveConnectionProfile', models: 'saveModelProfile', routes: 'saveRuntimeRoute' };
            const method = methods[request.params.kind];
            if (request.params.kind === 'connections') {
                const endpoint = new URL(request.body.endpoint);
                if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Endpoint must not contain credentials');
            }
            if (request.params.kind === 'routes') {
                const candidate = request.body;
                // Validate against exact P1 resources before mutating the player route.
                const persistence = Object.create(host.persistence);
                persistence.getRuntimeRoute = async (owner, id) => id === candidate.runtimeRouteId ? candidate : host.persistence.getRuntimeRoute(owner, id);
                const resolver = new RouteResolver({ persistence, library: host.library, providers: host.providers });
                // Project/Package refs require their host context at preview/execute time.
                if (candidate.generationProfileRef?.scope === 'library' && candidate.promptProgramRef?.scope === 'library') {
                    await resolver.resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: candidate.runtimeRouteId }, role: candidate.role });
                }
                const visited = new Set();
                const visit = async (route, active = new Set()) => {
                    if (active.has(route.runtimeRouteId)) throw new Error('Fallback cycle');
                    if (visited.has(route.runtimeRouteId)) return;
                    if (visited.size >= 128) throw new Error('Fallback graph too large');
                    visited.add(route.runtimeRouteId);
                    const next = new Set(active).add(route.runtimeRouteId);
                    for (const ref of route.fallbackRouteRefs || []) {
                        const fallback = await persistence.getRuntimeRoute(handle, ref.runtimeRouteId);
                        if (!fallback || fallback.role !== candidate.role) throw new Error('Fallback role mismatch');
                        await visit(fallback, next);
                    }
                };
                await visit(candidate);
            }
            if (method) return response.json(await host.persistence[method](handle, request.body, {
                expectedFingerprint: request.headers['if-match'],
                validate: async route => {
                    for (const ref of [route.promptProgramRef, route.generationProfileRef, ...(route.projectPromptBindings || []).map(b => b.promptProgramRef)]) if (ref.scope === 'library') await host.library.getExact(handle, ref);
                    await presets(host).assertPair(handle, route.promptProgramRef, route.generationProfileRef);
                },
            }));
            return response.sendStatus(404);
        } catch (error) { response.status(error.code === 'native_generation_configuration_conflict' ? 409 : 400).json({ error: ['native_runtime_fallback_role', 'native_generation_configuration_conflict'].includes(error.code) ? error.code : 'native_generation_configuration_invalid' }); }
    });
    router.post(['/execute', '/preview', '/task', '/turn'], async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        const controller = new AbortController();
        const streaming = request.headers.accept === 'text/event-stream';
        const emit = value => {
            if (!response.headersSent) response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            response.write('data: ' + JSON.stringify(value) + '\n\n');
        };
        const abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const host = getHost();
            const method = request.path === '/task' ? 'executeTask' : request.path === '/turn' ? 'executeTurn' : 'execute';
            const result = await host[method](handle, request.body, controller.signal, streaming ? chunk => emit({ chunk }) : undefined, { preview: request.path === '/preview' });
            if (!controller.signal.aborted) {
                if (streaming) { emit({ result }); response.end(); } else response.json(result);
            }
        } catch (error) {
            const { code, status } = generationFailure(error);
            const details = code === 'native_processing_failed' ? { resourceId: error.processorId, field: error.stage } : undefined;
            if (!controller.signal.aborted) {
                if (response.headersSent) { emit({ error: code, ...(details ? { details } : {}) }); response.end(); } else response.status(status).json({ error: code, ...(details ? { details } : {}) });
            }
        } finally { response.off('close', abort); }
    });
    return router;
}

export const router = createNativeGenerationRouter();

export const getNativeGenerationHost = services;
