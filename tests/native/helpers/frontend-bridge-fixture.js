import { assertNativeExperienceContract } from '../../../public/shared/native-experience-contract.js';
import { compileFrontend } from '../../../src/native/frontend/compiler.js';
import { EMPTY } from '../../../src/native/frontend/bridge.js';
import { sessionFixture } from './session-fixture.js';
import { lifecycleFixture } from './lifecycle-fixture.js';

export function bridgeFixture(mode = 'full') {
    const fixture = sessionFixture(), declarations = lifecycleFixture();
    declarations.lifecycleRuntime.automations = []; declarations.lifecycleRuntime.workflows = [];
    const variant = declarations.taskRuntime.tasks[0].variants[0];
    fixture.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Bridge task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Bridge task', output: { maxTokens: 128 } } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId } }));
    const contract = assertNativeExperienceContract({ schemaVersion: 1, capabilities: [], dataResources: [], ...declarations });
    const item = { type: 'object', properties: { id: { type: 'string', maxLength: 64 }, value: declarations.lifecycleRuntime.domains[0].recordSchema }, required: ['id', 'value'], additionalProperties: false };
    const bindings = [
        { id: 'notes', kind: 'read', target: { domainId: 'notes' }, inputSchema: EMPTY, outputSchema: { type: 'array', items: item, maxItems: 10000 } },
        { id: 'page', kind: 'read', target: { domainId: 'notes' }, inputSchema: { type: 'object', properties: { search: { type: 'string', maxLength: 256 }, id: { type: 'string', maxLength: 64 } }, additionalProperties: false }, outputSchema: item,
            collection: { pageSize: 2, orderBy: 'id', filters: ['id'], search: ['id'] } },
        { id: 'save', kind: 'action', target: { domainId: 'notes', commandId: 'save', recordId: 'main' }, inputSchema: { type: 'object', properties: { label: { type: 'string', maxLength: 256 } }, required: ['label'], additionalProperties: false }, outputSchema: EMPTY, mapping: { fields: { text: { input: 'label' } } } },
        { id: 'task', kind: 'operation', target: { taskId: 'summarize', variantId: 'default' }, inputSchema: declarations.taskRuntime.tasks[0].inputSchema, outputSchema: variant.outputSchema },
    ];
    const index = { format: 'atria-frontend-source', version: 3, primaryView: 'main', bridge: 'bridge.json', views: [{ id: 'main', root: 'Main', surface: mode === 'component' ? 'sidebar.right' : 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }, { id: 'Child', source: 'Child.aui' }] };
    const presentation = { state: { draft: { schema: { type: 'object', properties: { label: { type: 'string', maxLength: 256 } }, required: ['label'], additionalProperties: false }, initial: { label: 'from UI' } } }, interactions: { save: [{ kind: 'action.invoke', target: 'save', value: { object: { label: { get: 'draft.label' } } } }], page: [{ kind: 'read.page', target: 'page' }], next: [{ kind: 'read.page', target: 'page', cursor: { get: 'bridge.page.cursor' } }], task: [{ kind: 'operation.start', target: 'task' }] } };
    const files = new Map([
        ['frontend.json', Buffer.from(JSON.stringify(index))], ['bridge.json', Buffer.from(JSON.stringify({ version: 1, bindings }))],
        ['Main.aui', Buffer.from('<template><main node-id="root"><output node-id="notes" read="notes" /><label node-id="label" for="text">Note</label><input node-id="text" id="text" bind:value="draft.label" /><button node-id="save" on:click="save">Save</button><button node-id="page" on:click="page">Read page</button><button node-id="next" on:click="next">Next page</button><div node-id="rows" each="bridge.page.data" item-key="id"><span node-id="row" bind:text="item.id" /></div><output node-id="receipt" bind:text="bridge.save.status" /><component node-id="child" ref="Child" /></main></template><contract>' + JSON.stringify(presentation) + '</contract>')],
        ['Child.aui', Buffer.from('<template><div node-id="child">Scoped child</div></template>')],
        ['logic.json', Buffer.from('{"schemaVersion":2,"mutations":[]}')],
    ]);
    const compiled = compileFrontend({ source: 'frontend.json', files, mode, experienceContract: contract });
    fixture.manifest.runtime = { game: { logic: 'logic.json' }, experienceContract: contract, experience: { mode, frontend: { kind: 'native', version: 3, entry: compiled.entry } } };
    return { ...fixture, bindings, contract, files: new Map([...files, ...compiled.files]), compiled };
}
