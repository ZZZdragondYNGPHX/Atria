// Run against tools/serve.mjs (simulation only). Actual Core + Native Frontend,
// with a simulated generation provider; this does not validate model quality.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const arg=n=>process.argv[process.argv.indexOf(n)+1];
const require=createRequire(import.meta.url),{chromium}=require(path.resolve(arg('--playwright')));
const browser=await chromium.launch({executablePath:path.resolve(arg('--chrome')),headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}}),url=arg('--url')||'http://127.0.0.1:18741';
const out=path.resolve('validation');await fs.mkdir(out,{recursive:true});
const evidence=[],check=(label,value)=>{assert(value,label);evidence.push(label);console.log('PASS '+label);};
const debug=async()=>{const r=await page.request.get(url+'/debug',{maxRetries:2});return (await r.json()).game;};
const button=name=>page.getByRole('button',{name,exact:true});
const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate(await debug()))return;await new Promise(r=>setTimeout(r,200));}throw Error('Committed state timeout');};
const row=title=>page.getByRole('article').filter({has:page.getByRole('heading',{name:title,exact:true})});
const capture=async name=>page.screenshot({path:path.join(out,name+'.png')});
await page.addInitScript(()=>{const Native=window.Audio;window.__sounds=[];window.Audio=function(...args){const v=new Native(...args);window.__sounds.push(v);return v;};});
try{
 await page.goto(url);await button('开始新的三天').click();await page.getByLabel('大家怎样称呼你').fill('阿澜');await button('简洁直接').click();await button('启用声音').click();await wait(g=>g.started);await button('简图').waitFor();await page.waitForFunction(()=>{const visit=n=>{if(n.querySelector?.('[data-node-id=send]:not([disabled])'))return true;return [...(n.querySelectorAll?.('*')||[])].some(x=>x.shadowRoot&&visit(x.shadowRoot));};return visit(document);});
 check('开局身份与表达偏好持久化',(await debug()).name==='阿澜'&&(await debug()).preference==='简洁直接');
 await button('继续阅读').click();check('阅读翻页不耗 AP',(await debug()).spent_ap===0);await button('上一段').click();
 await page.waitForFunction(()=>window.__sounds.some(v=>v.currentTime>.2&&v.readyState===4&&!v.paused));
 check('真实 WAV 解码与播放时钟前进',true);await capture('desktop-inn');
 await button('周守川').click();await page.getByLabel('普通闲聊，不改变关键安排').fill('窗外的雨还很大。');await button('说给对方听').click();await page.locator('[data-node-id=chat-reply]').filter({hasText:'模拟闲聊'}).waitFor();await button('回看交谈回应').click();await page.getByRole('article').filter({hasText:'模拟闲聊'}).waitFor();check('人物闲聊及正式回应回看不耗 AP',(await debug()).spent_ap===0);await button('关闭并返回场景').click();
 await button('简图').click();await page.waitForFunction(()=>{let n=document.activeElement;while(n?.shadowRoot?.activeElement)n=n.shadowRoot.activeElement;return n?.dataset.nodeId==='close';});await page.keyboard.press('Escape');await button('简图').waitFor();
 await page.waitForFunction(()=>{let n=document.activeElement;while(n?.shadowRoot?.activeElement)n=n.shadowRoot.activeElement;return n?.dataset.nodeId==='map';});check('Escape 关闭并恢复触发焦点',true);
 await button('简图').click();await row('旧无线电室').getByRole('button').click();await button('先不做 / 修改打算').click();check('取消预览无移动无扣费',(await debug()).location==='inn'&&(await debug()).spent_ap===0);
 await button('简图').click();await row('旧无线电室').getByRole('button').click();await button('确认前往旧无线电室').click();await wait(g=>g.location==='radio');
 await button('检修现用报务台').click();await button('确认检修现用报务台').waitFor({state:'visible'});await capture('repair-preview');
 check('成本和确认后余量公开',(await page.locator('[data-node-id="preview-cost"]').textContent()).includes('零件 1'));
 await button('确认检修现用报务台').click();await wait(g=>g.spent_ap===1);check('维修仅结算一次',(await debug()).stock.parts===2&&(await debug()).facilities.radio===1);
 await button('菜单').click();await button('创建新存档').click();await page.locator('[data-node-id="panel-notice"]').filter({hasText:'新存档已创建'}).waitFor();await page.keyboard.press('Escape');
 await button('歇一会儿，等候一次行动').click();await button('确认歇一会儿，等候一次行动').click();await wait(g=>g.spent_ap===2);
 await button('菜单').click();await button('选择存档').click();await row('第1天 · 晨 · 旧无线电室').getByRole('button').click();await row('确认恢复').getByRole('button').click();await wait(g=>g.spent_ap===1);await button('简图').waitFor();check('宿主 SavePoint 恢复权威进度',(await debug()).facilities.radio===1);
 const draft=page.getByLabel('写下打算');await draft.fill('去码头\n再考虑登记');const before=await debug();
 await draft.dispatchEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true});await page.waitForTimeout(400);check('中文输入法组合按键不提交',(await debug()).sequence===before.sequence);
 await draft.press('Enter');check('普通 Enter 保留换行',await draft.inputValue().then(v=>v.includes('\n')));await draft.press('Control+Enter');await page.locator('[data-node-id="notice"]').filter({hasText:'模拟理解'}).waitFor();check('意图理解不改世界',(await debug()).sequence===before.sequence);
 await page.setViewportSize({width:390,height:844});await capture('narrow-radio');await button('菜单').click();await button('大字 / 宽行距').click();await page.locator('.panel.large').waitFor();await button('减少动态效果').click();await page.getByText('减少动态效果已开启；本作使用即时阅读与静止立绘。',{exact:true}).waitFor();await button('关闭并返回场景').click();await page.getByRole('dialog').waitFor({state:'detached'});await capture('narrow-large');
 check('窄屏大字无横向溢出',await page.locator('[data-node-id="stage"]').last().evaluate(n=>n.scrollWidth<=n.clientWidth+1));
 await button('菜单').click();await button('切换静音').click();await page.waitForFunction(()=>window.__sounds.every(v=>v.paused));check('总静音即时暂停实际声音',true);await page.keyboard.press('Escape');
 // Fail before the request reaches the real bridge. The previous valid state
 // and draft survive; a new preview after reconciliation is safe.
 let failed=false;await page.route('**/bridge/request',async route=>{const body=route.request().postDataJSON();if(!failed&&body.bindingId==='act'){failed=true;await route.fulfill({status:503,body:'{"error":"verification_offline"}'});}else await route.continue();});
 await button('歇一会儿，等候一次行动').click();await button('确认歇一会儿，等候一次行动').click();await page.waitForTimeout(1500);check('提交连接失败无扣账',failed&&(await debug()).spent_ap===1);await page.unroute('**/bridge/request');await button('先不做 / 修改打算').click();await button('歇一会儿，等候一次行动').click();await button('确认歇一会儿，等候一次行动').click();await wait(g=>g.spent_ap===2);check('核对后新预览可恢复执行',true);
 await page.route('**/file?*',async route=>{const p=new URL(route.request().url()).searchParams.get('p');if(p?.endsWith('/radio-day.webp'))await route.fulfill({status:503,body:'unavailable'});else await route.continue();});await page.reload();await button('看看这里').waitFor();check('图片失败仍能读取场景与操作',await button('简图').isVisible());await page.unroute('**/file?*');
 check('无挂载边界故障',await page.evaluate(()=>diagnostics.length===0));
 await fs.writeFile(path.join(out,'ui-results.json'),JSON.stringify({mode:'actual Core and Native Frontend; simulated generation',checks:evidence},null,2));console.log(JSON.stringify({passed:evidence.length,evidence}));
}catch(error){await capture('failure');await fs.writeFile(path.join(out,'ui-progress.json'),JSON.stringify({passed:evidence,error:error.message},null,2));throw error;}finally{await browser.close();}
