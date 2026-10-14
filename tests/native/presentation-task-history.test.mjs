import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFixedHost} from '../../src/native/frontend/host-services.js';
test('presentation task history never projects inputs, private results or another task',async()=>{
 const tasks=[{id:'public',resultPolicy:{resultClass:'presentation',sink:'artifact'}},{id:'private',resultPolicy:{resultClass:'turn_context',sink:'artifact'}}];
 const records=[{kind:'task',taskId:'public',resultClass:'presentation',status:'completed',invocationId:'one',payload:{text:'hello'},input:{secret:'PRIVATE'}},{kind:'task',taskId:'private',resultClass:'turn_context',status:'completed',payload:{text:'PRIVATE'}},{kind:'task',taskId:'public',resultClass:'presentation',status:'draft',payload:{text:'DRAFT'}}];
 const base={manifest:{runtime:{experienceContract:{taskRuntime:{tasks}}}},states:{atri_task_results:{records}}},binding={target:{service:'host.tasks',method:'presentation'}};
 const rows=await readFixedHost(null,'user',{},base,binding,{taskId:'public'});assert.deepEqual(rows,[{invocationId:'one',taskId:'public',payloadJson:'{"text":"hello"}'}]);
 await assert.rejects(readFixedHost(null,'user',{},base,binding,{taskId:'private'}),/bridge_binding_denied/);
 await assert.rejects(readFixedHost(null,'user',{},base,binding,{taskId:'unknown'}),/bridge_binding_denied/);
});
