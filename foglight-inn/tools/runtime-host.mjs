// Development/verification adapter. Credentials and test storage never enter
// the Package. The installed game still uses the ordinary product services.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {compile} from './compile.mjs';
import {cleanup} from './cleanup.mjs';
export async function createHost(core,{realConfig=null,quotaFile=null,archivePath=null,fetchImpl=fetch}={}){
 const load=p=>import(pathToFileURL(path.join(core,p)).href),f=await compile(core),{makeTempFsEngine}=await load('tests/storage/harness/fs-harness.js'),h=await makeTempFsEngine();
 const {services}=await load('tests/native/helpers/session-fixture.js'),svc=services(h),{seedGenerationProfiles}=await load('tests/native/helpers/generation-fixture.js'),{NativeGenerationHost}=await load('src/native/adapters/generation-host.js'),{createHttpGenerationProvider}=await load('src/native/adapters/http-generation-provider.js'),{FrontendBridgeService}=await load('src/native/frontend/host-bridge.js');
 const config=realConfig?JSON.parse(await fs.readFile(realConfig,'utf8')):null;
 const endpoint=config?config.endpoint.replace(/\/$/,'')+(/\/chat\/completions$/.test(config.endpoint)?'':'/chat/completions'):'http://127.0.0.1:1/v1/chat/completions';
 const seeded=await seedGenerationProfiles({...h,endpoint,roles:['narrator','intent_resolver']});
 seeded.model.limits.outputTokens=2048;await seeded.persistence.saveModelProfile(h.handle,seeded.model);
 if(config){seeded.model.remoteModelId=config.model;seeded.model.limits={contextTokens:config.contextTokens||64000,outputTokens:Math.max(2048,config.maxOutputTokens||8192)};seeded.model.tokenizer=config.tokenizer||{encoding:'cl100k_base',source:'local'};if(typeof seeded.model.tokenizer==='string')seeded.model.tokenizer={encoding:seeded.model.tokenizer,source:'local'};await seeded.persistence.saveModelProfile(h.handle,seeded.model);}
 seeded.generation.revision='r2';seeded.generation.output.maxTokens=2048;await seeded.library.commit(h.handle,'core.generation-profile',seeded.generation);
 for(const r of seeded.routes){r.generationProfileRef.revision='r2';r.policy.timeoutMs=120000;r.policy.maxRetries=0;await seeded.persistence.saveRuntimeRoute(h.handle,r);}
 let requests=0,usage={prompt:0,completion:0},samples=[],failures=[];
 async function quota(){if(!quotaFile)throw Error('Real API requires shared rolling quota file');for(;;){let lease;try{lease=await fs.open(quotaFile+'.lock','wx');}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,100));continue;}
  let wait=0;try{let q;try{q=JSON.parse(await fs.readFile(quotaFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;q={schemaVersion:1,carry:{requests:0,at:0},admissions:[]};}
   const now=Date.now();q.admissions=q.admissions.filter(a=>a.at>now-86400000);if(q.carry.at<=now-86400000)q.carry={requests:0,at:0};
   const recent=q.admissions.filter(a=>a.at>now-60000);if(q.admissions.length+q.carry.requests>=2000)wait=Math.max(1,Math.min(...q.admissions.map(a=>a.at),q.carry.requests?q.carry.at:Infinity)+86400001-now);else if(recent.length>=20)wait=recent[0].at+60001-now;
   if(!wait)q.admissions.push({id:'foglight-'+randomUUID(),at:now});await fs.writeFile(quotaFile,JSON.stringify(q));
  }finally{await lease.close();await fs.unlink(quotaFile+'.lock');}if(!wait)return;await new Promise(r=>setTimeout(r,Math.min(wait,60000)));}}
 const provider=createHttpGenerationProvider({fetchImpl:async(url,init)=>{
  requests++;if(config){await quota();let res;try{res=await fetchImpl(url,init);}catch(e){failures.push({code:e.cause?.code||e.code||e.name});throw e;}const clone=res.clone();try{const j=await clone.json();usage.prompt+=j.usage?.prompt_tokens||0;usage.completion+=j.usage?.completion_tokens||0;const text=j.choices?.[0]?.message?.content;if(text)samples.push(text);if(!res.ok)failures.push({status:res.status,message:String(j.error?.message||j.message||'provider error').replaceAll(config.apiKey,'[redacted]').slice(0,400)});}catch{if(!res.ok)failures.push({status:res.status});}return res;}
  const body=JSON.parse(init.body);const schema=body.response_format?.json_schema?.schema||{};const data=schema.properties?.narrative?{schemaVersion:1,narrative:'[模拟旁白] 窗边的雨落得很轻，你把眼前的安排记在便笺上。',outcomes:[],diagnostics:[]}:schema.properties?.candidates?{candidates:[],clarification:'[模拟理解] 请选择明确行动。'}:{text:'[模拟闲聊] 先坐一会儿吧，水还是热的。'};
  return new Response(JSON.stringify({id:'simulated-'+requests,object:'chat.completion',created:1,model:'simulated',choices:[{index:0,message:{role:'assistant',content:JSON.stringify(data)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140}}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 const host=new NativeGenerationHost({...seeded,sessionCore:svc.core,packageInstaller:svc.packageInstaller,providers:{'provider.openai-compatible':provider},secretPort:{resolveSecret:async()=>config?.apiKey||'simulation'}});
 const bindings=Object.fromEntries(['narrative','intent','conversation'].map(slot=>[slot,{scope:'player',runtimeRouteId:seeded.routes[0].runtimeRouteId}]));
 const built=archivePath?{archive:await fs.readFile(archivePath)}:f.native.buildAtriaPackageContainer({manifest:f.manifest,sourceFiles:f.files,assetPayloads:f.assets});await svc.packageInstaller.install(h.handle,built.archive,{grantedPermissions:['generation']});
 let base=await svc.core.create(h.handle,{packageId:f.manifest.packageId,packageVersionId:f.manifest.packageVersionId,entryPointId:f.manifest.entryPoints[0].entryPointId});base=await svc.core.applyLifecycleCommand(h.handle,base.session.sessionId,{type:'lifecycle',invocationId:'ready',action:{kind:'experience.ready'}},{expectedRevisionId:base.revision.revisionId});
 const bridge=new FrontendBridgeService(),servicesForBridge={...svc,generationHost:host,taskBindings:async()=>bindings};
 return {f,h,svc,host,base,archive:built.archive,bridge,bindings,services:servicesForBridge,metrics:()=>({mode:config?'real':'simulated',requests,usage,samples,failures}),async dispose(){bridge.dispose();await cleanup(core,h,svc,[base.session.sessionId]);}};
}
