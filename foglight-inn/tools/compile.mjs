import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {initial,projection,options} from '../runtime/game.js';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
export const S=(n=256,values)=>({type:'string',maxLength:n,...(values?{enum:values}:{})});
export const I=(min=0,max=1000000)=>({type:'integer',minimum:min,maximum:max});
export const B={type:'boolean'},O=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),A=(items,maxItems=128)=>({type:'array',items,maxItems});
export const F=formula=>({formula});
export const stable=(prefix,key)=>prefix+'_'+createHash('sha256').update('foglight-inn:'+key).digest('hex').slice(0,32);
export const hash=b=>createHash('sha256').update(b).digest('hex');
const fields=(v,at)=>at.startsWith('computed.')?{computed:at.slice(9)}:v.type==='object'?Object.fromEntries(Object.entries(v.properties).map(([k,s])=>[k,fields(s,at+'.'+k)])):F(at);
const infer=v=>typeof v==='boolean'?B:typeof v==='number'?I():typeof v==='string'?S(16384):Array.isArray(v)?A(S()):O(Object.fromEntries(Object.entries(v).map(([k,x])=>[k,infer(x)])));
export function schemas(){
 const g=initial(),state=infer(g),p=state.properties;
 p.spent_ap=I(0,24);p.name=S(48);p.preference=S(160);p.location=S(32,['inn','store','radio','lighthouse','pier']);p.sequence=I(0,2147483647);
 p.jobs=A(O({npc:S(16),target:S(16),due:I(0,24),parts:I(0,3),fuel:I(0,1),status:S(16)}),8);
 p.knowledge=A(O({id:S(64),title:S(128),kind:S(64),source:S(256),at:S(64),text:S(4096)}),64);
 p.memories=A(O({npc:S(16),event:S(64),text:S(4096),source:S(256),at:S(64)}),96);
 p.rations=A(S(16),3);p.meals=A(B,3);for(const k of ['events','investigated','shared'])p[k]=A(S(96),128);
 p.last=O({token:S(128),title:S(128),summary:S(2048),body:S(16384),changes:S(2048),before:I(0,24),after:I(0,24)});
 const action=O({id:S(160),kind:S(32),target:S(64),detail:S(96),label:S(256),ap:I(0,1),cost:O({supplies:I(0,1),fuel:I(0,1),parts:I(0,2)}),enabled:B,reason:S(256),note:S(1024),costText:S(256)});
 const v=projection(g),view=infer(v);view.properties.actions=A(action,256);view.properties.people=A(infer({id:'',name:'',role:'',description:'',greeting:'',place:'',here:false,available:true,status:'',promise:''}),4);view.properties.epilogues=A(O({id:S(16),name:S(64),text:S(4096)}),4);
 const input=O({kind:S(32,['start','move','ration','repair','exchange','supply','assist','cancelJob','register','coordinate','pack','stay','meal','investigate','talk','share','promise','deliver','wait','final','echo']),target:S(64),detail:S(96),token:S(128),text:S(2048)});
 return {state,view,action,input,receipt:p.last};
}
export async function compile(core,{ui=true}={}){
 const load=rel=>import(pathToFileURL(path.join(core,rel)).href),native=await load('src/native/index.js');
 const {state,view,input,receipt}=schemas(),g=initial(),files=new Map();
 for(const name of await fs.readdir(path.join(root,'runtime')))if(name.endsWith('.js'))files.set('runtime/'+name,await fs.readFile(path.join(root,'runtime',name)));
 const domains=[],automations=[];
 function domain(id,schema,value){domains.push({id,scopeId:'session',schemaVersion:1,recordSchema:schema,initial:value,commands:[{id:'bootstrap',argsSchema:O({}),event:id+'.ready',assign:value},{id:'publish',argsSchema:schema,event:id+'.changed',assign:fields(schema,'args')}],retention:{maxItems:1,maxLogicalBytes:131072,keepPinned:true,keepReferenced:true}});automations.push({id:id+'.ready',scopeId:'session',trigger:{kind:'experience.ready'},action:{kind:'app.command',domainId:id,commandId:'bootstrap',recordId:'main',args:{}},maxCatchUp:1});}
 domain('fog_game',O({state}),{state:g});domain('fog_view',O({view}),{view:projection(g)});
 const contract={schemaVersion:1,capabilities:['authority-transaction','model-task','session-application','temporal','data-projection'].map(id=>({id,version:1,required:true})),dataResources:[],
  lifecycleRuntime:{schemaVersion:1,scopes:[{id:'session',kind:'session'}],domains,automations,clocks:[{id:'world',unit:'action',initialTick:0}],advances:[{id:'advance',clockId:'world',maxTicks:1}],interactions:[],workflows:[],retention:{maxTaskResults:32,maxReceipts:256}},
  authorityRuntime:{schemaVersion:1,canonicalClockId:'world',intentObservation:{viewIds:['player.status'],maxItems:64,maxBytes:16384},policy:{maxReadGrants:16,maxWorldEvents:16,maxAppCommands:24,maxEffects:32,maxReceiptBytes:32768}},
  informationRuntime:{schemaVersion:1,actors:[],graphs:[],sources:[{id:'player.status',kind:'application',semantic:'truth',scopeId:'session',domainId:'fog_game',fields:[['state','name'],['state','preference'],['state','location'],['state','spent_ap'],['state','stock'],['state','last']]}],views:[{id:'player.status',audience:'player',sources:['player.status'],exposure:['display'],knowledge:false,memory:false,maxItems:64,maxCharacters:16384},{id:'narrator.status',audience:'narrator',sources:['player.status'],exposure:['context'],knowledge:false,memory:false,maxItems:64,maxCharacters:16384}],narration:{mode:'separate',contextViewId:'narrator.status',disclosureViewId:'player.status'}},
  taskRuntime:{schemaVersion:1,slots:[{id:'narrative',requiredCapabilities:[]},{id:'intent',requiredCapabilities:[]},{id:'conversation',requiredCapabilities:[]}],tasks:[],turn:{policy:'authority-first',stages:[],narratorTaskId:'fog.narrator'}}};
 const pkg=stable('pkg','work'),pkgv=stable('pkgv',version),world=stable('world','island'),worldv=stable('worldv','island-1'),entry=stable('entry','main'),resources=[];
 function task(id,slot,body,inputSchema,outputSchema,executionClass='interactive',context=['input']){
  const mod=stable('pmod',id),formatMod=stable('pmod',id+'.format'),program=stable('pprog',id),gen=stable('genprof',id),origin={scope:'package',packageId:pkg,packageVersionId:pkgv};
  const example=id==='fog.narrator'?{schemaVersion:1,narrative:'简体中文正文。',outcomes:[],diagnostics:[]}:id==='fog.intent'?{candidates:[],clarification:''}:{text:'简体中文人物回应。'};
  const formatBody='最后检查：输出必须是一个完整合法JSON对象，不是纯文本，不要Markdown或全角引号包住对象。以下只示意格式，不是正文内容：'+JSON.stringify(example)+'。回应内容全部用简体中文。不得增加输入未提供的秘密、维修门槛或承诺。'+(id==='fog.narrator'?'从获准公开投影的 data["state.last"].body 选一个具体瞬间，以2—4个短句自然表达；不照抄整段消息和数值，不写工作汇报。':'');
  const exact=(resourceType,resourceId)=>({resourceType,resourceId,revision:'r1',...origin});
  resources.push({resourceType:'core.prompt-module',origin,resource:{schemaVersion:1,promptModuleId:mod,revision:'r1',displayName:id,target:'system.foundation',stages:['stage.main'],body}},
   {resourceType:'core.prompt-module',origin,resource:{schemaVersion:1,promptModuleId:formatMod,revision:'r1',displayName:id+' output',target:'response.post_history',stages:['stage.main'],body:formatBody}},
   {resourceType:'core.prompt-program',origin,resource:{schemaVersion:1,promptProgramId:program,revision:'r1',displayName:id,stages:[{stageId:'stage.main',moduleRefs:[exact('core.prompt-module',mod),exact('core.prompt-module',formatMod)]}]}},
   {resourceType:'core.generation-profile',origin,resource:{schemaVersion:1,generationProfileId:gen,revision:'r1',displayName:id,output:{maxTokens:2048},streaming:{enabled:false}}});
  contract.taskRuntime.tasks.push({id,bindingSlotId:slot,executionClass,inputSchema,context,resultPolicy:{resultClass:'presentation',sink:'artifact'},variants:[{id:'default',prompt:{resourceId:program,revision:'r1'},generation:{resourceId:gen,revision:'r1'},outputSchema,requiredCapabilities:[]}]});
 }
 task('fog.narrator','narrative','你是《雾灯旅舍》的有限视角旁白。用简体中文自然地写一小段，2—4句，给生活细节留出停顿。只消费宿主裁定回执与获准信息，不能改动数字、时间、设施、资源、承诺、人物同意。本次冻结结果的故事正文在获准公开投影 player.status:main 的 data["state.last"].body 中，它与本次回执属于同一次已裁定安排；回执 label 只是定位提示，不是应当复述的故事。优先将正文中已经发生的具体动作自然写成2—4句，不要说安排已核对、其余细节不改动等工作汇报。正文中角色已说过的话才是本次授权披露；不要替别的在场人补私人知识或内心，不把转述变成亲见。旧呼号不解释来源、不替人解决出路。普通移动和查看不带来新线索。不得出现系统字段、事务、投影等术语；不复述整张数值表。JSON 返回 schemaVersion:1、narrative 字符串、outcomes:[]、diagnostics:[]。',O({stages:A(O({}),0)}),O({schemaVersion:I(1,1),narrative:S(4096),outcomes:A(O({}),0),diagnostics:A(S(256),0)}),'turn_blocking',['input','projection']);
 task('fog.intent','intent','把玩家原文理解为给定 options 中一个或几个依次处理的打算。只返回匹配 option 的 id（最多3个），不得生成结果、资源、同意或秘密。含糊时 candidates 空并在 clarification 用中文询问对象；超范围提出眼前可做的接近办法。多目标保持顺序，由玩家逐个预览确认。不要把普通问候当成维修。JSON 字段 candidates（id字符串数组）、clarification（字符串）。',O({text:S(2048),options:A(O({id:S(160),label:S(256),note:S(1024)}),256)}),O({candidates:A(S(160),3),clarification:S(1024)}));
 for(const person of ['zhou','lin','xu','shen'])task('fog.chat.'+person,'conversation','扮演输入中的这位成年海岛住客，用1—3句简体中文回应日常闲聊。人物二次元外观不改变其职业和年龄。只知道 input 提供的 known 和 memories，其他人秘密不属于你的知识。旅舍公示的固定规则是：五地点间普通移动免费，灯塔的有限检修层现已开放，可在地面与检修平台作业；查看灯塔维修方案不以前往报务台、等待天气、船务登记、持证或另行报修为条件。具体成本、协助和正式维修由玩家另外查看方案并确认，闲聊不能代办。涉及这些事时，简短建议去对应地点看看方案，不要编造手续、门槛或替玩家决定。不会借闲聊免费授予线索、关键关系、承诺、协助、物品或维修成果；实质目标请建议玩家用明确行动。不要读心，不说系统字段或通用客服话。可有小动作与朴素幽默。不得增设已知事实中没有的报修手续、资格、费用或天气门槛；不能把不知道的事编成限制。必须输出完整的合法JSON对象，例如 {"text":"先坐一会儿吧。"}；不要Markdown、前后说明或全角引号包住整个回复。',O({person:S(64),role:S(256),greeting:S(1024),text:S(2048),known:A(S(4096),64),memories:A(S(4096),32)}),O({text:S(2048)}));
 const logic={schemaVersion:3,commands:[],reducers:[],rules:[],interpretations:[],derivedPublications:[],transactions:[{id:'fog.act',verb:'arrange',intent:{expose:false,description:'仅通过明确预览确认的旅舍安排。'},inputSchema:input,reads:[{id:'game',domainId:'fog_game',recordId:'main',fields:['state']}],validators:[],computation:{source:'runtime/game.js',outputSchema:O({state,view,receipt})},resolution:{kind:'deterministic',cases:[],fallback:'success'},effects:[{kind:'app.command',domainId:'fog_game',commandId:'publish',recordId:'main',args:{state:fields(state,'computed.state')}},{kind:'app.command',domainId:'fog_view',commandId:'publish',recordId:'main',args:{view:fields(view,'computed.view')}},{kind:'clock.advance',commandId:'advance',ticks:1,when:'computed.state.spent_ap > reads.game.state.spent_ap'}],derivedPublications:[],receipt:{schema:O({outcome:S(16),label:S(128)}),projection:{outcome:F('resolution.outcome'),label:'旅舍安排已核对；事实回执见当前记录。'},maxBytes:32768}}]};
 files.set('runtime/logic.json',Buffer.from(JSON.stringify(logic)));
 const manifest={format:'atria-package',schemaVersion:2,nativeSchemaVersion:1,packageId:pkg,packageVersionId:pkgv,name:'雾灯旅舍',version,actors:Object.entries({zhou:'周守川',lin:'林岚',xu:'许澄',shen:'沈遥'}).map(([id,displayName])=>({actorId:stable('actor',id),displayName})),entryPoints:[{entryPointId:entry,displayName:'代管三天旅舍',actorIds:Object.keys({zhou:1,lin:1,xu:1,shen:1}).map(n=>stable('actor',n)),worldIds:[world],primaryWorldId:world,knowledgeBindingIds:[],initialTimeline:[]}],worlds:[{world:{worldId:world,displayName:'灯岬岛',currentRevisionId:worldv},revision:{worldId:world,worldRevisionId:worldv,baseline:{},knowledgeBindingIds:[],assetIds:[],metadata:{}}}],knowledge:[],knowledgeBindings:[],assets:[],capabilities:['narrative','world-simulation'],permissions:[{permission:'generation',required:true,reason:'自然旁白、人物闲聊与自由意图理解'}],resources,runtime:{game:{logic:'runtime/logic.json'},experience:{mode:'text'},experienceContract:contract}};
 for(const name of ['CREDITS.md','media/image-sources.json','media/audio/sources.json'])files.set(name,await fs.readFile(path.join(root,name)));
 const assets=new Map();
 const {assertNativeExperienceContract}=await load('public/shared/native-experience-contract.js');Object.assign(contract,assertNativeExperienceContract(contract));
 if(ui){const {frontend}=await import('./frontend.mjs');await frontend({core,load,files,manifest,contract,logic,schemas:schemas()});}
 return {manifest,files,assets,logic,contract,native};
}
