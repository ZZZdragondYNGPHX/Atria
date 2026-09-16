import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel: process.env.WORKSPACE_BROWSER || 'msedge', headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}); const errors=[]; page.on('pageerror',e=>{ errors.push(e.message); console.log('PAGE ERROR:',e.message); }); page.on('console',m=>{if(m.type()==='error') console.log('CONSOLE:',m.text().slice(0,300));});
 await page.goto(process.env.WORKSPACE_BASE_URL || 'http://127.0.0.1:8127/');
 await page.waitForFunction(()=>window.Luker?.getContext && !document.getElementById('preloader'));
 if(await page.locator('dialog textarea').isVisible()){await page.locator('dialog textarea').fill('Workspace Test');await page.locator('dialog .menu_button').filter({hasText:/^(好的|OK)$/}).click();}
 await page.waitForFunction(()=>window.Luker?.getContext?.().getExtensionApi?.('orchestrator')?.listWorkspacePresets);
 console.log(JSON.stringify(await page.evaluate(()=>({presets:window.Luker.getContext().getExtensionApi('orchestrator').listWorkspacePresets(),workspaceSettings:document.querySelector('#orchestrator_settings')?.textContent,errors:[]}))));
 const state=await page.evaluate(async()=>{const panel=await import('/scripts/extensions/orchestrator/workspace/panel.js');panel.openWorkspace('Presets');return document.querySelector('#agent-memory-workspace').textContent;});
 assert(state.includes('Unified Preset Library')); assert(state.includes('Spec'));
 await page.locator('#agent-memory-workspace').getByRole('button',{name:'Duplicate',exact:true}).click();
 await page.locator('#agent-memory-workspace').getByRole('button',{name:'Bind as default',exact:true}).click();
 const id=await page.evaluate(()=>window.Luker.getContext().extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId);
 await page.waitForTimeout(1800);await page.reload();
 await page.waitForFunction(()=>window.Luker?.getContext?.().getExtensionApi?.('orchestrator')?.listWorkspacePresets);
 assert.equal(await page.evaluate(()=>window.Luker.getContext().extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId),id);
 await page.evaluate(async()=>{const panel=await import('/scripts/extensions/orchestrator/workspace/panel.js');panel.openWorkspace('Presets');});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.querySelector('#agent-memory-workspace').scrollWidth>innerWidth),false);
 await page.screenshot({path:'.git/workspace-host-mobile.png'});
 console.log(JSON.stringify({nativeHost:true,persistedBinding:id,pageErrors:errors}));
} finally {await browser.close();}
