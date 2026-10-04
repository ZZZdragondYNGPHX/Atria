import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0] || 'validate';
if (args.includes('--regional-full') && !args.includes('--regional-only')) throw new Error('--regional-full requires --regional-only');
const option = name => {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Missing value for ' + name);
    return args[index + 1];
};
if (!args.includes('--core')) throw new Error('Usage: node tools/package.mjs build|validate|preview --core <Atria main checkout> [--out <new .atria file>]');
if (!['build', 'validate', 'preview'].includes(mode)) throw new Error('Unknown mode');
const core = path.resolve(option('--core'));
const coreHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: core, encoding: 'utf8' }).trim();
const packageHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const packageDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: root, encoding: 'utf8' }).trim());
const load = rel => import(pathToFileURL(path.join(core, rel)).href);
const json = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const native = await load('src/native/index.js');
const manifest = await json('manifest.json');
const fixture = args.includes('--fixture');
const boundedV1 = args.includes('--v1-campaign');
const legacyFlags=['--network-only','--convergence-only','--opening-only','--campaign-only','--frontend-only','--long-horizon-only','--lifetime-only','--history-only','--renewal-only','--enterprise-only','--regional-only','--century-only','--state-only'];
const roleplay = !fixture && !boundedV1 && !args.includes('--legacy') && !legacyFlags.some(flag=>args.includes(flag));
if(args.includes('--roleplay-only') && !roleplay)throw new Error('--roleplay-only conflicts with a historical profile');
if(args.includes('--release-only') && args.includes('--roleplay-ui-only'))throw new Error('Choose release-only or roleplay-ui-only validation');
if(!roleplay && args.includes('--roleplay-ui-only'))throw new Error('--roleplay-ui-only requires the default Open Lives profile');
const retainedV1 = args.includes('--retained-v1');
if(retainedV1 && (mode==='build'||fixture||!boundedV1||!args.includes('--archive')||!args.includes('--release-only')))throw new Error('--retained-v1 requires --v1-campaign --archive <original> --release-only in validate/preview mode');
if (fixture && boundedV1) throw new Error('Choose only one explicit regression scenario');
if(args.includes('--century-only')&&(fixture||boundedV1||args.includes('--regional-full')))throw new Error('--century-only is the fixed v2 final acceptance; conflicting regression/soak flags are invalid');
const { readContent, validateContent } = await import('./content-check.mjs');
validateContent(await readContent(), manifest);
manifest.resources = await json('runtime/model-resources.json');
// Historical v1 remains a distinct fixture; in-progress v2 must never reuse its immutable identity.
if (!roleplay && !fixture && !boundedV1) {
 const previous = manifest.packageVersionId;
 manifest.version = '2.0.0';
 manifest.packageVersionId = 'pkgv_' + createHash('sha256').update('occult-long-lived-world-2.0.0').digest('hex').slice(0, 32);
 manifest.resources = JSON.parse(JSON.stringify(manifest.resources).replaceAll(previous, manifest.packageVersionId));
}
if(fixture){const originalId=manifest.packageId,originalVersion=manifest.packageVersionId;manifest.packageId='pkg_'+createHash('sha256').update('occult-regression-only').digest('hex').slice(0,32);manifest.packageVersionId='pkgv_'+createHash('sha256').update('occult-regression-release-1.0.0').digest('hex').slice(0,32);manifest.version+='-regression';manifest.resources=JSON.parse(JSON.stringify(manifest.resources).replaceAll(originalId,manifest.packageId).replaceAll(originalVersion,manifest.packageVersionId));}
const contract = { schemaVersion: 1, capabilities: await json('runtime/capabilities.json'), dataResources: [] };
for (const [key, file] of Object.entries({ lifecycleRuntime: 'lifecycle', taskRuntime: 'tasks', informationRuntime: 'information', authorityRuntime: 'authority', simulationRuntime: 'simulation' })) contract[key] = await json('runtime/' + file + '.json');
manifest.runtime.experienceContract = contract;
const assetPayloads = new Map();
for (const file of (await fs.readdir(path.join(root, 'data'))).sort()) {
    if (!file.endsWith('.json') || (!roleplay && file==='roleplay.foundation.json')) continue;
    const bytes = await fs.readFile(path.join(root, 'data', file));
    const resourceId = file.slice(0, -5);
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const assetId = 'asset_' + createHash('sha256').update(roleplay ? resourceId + ':' + contentHash : resourceId).digest('hex').slice(0, 32);
    contract.dataResources.push({ resourceId, assetId, contentHash });
    manifest.assets.push({ assetId, contentHash, size: bytes.length, mediaType: 'application/json' });
    assetPayloads.set(assetId, bytes);
    assert(bytes.length < 256 * 1024, 'Package authoring soft resource limit');
}
// Bootstrap constants are compiled from this single data authority, not maintained twice.
const seed = await json('data/seed.bootstrap.json');
const bootstrap = contract.lifecycleRuntime.domains.find(d => d.id === 'entities').commands.find(c => c.id === 'bootstrap');
bootstrap.assign = { scene: seed.scene, playerStatus: seed.playerStatus, privateNote: seed.privateNote };
let frontendCatalog;
const sourceFiles = new Map([['runtime/logic.json', await fs.readFile(path.join(root, 'runtime/logic.json'))]]);
for (const file of ['frontend/frontend.json', 'frontend/bridge.json', 'frontend/Main.aui']) sourceFiles.set(file, await fs.readFile(path.join(root, file)));
if(roleplay) {
 const {compileRoleplay}=await import('./roleplay-compile.mjs');
 const {compileRoleplayWorld}=await import('./roleplay-world-compile.mjs');
 const compiled=compileRoleplayWorld(compileRoleplay({manifest,contract,data:await json('data/roleplay.foundation.json'),institutions:(await json('data/defs.institutions.json')).items}));
 sourceFiles.set('runtime/logic.json',Buffer.from(JSON.stringify(compiled.logic)));
 sourceFiles.set('frontend/bridge.json',Buffer.from(JSON.stringify(compiled.bridge)));
 const {compileRoleplayFrontend}=await import('./roleplay-frontend-compile.mjs');
 const frontend=await compileRoleplayFrontend({root,compiled,manifest,data:await json('data/roleplay.foundation.json'),load});
 sourceFiles.delete('frontend/Main.aui');
 for(const [file,bytes]of frontend.files)sourceFiles.set(file,bytes);
 console.error('Open Lives frontend budgets',JSON.stringify(frontend.budget));
} else if (!fixture) {
 const { compileOpening } = await import('./opening-compile.mjs');
 let opening=compileOpening({manifest,contract,backgrounds:(await json('data/defs.origins.json')).items,seeds:(await json('data/defs.claims.seeds.json')).items,caseAsset:(await json('data/cases.signature.second_death.json')).items[0]});
 const {compileNetwork}=await import('./network-compile.mjs');
 opening=compileNetwork(opening,await Promise.all(['property','burial','railway'].map(async k=>(await json('data/cases.signature.'+k+'.json')).items[0])),(await json('data/defs.actors.supporting.json')).items);
 const {compileConvergence}=await import('./convergence-compile.mjs');
 opening=compileConvergence(opening,await Promise.all(['company','accident','headline'].map(async k=>(await json('data/cases.signature.'+k+'.json')).items[0])),[...(await json('data/cases.patterns.network_a.json')).items,...(await json('data/cases.patterns.network_b.json')).items],[...(await json('data/defs.claims.seeds.json')).items,...(await json('data/defs.claims.archetypes.json')).items]);
 if (!boundedV1) {
  const { compileLongHorizon } = await import('./long-horizon-compile.mjs');
  opening = compileLongHorizon(opening, manifest);
  const { compileHistory } = await import('./history-compile.mjs');
  const { HISTORY_OPERATIONS } = await load('public/shared/native-history-contract.js');
  opening = compileHistory(opening, manifest, HISTORY_OPERATIONS);
  const { compileLifetimes } = await import('./lifetime-compile.mjs');
  const { LIFETIME_OPERATIONS } = await load('public/shared/native-lifetime-contract.js');
  const { anniversary } = await load('public/shared/native-lifetime-runtime.js');
  opening = compileLifetimes(opening, manifest, LIFETIME_OPERATIONS, anniversary);
  const { compileRenewal } = await import('./renewal-compile.mjs');
  opening = compileRenewal(opening);
  const { compileEnterprise } = await import('./enterprise-compile.mjs');
  opening = compileEnterprise(opening);
  const { compileRegional } = await import('./regional-compile.mjs');
  opening = compileRegional(opening);
  opening.logic.transactions.find(t=>t.id==='opening.wait').receipt.projection.notice='Advance the canonical clock. Six stances persist; zero minutes changes policy only. Longer intervals resolve aging, births, succession, institutions, regions and retained obligations. Review public attention interruptions before continuing; continuity and reconstruction retain their costs.';
  opening.logic.transactions.find(t=>t.id==='opening.day').receipt.projection.notice='Resolve the chronological interval and retained obligations through the shared Native lifetime, regional and historical authorities.';
 }
 contract.authorityRuntime.intentObservation.viewIds=['player.overview'];
 Object.assign(contract,{lifecycleRuntime:opening.lifecycle,simulationRuntime:opening.simulation,informationRuntime:opening.information});
 for(const r of manifest.resources)if(r.resourceType==='core.prompt-module' && r.resource.displayName==='narrator')r.resource.body='Render only the Host-approved outcome and disclosure-safe projections. A receipt notice describes a method, not proof it succeeded: respect its outcome. Never invent evidence, a Claim, an external biography fact, a hidden motive or deep Eastbank cause. Player descriptions define ordinary personal expression only. Hypotheses and testimony remain attributed and uncertain. Breach does not grant a class.';
 manifest.name='Original Occult Western Fantasy — Eastbank Field Register';
 manifest.entryPoints[0].displayName='Second Death — Eastbank Convergence';
 manifest.actors[0].displayName='Independent Civil Verifier';
 manifest.entryPoints[0].initialTimeline[0].content='Before accepting a family death-verification mandate, create your ordinary adult Identity, Origin, Prior Life, Faith, living Personal Anchor and Reason. No supernatural class is selected. Use the conversation to make these choices.';
 sourceFiles.set('runtime/logic.json',Buffer.from(JSON.stringify(opening.logic)));
 sourceFiles.set('frontend/bridge.json',Buffer.from(JSON.stringify(opening.bridge)));
 manifest.runtime.experience.features=[{id:'frontend-script',version:1,required:true}];
 const {compileInquiry}=await import('./frontend-compile.mjs');
 const frontend=await compileInquiry({root,opening,contract,load});
 frontendCatalog=frontend.catalog;
 if(!boundedV1){
  // Renderer notices retain the full authored review. Resolver tool descriptions
  // are concise public metadata; schemas and mechanical validators are unchanged.
  const descriptions={
   identity:'Ordinary adult identity; expression grants no external facts or powers.',origin:'Curated ordinary origin; familiarity grants no restricted access.',prior_life:'Curated ordinary prior life; no restricted access.',faith:'Curated faith; no restricted access.',anchor:'One consenting living ordinary Personal Anchor.',reason:'Independent Civil Verifier, family mandate, practice and rent; no Claim.',
   family:'Consented attributed family testimony; not documentary Truth.',compare:'Independent records conflict; no deep cause established.',preserve:'Witness verified contradictions; Breach and two supported Seeds, no class.',hypothesis:'Revisable proposal; no new evidence or Truth.',lead:'Inquiry proposal; no new evidence or Truth.',private_access:'Denied access leaves an alternative route, no private knowledge.',seed_unlost_evidence:'Candidate recognition of verified contradiction; no mind protection or reconstruction.',seed_name_mismatch:'Candidate designation mismatch; no true names or universal forgery detection.',postpone:'Remain uninvested, strained and unreliable; no formal Price.',consult:'Qualified Seed/Anchor/Price consultation; no self-Investiture or secret cosmology.',invoke:'Granted rule on examined support only; no new evidence or universal detection.',test_copy:'Examine acquired copy; no invented historical evidence.',reopen:'Reopen inquiry; preserve Settlement and evidence.',visit:'Spend time with the living Anchor; no Humanity score.',wait:'Canonical interval; six persistent stances, zero-minute policy; optional attributed history, consent-based lifetimes and costly continuity.',
   'network.open':'Consented post-Breach property/burial/railway mandate; deadlines persist.',
   'network.prepare':'Consent, escort and carrier safety; prevents new Injury, preserves prior Injury.',
   'network.interview':'Consented attributed testimony; not independent documentary Truth.',
   'network.compare':'Independent acquired roles; duplicates/testimony alone cannot qualify.',
   'network.property_referral':'Recorded shared-use gives a rail copy referral; no safety or office.',
   'network.reopen':'Reopen; preserve time, Settlement, access obligations and evidence.',
   'network.merge':'Revisable cross-case links; no shared-cause proof or evidence ownership change.',
   'network.split':'Split links; preserve evidence, dispositions and records.',
   'network.care':'Ordinary wound care; persistent Injury remains.',
   'network.pattern_open':'Two bounded consenting follow-up slots; ordinary claimant, no external Canon.',
   'network.pattern_request':'Independent claimant request; no cross-slot evidence reuse.',
   'network.pattern_reply':'Independent reply requires its claimant request; no cross-slot reuse.',
   'network.pattern_settle':'Qualified remedy/referral/withdrawal; continuing duty, no historical proof.',
   'convergence.manage':'Consented mandate and exact institutional terms; preserve debts, ordinary cover, disclosure limits and uncertainty.',
   'convergence.hearing':'Qualified cross-source compact; six independent terms, residual inquiry; prior locks/exclusions remain.',
   'convergence.practice':'Consenting per-instance request/reply; remedy and actual bounded fulfilment; fixed family/due date.',
   'convergence.claim':'Earned rule on supervised consenting carrier; inspected substrate, Investiture and maintained civic/sacred Price; no rewritten history or hidden cause.'
  };
  for(const t of opening.logic.transactions){const key=t.id.replace(/^opening\./,'');
   const concise=descriptions[key]??(key.startsWith('acquire_')?'Automatic authorized source; provenance is not incompatible Truth.':key.startsWith('familiar_')?'Qualified introduction gives the same source; public route remains.':key.startsWith('stabilize_')?'Formal Claim requires verified Breach, Seed, consultation, Anchor and Price; only its narrow rule.':key.startsWith('settle_')?'Qualified incomplete disposition; preserve evidence, Truth and continuing consequences.':key.startsWith('network.acquire_')?'Authorized acquired source; provenance is not causal Truth. Rail inner entry needs safety/escort; public routes remain.':key.startsWith('network.settle_')?'Qualified institutional arrangement; evidence and deadline consequences persist.':key.startsWith('convergence.source_')?'Authorized independent source; no private Truth. Trial needs isolation/consent; documentary routes remain.':null);
   if(concise)t.intent.description=concise;
  }
  sourceFiles.set('runtime/logic.json',Buffer.from(JSON.stringify(opening.logic)));
  const {resolverRequest}=await load('src/native/authority-turn.js');
  // Reserve the full public observation cap plus an ordinary prose inquiry.
  resolverRequest(opening.logic.transactions,{text:'x'.repeat(16370)},'x'.repeat(256));
 }

 for(const [file,bytes]of frontend.files)sourceFiles.set(file,bytes);
 console.error('P8 frontend budgets',JSON.stringify(frontend.budget));

}
const { compileProjectFrontends } = await load('src/native/frontend/compiler.js');
const compiled = compileProjectFrontends(manifest, sourceFiles);
Object.assign(manifest, compiled.packageSource);
sourceFiles.clear();
for (const [file, bytes] of compiled.files) sourceFiles.set(file, bytes);
const { archive: builtArchive } = native.buildAtriaPackageContainer({ manifest, sourceFiles, assetPayloads });
if (mode === 'build' && args.includes('--archive')) throw new Error('--archive is only valid for validation/preview');
const archive = args.includes('--archive') ? await fs.readFile(path.resolve(option('--archive'))) : builtArchive;
if (args.includes('--archive')) {
 const actual = native.inspectAtriaPackageContainer(archive);
 if(retainedV1){
  assert.equal(createHash('sha256').update(archive).digest('hex'),'e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09','Retained v1 bytes must be unchanged');
  for(const key of Object.keys(manifest))delete manifest[key];Object.assign(manifest,actual.manifest);
  sourceFiles.clear();for(const [file,bytes]of actual.sourceFiles)sourceFiles.set(file,bytes);
  assetPayloads.clear();for(const [id,bytes]of actual.assets)assetPayloads.set(id,bytes);
 }else{
 const expected = native.inspectAtriaPackageContainer(builtArchive);
 // Never pretty-print whole compiled Buffer maps on mismatch: a small source
 // fingerprint difference can otherwise allocate gigabytes of diagnostic text.
 assert(isDeepStrictEqual(actual.manifest, expected.manifest), 'Release manifest must match current source');
 for(const [label,found,wanted]of [['compiled file',actual.sourceFiles,expected.sourceFiles],['Data asset',actual.assets,expected.assets]]){
  assert.equal(found.size,wanted.size,'Release '+label+' count must match current source');
  for(const [id,bytes]of wanted)assert(found.get(id)?.equals(bytes),'Release '+label+' must match current source: '+id);
 }
 }
}
if (mode === 'build') {
    const out = args.includes('--out') ? path.resolve(option('--out')) : path.join(root, 'build', manifest.version + '.atria');
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, archive, { flag: 'wx' });
    console.log(JSON.stringify({ mode, packageHead, packageDirty, coreHead, output: out, bytes: archive.length }));
} else {
    const { verify } = await import(roleplay ? args.includes('--release-only')?'./roleplay-release-check.mjs':args.includes('--roleplay-ui-only')?'./roleplay-frontend-check.mjs':'./roleplay-check.mjs' : args.includes('--release-only')&&!fixture ? './release-check.mjs' : args.includes('--frontend-only')&&!fixture ? './frontend-check.mjs' : fixture ? './verify.mjs' : './opening-check.mjs');
    console.log(JSON.stringify({ packageHead, packageDirty, coreHead, ...await verify({ load, native, manifest, sourceFiles, assetPayloads, archive, mode, frontendCatalog }) }, null, 2));
}
