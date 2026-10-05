/** @jest-environment jsdom */
import '../util/structured-clone.js';
import { TextDecoder } from 'node:util';
import { test, expect, jest, afterEach } from '@jest/globals';
import { mountFrontendEditor } from '../../public/scripts/native/studio-frontend-editor.js';
globalThis.TextDecoder ??= TextDecoder;
const tick = () => new Promise(r=>setTimeout(r,0));
const button = (root,label)=>[...root.querySelectorAll('button')].find(n=>n.textContent === label);
async function setup(){
    const root = document.createElement('main');document.body.append(root);const entries = ['Main','Other'].map(id=>({ kind:'component',id,file:'ui/main.aui',contentHash:'exact',value:{ props:{ opaque:{ nested:[null,false,3] } } } }));
    const graph = { owners:[{ id:'package',mode:'native' }],entries,features:[],permissions:[],diagnostics:[],previewEntryPointId:'entry_a' };const client = { inspectFrontend:jest.fn(async()=>graph),readSource:jest.fn(async()=>({ content:btoa('component Main {}') })),evaluateFrontend:jest.fn(async()=>({ validation:{ status:'passed',diagnostics:[] } })) };const stageOperations = jest.fn(async()=>true);const life = await mountFrontendEditor({ document,root,projectId:'project_a',baseRevision:'exact-r1',client,stageOperations });return{ root,client,stageOperations,life };
}
afterEach(()=>document.body.replaceChildren());
test('structured UI fields retain their draft across Source Graph selection and stage through the original frontend patch',async()=>{
    const { root,stageOperations,life } = await setup();let value = root.querySelector('[aria-label="Structured value"]');value.value = JSON.stringify({ props:{ advanced:[null,false,8] } });value.dispatchEvent(new Event('input',{ bubbles:true }));expect(root.querySelector('[data-atria-draft-dirty="true"]')).not.toBeNull();
    const chooser = root.querySelector('[aria-label="Source Graph"]');chooser.value = '1';chooser.dispatchEvent(new Event('change'));await tick();chooser.value = '0';chooser.dispatchEvent(new Event('change'));await tick();value = root.querySelector('[aria-label="Structured value"]');expect(JSON.parse(value.value)).toEqual({ props:{ advanced:[null,false,8] } });button(root,'Review structured edit').click();await tick();expect(stageOperations).toHaveBeenCalledTimes(1);expect(stageOperations.mock.calls[0][0][0]).toMatchObject({ operationType:'frontend.patch',input:{ id:'Main',contentHash:'exact',value:{ props:{ advanced:[null,false,8] } } } });life.dispose();
});
test('late structured UI evaluation cannot stage after its editor is disposed',async()=>{
    const { root,client,stageOperations,life } = await setup();let resolve;client.evaluateFrontend.mockImplementation(()=>new Promise(r=>resolve = r));button(root,'Review structured edit').click();await tick();life.dispose();resolve({ validation:{ status:'passed',diagnostics:[] } });await tick();expect(stageOperations).not.toHaveBeenCalled();
});
