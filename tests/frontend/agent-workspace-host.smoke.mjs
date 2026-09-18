import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel: process.env.WORKSPACE_BROWSER || 'msedge', headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const errors=[]; page.on('pageerror',e=>{ errors.push(e.message); console.log('PAGE ERROR:',e.message); }); page.on('console',m=>{if(m.type()==='error') console.log('CONSOLE:',m.text().slice(0,300));});
 await page.goto(process.env.WORKSPACE_BASE_URL || 'http://127.0.0.1:8127/');
 await page.waitForFunction(()=>window.Atria?.getContext && !document.getElementById('preloader'));
 if(await page.locator('dialog textarea').isVisible()){await page.locator('dialog textarea').fill('Workspace Test');await page.locator('dialog .menu_button').filter({hasText:/^(好的|OK)$/}).click();}
 await page.waitForFunction(()=>window.Atria?.getContext?.().getExtensionApi?.('orchestrator')?.listWorkspacePresets);
 const onboarding = page.locator('dialog').filter({has:page.locator('#onboarding_ui_language_select')});
 await onboarding.waitFor({state:'visible',timeout:3000}).catch(()=>{});
 if(await onboarding.isVisible()) {
   await onboarding.locator('textarea').fill('Workspace Test');
   await onboarding.locator('.menu_button').filter({hasText:/^(好的|OK)$/}).click();
   await onboarding.waitFor({state:'hidden'});
 }
 console.log(JSON.stringify(await page.evaluate(()=>({presets:window.Atria.getContext().getExtensionApi('orchestrator').listWorkspacePresets(),workspaceSettings:document.querySelector('#orchestrator_settings')?.textContent,errors:[]}))));
 const state=await page.evaluate(async()=>{const panel=await import('/scripts/extensions/orchestrator/workspace/panel.js');panel.openWorkspace('Orchestration');return document.querySelector('#agent-memory-workspace').textContent;});
 assert(/Unified Preset Library|统一预设库|統一預設庫/.test(state)); assert(state.includes('Spec'));
 const workspace = page.locator('#agent-memory-workspace');
 assert.equal(await workspace.locator('.atria-workspace-mobile-nav').getByRole('button').count(),4);
 for (const mode of ['spec','agenda','director']) {
   await workspace.locator('.workspace-preset-list button').filter({hasText:new RegExp(mode === 'agenda' ? '^Atri-agenda' : `^${mode}`, 'i')}).tap();
   const count=await page.evaluate(mode=>window.Atria.getContext().extensionSettings.orchestrator.agentWorkspace.presets.find(p=>p.mode===mode).planTemplate.nodes.length,mode);
   page.once('dialog',dialog=>dialog.accept(`Mobile ${mode}`));
   await workspace.getByRole('button',{name:mode==='spec'?/^(Append worker stage|添加执行阶段)$/:/^(Add specialist|添加协作智能体)$/}).tap();
   const card=workspace.locator('.workspace-agent').filter({has:page.locator('summary').filter({hasText:`Mobile ${mode}`})});
   assert.equal(await card.getAttribute('open'),'');
   assert.equal(await page.evaluate(mode=>window.Atria.getContext().extensionSettings.orchestrator.agentWorkspace.presets.find(p=>p.mode===mode).planTemplate.nodes.length,mode),count+1);
   page.once('dialog',dialog=>dialog.accept());
   await card.getByRole('button',{name:/^(Delete agent|删除智能体)$/}).tap();
   assert.equal(await page.evaluate(mode=>window.Atria.getContext().extensionSettings.orchestrator.agentWorkspace.presets.find(p=>p.mode===mode).planTemplate.nodes.length,mode),count);
 }
 await workspace.locator('.workspace-preset-list button').filter({hasText:/^Spec/}).tap();
 await page.locator('#agent-memory-workspace').getByRole('button',{name:/^(Duplicate|复制|複製)$/,exact:true}).click();
 await page.locator('#agent-memory-workspace').getByRole('button',{name:/^(Bind as default|设为全局默认)$/,exact:true}).click();
 const id=await page.evaluate(()=>window.Atria.getContext().extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId);
 await page.waitForTimeout(1800);await page.reload();
 await page.waitForFunction(()=>window.Atria?.getContext?.().getExtensionApi?.('orchestrator')?.listWorkspacePresets);
 assert.equal(await page.evaluate(()=>window.Atria.getContext().extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId),id);
 await page.evaluate(async()=>{const panel=await import('/scripts/extensions/orchestrator/workspace/panel.js');panel.openWorkspace('Orchestration');});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.querySelector('#agent-memory-workspace').scrollWidth>innerWidth),false);
 await page.screenshot({path:'.git/workspace-host-mobile.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:'.git/workspace-host-desktop.png'});
 await workspace.locator('.atria-workspace-nav').getByRole('button',{name:/^(Memory|记忆|記憶)$/,exact:true}).click();
 const memory = page.locator('#memory_graph_settings');
 assert.equal(await memory.locator('.inline-drawer').count(),0);
 assert.equal(await memory.locator('.memory-control-card').count(),5);
 const recall = memory.locator('#atria_rpg_memory_recall_enabled');
 const wasEnabled = await recall.isChecked(); await recall.setChecked(!wasEnabled);
 assert.equal(await page.evaluate(()=>window.Atria.getContext().extensionSettings.memory_graph.recallEnabled),!wasEnabled);
 await recall.setChecked(wasEnabled);
 const retrieval = memory.locator('.memory-settings-group').filter({has:page.locator('#atria_rpg_memory_recall_method')});
 await retrieval.locator(':scope > summary').click();
 await memory.locator('#atria_rpg_memory_recall_method').selectOption('rag');
 assert.equal(await memory.locator('#atria_rpg_memory_rag_settings').isVisible(),true);
 assert.equal(await memory.locator('#atria_rpg_memory_recall_llm_settings').isVisible(),false);
 await memory.locator('#atria_rpg_memory_recall_method').selectOption('llm');
 await retrieval.locator(':scope > summary').click();
 await page.screenshot({path:'.git/workspace-host-memory.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.querySelector('#agent-memory-workspace').scrollWidth>innerWidth),false);
 await page.screenshot({path:'.git/workspace-host-memory-mobile.png'});
 for(const summary of await memory.locator(':scope > details > summary').all()) {
   await summary.click();
   assert.equal(await page.evaluate(()=>document.querySelector('#workspace-content').scrollWidth>document.querySelector('#workspace-content').clientWidth),false);
   await summary.click();
 }
 await workspace.locator('.atria-workspace-mobile-nav').getByRole('button',{name:/^(Orchestration|编排|編排)$/,exact:true}).click();
 assert.equal(await page.locator('#memory_graph_settings').count(),0);
 await workspace.locator('.atria-workspace-mobile-nav').getByRole('button',{name:/^(Memory|记忆|記憶)$/,exact:true}).click();
 assert.equal(await page.locator('#memory_graph_settings').count(),1);
 assert.deepEqual(errors, []);
 console.log(JSON.stringify({nativeHost:true,persistedBinding:id,pageErrors:errors}));
} finally {await browser.close();}
