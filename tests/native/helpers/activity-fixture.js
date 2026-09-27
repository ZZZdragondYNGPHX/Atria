import { lifecycleFixture } from './lifecycle-fixture.js';
import { buildAtriaPackageContainer } from '../../../src/native/index.js';
import { sessionFixture, services } from './session-fixture.js';

const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export function activityFixture() {
    const declaration = lifecycleFixture();
    declaration.lifecycleRuntime.automations = []; declaration.lifecycleRuntime.workflows = [];
    const outcomeSchema = object({ text: { type: 'string', maxLength: 256 } });
    const text = { type: 'string', maxLength: 128 };
    const number = { type: 'integer', minimum: 0 };
    declaration.taskRuntime.tasks[0].inputSchema = object({ observation: object({ activityId: text, instanceId: text,
        outcome: outcomeSchema, committedRevisionId: text, branchId: text, scopeId: text, scopeEpoch: number, activityElapsedMs: number }) });
    declaration.taskRuntime.tasks[0].variants[0].outputSchema = { type: 'string', minLength: 1, maxLength: 1024 };
    declaration.presentationRuntime = { schemaVersion: 1, scenes: [], assetPacks: [], voices: [], host: [],
        activities: [{ id: 'encounter', scopeId: 'session', outcomeSchema,
            settlement: { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'result' },
            narrator: { taskId: 'summarize', variantId: 'default' } }] };
    return declaration;
}
export async function openActivity(h, configure = () => {}) {
    const f = { ...sessionFixture(), ...services(h) }; const declaration = activityFixture(); configure(declaration, f);
    const variant = declaration.taskRuntime.tasks[0].variants[0];
    f.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Activity Narrator', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Activity Narrator', output: { maxTokens: 128 } } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
    f.manifest.runtime = { game: { logic: 'logic.json' }, experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], ...declaration } };
    const logic = { schemaVersion: 2, mutations: [{ id: 'heal', event: 'healed',
        argsSchema: { type: 'object', properties: { amount: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['amount'], additionalProperties: false },
        assign: { hp: { formula: 'world.hp + args.amount' } } }] };
    const { archive } = buildAtriaPackageContainer({ manifest: f.manifest,
        sourceFiles: new Map([['logic.json', Buffer.from(JSON.stringify(logic))]]), assetPayloads: new Map() });
    await f.packageInstaller.install(h.handle, archive);
    const base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
    return { f, base, declaration };
}
