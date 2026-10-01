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
const fixture = args.includes('--fixture');
const { readContent, validateContent } = await import('./content-check.mjs');
validateContent(await readContent(), manifest);
manifest.resources = await json('runtime/model-resources.json');
if(fixture){const originalId=manifest.packageId,originalVersion=manifest.packageVersionId;manifest.packageId='pkg_'+createHash('sha256').update('occult-regression-only').digest('hex').slice(0,32);manifest.packageVersionId='pkgv_'+createHash('sha256').update('occult-regression-p6').digest('hex').slice(0,32);manifest.version+='-regression';manifest.resources=JSON.parse(JSON.stringify(manifest.resources).replaceAll(originalId,manifest.packageId).replaceAll(originalVersion,manifest.packageVersionId));}
const contract = { schemaVersion: 1, capabilities: await json('runtime/capabilities.json'), dataResources: [] };
for (const [key, file] of Object.entries({ lifecycleRuntime: 'lifecycle', taskRuntime: 'tasks', informationRuntime: 'information', authorityRuntime: 'authority', simulationRuntime: 'simulation' })) contract[key] = await json('runtime/' + file + '.json');
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
if (!fixture) {
 const { compileOpening } = await import('./opening-compile.mjs');
 let opening=compileOpening({manifest,contract,backgrounds:(await json('data/defs.origins.json')).items,seeds:(await json('data/defs.claims.seeds.json')).items,caseAsset:(await json('data/cases.signature.second_death.json')).items[0]});
 const {compileNetwork}=await import('./network-compile.mjs');
 opening=compileNetwork(opening,await Promise.all(['property','burial','railway'].map(async k=>(await json('data/cases.signature.'+k+'.json')).items[0])),(await json('data/defs.actors.supporting.json')).items);
 Object.assign(contract,{lifecycleRuntime:opening.lifecycle,simulationRuntime:opening.simulation,informationRuntime:opening.information});
 for(const r of manifest.resources)if(r.resourceType==='core.prompt-module' && r.resource.displayName==='narrator')r.resource.body='Render only the Host-approved outcome and disclosure-safe projections. A receipt notice describes a method, not proof it succeeded: respect its outcome. Never invent evidence, a Claim, an external biography fact, a hidden motive or deep Eastbank cause. Player descriptions define ordinary personal expression only. Hypotheses and testimony remain attributed and uncertain. Breach does not grant a class.';
 manifest.name='Original Occult Western Fantasy — Signature Network A';
 manifest.entryPoints[0].displayName='Second Death — Signature Network A';
 manifest.actors[0].displayName='Independent Civil Verifier';
 manifest.entryPoints[0].initialTimeline[0].content='Before accepting a family death-verification mandate, create your ordinary adult Identity, Origin, Prior Life, Faith, living Personal Anchor and Reason. No supernatural class is selected. Use the conversation to make these choices.';
 sourceFiles.set('runtime/logic.json',Buffer.from(JSON.stringify(opening.logic)));
 sourceFiles.set('frontend/bridge.json',Buffer.from(JSON.stringify(opening.bridge)));
 // Functional composer entry, not P8 visual design. Typed bindings remain available to Native clients.
 const interactions=Object.fromEntries(opening.bridge.bindings.map(b=>[b.id,[{kind:'action.invoke',target:b.id,value:{object:Object.fromEntries(Object.entries(b.inputSchema.properties).map(([k,s])=>[k,s.enum?.[0]??(s.type==='integer'?s.minimum:s.type==='boolean'?true:'Player input')]))}}]]));
 sourceFiles.set('frontend/Main.aui',Buffer.from('<template><main node-id="root"><p node-id="notice">Second Death — use the conversation for character creation and investigation. Native typed actions share the same contracts.</p></main></template><contract>'+JSON.stringify({interactions})+'</contract>'));
}
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
    const { verify } = await import(fixture ? './verify.mjs' : './opening-check.mjs');
    console.log(JSON.stringify({ coreHead, ...await verify({ load, native, manifest, sourceFiles, assetPayloads, archive, mode }) }, null, 2));
}
