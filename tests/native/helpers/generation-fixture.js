import { createNativeId } from '../../../src/native/identity.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../../src/native/model-prompt-runtime/persistence.js';

export async function seedGenerationProfiles({ engine, handle, endpoint, roles = ['narrator'], format = 'openai-compatible', streaming = false }) {
    const persistence = new NativeModelPromptPersistence({ engine });
    const library = new VersionedJsonResourceHandler({ engine });
    const generation = { schemaVersion: 1, generationProfileId: createNativeId('generationProfile'), revision: 'r1', displayName: 'P4 generation', output: { maxTokens: 512 }, streaming: { enabled: streaming } };
    const module = { schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: 'r1', displayName: 'P4 module', target: 'system.foundation', stages: ['stage.main'], body: 'Use the selected Native facts. Produce a concise response.' };
    const prompt = { schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: 'r1', displayName: 'P4 program', stages: [{ stageId: 'stage.main', moduleRefs: [{ resourceType: 'core.prompt-module', scope: 'library', resourceId: module.promptModuleId, revision: 'r1' }] }] };
    for (const [type, value] of [['core.generation-profile', generation], ['core.prompt-module', module], ['core.prompt-program', prompt]]) await library.commit(handle, type, value);
    const connection = { schemaVersion: 1, connectionProfileId: createNativeId('connectionProfile'), displayName: 'P4 connection', scope: 'player', endpoint,
        providerAdapter: 'provider.' + format, transport: 'transport.http', secretRef: { secretId: 'p4-synthetic-key', scope: 'player' } };
    await persistence.saveConnectionProfile(handle, connection);
    const model = { schemaVersion: 1, modelProfileId: createNativeId('modelProfile'), scope: 'player', displayName: 'P4 model', connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId },
        remoteModelId: 'p4-fixture', limits: { contextTokens: 16000, outputTokens: 512 }, tokenizer: { encoding: 'cl100k_base', source: 'fixture' } };
    await persistence.saveModelProfile(handle, model);
    const routes = [];
    for (const role of roles) {
        const route = { schemaVersion: 1, runtimeRouteId: createNativeId('runtimeRoute'), scope: 'player', displayName: role, role: 'role.' + role,
            modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef,
            generationProfileRef: { resourceType: 'core.generation-profile', resourceId: generation.generationProfileId, scope: 'library', revision: 'r1' },
            promptProgramRef: { resourceType: 'core.prompt-program', resourceId: prompt.promptProgramId, scope: 'library', revision: 'r1' },
            fallbackRouteRefs: [], policy: { timeoutMs: 10000, maxRetries: 0, maxFallbackAttempts: 1 }, requirements: [] };
        await persistence.saveRuntimeRoute(handle, route); routes.push(route);
    }
    return { persistence, library, generation, prompt, module, connection, model, routes };
}
