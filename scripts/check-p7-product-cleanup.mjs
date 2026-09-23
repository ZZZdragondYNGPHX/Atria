import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path + '/' + item.name) : item.name.endsWith('.js') ? [path + '/' + item.name] : []);
// Only the explicit non-Native facade may read a legacy manager. No path-wide
// exemptions for Settings, Runtime, authoring or search product implementations.
const compatibility = 'public/scripts/native/generation-compat.js';
const forbidden = /\bgetPresetManager\s*(?:\?\.)?\s*\(|\bPromptManager\b|\bbuildPresetAwarePromptMessages\b|extensionSettings\.connectionManager|\boai_settings\b|\bpower_user\b|#(?:left-nav-panel|AdvancedFormatting|rm_api_block)|\bpackage\.presets\b/;
for (const path of ['public/scripts/native', 'public/scripts/atria-shell', 'src/native'].flatMap(walk)) {
    const source = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (path !== compatibility) assert.ok(!forbidden.test(source), 'P7 legacy product authority: ' + path);
}
for (const sample of ['x.getPresetManager?.(\'openai\')', 'new PromptManager()', 'package.presets', 'power_user', '#rm_api_block']) assert.ok(forbidden.test(sample), sample);
const settings = read('public/scripts/atria-shell/utility-workspaces.js');
assert.match(settings, /PREFERENCE_CONTROLS/);
const preferences = settings.slice(settings.indexOf('export const PREFERENCE_CONTROLS'), settings.indexOf('export async function mountAccountUtility'));
assert.doesNotMatch(preferences, /user-settings-block|power-user-options-block|UI-Theme-Block|enableLabMode|enableZenSliders/);
assert.match(preferences, /restorePlacement/);
const search = read('public/scripts/atria-shell/product-search.js');
assert.match(search, /host.openLibraryResource\(ref, title\)/); assert.doesNotMatch(search, /createElement|innerHTML|appendChild|presetName/);
assert.match(read(compatibility), /nativePromptUiActive\(\) \? null : context\?\.getPresetManager/);
assert.match(read('public/scripts/native/prompt-authoring.js'), /requested exact revision is unavailable/);
assert.match(read('public/scripts/native/studio-workspace.js'), /\['metadata', 'Package Metadata'\]/);
console.log('P7 product authority, preference whitelist and exact owning-route guard passed.');
