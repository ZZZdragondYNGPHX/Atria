import {pathToFileURL} from 'node:url';
import path from 'node:path';
export async function cleanup(core,h,svc,ids){
 const load=p=>import(pathToFileURL(path.join(core,p)).href),{cancelSessionMaintenance}=await load('src/native/session-maintenance.js'),{nativeTaskScheduler:scheduler}=await load('src/native/task-scheduler.js');
 for(const id of ids)cancelSessionMaintenance(svc.sessionRepo,h.handle,id);
 for(const operation of scheduler.operations.values())if(operation.owner===h.handle)try{scheduler.cancel(h.handle,operation.view.operationId);}catch{}
 for(let i=0;i<100&&[...scheduler.running].some(o=>o.owner===h.handle);i++)await new Promise(r=>setTimeout(r,50));
 if([...scheduler.running].some(o=>o.owner===h.handle))throw Error('Test storage still has running tasks');
 await h.cleanup();
}
