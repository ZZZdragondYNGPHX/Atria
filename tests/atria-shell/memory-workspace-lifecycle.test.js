/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
jest.unstable_mockModule('../../public/scripts/native/generation-compat.js',()=>({ nativePromptUiActive:()=>false }));
jest.unstable_mockModule('../../public/scripts/agents/orchestrator/i18n.js',()=>({ i18n:s=>s,i18nFormat:(s,...v)=>s.replace(/\$\{(\d+)\}/g,(_,i)=>v[i]) }));
const { createMemoryWorkspace } = await import('../../public/scripts/agents/orchestrator/workspace/memory/page.js');
const tick = ()=>new Promise(r=>setTimeout(r,0));
const ui = { el(tag,text,parent){const n = document.createElement(tag);if(text !== undefined)n.textContent = text;parent?.append(n);return n;},button(parent,text,action){const n = ui.el('button',text,parent);n.addEventListener('click',action);return n;} };
function setup(service){const host = ui.el('main',undefined,document.body);const context = { getCapabilityApi:()=>({ getWorkspacePorts:()=>service }) };const lifecycle = createMemoryWorkspace({ getContext:()=>context })(host,ui); const click = text=>[...host.querySelectorAll('button')].find(n=>n.textContent === text).click();return { host,lifecycle,click };}
afterEach(()=>document.body.replaceChildren());
test('Memory maintenance catches synchronous failures and deduplicates pending reset without bypassing its service confirmation',async()=>{
    let resolve;const resetGraph = jest.fn(()=>new Promise(r=>resolve = r));const service = { getStatus:()=>({ memoryOsEnabled:false }),manualCompress:()=>{throw Error('sync failure');},resetGraph };const { host,click } = setup(service);click('Maintenance');click('Manual compression');await tick();expect(host.textContent).toContain('sync failure');click('Reset current chat memory');click('Reset current chat memory');expect(resetGraph).toHaveBeenCalledTimes(1);expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();resolve({ cancelled:true });await tick();expect(host.querySelector('[aria-busy="true"]')).toBeNull();
});
test('disposed Memory load never inspects or renders a late snapshot',async()=>{
    let resolve;const inspect = jest.fn();const service = { getStatus:()=>({ memoryOsEnabled:true }),load:()=>new Promise(r=>resolve = r),inspect };const { host,lifecycle } = setup(service);const before = host.textContent;lifecycle.dispose();resolve({ assertCurrent:()=>{} });await tick();expect(inspect).not.toHaveBeenCalled();expect(host.textContent).toBe(before);
});
test('late maintenance completion cannot refresh a disposed Memory workspace',async()=>{
    let resolve;const service = { getStatus:()=>({ memoryOsEnabled:false }),resetGraph:()=>new Promise(r=>resolve = r),load:jest.fn() };const { host,lifecycle,click } = setup(service);click('Maintenance');click('Reset current chat memory');const before = host.textContent;lifecycle.dispose();resolve({});await tick();expect(service.load).not.toHaveBeenCalled();expect(host.textContent).toBe(before);
});
