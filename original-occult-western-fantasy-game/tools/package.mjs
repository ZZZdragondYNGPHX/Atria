import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0] || 'validate';
const option = name => {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Missing value for ' + name);
    return args[index + 1];
};
if (!args.includes('--core')) throw new Error('Usage: node tools/package.mjs build|validate|preview --core <Atria main checkout> [--out <new .atria file>]');
if (!['build', 'validate', 'preview'].includes(mode)) throw new Error('Unknown mode');
const core = path.resolve(option('--core'));
const coreHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: core, encoding: 'utf8' }).trim();
const load = rel => import(pathToFileURL(path.join(core, rel)).href);
const json = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const native = await load('src/native/index.js');
const manifest = await json('manifest.json');
manifest.resources = await json('runtime/model-resources.json');
const contract = { schemaVersion: 1, capabilities: await json('runtime/capabilities.json'), dataResources: [] };
for (const [key, file] of Object.entries({ lifecycleRuntime: 'lifecycle', taskRuntime: 'tasks', informationRuntime: 'information', authorityRuntime: 'authority' })) contract[key] = await json('runtime/' + file + '.json');
manifest.runtime.experienceContract = contract;
const assetPayloads = new Map();
for (const file of (await fs.readdir(path.join(root, 'data'))).sort()) {
    if (!file.endsWith('.json')) continue;
    const bytes = await fs.readFile(path.join(root, 'data', file));
    const resourceId = file.slice(0, -5);
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const assetId = 'asset_' + createHash('sha256').update(resourceId).digest('hex').slice(0, 32);
    contract.dataResources.push({ resourceId, assetId, contentHash });
    manifest.assets.push({ assetId, contentHash, size: bytes.length, mediaType: 'application/json' });
    assetPayloads.set(assetId, bytes);
    assert(bytes.length < 256 * 1024, 'Package authoring soft resource limit');
}
// Bootstrap constants are compiled from this single data authority, not maintained twice.
const seed = await json('data/seed.bootstrap.json');
const bootstrap = contract.lifecycleRuntime.domains.find(d => d.id === 'entities').commands.find(c => c.id === 'bootstrap');
bootstrap.assign = { scene: seed.scene, playerStatus: seed.playerStatus, privateNote: seed.privateNote };
const sourceFiles = new Map([['runtime/logic.json', await fs.readFile(path.join(root, 'runtime/logic.json'))]]);
for (const file of ['frontend/frontend.json', 'frontend/bridge.json', 'frontend/Main.aui']) sourceFiles.set(file, await fs.readFile(path.join(root, file)));
const { compileProjectFrontends } = await load('src/native/frontend/compiler.js');
const compiled = compileProjectFrontends(manifest, sourceFiles);
Object.assign(manifest, compiled.packageSource);
sourceFiles.clear();
for (const [file, bytes] of compiled.files) sourceFiles.set(file, bytes);
const { archive } = native.buildAtriaPackageContainer({ manifest, sourceFiles, assetPayloads });
if (mode === 'build') {
    const out = args.includes('--out') ? path.resolve(option('--out')) : path.join(root, 'build', manifest.version + '.atria');
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, archive, { flag: 'wx' });
    console.log(JSON.stringify({ mode, coreHead, output: out, bytes: archive.length }));
} else {
    const { verify } = await import('./verify.mjs');
    console.log(JSON.stringify({ coreHead, ...await verify({ load, native, manifest, sourceFiles, assetPayloads, archive, mode }) }, null, 2));
}
