import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const read = path => readFileSync(path, 'utf8');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(dir + '/' + item.name) : item.name.endsWith('.js') ? [dir + '/' + item.name] : []);
const guards = [
    'p0-model-prompt-runtime-architecture', 'p1-model-prompt-resource-foundation', 'p2-generation-core', 'p3-prompt-compiler',
    'p4-native-generation', 'p5-native-runtime-ui', 'p6-native-authoring', 'p7-product-cleanup',
    'a0-native-authoring-hard-cutover', 'a1-native-authoring-backend', 'a2-library-resource-architecture', 'a3-native-game-runtime-cutover',
    'a4-experience-runtime', 'a5-plugin-skill-platform', 'a6-native-product-frontend', 'a7-studio-authoring-ux', 'a8-project-agent',
    'a9-hard-cutover-product-finalization', 'n9-native-product-authority', 'n10-native-hard-cutover',
];
for (const guard of guards) {
    const result = spawnSync(process.execPath, ['scripts/check-' + guard + '.mjs'], { stdio: 'inherit' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, guard);
}
// Request-time Core only reads validated ports. The only canonical writes live
// in P1 persistence; neither compile nor resolve may secretly provision defaults.
const noWrites = /\b(?:saveRuntimeRoute|saveModelProfile|saveConnectionProfile|putMutable|writeFile|writeFileSync|localStorage|indexedDB)\s*(?:\(|\.)|\.library\.commit\s*\(/;
for (const file of walk('src/native/model-prompt-runtime').filter(file => !file.endsWith('/persistence.js'))) assert.doesNotMatch(read(file), noWrites, file);
assert.doesNotMatch(read('src/native/adapters/generation-host.js'), noWrites);
for (const file of ['route-resolver', 'prompt-compiler', 'generation-service', 'package-freeze']) assert.doesNotMatch(read('src/native/model-prompt-runtime/' + file + '.js'), /getCurrent\s*\(|currentRevision/);
const host = read('src/native/adapters/generation-host.js');
assert.match(host, /native_generation_context_ambiguous/); assert.match(host, /input\.routeRef\.scope !== 'player'/);
assert.match(host, /input\.previewRefs && !preview/);
const compatibility = read('public/scripts/native/generation-compat.js');
assert.equal((compatibility.match(/!nativePromptUiActive\(\) && !options.nativeSource/g) || []).length, 2);
assert.match(compatibility, /nativeGenerationActive\(\) \|\| globalThis.document\?\.body\?\.dataset\?\.atriaShellMounted/);
const service = read('src/native/model-prompt-runtime/generation-service.js');
assert.ok(service.indexOf('if (preview) return') < service.indexOf('await this._send'));
assert.match(service, /generation_output_authority_changed/);
assert.match(read('src/native/package-composition.js'), /freezePackagePromptPrograms\(mappedModelPromptResources/);
assert.match(read('.github/workflows/model-prompt-runtime.yml'), /pull_request:[\s\S]*main/);
assert.match(read('.github/workflows/model-prompt-runtime.yml'), /npm rebuild better-sqlite3 --ignore-scripts=false/);
for (const poison of ['saveRuntimeRoute(', 'writeFileSync(', 'localStorage.setItem(']) assert.ok(noWrites.test(poison));
console.log('P8 integration freeze passed: P0-P7, A0-A9, N9/N10, exact reads, no dual-write and no Native hidden fallback.');
