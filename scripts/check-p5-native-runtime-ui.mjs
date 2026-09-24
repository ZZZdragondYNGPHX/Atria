import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = path => readFileSync(path, 'utf8');
const ui = read('public/scripts/native/runtime-workspace.js');
const domain = read('public/scripts/atria-shell/library-runtime-workspaces.js');
for (const section of ['routes', 'models', 'connections', 'profiles', 'diagnostics']) assert.match(domain, new RegExp('id: \'' + section + '\''));
for (const source of [ui, domain, read('public/scripts/native/runtime-client.js')]) {
    assert.doesNotMatch(source, /getPresetManager|connectionManager|oai_settings|power_user|localStorage|sessionStorage|indexedDB|rm_api_block|AdvancedFormatting|left-nav-panel/);
}
assert.match(ui, /generationProfileRef/);
assert.match(ui, /promptProgramRef/);
assert.match(ui, /fallbackRouteRefs/);
assert.match(ui, /Capabilities/);
assert.match(ui, /Prompt provenance/);
assert.match(ui, /Fallback attempts/);
assert.match(ui, /signal: controller.signal/);
assert.match(ui, /save.disabled = saved/);
assert.match(read('src/endpoints/native-generation.js'), /request.user\?\.profile\?\.handle/);
assert.match(read('src/endpoints/native-generation.js'), /host.library.commit/);
const service = read('src/native/model-prompt-runtime/generation-service.js');
assert.ok(service.indexOf('if (preview) return') < service.indexOf('await this._send'));
assert.match(read('public/scripts/atria-shell/product-search.js'), /host.openRuntimeSection\(section, id\)/);
assert.match(read('public/css/atria-runtime.css'), /atri-runtime\[data-atria-viewport="compact"\]\[data-editor\].*position: fixed/);
assert.match(read('public/index.html'), /css\/atria-runtime.css/);
assert.match(ui, /createAtriaShellEnvironment/);
console.log('P5 Native Runtime product UI guard passed.');
