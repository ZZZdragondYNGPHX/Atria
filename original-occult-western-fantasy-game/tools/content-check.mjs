import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertShape, schemaFor } from './content-schema.mjs';
const root = new URL('../', import.meta.url);
const idPattern = /^(district|location|institution|office|actor|artifact|event|matter|canon|tradition|primitive|claim|anomaly|origin|prior_life|faith|knowledge)\.[a-z][a-z0-9_.]*$/;
const principles = new Set(['Witness', 'Name', 'Boundary', 'Bond', 'Memory', 'Echo', 'Form', 'Possibility']);
const stringsIn = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(stringsIn) : [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function readContent() {
 const result = new Map();
 for (const file of (await fs.readdir(new URL('data/', root))).sort()) {
  if (!file.endsWith('.json')) continue;
  const bytes = await fs.readFile(new URL('data/' + file, root));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert(!text.startsWith('\uFEFF'), 'No BOM: ' + file);
  result.set(file.slice(0, -5), { bytes, value: JSON.parse(text) });
 }
 return result;
}
export function validateContent(resources, manifest) {
 assert(resources.size <= 64, 'P4 resource soft ceiling');
 const all = new Map(); let total = 0; let max = 0;
 for (const [file, { bytes, value }] of resources) {
  total += bytes.length; max = Math.max(max, bytes.length);
  assert(bytes.length < 256 * 1024, 'Resource soft ceiling: ' + file);
  if (file === 'seed.bootstrap') continue;
  assert.deepEqual(Object.keys(value).sort(), ['items', 'schemaVersion']);
  assert.equal(value.schemaVersion, 1);
  assert(Array.isArray(value.items));
  if (file === 'cases.signature.second_death') assert.equal(value.items.length, 1, 'Exactly the P5 opening Case');
  assert(value.items.length > 0, 'Empty P4 module: ' + file);
  for (const a of value.items) {
   assertShape(a, schemaFor(a.kind), a.id);
   assert(idPattern.test(a.id) && a.id.length <= 96, 'Stable ID: ' + a.id);
   assert(!all.has(a.id), 'Duplicate ID: ' + a.id); all.set(a.id, a);
   assert.equal(a.authority, 'definition'); assert.equal(a.generationPolicy, 'hard_authored');
   assert.equal(a.disclosure, a.kind === 'public_knowledge' ? 'public' : 'private_definition');
   assert.equal(new Set(a.dependencies).size, a.dependencies.length, 'Duplicate dependency');
   assert(a.kind.startsWith('canon_') === file.startsWith('canon.'), 'Canon module isolation');
   for (const p of a.canon.principles ?? []) assert(principles.has(p), 'Unsupported Principle');
   if (a.canon.principles) assert(a.canon.principles.length <= 2, 'Bounded Claim/Anomaly composition');
   if (a.kind.startsWith('actor_')) assert.equal(a.canon.formalClaims.length, 0, 'P4 cores carry no granted Claim');
   const referenced = stringsIn([a.canon, a.perspective, a.runtime]).filter(s => idPattern.test(s));
   for (const ref of referenced) assert(a.dependencies.includes(ref), a.id + ': undeclared reference ' + ref);
  }
 }
 assert(total < 2 * 1024 * 1024, 'P4 total low-megabyte soft budget');
 for (const a of all.values()) for (const ref of a.dependencies) assert(all.has(ref), a.id + ': dangling ' + ref);
 const byKind = kind => [...all.values()].filter(a => a.kind === kind);
 const range = (kind, lo, hi) => assert(byKind(kind).length >= lo && byKind(kind).length <= hi, 'Count: ' + kind);
 range('district', 6, 6); range('location', 25, 35); range('institution', 10, 10); range('actor_a', 12, 16); range('actor_b', 30, 50);
 range('civic_office', 4, 4); range('anomaly', 8, 12); range('claim_primitive', 8, 8); range('claim_seed', 16, 24); range('claim_archetype', 30, 40); range('canon_fragment', 12, 12);
 for (const a of byKind('location')) { assert.equal(all.get(a.canon.district).kind, 'district'); assert(['institution', 'civic_office'].includes(all.get(a.canon.controller).kind)); for (const id of a.canon.actors) assert(all.get(id).kind.startsWith('actor_')); }
 for (const a of byKind('institution')) {
  assert(a.canon.actors.some(id => all.get(id).kind === 'actor_a'), 'Institution requires major actor');
  assert(a.canon.actors.some(id => all.get(id).kind === 'actor_b'), 'Institution requires supporting actors');
  for (const id of a.canon.actors) assert.equal(all.get(id).canon.affiliation, a.id);
  assert.equal(all.get(a.canon.eastbank).kind, 'canon_fragment');
 }
 for (const a of [...byKind('claim_seed'), ...byKind('claim_archetype')]) { assert.equal(all.get(a.canon.primitive).kind, 'claim_primitive'); assert(a.canon.principles.includes(all.get(a.canon.primitive).canon.principles[0])); }
 assert.equal(new Set(byKind('claim_archetype').map(a => a.canon.coreRule)).size, byKind('claim_archetype').length, 'Do not count Anchor skins as new mechanics');
 const supported=byKind('claim_seed').filter(a=>a.canon.runtimeEligibility.length);
 assert.deepEqual(supported.map(a=>a.id),['claim.seed.unlost_evidence','claim.seed.name_mismatch']);
 for(const a of supported){assert.deepEqual(a.canon.runtimeEligibility,['verified_identity_across_sources','preserved_conflicting_evidence','first_breach']);assert.deepEqual(a.canon.runtimeTraditions,['tradition.civic','tradition.church']);}
 const network=byKind('signature_case').filter(a=>a.id!=='matter.second_death');
 assert.deepEqual(network.map(a=>a.runtime?.key).sort(),['burial','property','railway']);
 for(const a of network){
  const r=a.runtime;assert.equal(r.sources.length,4);assert.deepEqual(r.sources.map(s=>s.slot),['s0','s1','s2','s3']);
  assert.equal(new Set(r.sources.map(s=>s.id)).size,4);assert.equal(new Set(r.sources.map(s=>s.method)).size,4);
  assert.equal(r.sources[0].role,r.sources[2].role);assert.equal(r.sources[1].role,r.sources[3].role);assert.notEqual(r.sources[0].role,r.sources[1].role);
  assert.equal(r.dispositions.length,4);assert.equal(r.dispositions.at(-1).id,'withdraw');
  assert.equal(r.sources.filter(s=>s.dangerous).length,r.key==='railway'?1:0);
  assert.equal(all.get(r.actor).kind,'actor_b');assert.equal(all.get(r.location).kind,'location');
 }
 assert.equal(byKind('institutional_case_pattern').length,3);
 const fragments = byKind('canon_fragment');
 for (const a of fragments) { assert(a.canon.holders.length < 10); for (const id of a.canon.evidenceGateways) assert.equal(all.get(id).kind, 'artifact_template'); }
 assert.equal(all.get('canon.deep').canon.epistemicStatus, 'unresolved');
 assert.deepEqual(new Set(all.get('canon.index').canon.fragments), new Set(fragments.map(a => a.id)));
 const incoming = new Set([...all.values()].flatMap(a => a.dependencies));
 for (const a of all.values()) if (['institution', 'actor_a', 'actor_b', 'claim_primitive', 'tradition', 'canon_fragment', 'artifact_template'].includes(a.kind)) assert(incoming.has(a.id), 'Orphan: ' + a.id);
 const publicAssets = byKind('public_knowledge');
 assert.equal(manifest.knowledge.length, 1);
 const entries = manifest.knowledge[0].entries;
 assert.equal(entries.length, publicAssets.length);
 for (const a of publicAssets) { const e = entries.find(e => e.metadata.sourceDefinitionId === a.id); assert(e && e.content === a.canon.text && e.metadata.disclosure === 'public', 'Knowledge must be exact approved public text'); }
 assert.equal(manifest.knowledgeBindings.length, 0, 'No fixture retrieval binding');
 for (const e of manifest.entryPoints) assert.equal(e.knowledgeBindingIds.length, 0);
 for (const w of manifest.worlds) assert.equal(w.revision.knowledgeBindingIds.length, 0);
 const secretTexts = [...byKind('signature_case').map(a=>a.canon.truth), ...fragments.flatMap(a => a.canon.assertions), ...byKind('actor_a').flatMap(a => [a.canon.privateMotive, ...a.perspective.knownSecrets]), ...byKind('institution').flatMap(a => [a.canon.realFunction, ...a.perspective.initialKnowledge])];
 const assertSafe = value => { const text = JSON.stringify(value); for (const secret of secretTexts) assert(!text.includes(secret), 'Hidden Canon escaped'); for (const fragment of fragments) assert(!text.includes(fragment.id), 'Canon reference escaped'); };
 assertSafe(manifest.knowledge); assertSafe(manifest.entryPoints);
 return { all, assertSafe, metrics: { resources: resources.size, assets: all.size, bytes: total, largestResourceBytes: max, counts: Object.fromEntries([...new Set([...all.values()].map(a => a.kind))].map(k => [k, byKind(k).length])) } };
}
export async function contentCheck({ manifest, opened, session, projections, logic }) {
 assert.deepEqual(opened.manifest.knowledge, manifest.knowledge, 'Installed public Knowledge revision');
 const resources = await readContent(); const validated = validateContent(resources, manifest); const { all, assertSafe } = validated;
 for (const ref of manifest.runtime.experienceContract.dataResources) {
  const bytes = resources.get(ref.resourceId).bytes;
  assert.equal(hash(bytes), ref.contentHash);
  assert.deepEqual(opened.assets.get(ref.assetId), bytes, 'Installed exact content asset');
 }
 for (const a of all.values()) assert(!JSON.stringify(session.states).includes(a.id), 'P4 definition eagerly materialized: ' + a.id);
 assertSafe(projections); assertSafe(manifest.resources);
 assert.equal(manifest.runtime.experienceContract.taskRuntime.tasks.length, 4);
 assert.equal(manifest.runtime.experienceContract.informationRuntime.views.length, 5);
 assert.equal(manifest.runtime.experienceContract.informationRuntime.graphs.length, 2);
 for (const capability of ['authority-transaction', 'world-simulation']) assert(manifest.runtime.experienceContract.capabilities.some(c => c.id === capability && c.version === 1 && c.required));
 assert.deepEqual(manifest.runtime.experienceContract.authorityRuntime.policy, { maxReadGrants: 16, maxWorldEvents: 16, maxAppCommands: 24, maxEffects: 32, maxReceiptBytes: 32768 });
 const publication = logic.derivedPublications[0];
 const count = value => Array.isArray(value) ? value.reduce((n, x) => n + count(x), 0) : value && typeof value === 'object' ? (value.kind === 'app.command' ? 1 : 0) + Object.values(value).reduce((n, x) => n + count(x), 0) : 0;
 // The simulation regression independently measures selected expanded work, not this static reservation.
 assert.equal(publication.reads.length, 7);
 const staticCommands = count(publication);
 assert.equal(staticCommands, 10);
 const reject = mutate => { const copy = structuredClone(resources); mutate(copy); assert.throws(() => validateContent(copy, manifest)); };
 reject(r => { r.get('defs.actors.major').value.items[0].canon.inventedAuthority = true; });
 reject(r => { delete r.get('defs.claims.seeds').value.items[0].canon.forbiddenExtensions; });
 reject(r => { r.get('defs.geography.locations').value.items[0].canon.controller = 'institution.missing'; });
 reject(r => { r.get('defs.institutions').value.items[0].dependencies.push('institution.missing'); });
 reject(r => { r.get('defs.claims.primitives').value.items[0].canon.principles = ['Time']; });
 reject(r => { r.get('canon.eastbank.deep').value.items[0].canon.epistemicStatus = 'proven'; });
 reject(r => { r.get('defs.actors.supporting').value.items[0].id = 'actor.mara_vey'; });
 reject(r => { r.get('defs.knowledge.public').value.items[0].canon.text = all.get('canon.settlement').canon.assertions[0]; });
 reject(r => { r.get('defs.actors.major').value.items[0].name = '\uFFFD'; });
 reject(r => { r.get('defs.claims.seeds').value.items[0].canon.coreRule = 'x'.repeat(2049); });
 reject(r => { r.get('defs.claims.seeds').bytes = Buffer.alloc(256 * 1024); });
 assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.of(0xc3, 0x28)), 'Malformed UTF-8 fails closed');
 reject(r => { while (r.size <= 64) r.set('extra.' + r.size, { bytes: Buffer.from('{}'), value: {} }); });
 const bad = structuredClone(manifest); bad.knowledge[0].entries.push({ content: all.get('canon.settlement').canon.assertions[0] }); assert.throws(() => validateContent(resources, bad));
 // Declaration-level leak: a public binding must not be introduced silently.
 bad.knowledge[0].entries.pop(); bad.entryPoints[0].knowledgeBindingIds.push('kbind_unreviewed'); assert.throws(() => validateContent(resources, bad));
 return { result: { phase: 'P4', ...validated.metrics, staticPublicationReadGrants: publication.reads.length, staticPublicationAppCommands: staticCommands, negativeChecks: 15, initialMaterialization: 'P3 fixture only; no P4 entity copies', knowledge: 'Six installed public entries; no active fixture binding' }, assertSafe };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
 console.log(JSON.stringify(validateContent(await readContent(), manifest).metrics, null, 2));
}
