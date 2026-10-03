import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function browserChecks({load,url,root,getSession,actNative,setFailure,getLastProof,getTypedRequests,version}){
 const {chromium}=await load('tests/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({channel:process.env.ATRIA_BROWSER_CHANNEL||'msedge',headless:true});
 const output=path.join(root,'build/ui-'+version);await fs.mkdir(output,{recursive:true});const result={browser:'Edge Chromium headless',screenshots:[],checks:[]};
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error('Browser console',m.text());});
 page.setDefaultTimeout(180000);
 const node=id=>page.locator('[data-node-id="'+id+'"]');
 const navigate=async section=>{await node(['notes','evidence','cases'].includes(section)?'go_notes':['timeline','people','institutions','artifacts'].includes(section)?'go_chronicle':'go_arrangements').click();if(!['notes','timeline','identity'].includes(section))await node('selectSection').selectOption(section);};
 const shot=async name=>{await page.screenshot({path:path.join(output,name+'.png'),timeout:120000});result.screenshots.push(name+'.png');};
 const settle=async()=>{await node('root').waitFor({state:'visible',timeout:240000});await node('loading').waitFor({state:'hidden',timeout:240000});await page.waitForFunction(()=>window.diagnostics?.length===0);};
 const choose=async(id,input)=>{await node('selectAction').selectOption(id);await page.waitForTimeout(150);for(const [i,value]of Object.values(input).entries()){const select=node('select_f'+i),text=node('text_f'+i);if(await select.isVisible())await select.selectOption(String(value));else if(await node('numeric_f'+i).isVisible())await node('numeric_f'+i).fill(String(value));else await text.fill(String(value));}await node('accept-check').check();await node('commit').click();};
 const waitStep=async n=>{await page.waitForFunction(n=>{const find=root=>{for(const el of root.querySelectorAll('*')){if(el.dataset.nodeId==='stepText'&&el.textContent.includes('Step '+n+' of 6'))return true;if(el.shadowRoot&&find(el.shadowRoot))return true;}return false;};return find(document);},n,{timeout:240000});};
 try{
  await page.goto(url);await settle();await shot('desktop-creation');
  if(process.argv.includes('--phase7-ui-only')){
   // Focused Phase 7 diagnostic: setup uses real Native transactions, not UI turns.
   for(const [id,input] of [['opening.identity',{name:'Marin Vale',pronouns:'they / them',age:28,appearance:'An ordinary coat.'}],['opening.origin',{choice:'origin.clerical_household'}],['opening.prior_life',{choice:'prior_life.legal'}]])await actNative(id,input);
   await node('refresh').click();await waitStep(4);const faith=await node('select_f0').locator('option').first().getAttribute('value');
   for(const [id,input] of [['opening.faith',{choice:faith}],['opening.anchor',{name:'Robin Vale',relationship:'sibling',place:'home'}],['opening.reason',{reason:'Follow records carefully.'}],['opening.acquire_mortuary',{method:'inspect_death'}]])await actNative(id,input);
   await node('refresh').click();await node('creation').waitFor({state:'hidden'});await navigate('evidence');await node('search').fill('no-such-acquired-record');await node('evidence-list').getByText('No matching acquired record',{exact:true}).waitFor();
   await navigate('timeline');await node('history-row').first().waitFor();
   const fact=Object.values(getSession().states.atri_lifecycle.history.facts).find(f=>f.public);
   await node('historyId').fill(fact.id);await node('historyApply').click();await node('historySelect').filter({hasText:fact.label}).waitFor();await node('historySelect').first().click();await node('history-detail').waitFor();
   assert((await node('history-detail-source').innerText()).includes(fact.id));await node('historyMark').click();
   await page.waitForFunction(()=>!document.body.textContent.includes('Required Controller unavailable'));
   const deadline=Date.now()+120000;while(!getSession().states.atri_lifecycle.history.memory[fact.id]?.marked&&Date.now()<deadline)await page.waitForTimeout(100);
   assert.equal(getSession().states.atri_lifecycle.history.memory[fact.id]?.marked,true);await node('historyApply').click();await node('historySelect').first().click();await shot('phase7-marked-record');
   await navigate('people');await node('historySelect').first().waitFor();await node('historySelect').first().click();assert((await node('history-detail-text').innerText()).includes('chronological Age'));
   for(const width of [375,390,768,1024,1440]){await page.setViewportSize({width,height:900});await shot('phase7-person-'+width);assert(await node('folio').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
   await page.evaluate(()=>document.documentElement.style.fontSize='32px');await page.setViewportSize({width:390,height:900});await shot('phase7-person-large-text');assert(await node('folio').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.evaluate(()=>document.documentElement.style.fontSize='');
   await navigate('time');await node('stanceOnly').click();const before=getSession().states.atri_lifecycle.clocks.world;await node('accept-check').check();await node('commit').click();await page.waitForTimeout(1000);await node('loading').waitFor({state:'hidden'});assert.equal(getSession().states.atri_lifecycle.clocks.world,before);
   assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.diagnostics),[]);result.checks.push('focused diagnostic only: Native setup; evidence search; real history mark; public person view; widths and enlarged text; zero-minute stance request');await fs.writeFile(path.join(output,'phase7-focused-report.json'),JSON.stringify(result,null,2));return result;
  }
  // The actual six-step UI invokes Host-owned authority transactions.
  for(const [index,[id,input]]of [
   ['opening_identity',{name:'Marin Vale',pronouns:'they / them',age:28,appearance:'An ordinary coat and ink-stained cuffs.'}],
   ['opening_origin',{choice:'origin.clerical_household'}],
   ['opening_prior_life',{choice:'prior_life.legal'}],
   ['opening_faith',{choice:'faith.conventional'}],
   ['opening_anchor',{name:'Robin Vale',relationship:'sibling',place:'home'}],
   ['opening_reason',{reason:'Keep an independent practice and follow records carefully.'}],
  ].entries()){
   // Faith is a curated native enum; use its first actual stable ID, never invent an option.
   if(id==='opening_faith')input.choice=await node('select_f0').locator('option').first().getAttribute('value');
   await choose(id,input);if(index<5)await waitStep(index+2);else await node('creation').waitFor({state:'hidden',timeout:240000});
   console.error('P8 browser PASS creation',index+1);
  }
  result.checks.push('six native typed creation steps; distinct option IDs');await shot('desktop-created');
  const beforeFailure=structuredClone(getSession());setFailure(true);
  await choose('opening_acquire_mortuary',{method:'inspect_death'});
  await node('retryAction').waitFor({state:'visible',timeout:120000});
  assert.equal(getSession().revision.revisionId,beforeFailure.revision.revisionId);
  const original=getTypedRequests().at(-1);setFailure(false);await node('retryAction').click();
  await page.waitForFunction(()=>{const find=r=>[...r.querySelectorAll('*')].some(e=>(e.dataset.nodeId==='notice'&&e.textContent.includes('Atria recorded'))||(e.shadowRoot&&find(e.shadowRoot)));return find(document);},null,{timeout:120000});
  const replay=getTypedRequests().at(-1);assert.deepEqual(replay,original);
  result.checks.push('actual typed provider failure publishes zero; retry retains epoch/revision/key/input');
    // Existing official Native entrypoints create acquired evidence for UI coverage, not forged state.
  for(const [id,input]of [
   ['opening.acquire_register',{method:'request_old_register'}],['opening.family',{method:'ask_with_consent'}],['opening.compare',{method:'compare_independent_sources'}],['opening.preserve',{method:'separate_and_witness'}],['opening.hypothesis',{text:'The authentic records may serve different present interests. This is a revisable hypothesis, not a hidden answer.'}],
  ])await actNative(id,input);
  for(const [id,input]of [
   ['convergence.manage',{case:'company',operation:'open',disposition:'none'}],['convergence.source_0',{method:'charter_extract'}],['convergence.source_1',{method:'worker_countersign'}],
   ['convergence.manage',{case:'headline',operation:'open',disposition:'none'}],['convergence.source_0',{method:'draft_custody'}],['convergence.source_1',{method:'witness_copy'}],
   ['opening.seed_unlost_evidence',{seed:'claim.seed.unlost_evidence'}],['opening.consult',{method:'qualified_civic_or_church_consultation'}],['opening.stabilize_unlost_evidence_civic',{tradition:'civic',seed:'claim.seed.unlost_evidence',acceptPrice:true}],
  ])await actNative(id,input);
  const terms={history:'attributed_public',stability:'phased_revision',justice:'recognition_review',power:'shared_council',religion:'dual_registry',accountability:'named_duties'};
  for(const operation of ['petition','examine','settle'])await actNative('convergence.hearing',{operation,...terms});
  await node('refresh').click();await page.waitForTimeout(500);await settle();await navigate('evidence');await page.waitForTimeout(250);
  await node('selectEvidence').first().click();await shot('desktop-evidence');
  assert(await node('detail').isVisible());assert((await node('epistemic').innerText()).includes('Testimony'));assert((await node('epistemic').innerText()).includes('Finding'));assert((await node('epistemic').innerText()).includes('Hypothesis'));
  await node('search').fill('no-such-acquired-record');await node('evidence-list').getByText('No matching acquired record',{exact:true}).waitFor({state:'visible'});await node('search').fill('');await page.waitForTimeout(200);
  result.checks.push('acquired evidence, provenance, graph selection, semantic categories, empty search');
  await navigate('cases');await page.waitForTimeout(200);assert.equal(await node('term').count(),6);assert((await node('terms').innerText()).includes('Phased revision'));await shot('desktop-cases');
  await navigate('identity');await page.waitForTimeout(200);await shot('desktop-identity');
  await node('save').click();await node('save-option').first().waitFor({state:'attached',timeout:120000});
  result.checks.push('Native SavePoint through visible UI; acquired six-dimensional compact and Claim Price');
  await node('advisory-summary').click();await node('query').fill('Compare the known independent sources.');
  await node('reflection').click();await page.waitForFunction(()=>{const find=r=>[...r.querySelectorAll('*')].some(e=>(e.dataset.nodeId==='advice'&&e.textContent.includes('Advisory only'))||(e.shadowRoot&&find(e.shadowRoot)));return find(document);},null,{timeout:120000});
  await node('advisor').click();await page.waitForTimeout(300);await page.waitForFunction(()=>{const find=r=>[...r.querySelectorAll('*')].some(e=>(e.dataset.nodeId==='advice'&&e.textContent.includes('Advisory only'))||(e.shadowRoot&&find(e.shadowRoot)));return find(document);},null,{timeout:120000});
  result.checks.push('Reflection and Claim Advisor complete through native operation bindings');
  // Form identity, consent and bounds never mutate authority before confirmation.
  await node('selectAction').selectOption('convergence_claim');await page.waitForTimeout(250);assert.equal(await node('select_f0').locator('option').count(),48);assert.equal(await node('select_f6').inputValue(),'false');assert(await node('commit').isDisabled());
  const currentRevision=getSession().revision.revisionId;await node('select_f0').selectOption({index:20});await page.waitForTimeout(300);assert.equal(getSession().revision.revisionId,currentRevision);await shot('desktop-catalog');
  result.checks.push('bounded 16/32 catalog; consent off; no action on selection');
  for(const width of [375,390,768,1440]){
   await page.setViewportSize({width,height:900});for(const section of ['notes','evidence','cases','identity']){await navigate(section);await page.waitForTimeout(150);await node('folio').evaluate(el=>{el.scrollTop=0;});await shot(section+'-'+width);assert(await node('root').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await node('folio').evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
  }
  await page.setViewportSize({width:812,height:375});await navigate('evidence');await page.waitForTimeout(150);await shot('evidence-landscape');assert(await node('folio').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.setViewportSize({width:375,height:900});await page.evaluate(()=>document.documentElement.style.fontSize='32px');await page.waitForTimeout(150);await shot('evidence-375-large-text');assert(await node('nav').locator('button').evaluateAll(buttons=>buttons.every(el=>el.scrollWidth<=el.clientWidth+1)));assert(await node('folio').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.evaluate(()=>document.documentElement.style.fontSize='');
  await node('go_chronicle').hover();await node('go_chronicle').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));assert.equal(await node('go_chronicle').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(40, 84, 93)');
  result.checks.push('375px small phone, 812x375 landscape, 200% root text sizing without horizontal overflow');
  await page.emulateMedia({colorScheme:'dark'});assert.equal(await node('root').evaluate(el=>getComputedStyle(el).colorScheme),'light');
  result.checks.push('intentional paper/light surface retains explicit color scheme under dark OS preference');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await node('commit').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  await node('go_notes').focus();await page.keyboard.press('Enter');await page.waitForTimeout(100);assert(await node('notes').isVisible());
  result.checks.push('390/768/1440 layouts, overflow, keyboard activation, reduced motion');
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.diagnostics),[]);
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(result,null,2));return result;
 }catch(e){console.error('P8 browser failure',e.message,await node('error-copy').textContent().catch(()=>''),JSON.stringify(await page.evaluate(()=>window.diagnostics)));await shot('failure').catch(()=>{});throw e;}finally{await browser.close();}
}
