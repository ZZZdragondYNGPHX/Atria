import { sessionFixture } from './session-fixture.js';
import { lifecycleFixture } from './lifecycle-fixture.js';
import { compileFrontend } from '../../../src/native/frontend/compiler.js';
import { buildAtriaPackageContainer } from '../../../src/native/package-container.js';

export function taskBindingFixture({ tasks = true, capability } = {}) {
    const f = sessionFixture();
    f.manifest.name = 'Task binding regression';
    f.manifest.capabilities.push('game-runtime');
    f.manifest.permissions = [{ permission: 'generation', required: true, reason: 'Model tasks' }];
    const { taskRuntime } = lifecycleFixture();
    const template = taskRuntime.tasks[0];
    taskRuntime.slots = [{ id: 'narrative', requiredCapabilities: [] }, { id: 'structured', requiredCapabilities: capability ? [capability] : [] }];
    taskRuntime.tasks = ['narrator', 'case.reflection', 'claim.advisor', 'agenda.deliberation'].map((id, i) => ({ ...structuredClone(template), id, bindingSlotId: i ? 'structured' : 'narrative' }));
    const variant = template.variants[0];
    f.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Task', output: { maxTokens: 128 } } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
    const sourceFiles = new Map([
        ['frontend.json', Buffer.from(JSON.stringify({ format: 'atria-frontend-source', version: 3, primaryView: 'main', views: [{ id: 'main', root: 'Main', surface: 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] }))],
        ['Main.aui', Buffer.from('<template><main node-id="root"><h1 node-id="title">Task binding Full UI</h1></main></template>')],
    ]);
    const compiled = compileFrontend({ source: 'frontend.json', files: sourceFiles, mode: 'full' });
    f.manifest.runtime = { experience: { mode: 'full', frontend: { kind: 'native', version: 3, entry: compiled.entry } },
        experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], ...(tasks ? { taskRuntime } : {}) } };
    const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map([...sourceFiles, ...compiled.files]) });
    return { ...f, archive };
}
