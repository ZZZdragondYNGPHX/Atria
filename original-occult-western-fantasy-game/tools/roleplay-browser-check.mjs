import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function browserChecks({load,url,root,getSession,fresh,act,getRequests,getCommits,setFailure,setDropBegin,appendReadingFixture}){
 const {chromium}=await load('tests/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({...(process.env.ATRIA_BROWSER_CHANNEL?{channel:process.env.ATRIA_BROWSER_CHANNEL}:{}),headless:true});
 const output=path.join(root,'build/ui-3.0.0-p4');await fs.mkdir(output,{recursive:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[],screenshots=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error('Browser',m.text());});
 page.setDefaultTimeout(30000);
 const node=id=>page.locator('[data-node-id="'+id+'"]');
 const check=text=>{checks.push(text);console.error('P4 PASS',text);};
 const shot=async name=>{
  const target=name.includes('drawer')?'drawer':name==='desktop-entry'?'entry':name==='desktop-review'?'review':'story';
  const loading=target==='drawer'?'drawer-loading':'loading';let capture,ready=false;
  for(let attempt=0;attempt<3;attempt++){
   await node(target).waitFor({state:'visible'});await node(loading).waitFor({state:'hidden'});
   if(name.startsWith('story-'))await node('scene').evaluate(e=>e.scrollIntoView({block:'start'}));
   if(name==='claim-drawer')await node('detail-row').filter({hasText:'超凡与义务'}).evaluate(e=>e.scrollIntoView({block:'center'}));
   if(name.endsWith('terminal')){await node('error').waitFor({state:'hidden'});await node('terminal').evaluate(e=>e.scrollIntoView({block:'center'}));}
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   capture=await page.screenshot({animations:'disabled'});
   ready=capture.length>4096&&await node(target).isVisible()&&!await node(loading).isVisible();
   if(ready)break;
  }
  assert(ready,'Native viewport capture must contain its ready destination');
  await fs.writeFile(path.join(output,name+'.png'),capture);screenshots.push(name+'.png');
 };
 const settle=async()=>{await node('lives').waitFor();await node('loading').waitFor({state:'hidden'});};
 const choose=async label=>{await node('choose').filter({hasText:label}).click();await node('choose').filter({hasText:label}).and(page.locator('[aria-current="true"]')).waitFor();await node('nextQuestion').click();};
 const waitUntil=async fn=>{const end=Date.now()+30000;while(!fn()&&Date.now()<end)await page.waitForTimeout(100);assert(fn(),'Expected Native state was not published');};
 const value=id=>getSession().states.atri_lifecycle.domains[id].records.find(r=>r.id==='main').value;
 const create=async(mode='ordinary',traveller=false)=>{
  await node('newStory').click();await node('name').fill(traveller?'岚':'林');await node(mode).click();await node('next').click();
  for(const label of traveller?['刚到城的旅人','读写与账目','暂想独自生活','旁观机构示范','寻求归属']:['本地街区住民','手艺与短工','一位熟人','只有传闻','安顿谋生'])await choose(label);
  const sends=getRequests(),count=getCommits();await node('begin').click();await node('story').waitFor();await settle();assert.equal(getRequests(),sends);assert.equal(getCommits(),count+1);
 };
 const prepareRisk=async()=>{
  // Later-state presentation setup uses real Native authority, not UI-click coverage.
  await act('roleplay.travel',{to:'location.cathedral'});await act('roleplay.talk',{targetId:'church',method:'ask_training',text:'我想了解这里的礼仪。'});await act('roleplay.learn',{institution:'church',method:'study',acceptPrice:false});await act('roleplay.practice',{institution:'church'});await act('roleplay.talk',{targetId:'church',method:'ask_practice',text:'我想知道私设载体的风险。'});
 };
 const reachDeath=async()=>{
  await act('roleplay.travel',{to:'location.old_ferry'});await act('roleplay.travel',{to:'location.signal_house'});await act('roleplay.research',{engineering:'personal_carrier',text:'我研究自己的见证载体。'});
  let attempts=0;while(getSession().states.atri_run.status!=='dead'&&attempts++<24){if(value('roleplay_summary').pursuit.stage>=3&&!value('roleplay_summary').pursuit.assisted)await act('roleplay.petition',{method:'request_supervision'});if(value('roleplay_summary').claim.active)await act('roleplay.maintain',{method:'deny_witness'});await act('risk.resolve',{seed:'claim.seed.unlost_evidence',engineering:'personal_carrier',method:'force',acceptPrice:true,acknowledgeSevere:true});}
  assert.equal(getSession().states.atri_run.status,'dead');await node('refresh').click();await node('terminal').waitFor();assert(await node('send').isDisabled());
 };
 try{
  await page.goto(url);await settle();await shot('desktop-entry');await node('newStory').click();await node('next').click();await node('error').getByText('请写下 1–48 字称呼。',{exact:true}).waitFor();
  await node('name').fill('林');await node('appearance').fill('墨迹留在袖口。');await node('next').click();
  await choose('寄住熟人家');await choose('手艺与短工');await choose('暂想独自生活');await choose('只有传闻');
  await node('choose').filter({hasText:'安顿谋生'}).click();await node('nextQuestion').click();await node('error').getByText('寄住熟人需要保留这一段普通关系',{exact:false}).waitFor();
  assert.equal(getRequests(),0);assert.equal(value('roleplay_player').started,false);
  await node('previous').click();await node('previous').click();await node('choose').filter({hasText:'一位熟人'}).click();await node('nextQuestion').click();await node('nextQuestion').click();await node('nextQuestion').click();
  await shot('desktop-review');const sends=getRequests(),count=getCommits();setDropBegin();await node('begin').click();await waitUntil(()=>value('roleplay_player').started);await node('refresh').click();await node('story').waitFor();await settle();assert.equal(getRequests(),sends);assert.equal(getCommits(),count+1);assert.equal(value('roleplay_player').residence,'guest');
  assert((await node('background-text').textContent()).includes(value('roleplay_player').background.residence));
  check('invalid name and incompatible choices leave character pending; back/edit, single-CAS zero-provider begin, committed response loss recovers');
  const rev=getSession().revision.revisionId,requests=getRequests();await node('suggest').first().click();await page.waitForTimeout(150);assert((await node('draft').inputValue()).length>0);assert.equal(getSession().revision.revisionId,rev);assert.equal(getRequests(),requests);
  const draft=await node('draft').inputValue();await node('openCompanion').click();await node('drawer').waitFor();await node('drawer-loading').waitFor({state:'hidden'});await shot('desktop-drawer');
  assert((await node('drawer').innerText()).includes('墨迹留在袖口'));
  await node('chooseTab').filter({hasText:'人物关系'}).click();await node('detail-row').filter({hasText:'米拉'}).waitFor();
  await page.keyboard.press('Escape');await node('drawer').waitFor({state:'hidden'});assert.equal(await node('draft').inputValue(),draft);assert(await node('openCompanion').evaluate(el=>el===el.getRootNode().activeElement));
  check('suggestions only fill draft; public self/relationship drawer, Escape and focus return preserve draft');
  await node('draft').fill('我修补渡口的绳索。');await node('send').click();await waitUntil(()=>value('roleplay_summary').progress.effectiveTurns===1);await node('send').and(page.locator(':not(:disabled)')).waitFor();assert.equal(await node('draft').inputValue(),'');assert.equal(value('roleplay_summary').economy.coins,32);
  await node('openCompanion').click();await node('chooseTab').filter({hasText:'保存与继续'}).click();await node('save').click();await node('drawer-notice').getByText('当前进度已保存。',{exact:true}).waitFor();await node('chooseSave').first().waitFor();const saved=value('roleplay_summary').economy.coins;
  await node('drawer-loading').waitFor({state:'hidden'});await node('closeCompanion').click();await node('draft').fill('我再修补一件工具。');await node('send').click();await waitUntil(()=>value('roleplay_summary').progress.effectiveTurns===2);await node('openCompanion').click();await node('chooseTab').filter({hasText:'保存与继续'}).click();await node('chooseSave').first().click();await node('restore-review').waitFor();await node('restore').click();await waitUntil(()=>value('roleplay_summary').economy.coins===saved);await node('drawer-loading').waitFor({state:'hidden'});if(await node('closeCompanion').isVisible())await node('closeCompanion').click();await node('refresh').click();await settle();
  check('visible Host Composer resolves a real work transaction; visible Host save and explicit restore recover committed resources');
  await node('draft').fill('我说：先听听河岸的消息。');setFailure(true);const before=value('roleplay_summary').progress.effectiveTurns;await node('send').click();await node('unknown').waitFor();assert.equal(value('roleplay_summary').progress.effectiveTurns,before);assert((await node('draft').inputValue()).includes('河岸'));assert(await node('send').isDisabled());setFailure(false);await node('recover').click();await node('send').waitFor();
  check('actual narrator failure preserves draft, publishes no turn, blocks unconfirmed resubmission until explicit Host recovery');
  for(const width of [390,1440,375,768,1024]){
   await page.setViewportSize({width,height:900});await shot('story-'+width);assert(await node('lives').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   assert(await node('draft').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
   assert(await page.locator('button:visible').evaluateAll(rows=>rows.every(e=>{const b=e.getBoundingClientRect();return b.width>=44&&b.height>=44;})));
   await node('openCompanion').click();await node('drawer-loading').waitFor({state:'hidden'});assert(await node('drawer').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   if(width===390)await shot('drawer-390');await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert(await page.evaluate(()=>{let e=document.activeElement;while(e?.shadowRoot?.activeElement)e=e.shadowRoot.activeElement;return !!e?.closest('[data-node-id="companion"]');}));await page.keyboard.press('Escape');
  }
  await page.emulateMedia({reducedMotion:'reduce'});await node('openCompanion').click();assert.equal(await node('drawer').evaluate(e=>getComputedStyle(e).animationName),'none');await page.keyboard.press('Escape');
  await page.setViewportSize({width:844,height:390});await shot('landscape');
  await page.setViewportSize({width:390,height:400});await node('draft').focus();await node('send').evaluate(e=>e.scrollIntoView({block:'center'}));assert(await node('send').evaluate(e=>{const b=e.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;}));
  await page.goto(url+'/?textScale=2');await settle();await shot('text-scale-200');assert(await node('lives').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  check('390/1440 plus 375/768/1024, landscape and Native 200% text have no horizontal overflow; visible touch targets are at least 44px; resized mobile viewport keeps send reachable; drawer focus stays inside; reduced motion removes drawer animation');
  await appendReadingFixture();await node('refresh').click();await node('message').filter({hasText:'本地阅读排版样本 37。'}).waitFor();assert((await node('message').count())<=32);await node('nextMessages').click();await page.waitForTimeout(150);const earlierIds=await node('message').evaluateAll(rows=>rows.map(r=>r.textContent));await node('draft').fill('我说：今天暂且如此。');const beforeReply=getSession().timeline.at(-1).messageId;await node('send').click();await waitUntil(()=>getSession().timeline.at(-1).role==='assistant'&&getSession().timeline.at(-1).messageId!==beforeReply);await node('send').and(page.locator(':not(:disabled)')).waitFor();assert.deepEqual(await node('message').evaluateAll(rows=>rows.map(r=>r.textContent)),earlierIds);await node('latestMessages').click();await node('message').filter({hasText:'今天暂且如此。'}).waitFor();check('bounded recent/earlier Timeline windows; an actual new reply leaves the earlier reading window unchanged until explicit return to latest');
  await fresh();await page.goto(url);await settle();await create('ordinary',true);assert.equal(value('roleplay_player').location,'location.lodging');assert.equal(value('roleplay_summary').relation.created,false);await shot('traveller');
  await node('draft').fill('我想收束这一段经历。');await node('send').click();await waitUntil(()=>value('roleplay_summary').progress.episode==='closed');await node('episode').waitFor();assert.equal(getSession().states.atri_run.status,'active');
  check('second ordinary traveller/solo start uses approved fragments and actual lodging; episode closure stays distinct from death');
  await page.setViewportSize({width:1440,height:1000});await fresh();await page.goto(url);await settle();await create();await node('openCompanion').click();await node('chooseTab').filter({hasText:'保存与继续'}).click();await node('save').click();await node('drawer-notice').getByText('当前进度已保存。',{exact:true}).waitFor();await node('drawer-loading').waitFor({state:'hidden'});await node('closeCompanion').click();
  await prepareRisk();await act('roleplay.learn',{institution:'church',method:'accept_price',acceptPrice:true});await node('refresh').click();await settle();await node('openCompanion').click();await node('drawer-loading').waitFor({state:'hidden'});await node('detail-row').filter({hasText:'超凡与义务'}).getByText('锚点：',{exact:false}).waitFor();const claimText=await node('detail-row').filter({hasText:'超凡与义务'}).innerText();assert(claimText.includes(value('roleplay_summary').claim.anchor));assert(claimText.includes(value('roleplay_summary').claim.price));await shot('claim-drawer');await node('closeCompanion').click();await act('roleplay.maintain',{method:'deny_witness'});
  await reachDeath();await shot('ordinary-terminal');await node('openCompanion').click();await node('chooseTab').filter({hasText:'保存与继续'}).click();await node('chooseSave').first().click();await node('restore-review').waitFor();await node('restore').click();await waitUntil(()=>getSession().states.atri_run.status==='active');await node('drawer-loading').waitFor({state:'hidden'});if(await node('closeCompanion').isVisible())await node('closeCompanion').click();await node('refresh').click();await settle();assert.equal(value('roleplay_summary').player.location,'location.old_ferry');assert(await node('send').isEnabled());
  check('actual accepted Claim shows its public rule/Anchor/Price; ordinary death stops sending and explicit earlier-save restore resumes the saved life');
  await page.setViewportSize({width:1440,height:1000});await fresh();await page.goto(url);await settle();await create('ironman');await node('openCompanion').click();await node('chooseTab').filter({hasText:'保存与继续'}).click();await node('save').click();await node('chooseSave').first().waitFor();assert(await node('chooseSave').first().isDisabled());await page.keyboard.press('Escape');
  await prepareRisk();await reachDeath();await shot('ironman-terminal');
  await node('openCompanion').click();await node('drawer-loading').waitFor({state:'hidden'});await node('detail-row').filter({hasText:'人生终局'}).waitFor();await node('chooseTab').filter({hasText:'保存与继续'}).click();await node('drawer-loading').waitFor({state:'hidden'});assert.equal(await node('chooseSave').count(),0);assert(await node('save').isDisabled());await node('drawer-error').waitFor({state:'hidden'});await node('closeCompanion').click();
  check('ironman current save exposes no rollback; real qualified authority death renders terminal and disables continuation; terminal drawer reads no deleted state or saves');
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.diagnostics),[]);
  return {browser:'Playwright Chromium headless',checks,screenshots,errors};
 }catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error('P4 failure diagnostics',await page.evaluate(()=>window.diagnostics).catch(()=>[]));throw error;}finally{await browser.close();}
}
