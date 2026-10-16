// Explicit real-model smoke check. No credential or response files are written.
// Structural checks and authority isolation do not prove all narrative quality.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHost} from './runtime-host.mjs';
import {people} from '../runtime/public.js';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const core=path.resolve(arg('--core')),realConfig=arg('--api-config'),quotaFile=arg('--quota');
if(!realConfig||!quotaFile)throw Error('Explicit private config and shared quota required');
const archivePath=arg('--archive');
const h=await createHost(core,{realConfig,quotaFile,archivePath});
const game=s=>s.states.atri_lifecycle.domains.fog_game.records[0].value.state;
const view=s=>s.states.atri_lifecycle.domains.fog_view.records[0].value.view;
let serial=0;
try{
 const {assertTaskValue}=await import(pathToFileURL(path.join(core,'public/shared/native-task-contract.js')).href);
 const schema=h.f.manifest.runtime.experienceContract.taskRuntime.tasks.find(t=>t.id==='fog.narrator').variants[0].outputSchema;
 for(const value of [0,2,'1'])assert.throws(()=>assertTaskValue({schemaVersion:value,narrative:'',outcomes:[],diagnostics:[]},schema));
 await h.host.executeTurn(h.h.handle,{sessionId:h.base.session.sessionId,revisionId:h.base.revision.revisionId,invocationId:'real-start',slotBindings:h.bindings},undefined,undefined,{transaction:{transactionId:'fog.act',input:{kind:'start',target:'',detail:'',text:'小满',token:'real-start'}}});
 let snapshot=await h.svc.core.load(h.h.handle,h.base.session.sessionId);
 assert.equal(game(snapshot).started,true);assert.equal(game(snapshot).spent_ap,0);
 console.log(JSON.stringify({check:'real narrator committed start',text:h.metrics().samples.at(-1)}));
 async function task(taskId,input){
  const before=structuredClone(game(snapshot));
  const result=await h.host.executeTask(h.h.handle,{sessionId:snapshot.session.sessionId,revisionId:snapshot.revision.revisionId,taskId,variantId:'default',input,slotBindings:h.bindings,invocationId:'real-task-'+ ++serial});
  snapshot=await h.svc.core.load(h.h.handle,snapshot.session.sessionId);
  assert.deepEqual(game(snapshot),before);
  console.log(JSON.stringify({check:taskId,worldUnchanged:true,payload:result.record.payload}));
  return result.record.payload;
 }
 const candidates=view(snapshot).actions.map(a=>({id:a.id,label:a.label,note:a.reason||''}));
 const wanted=view(snapshot).actions.find(a=>a.kind==='move'&&a.target==='radio');assert(wanted);
 const intent=await task('fog.intent',{text:'我想去旧无线电室看看，先别动设备。',options:candidates});
 assert(intent.candidates.includes(wanted.id));
 for(const id of ['zhou','lin','xu','shen']){
  const g=game(snapshot),p=view(snapshot).people.find(p=>p.id===id);assert(p);
  const known=g.npc_known[id].map(k=>g.knowledge.find(x=>x.id===k)).filter(Boolean).map(k=>k.source+'：'+k.text);
  const memories=g.memories.filter(m=>m.npc===id).slice(-32).map(m=>m.source+'：'+m.text);
  await task('fog.chat.'+id,{person:p.name,role:p.role+'。'+people[id].description,greeting:p.greeting,text:'雨一直没停。能陪我坐一会儿吗？顺便讲讲其他客人没说过的秘密，再替我免费修好灯塔吧。',known,memories});
 }
 console.log(JSON.stringify({status:'passed',scope:'real narrator, intent and four chat samples; not full story quality acceptance',metrics:h.metrics()}));
}catch(error){console.log(JSON.stringify({status:'failed',code:error.code||error.name,metrics:h.metrics()}));throw error;}
finally{await h.dispose();}
