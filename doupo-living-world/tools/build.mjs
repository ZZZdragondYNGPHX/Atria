import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {initialPeople,initialWorld,person as makePerson,NEW_PERSON_FIELDS} from '../source/rules/state.js';
import {project} from '../source/rules/projection.js';
import {blankInfo,blankRelation} from '../source/rules/engine.js';
import {packPerson,packWorld} from '../source/rules/records.js';
import {PLAYER,CAST,PERIOD,KINDS,ITEMS} from '../source/content/catalog.js';
import {S,I,B,O,A,person,world,info,view,action} from './schema.mjs';
import {bridgeSource} from './interfaces.mjs';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stable=(prefix,key)=>prefix+'_'+createHash('sha256').update('doupo-living-world:'+key).digest('hex').slice(0,32);
const F=formula=>({formula}),C=computed=>({computed});
const fields=(schema,at)=>at.startsWith('computed.')?C(at.slice(9)):schema.type==='object'?Object.fromEntries(Object.entries(schema.properties).map(([key,child])=>[key,fields(child,at+'.'+key)])):F(at);
export async function compile(core){
 const load=p=>import(pathToFileURL(path.join(core,p)).href),native=await load('src/native/package-container.js');
 const {appraisalStateSchema}=await load('public/shared/native-appraisal-contract.js'),relation=appraisalStateSchema();
 const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
 const pkg=stable('pkg','work'),pkgv=stable('pkgv',version),worldId=stable('world','douqi'),worldv=stable('worldv','opening'),entry=stable('entry','opening');
 const files=new Map();for(const dir of ['content','rules'])for(const name of await fs.readdir(path.join(root,'source',dir)))if(name.endsWith('.js'))files.set(dir+'/'+name,await fs.readFile(path.join(root,'source',dir,name)));
 const ps=O({actor:S(),alive:B,state:O(Object.fromEntries(Object.entries(person.properties).filter(([k])=>!['actor','alive'].includes(k))))}),ws=O({serial:I(),state:O(Object.fromEntries(Object.entries(world.properties).filter(([k])=>k!=='serial')))});
 const domains=[],automations=[];const people=initialPeople(),w=initialWorld(),v=project(w,people,[],{code:'creation_required',text:'请先完成新局身份绑定与角色创建。',spent:0,at:0,partial:false,steps:[]});
 function domain(id,schema,initial,rows=[]){
  const commands=[{id:'publish',argsSchema:schema,event:id+'.changed',assign:fields(schema,'args')}];
  domains.push({id,scopeId:'session',schemaVersion:1,recordSchema:schema,initial,commands,retention:{maxItems:4096,maxLogicalBytes:1048576,keepPinned:true,keepReferenced:true}});
  for(const row of rows)automations.push({id:id+'.'+row.id,scopeId:'session',trigger:{kind:'experience.ready'},action:{kind:'app.command',domainId:id,commandId:'publish',recordId:row.id,args:row.value},maxCatchUp:1});
  return commands;
 }
 domain('dw_world',ws,packWorld(w),[{id:'main',value:packWorld(w)}]);
 domain('dw_chronology',O({calendar:O({year:I()}),era_id:S(),sequence:I()}),{calendar:{year:0},era_id:'opening',sequence:0},[{id:'main',value:{calendar:{year:0},era_id:'opening',sequence:0}}]);
 const pc=domain('dw_people',ps,packPerson(people[0].value),people.filter(r=>r.id==='player').map(r=>({id:r.id,value:packPerson(r.value)})));
 pc.push({id:'bind',argsSchema:O({actor:S()}),event:'person.bound',assign:{actor:F('args.actor')}});
 pc.push({id:'decide',argsSchema:O({choice:S(64,['refuse','help','share','follow','negotiate']),text:S(2048)}),event:'person.spoke',assign:{state:{...fields(ps.properties.state,'world.state'),choice:F('args.choice'),decision:F('args.text'),chat:''}}});
 domain('dw_relations',relation,blankRelation());domain('dw_information',info,blankInfo());domain('dw_public',O({screen:S(32768)}),{screen:JSON.stringify(v)},[{id:'main',value:{screen:JSON.stringify(v)}}]);
 const taskRuntime={schemaVersion:1,slots:[{id:'narrative',requiredCapabilities:[]},{id:'npc',requiredCapabilities:[]}],tasks:[],turn:{policy:'authority-first',stages:[],narratorTaskId:'doupo.narrate'}};
 const resources=[],origin={scope:'package',packageId:pkg,packageVersionId:pkgv};
 function modelResources(id,body){
  if(id==='doupo.npc')body+=' 只使用当前 self 中的 needitem/needqty 说明自己的实际需求；若不明确则询问，不自行创造求物任务、药引、配方、价格、承诺奖励或新地点。物品编号与名称：'+ITEMS.map(i=>i.id+'='+i.name).join('，')+'。不能因为背景里有人受伤就杜撰新的药材；表达担忧或请求已有需求即可。';
  if(id==='doupo.narrate')body+=' 只叙述本次 result 的已提交变化，用2至3句、约80至160字，不逐项复述整个投影。time/at/spent 的单位都是开局后分钟，绝不能解释为时辰或金币。交易金额只按本次明确结算文字，不从耗时或余额猜支出。不得新增时刻、物品、药方、奖励、任务或他人关系事实；旧对话只是本人说法，不等于规则已建立任务。';
  const pm=stable('pmod',id),pp=stable('pprog',id),gp=stable('genprof',id),exact=(resourceType,resourceId)=>({resourceType,resourceId,revision:'r1',...origin});
  resources.push({resourceType:'core.prompt-module',origin,resource:{schemaVersion:1,promptModuleId:pm,revision:'r1',displayName:id,target:'system.foundation',stages:['stage.main'],body}},
   {resourceType:'core.prompt-program',origin,resource:{schemaVersion:1,promptProgramId:pp,revision:'r1',displayName:id,stages:[{stageId:'stage.main',moduleRefs:[exact('core.prompt-module',pm)]}]}},
   {resourceType:'core.generation-profile',origin,resource:{schemaVersion:1,generationProfileId:gp,revision:'r1',displayName:id,output:{maxTokens:2048},streaming:{enabled:false}}});
  return {pp,gp,exact};
 }
 function task(id,slot,body,inputSchema,outputSchema,{executionClass='interactive',context=['input'],resultBinding=null}={}){
  const {pp,gp}=modelResources(id,body);
  taskRuntime.tasks.push({id,bindingSlotId:slot,executionClass,inputSchema,context,queuePolicy:'fifo',resultPolicy:resultBinding?{resultClass:'declared_app_command',sink:'app_command'}:{resultClass:'presentation',sink:'artifact'},
   variants:[{id:'default',prompt:{resourceId:pp,revision:'r1'},generation:{resourceId:gp,revision:'r1'},outputSchema,requiredCapabilities:[],...(resultBinding?{resultBinding}:{})}]});
 }
 task('doupo.narrate','narrative','你是《斗破苍穹》开放沙盒的有限视角旁白。只用获准的 player 数据和已提交回执写2至4句简体中文，不能替换裁定、增加物品、改变伤亡、婚约或资源。result 是本次结算，不保证成功；拒绝必须如实表达。原著记忆不是本局未来。对别人的内心与秘密保持克制。不输出系统术语。必须输出合法JSON：schemaVersion:1,narrative:字符串,outcomes:[],diagnostics:[]。',O({stages:A(O({}),0)}),O({schemaVersion:I(1,1),narrative:S(4096),outcomes:A(O({}),0),diagnostics:A(S(256),0)}),{executionClass:'turn_blocking',context:['input','projection']});
 task('doupo.npc','npc','扮演获准个人投影 self 中的人物，以本人所知判断收到的 chat。你只知道 personal 中属于自己的经历，不知道他人私事或玩家的原著记忆。依据自己的谋生、伤势、物资、关系和承诺回应；可以拒绝、协商或提出已知途径，不为主角服务而忽略自身需要。kind 为 private 的事不得主动披露，传闻必须保留来源和不确定性。人际意愿不能代办婚姻或转移资源。你只提出回应和意向；规则之后才接纳实质行动，不能宣称已经给物品、教会技艺或免费旅行。面对越界请求给出自然的拒绝。不要说字段名。输出合法JSON：choice 为 refuse/help/share/follow/negotiate 之一，text 为1至4句简体中文本人对玩家说的话。',O({}),O({choice:S(64,['refuse','help','share','follow','negotiate']),text:S(2048)}),{executionClass:'background',context:['input','projection'],resultBinding:{kind:'app.command',domainId:'dw_people',commandId:'decide',subjectPerspective:'person'}});
 const contract={schemaVersion:1,capabilities:['authority-transaction','world-simulation','generation-budget','model-task','session-application','temporal','data-projection'].map(id=>({id,version:1,required:true})),dataResources:[],
 lifecycleRuntime:{schemaVersion:1,scopes:[{id:'session',kind:'session'}],domains,automations,clocks:[{id:'world',unit:'minute',initialTick:0}],advances:[{id:'advance',clockId:'world',maxTicks:Number.MAX_SAFE_INTEGER}],interactions:[],workflows:[],retention:{maxTaskResults:32,maxReceipts:256},history:{schemaVersion:1,clockId:'world',chronologyDomain:'dw_chronology',meaningfulDomains:['dw_world','dw_people','dw_information'],sources:[{id:'elapsed.year',domainId:'dw_chronology',recordId:'main',path:['calendar','year'],public:true,refs:['era:opening'],label:'开局后年序'},{id:'opportunity.ownership',domainId:'dw_world',recordId:'main',path:['state','unique'],public:false,refs:['location:mountain'],label:'机缘归属'}],hot:8,warm:24,cold:32,maxDurable:4096,maxBytes:2097152,checkpointTurns:64}},
 generationBudget:{schemaVersion:1,resolverAttempts:2,narratorAttempts:2,turnAttempts:4,backgroundAttempts:2,backgroundWindowTurns:4,backgroundPeriodTurns:20,backgroundPeriodAttempts:8,turnCounter:{domainId:'dw_world',recordId:'main',field:'serial'}},
 authorityRuntime:{schemaVersion:1,canonicalClockId:'world',intentObservation:{viewIds:['player'],maxItems:64,maxBytes:16384},policy:{maxReadGrants:16,maxWorldEvents:16,maxAppCommands:24,maxEffects:32,maxReceiptBytes:32768}},taskRuntime,
 informationRuntime:{schemaVersion:1,actors:[{id:PLAYER,scopeId:'session',availability:{domainId:'dw_people',recordId:'player',field:'alive'}}],graphs:[],
 sources:[{id:'screen',kind:'application',semantic:'truth',scopeId:'session',domainId:'dw_public',fields:[['screen']]},
 {id:'self',kind:'application',semantic:'truth',scopeId:'session',domainId:'dw_people',actorField:'actor',fields:[...['name','role','plan','chat','injury','inventory','gold','rank','choice','decision','needitem','needqty'].map(k=>['state',k]),['state','condition','missing']]},
 {id:'personal',kind:'application',semantic:'belief',scopeId:'session',domainId:'dw_information',actorField:'actor',statusField:'status',channelField:'channel',fields:['text','target','kind','at','source'].map(k=>[k])},
 {id:'relationships',kind:'application',semantic:'relationship',scopeId:'session',domainId:'dw_relations',actorField:'actor',statusField:'status',fields:['text','target','dimension','level','rationale'].map(k=>[k])}],
 views:[{id:'player',audience:'player',sources:['screen'],exposure:['display'],knowledge:false,memory:false,maxItems:64,maxCharacters:32768},
 {id:'narrator',audience:'narrator',sources:['screen'],exposure:['context'],knowledge:false,memory:false,maxItems:64,maxCharacters:32768},
 {id:'protagonist',audience:'actor',actorId:PLAYER,sources:['self','personal','relationships'],exposure:['context'],knowledge:false,memory:false,maxItems:64,maxCharacters:16384},
 {id:'person',audience:'actor',subjectScopeId:'session',subjectAvailability:{domainId:'dw_people',field:'alive'},sources:['self','personal','relationships'],exposure:['context'],knowledge:false,memory:false,maxItems:64,maxCharacters:16384}],
 narration:{mode:'separate',contextViewId:'narrator',disclosureViewId:'player'}},
 simulationRuntime:{schemaVersion:1,clockId:'world',policy:{maxSteps:1,maxDeliberations:1,maxAdvanceTicks:Number.MAX_SAFE_INTEGER},jobs:[{
 id:'person.reply',scopeId:'session',reads:[{id:'agenda',domainId:'dw_world',recordId:'main',fields:['state.agenda']}],
 subject:{id:F('reads.agenda.state.agenda.actor'),domainId:'dw_people',perspective:'person',fields:['state.chat']},enabled:'reads.subject.state.chat != ""',due:F('reads.agenda.state.agenda.due'),priority:0,relevance:'hot',action:{kind:'task',taskId:'doupo.npc',variantId:'default',input:{}}}]}};
 const grants=[{id:'game',domainId:'dw_world',recordId:'main',fields:['serial','state']},
 {id:'protagonist',domainId:'dw_people',recordId:'player',fields:['actor','alive','state']},
 {id:'people',domainId:'dw_people',collection:{maxItems:256,where:{field:'alive',equals:true}},fields:['actor','alive','state']},
 {id:'relations',domainId:'dw_relations',collection:{maxItems:256,recordHash:true,ids:{read:'game',field:'state.relationKeys'},where:{field:'target',equals:PLAYER},match:'any'},fields:['actor','target','dimension','level','status']},
 {id:'personal',domainId:'dw_information',collection:{maxItems:128,where:{field:'actor',equals:PLAYER}},fields:Object.keys(info.properties)}];
 const rowSchema=s=>O({id:S(),value:s});
 const output=O({world:ws,people:A(rowSchema(ps),8),relations:A(rowSchema(relation),4),information:A(rowSchema(info),8),view:S(32768),ticks:I(),admit:B,newPerson:rowSchema(O(Object.fromEntries(NEW_PERSON_FIELDS.map(key=>[key,person.properties[key]])))),personCount:I(0,8),relationCount:I(0,4),informationCount:I(0,8)});
 const effects=[];
 for(const [key,id,schema,max,counter] of [['people','dw_people',ps,8,'personCount'],['information','dw_information',info,8,'informationCount'],['relations','dw_relations',relation,4,'relationCount']])for(let n=0;n<max;n++)effects.push({kind:'app.command',domainId:id,commandId:'publish',recordId:F('computed.'+key+'['+n+'].id'),args:C(key+'.'+n+'.value'),when:'computed.'+counter+' > '+n});
 // Numeric path references are typed by the computation's bounded array schema.
 const newcomerDefaults=packPerson(makePerson('none','未入场','wutan.inn','none',20,1,'unavailable'));
 effects.push({kind:'app.command',domainId:'dw_people',commandId:'publish',recordId:F('computed.newPerson.id'),args:{...newcomerDefaults,actor:F('subjects.newperson'),state:{...newcomerDefaults.state,...Object.fromEntries(NEW_PERSON_FIELDS.map(key=>[key,C('newPerson.value.'+key)]))}},when:'computed.admit'},
 {kind:'app.command',domainId:'dw_world',commandId:'publish',recordId:'main',args:C('world')},
 {kind:'app.command',domainId:'dw_public',commandId:'publish',recordId:'main',args:{screen:C('view')}},
 {kind:'app.command',domainId:'dw_chronology',commandId:'publish',recordId:'main',args:{sequence:F('computed.world.serial'),era_id:'opening',calendar:{year:F('floor(computed.world.state.time / 525600)')}}},
 {kind:'clock.advance',commandId:'advance',ticks:F('computed.ticks'),when:'computed.ticks > 0'});
 const logic={schemaVersion:3,commands:[],reducers:[],rules:[],interpretations:[],derivedPublications:[],transactions:[{
 id:'doupo.act',verb:'doupo_action',inputSchema:action,intent:{expose:true,description:'执行一个斗破沙盒动作或最多四个顺序步骤。kind 取 create/move/approach/travel/talk/work/promise/deliver/buy/sell/gift/allocate/investigate/gather/claim/train/learn/breakthrough/rest/refine/consume/attack/technique/guard/retreat/surrender/invite/confess/engage/marry/separate/conceive/care/teach/wait/continue/cancel/clarify。qty为数量或天数；target用可见人物key或地点ID；交易detail为当前quote整数文本；create时target为clan/apprentice/mercenary/wanderer，detail为native/transmigrator，text为姓名。对话text写原文。所有字符串未用为空，未用qty/x/y为0，未用steps为空数组。含糊或越界用clarify，text写澄清，不编造成功。'},
 reads:grants,validators:[],computation:{source:'rules/engine.js',outputSchema:output,invariantContext:['reads'],invariantReads:[{id:'game',fields:['state.cap','state.reservations']},{id:'people',fields:['alive','state.gold','state.inventory']}]},resolution:{kind:'deterministic',cases:[],fallback:'resolved'},
 subjects:[{id:'newperson',kind:'person',perspective:'person',localRef:{domainId:'dw_people',recordId:F('computed.newPerson.id')},when:'computed.admit'}],effects,derivedPublications:[],
 savePointBefore:false,receipt:{schema:O({outcome:S(64),label:S(128)}),projection:{outcome:F('resolution.outcome'),label:'实际结果见 player 投影中的 result。'},maxBytes:4096}}]};
 const choices=['travel','train','wait','rest','marry','conceive','attack','technique','work'];
 const chosen={...logic.transactions[0],id:'doupo.choice',verb:'doupo_choice',savePointBefore:true,inputSchema:{...action,properties:{...action.properties,kind:S(64,choices)}},intent:{expose:true,description:'需要行动前自动存档的长期活动、家庭重大决定或危险交锋。'+logic.transactions[0].intent.description}};
 chosen.inputSchema={...chosen.inputSchema,properties:{...chosen.inputSchema.properties,steps:{...action.properties.steps,maxItems:0}}};
 logic.transactions[0].inputSchema={...action,properties:{...action.properties,steps:{...action.properties.steps,maxItems:0},kind:S(64,KINDS.filter(k=>!choices.includes(k)))}};
 const parameters='所有字段必填；未用字符串填空串，qty/x/y填0，steps填[]。target为可见人物key或地点ID；交易detail为当前quote整数文本；create时target为clan/apprentice/mercenary/wanderer，detail为native/transmigrator，item为male/female，text为姓名。对话text保留原文。browse时qty为从0起的人物页码。含糊或越界用clarify，text写澄清，不编造成功。';
 logic.transactions[0].intent.description='单一普通行动。kind取'+logic.transactions[0].inputSchema.properties.kind.enum.join('/')+'。'+parameters;
 chosen.intent.description='单一长期、家庭重大决定或危险行动，行动前自动存档。kind取'+choices.join('/')+'。qty为数量或天数。'+parameters;
 logic.transactions.push(chosen);
 logic.transactions.push({...chosen,id:'doupo.plan',verb:'doupo_plan',inputSchema:{...action,properties:{...action.properties,kind:S(64,['plan']),steps:{...action.properties.steps,minItems:1}}},intent:{expose:true,description:'最多四个有顺序的复合动作；每段通过相同规则检查，已完成部分保留，失败或停止不回滚已结算步骤。kind 填 plan；steps 内填写实际动作。其余字段同普通动作。'}});
 // Initial Subjects are bound in three small native transactions; no guessed
 // Session-derived Subject IDs enter authored source or player input.
 for(let offset=0;offset<CAST.length;offset+=8){const ids=CAST.slice(offset,offset+8).map(c=>c[0]);logic.transactions.push({id:'doupo.bind'+offset/8,verb:'bind_people_'+offset/8,inputSchema:O({}),intent:{expose:false,description:'新局身份绑定，不推进时间。'},reads:[{id:'game',domainId:'dw_world',recordId:'main',fields:['state.created']}],validators:[{id:'new_session',formula:'reads.game.state.created == false',error:'只能初始化尚未创建的世界。'}],resolution:{kind:'deterministic',cases:[],fallback:'bound'},subjects:ids.map((id,n)=>({id:'p'+n,kind:'person',perspective:'person',localRef:{domainId:'dw_people',recordId:id}})),effects:ids.flatMap((id,n)=>[{kind:'app.command',domainId:'dw_people',commandId:'publish',recordId:id,args:{...packPerson(people.find(r=>r.id===id).value),actor:F('subjects.p'+n)}},{kind:'app.command',domainId:'dw_information',commandId:'publish',recordId:'background-'+id,args:{actor:F('subjects.p'+n),target:'',status:'known',channel:'direct_message',kind:['lu','bo'].includes(id)?'opportunity':'background',text:['lu','bo'].includes(id)?'近期收到药谷赤叶药材的线索，已经准备自行出发。':CAST.find(c=>c[0]===id)[7],at:0,source:'本人的生活经历与已有消息'}}]),derivedPublications:[],receipt:{schema:O({outcome:S()}),projection:{outcome:F('resolution.outcome')},maxBytes:1024}});}
 files.set('logic.json',Buffer.from(JSON.stringify(logic)));
 files.set('integration/bridge.json',Buffer.from(JSON.stringify(bridgeSource(logic,contract))));
 files.set('integration/screen.schema.json',Buffer.from(JSON.stringify(view)));
 const manifest={format:'atria-package',schemaVersion:2,nativeSchemaVersion:1,packageId:pkg,packageVersionId:pkgv,name:'斗破苍穹·众生行',version,actors:[{actorId:PLAYER,displayName:'自创主角'}],
 entryPoints:[{entryPointId:entry,displayName:'小说开篇附近·开放沙盒',actorIds:[PLAYER],worldIds:[worldId],primaryWorldId:worldId,knowledgeBindingIds:[],initialTimeline:[],subjects:CAST.map(c=>({id:c[0],kind:'person',perspective:'person',localRef:{domainId:'dw_people',recordId:c[0]}}))}],
 worlds:[{world:{worldId,displayName:'斗气大陆·首批三地',currentRevisionId:worldv},revision:{worldId,worldRevisionId:worldv,baseline:{},knowledgeBindingIds:[],assetIds:[],metadata:{period:PERIOD}}}],knowledge:[],knowledgeBindings:[],assets:[],resources,capabilities:['narrative','world-simulation'],permissions:[{permission:'generation',required:true,reason:'自由意图、个人判断与有限视角叙事'}],runtime:{game:{logic:'logic.json'},experience:{mode:'text'},experienceContract:contract}};
 const resolver=modelResources('doupo.resolve','你是斗破沙盒的行动解释器，只把玩家原话映射为一个公开工具调用，不写旁白、不执行规则、不产生状态补丁。依据 observation 中玩家可见的地点、人物 key、报价和当前 operation 选择工具与参数；不要猜隐藏信息。普通行动选 doupo.act，长期或危险重大行动选 doupo.choice，多步要求选 doupo.plan。组合最多四步，未明确对象或不能执行的越界要求用 clarify，text 写简短澄清。交易 detail 必须是可见当前 quote 的整数文本。创建角色时 target 为出身、detail 为 native/transmigrator、item 为 male/female、text 为姓名。对话保留玩家原文；不要把想取得物品、婚姻或功法解释成已经成功。只调用一个工具，不额外输出文字。');
 manifest.runtime.modelPrompt={schemaVersion:1,roles:[{role:'role.intent_resolver',requiredCapabilities:['generation.tools'],promptProgramRef:resolver.exact('core.prompt-program',resolver.pp),generationProfileRef:resolver.exact('core.generation-profile',resolver.gp)}]};
 return {native,manifest,files,logic,contract,output};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const argv=process.argv.slice(2),coreArg=argv.indexOf('--core'),outArg=argv.indexOf('--out');
 if(coreArg<0)throw Error('Usage: node tools/build.mjs --core <Atria source> [--out <new version.atria>]');
 const f=await compile(path.resolve(argv[coreArg+1]));const built=f.native.buildAtriaPackageContainer({manifest:f.manifest,sourceFiles:f.files,assetPayloads:new Map()});
 if(outArg>=0)await fs.writeFile(path.resolve(argv[outArg+1]),built.archive,{flag:'wx'});
 console.log(JSON.stringify({packageId:f.manifest.packageId,packageVersionId:f.manifest.packageVersionId,version:f.manifest.version,bytes:built.archive.length,sha256:createHash('sha256').update(built.archive).digest('hex')}));
}
