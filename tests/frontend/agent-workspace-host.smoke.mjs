import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel: process.env.WORKSPACE_BROWSER || 'msedge', headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}); const errors=[]; page.on('pageerror',e=>{ errors.push(e.message); console.log('PAGE ERROR:',e.message); }); page.on('console',m=>{if(m.type()==='error') console.log('CONSOLE:',m.text().slice(0,300));});
 await page.goto(process.env.WORKSPACE_BASE_URL || 'http://127.0.0.1:8127/');
 await page.waitForFunction(()=>window.Luker?.getContext && !document.getElementById('preloader'));
 if(await page.locator('dialog textarea').isVisible()){await page.locator('dialog textarea').fill('Workspace Test');await page.locator('dialog .menu_button').filter({hasText:/^(好的|OK)$/}).click();}
 await page.waitForFunction(()=>window.Luker?.getContext?.().getExtensionApi?.('orchestrator')?.listWorkspacePresets);
 const onboarding = page.locator('dialog').filter({has:page.locator('#onboarding_ui_language_select')});
 await onboarding.waitFor({state:'visible',timeout:3000}).catch(()=>{});
 if(await onboarding.isVisible()) {
   await onboarding.locator('textarea').fill('Workspace Test');
   await onboarding.locator('.menu_button').filter({hasText:/^(好的|OK)$/}).click();
   await onboarding.waitFor({state:'hidden'});
 }
 console.log(JSON.stringify(await page.evaluate(()=>({presets:window.Luker.getContext().getExtensionApi('orchestrator').listWorkspacePresets(),workspaceSettings:document.querySelector('#orchestrator_settings')?.textContent,errors:[]}))));
 const state=await page.evaluate(async()=>{const panel=await import('/scripts/extensions/orchestrator/workspace/panel.js');panel.openWorkspace('Presets');return document.querySelector('#agent-memory-workspace').textContent;});
 assert(/Unified Preset Library|统一预设库|統一預設庫/.test(state)); assert(state.includes('Spec'));
 await page.locator('#agent-memory-workspace').getByRole('button',{name:/^(Duplicate|复制|複製)$/,exact:true}).click();
 await page.locator('#agent-memory-workspace').getByRole('button',{name:/^(Bind as default|设为全局默认)$/,exact:true}).click();
 const id=await page.evaluate(()=>window.Luker.getContext().extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId);
 await page.waitForTimeout(1800);await page.reload();
 await page.waitForFunction(()=>window.Luker?.getContext?.().getExtensionApi?.('orchestrator')?.listWorkspacePresets);
 assert.equal(await page.evaluate(()=>window.Luker.getContext().extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId),id);
 await page.evaluate(async()=>{const panel=await import('/scripts/extensions/orchestrator/workspace/panel.js');panel.openWorkspace('Presets');});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.querySelector('#agent-memory-workspace').scrollWidth>innerWidth),false);
 await page.screenshot({path:'.git/workspace-host-mobile.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:'.git/workspace-host-desktop.png'});
 await page.getByRole('tab',{name:/^(Memory|记忆|記憶)$/,exact:true}).click();
 const memory = page.locator('#memory_graph_settings');
 assert.equal(await memory.locator('.inline-drawer').count(),0);
 assert.equal(await memory.locator('.memory-control-card').count(),5);
 const recall = memory.locator('#luker_rpg_memory_recall_enabled');
 const wasEnabled = await recall.isChecked(); await recall.setChecked(!wasEnabled);
 assert.equal(await page.evaluate(()=>window.Luker.getContext().extensionSettings.memory_graph.recallEnabled),!wasEnabled);
 await recall.setChecked(wasEnabled);
 const retrieval = memory.locator('.memory-settings-group').filter({has:page.locator('#luker_rpg_memory_recall_method')});
 await retrieval.locator(':scope > summary').click();
 await memory.locator('#luker_rpg_memory_recall_method').selectOption('rag');
 assert.equal(await memory.locator('#luker_rpg_memory_rag_settings').isVisible(),true);
 assert.equal(await memory.locator('#luker_rpg_memory_recall_llm_settings').isVisible(),false);
 await memory.locator('#luker_rpg_memory_recall_method').selectOption('llm');
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
 await page.getByRole('tab',{name:/^(Presets|预设|預設)$/,exact:true}).click();
 assert.equal(await page.locator('#memory_graph_settings').count(),0);
 await page.getByRole('tab',{name:/^(Memory|记忆|記憶)$/,exact:true}).click();
 assert.equal(await page.locator('#memory_graph_settings').count(),1);
 assert.deepEqual(errors, []);
 console.log(JSON.stringify({nativeHost:true,persistedBinding:id,pageErrors:errors}));
} finally {await browser.close();}
