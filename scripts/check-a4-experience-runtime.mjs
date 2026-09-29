import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { assertExperienceContract } from '../src/native/authoring-contracts.js';
import { compileFrontend } from '../src/native/frontend/compiler.js';
import { validateFrontendGraph } from '../src/native/frontend/graph.js';
const read = path => readFileSync(path, 'utf8');
for (const mode of ['component', 'hybrid', 'full']) {
    for (const version of [1, 2]) assert.throws(() => assertExperienceContract({ mode, componentModelVersion: version, component: 'ui.json' }));
    const source = { format: 'atria-frontend-source', version: 3, primaryView: 'main', views: [{ id: 'main', root: 'Main', surface: mode === 'component' ? 'chat.footer' : 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] };
    const files = new Map([['frontend.json', Buffer.from(JSON.stringify(source))], ['Main.aui', Buffer.from('<template><main node-id="root">Native</main></template>')]]);
    const compiled = compileFrontend({ source: 'frontend.json', files, mode });
    assert.equal(validateFrontendGraph({ entry: compiled.entry, files: compiled.files, mode }).index.version, 3);
    assert.equal(assertExperienceContract({ mode, frontend: { kind: 'native', version: 3, entry: compiled.entry } }).frontend.version, 3);
}
for (const name of ['v2-document', 'v2-runtime', 'component-model', 'runtime', 'declarative', 'selectors']) assert.equal(existsSync('public/scripts/native/experience/ui/' + name + '.js'), false);
for (const path of ['src/native/runtime-descriptor.js', 'src/native/authoring-contracts.js', 'src/native/experience-validation.js', 'public/scripts/native/experience/ui/live.js', 'public/scripts/native/studio-preview-ui.js']) {
    assert.doesNotMatch(read(path), /componentModelVersion|compileUiDocument|mountUiDocument|compileExperienceComponentModel/);
}
const live = read('public/scripts/native/experience/ui/live.js');
assert.match(live, /mountNativeFrontend/); assert.match(live, /createFullGameHost/); assert.match(live, /mode === 'text'/);
assert.match(read('public/scripts/native/studio-preview-ui.js'), /mountNativeFrontend/);
assert.match(read('src/native/studio-preview.js'), /persisted: false/);
assert.match(read('public/scripts/native/experience/ui/full-host.js'), /acquireStageOwnership/);
console.log('Native Frontend Hard Cut guard passed: native@3 only, exact graph, shared Preview renderer, Host recovery');
