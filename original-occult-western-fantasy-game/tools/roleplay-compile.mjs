// Build-time only: emits Native declarations; no shipped evaluator or scheduler.
import { createHash } from 'node:crypto';
export const F = formula => ({formula});
export const S = (maxLength=256,values) => ({type:'string',maxLength,...(values?{enum:values}:{})});
export const I = (minimum=0,maximum=1000000) => ({type:'integer',minimum,maximum});
export const B = {type:'boolean'};
export const O = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const fieldsFrom = (schema,at) => schema.type==='object'?Object.fromEntries(Object.entries(schema.properties).map(([k,s])=>[k,fieldsFrom(s,at+'.'+k)])):F(at);
const id = (prefix,key) => prefix+'_'+createHash('sha256').update('occult-open-roleplay-3:'+key).digest('hex').slice(0,32);
export const ROLEPLAY_VERSION = '3.0.1';
export const ROLEPLAY_VERSION_ID = id('pkgv','version:'+ROLEPLAY_VERSION);
export function compileRoleplay({manifest,contract,data,institutions}) {
 const previous=manifest.packageVersionId;
 manifest.version=ROLEPLAY_VERSION; manifest.packageVersionId=ROLEPLAY_VERSION_ID;
 manifest.resources=JSON.parse(JSON.stringify(manifest.resources).replaceAll(previous,manifest.packageVersionId));
 manifest.name='异闻之城';
 manifest.actors[0].displayName='普通成年人';
 manifest.entryPoints[0].displayName='异闻之城：从凡人开始';manifest.entryPoints[0].initialTimeline=[];
 manifest.worlds[0].world.displayName='城市与郊野';
 const domains=[],automations=[],logic={schemaVersion:3,commands:[],reducers:[],rules:[],interpretations:[],derivedPublications:[],transactions:[]};
 const empty=O({});
 function domain(id,scopeId,properties,initial,bootstrap=true){
  const d={id,scopeId,schemaVersion:1,recordSchema:O(properties),initial,commands:[{id:'bootstrap',argsSchema:empty,event:id+'.ready',assign:structuredClone(initial)}],retention:{maxItems:16,maxLogicalBytes:131072,keepPinned:true,keepReferenced:true}};
  domains.push(d);
  if(bootstrap)automations.push({id:id+'.ready',scopeId,trigger:{kind:'experience.ready'},action:{kind:'app.command',domainId:id,commandId:'bootstrap',recordId:'main',args:{}},maxCatchUp:1});
  return d;
 }
 const read=(id,domainId,fields,recordId='main')=>({id,domainId,recordId,fields});
 const effect=(domainId,commandId,args={},when,recordId='main')=>({kind:'app.command',domainId,commandId,recordId,args,...(when?{when}:{})});
 const atSchema=(d,path)=>path.split('.').reduce((s,k)=>s.properties[k],d.recordSchema);
 const patches=new Map();
 function set(domainId,values,when,recordId='main'){
  const d=domains.find(d=>d.id===domainId),keys=Object.keys(values).sort(),key=domainId+':'+keys.join(',');
  if(!patches.has(key)){
   const cid='put_'+patches.size;
   d.commands.push({id:cid,argsSchema:O(Object.fromEntries(keys.map(k=>[k.replaceAll('.','_'),atSchema(d,k)]))),event:domainId+'.'+cid,assign:Object.fromEntries(keys.map(k=>[k,F('args.'+k.replaceAll('.','_'))]))});patches.set(key,cid);
  }
  return effect(domainId,patches.get(key),Object.fromEntries(Object.entries(values).map(([k,v])=>[k.replaceAll('.','_'),v])),when,recordId);
 }
 const choice=key=>S(32,data.questions.find(q=>q.id===key).options.map(o=>o.id));
 const slotIds=Array.from({length:8},(_,i)=>'dynamic_'+String(i+1).padStart(2,'0'));
 const player=domain('roleplay_player','world',{started:B,name:{...S(48),minLength:0},appearance:S(160),adult:B,residence:choice('residence'),livelihood:choice('livelihood'),attachment:choice('attachment'),contact:choice('contact'),aim:choice('aim'),location:S(96,[...data.places.map(p=>p.id),...slotIds]),tool:S(32),background:O({residence:S(512),livelihood:S(512),contact:S(512),aim:S(512)}),opening:S(2048)},
 {started:false,name:'',appearance:'',adult:true,residence:'local',livelihood:'craft',attachment:'solo',contact:'rumour',aim:'settle',location:'location.old_ferry',tool:'none',background:{residence:'',livelihood:'',contact:'',aim:''},opening:''});
 const Route=O({institutionName:S(96),contacted:B,taught:B,witnessed:B,sourceId:S(64),maintenance:I(),practised:B});
 const Claim=O({engineering:S(32),supportPlace:S(96),active:B,tradition:S(32),seed:S(96),rule:S(512),anchorId:S(64),anchor:S(512),price:S(512),accepted:B,valid:B,due:I(),fee:I(0,4),stage:I(0,4),firstUsed:B,secondUsed:B,breached:B});
 const Entity=O({id:S(32),kind:S(16),name:S(64),description:S(256),parentId:S(96),sourceBatchId:S(64),introducedTurn:I(),revision:I(),status:S(16),known:B,sourceRevision:I(),role:S(32),fulfilled:B});
 const blankEntity=k=>({id:k,kind:'',name:'',description:'',parentId:'',sourceBatchId:'',introducedTurn:0,revision:0,status:'empty',known:false,sourceRevision:0,role:'',fulfilled:false});
 const Proposal=O({pending:B,decision:S(16,['introduce','defer']),batchId:S(64),kind:S(16,['person','place','affair']),name:S(64),description:S(256),parentId:S(96),templateId:S(32)});
 const world=domain('roleplay_world','world',{
  progress:O({effectiveTurns:I(),minutes:I(),episode:S(16,['open','closed']),episodes:I()}),
  economy:O({coins:I(),arrears:I(),processedDay:I(),nextDay:I()}),
  relation:O({created:B,id:S(64),name:S(64),kind:S(32),text:S(512),kept:B,due:I(),overdue:B}),
  routes:O({church:Route,academy:Route}),claim:Claim,
  conditions:O({tired:B,injured:B,carrierPrepared:B,illegalKnown:B,carrierBroken:B,notice:S(512)}),
  pursuit:O({stage:I(0,5),sourceId:S(64),knownFact:S(256),due:I(),assisted:B,repeated:B}),
  schedule:O({slot:I(1,9),slotId:S(32),batchId:S(64),batchTurn:I(),lastUpdatedTurn:I(),nextEligibleTurn:I(),relevance:S(4,['hot','warm','cold']),focusId:S(96),parentId:S(96),lastStatus:S(32),cursor:I()}),
  proposal:Proposal,dynamic:O(Object.fromEntries(slotIds.map(k=>[k,Entity])))
 },{
  progress:{effectiveTurns:0,minutes:0,episode:'open',episodes:0},economy:{coins:0,arrears:0,processedDay:0,nextDay:1440},relation:{created:false,id:'',name:'',kind:'',text:data.questions[2].options.find(o=>o.id==='solo').text,kept:false,due:2880,overdue:false},
  routes:Object.fromEntries(['church','academy'].map(k=>[k,{institutionName:data.institutions.find(i=>i.id===k).label,contacted:false,taught:false,witnessed:false,sourceId:'',maintenance:0,practised:false}])),
  claim:{engineering:'none',supportPlace:'',active:false,tradition:'none',seed:'',rule:'',anchorId:'',anchor:'',price:'',accepted:false,valid:false,due:0,fee:0,stage:0,firstUsed:false,secondUsed:false,breached:false},
  conditions:{tired:false,injured:false,carrierPrepared:false,illegalKnown:false,carrierBroken:false,notice:'你尚未获得超凡能力。'},pursuit:{stage:0,sourceId:'',knownFact:'',due:0,assisted:false,repeated:false},
  schedule:{slot:1,slotId:slotIds[0],batchId:'world_batch_01',batchTurn:0,lastUpdatedTurn:0,nextEligibleTurn:4,relevance:'warm',focusId:'location.old_ferry',parentId:'location.old_ferry',lastStatus:'waiting',cursor:0},
  proposal:{pending:false,decision:'defer',batchId:'',kind:'person',name:'',description:'',parentId:'',templateId:''},dynamic:Object.fromEntries(slotIds.map(k=>[k,blankEntity(k)]))
 });
 const W=read('w',world.id,Object.keys(world.initial)),P=read('p',player.id,['started','location','tool','attachment']);
 // These reads select public subfields, never inbox or scheduling internals.
 const summaryProps={player:player.recordSchema,economy:world.recordSchema.properties.economy,relation:world.recordSchema.properties.relation,routes:world.recordSchema.properties.routes,claim:Claim,conditions:world.recordSchema.properties.conditions,pursuit:world.recordSchema.properties.pursuit,progress:world.recordSchema.properties.progress};
 const summary=domain('roleplay_summary','session',summaryProps,{player:player.initial,...Object.fromEntries(Object.keys(summaryProps).filter(k=>k!=='player').map(k=>[k,world.initial[k]]))},false);
 const visible=domain('roleplay_visible','session',{entries:world.recordSchema.properties.dynamic},{entries:world.initial.dynamic},false);
 const pub={id:'roleplay.publish',reads:[read('p',player.id,Object.keys(player.initial)),read('w',world.id,['economy','relation','routes','claim','conditions','pursuit','progress','dynamic'])],effects:[set(summary.id,Object.fromEntries(Object.entries(summaryProps).map(([k,s])=>[k,fieldsFrom(s,k==='player'?'reads.p':'reads.w.'+k)])))]};
 pub.effects.push(set(visible.id,{entries:fieldsFrom(world.recordSchema.properties.dynamic,'reads.w.dynamic')}));
 logic.derivedPublications.push(pub);
 const source={id:'roleplay.status',kind:'application',scopeId:'session',domainId:summary.id,semantic:'truth',fields:Object.keys(summaryProps).map(k=>[k])};
 const dynSource={id:'roleplay.encounters',kind:'application',scopeId:'session',domainId:visible.id,semantic:'truth',fields:[['entries']]};
 contract.informationRuntime={schemaVersion:1,sources:[source,dynSource],actors:[],graphs:[],views:[
  {id:'player.overview',audience:'player',sources:[source.id,dynSource.id],exposure:['display'],knowledge:false,memory:false,maxItems:64,maxCharacters:16384},
  {id:'narrator.overview',audience:'narrator',sources:[source.id,dynSource.id],exposure:['context'],knowledge:false,memory:false,maxItems:64,maxCharacters:16384}
 ]};
 const gate='resolution.outcome != "impossible"';
 function tx(id,props,allowed,effects,notice,minutes=0,{expose=true,origin,reads=[W,P],outcome='automatic',cases=[]}={}){
  const t={id,verb:id.replaceAll('.','_'),inputSchema:O(props),intent:{expose,description:notice},reads,validators:[],resolution:{kind:'deterministic',cases:[...(Array.isArray(allowed)?allowed.map((when,i)=>({id:'allowed_'+i,when,outcome})):allowed?[{id:'impossible',when:'!('+allowed+')',outcome:'impossible'}]:[]),...cases],fallback:Array.isArray(allowed)?'impossible':outcome},effects:effects.map(e=>({...e,when:e.when?'('+e.when+') && '+gate:gate})),derivedPublications:['roleplay.publish'],receipt:{schema:O({outcome:S(32),notice:S(2048),plannedMinutes:I(0,1440),spentTime:B,pending:S(256)}),projection:{outcome:F('resolution.outcome'),notice,plannedMinutes:0,spentTime:false,pending:'这次只处理第一个行动，其余打算留待之后。'},maxBytes:8192},...(origin?{origin}:{})};
  if(minutes){const duration=typeof minutes==='number'?minutes:F(minutes);
   t.effects.push(set(world.id,{'progress.effectiveTurns':F('reads.w.progress.effectiveTurns + 1'),'progress.minutes':F('reads.w.progress.minutes + '+(typeof minutes==='number'?minutes:minutes))},gate));
   t.effects.push({kind:'clock.advance',commandId:'advance',ticks:duration,when:gate});
   t.receipt.projection.plannedMinutes=duration;
   t.receipt.projection.spentTime=F(gate);
  }
  logic.transactions.push(t);return t;
 }
 const ready='reads.p.started && reads.w.progress.episode == "open" && reads.w.pursuit.stage != 4';
 const attention=(relevance,focusId,parentId=F('reads.p.location'))=>set(world.id,{'schedule.relevance':relevance,'schedule.focusId':focusId,'schedule.parentId':parentId});
 // 5 dimensions, additive and independently authored, below 24 commands even
 // when all conditional branches are reserved by the compiler.
 const beginProps={mode:S(16,['ordinary','ironman']),name:{...S(48),minLength:1},appearance:S(160),...Object.fromEntries(data.questions.map(q=>[q.id,choice(q.id)]))};
 const beginEffects=[set(player.id,{started:true,name:F('args.name'),appearance:F('args.appearance'),adult:true,...Object.fromEntries(data.questions.map(q=>[q.id,F('args.'+q.id)]))})];
 for(const o of data.questions[0].options)beginEffects.push(set(player.id,{location:o.location,'background.residence':o.text},'args.residence == "'+o.id+'"'));
 for(const o of data.questions[1].options){beginEffects.push(set(world.id,{'economy.coins':o.coins},'args.livelihood == "'+o.id+'"'));beginEffects.push(set(player.id,{tool:o.tool,'background.livelihood':o.text},'args.livelihood == "'+o.id+'"'));}
 for(const kind of ['friend','promise'])beginEffects.push(set(world.id,{relation:{created:true,id:'mira',name:'米拉',kind,text:data.questions[2].options.find(o=>o.id===kind).text,kept:kind==='friend',due:2880,overdue:false}},'args.attachment == "'+kind+'"'));
 for(const key of ['contact','aim'])for(const o of data.questions.find(q=>q.id===key).options)beginEffects.push(set(player.id,{['background.'+key]:o.text},'args.'+key+' == "'+o.id+'"'));
 const opening='你的人生，就从这座城开始。河岸有短工可做，旅舍里有人愿意与你聊聊，教堂与大学也向来访者敞开大门。城外的路还很长。眼下，你只是个尚未拥有超凡力量的成年人；带着刚刚选定的身世，用自己的话说出想说的话，去做想做的事。';
 beginEffects.push(set(player.id,{opening}));
 const begin=tx('story.begin',beginProps,null,beginEffects,'按已确认的选择建立成年角色。个人描述不会额外赋予身世、财富、官职、关系或力量。',0,{expose:false,reads:[],outcome:'started'});
 begin.validators=data.incompatibilities.map((r,i)=>({id:'combination_'+i,formula:'!(args.residence == "'+r.residence+'" && args.attachment == "'+r.attachment+'")',error:r.reason}));
 begin.receipt={schema:O({opening:S(2048)}),projection:{opening},maxBytes:8192};
 tx('roleplay.express',{text:S(512),method:S(32,['say','attempt','clarify'])},ready,[],'说出想法，澄清意思，或尝试尚无条件做到的事。表达本身不代表他人同意，也不会凭空改变事实或赋予力量；不耗时。');
 const staticTargets=['mira','church','academy','abnormal'];
 const targetArg=S(64,[...staticTargets,...slotIds]);
 const targetChoices=staticTargets.map(k=>'(args.targetId == "'+k+'" && reads.p.location == "'+({mira:'location.lodging',church:'location.cathedral',academy:'location.ontology',abnormal:'location.abnormal_office'}[k])+'")').concat(slotIds.map(k=>'(args.targetId == "'+k+'" && reads.w.dynamic.'+k+'.known && reads.w.dynamic.'+k+'.kind == "person" && reads.w.dynamic.'+k+'.parentId == reads.p.location)'));
 const talkEffects=[attention('hot',F('args.targetId'))];
 for(const inst of data.institutions)talkEffects.push(set(world.id,{['routes.'+inst.id+'.contacted']:true},'args.targetId == "'+inst.id+'"'));
 talkEffects.push(set(world.id,{'conditions.illegalKnown':true},'args.method == "ask_practice"'));
 talkEffects.push(set(world.id,{'relation.kept':true,'relation.overdue':false},'args.targetId == "mira" && reads.w.relation.created && reads.w.relation.kind == "friend" && args.method == "visit"'));
 talkEffects.push(set(world.id,{'pursuit.assisted':true,'pursuit.stage':5},'args.targetId == "abnormal" && args.method == "seek_aid" && reads.w.pursuit.stage > 0'));
 tx('roleplay.talk',{targetId:targetArg,method:S(32,['greet','ask_work','ask_training','ask_practice','visit','seek_aid']),text:S(512)},targetChoices.map(x=>ready+' && '+x),talkEffects,'与眼前认识的人或接待人员交谈。听取课程介绍还不等于加入机构；报告须说明来源，交谈也不会直接赋予超凡能力或揭示秘密。',5);
 const workBranches=[
  {method:'carry',location:'location.old_ferry',tool:null,wage:8},
  {method:'repair',location:'location.old_ferry',tool:'repair_kit',wage:12},
  {method:'copy',location:'location.lodging',tool:'writing_kit',wage:12},
  {method:'assist',location:'location.ontology',tool:'writing_kit',wage:10},
  {method:'help_lodging',location:'location.lodging',tool:null,wage:0}
 ];
 const allowedWork=workBranches.map(w=>'(args.method == "'+w.method+'" && reads.p.location == "'+w.location+'"'+(w.tool?' && reads.p.tool == "'+w.tool+'"':'')+')').join(' || ');
 const we=workBranches.map(w=>set(world.id,{'economy.coins':F('reads.w.economy.coins + '+w.wage),'conditions.tired':true},'args.method == "'+w.method+'"'));
 we.push(set(world.id,{'relation.kept':true,'relation.overdue':false},'reads.w.relation.created && reads.w.relation.kind == "promise" && reads.p.location == "location.lodging"'));
 tx('roleplay.work',{method:S(32,workBranches.map(w=>w.method))},ready+' && !reads.w.conditions.injured && ('+allowedWork+')',we,'用现有工具做一份当地短工，领取相应工钱，也会感到疲劳。这份工作不授予官职或超凡资格。',60);
 // Neighbouring public travel uses one authored 20-minute interval.
 const paths=data.routes.flatMap(r=>[{...r},{from:r.to,to:r.from,minutes:r.minutes}]);
 tx('roleplay.travel',{to:S(96,data.places.map(p=>p.id))},ready+' && ('+paths.map(r=>'(reads.p.location == "'+r.from+'" && args.to == "'+r.to+'")').join(' || ')+')',[set(player.id,{location:F('args.to')}),attention('warm',F('args.to'),F('args.to'))],'沿相邻地点之间的开放道路走二十分钟。到达某地仍须遵守当地的出入限制。',20);
 const slotChoices=predicate=>slotIds.map(k=>ready+' && args.targetId == "'+k+'" && reads.w.dynamic.'+k+'.known && ('+predicate(k)+')');
 tx('roleplay.help',{targetId:S(32,slotIds)},slotChoices(k=>'!reads.w.conditions.injured && reads.w.dynamic.'+k+'.role == "short_job" && !reads.w.dynamic.'+k+'.fulfilled && reads.w.dynamic.'+k+'.parentId == reads.p.location'),[
  ...slotIds.map(k=>set(world.id,{['dynamic.'+k+'.fulfilled']:true,['dynamic.'+k+'.revision']:F('reads.w.dynamic.'+k+'.revision + 1')},'args.targetId == "'+k+'"')),
  set(world.id,{'economy.coins':F('reads.w.economy.coins + 8'),'conditions.tired':true})
 ],'完成一份已知的当地短工，得到八枚硬币。这件事会留在记事中，工作名称不会改变报酬或要求。',60);
 tx('roleplay.visit_place',{targetId:S(32,slotIds),method:S(16,['enter','leave'])},slotChoices(k=>'reads.w.dynamic.'+k+'.kind == "place" && ((args.method == "enter" && reads.p.location == reads.w.dynamic.'+k+'.parentId) || (args.method == "leave" && reads.p.location == "'+k+'"))'),[
  set(player.id,{location:F('args.targetId')},'args.method == "enter"'),
  ...slotIds.map(k=>set(player.id,{location:F('reads.w.dynamic.'+k+'.parentId')},'args.method == "leave" && args.targetId == "'+k+'"'))
 ],'前往所在地点的一处已知公共工作台，或从那里离开。不因此获得其他地方的通行权、官职或力量。',5);
 tx('roleplay.attention',{targetId:S(96,[...data.places.map(p=>p.id),'mira','church','academy','abnormal',...slotIds]),method:S(16,['follow','leave'])},['args.targetId == reads.p.location',...targetChoices].map(x=>ready+' && '+x),[
  attention('hot',F('args.targetId')),
  set(world.id,{'schedule.relevance':'cold','schedule.nextEligibleTurn':F('reads.w.progress.effectiveTurns + 24')},'args.method == "leave"'),
  set(world.id,{'schedule.relevance':'hot','schedule.nextEligibleTurn':F('max(reads.w.schedule.lastUpdatedTurn + 4, reads.w.progress.effectiveTurns)')},'args.method == "follow"')
 ],'继续留意一件已知的事，或暂且放下。这个选择会保留，但不会让时间推进；放下的事不会定期触发新的变化。');
 tx('roleplay.rest',{method:S(32,['sleep','care'])},ready,[set(world.id,{'conditions.tired':false}),set(world.id,{'conditions.injured':false},'args.method == "care" && reads.p.location == "location.lodging"')],'休息一小时。睡眠可缓解疲劳，旅舍的照料可治疗练习造成的轻伤；损坏的载体仍需另行处理。',60);
 const learnAllowed=data.institutions.map(i=>'(args.institution == "'+i.id+'" && reads.p.location == "'+i.place+'" && reads.w.routes.'+i.id+'.contacted && (args.method == "study" || (args.method == "accept_price" && args.acceptPrice && reads.w.routes.'+i.id+'.witnessed && !reads.w.claim.accepted)))').join(' || ');
 const le=[];
 for(const i of data.institutions){const chosen='args.institution == "'+i.id+'"';le.push(set(world.id,{['routes.'+i.id+'.taught']:true,'conditions.notice':i.training},chosen+' && args.method == "study"'));
  le.push(set(world.id,{claim:{engineering:'supervised',supportPlace:i.place,active:true,tradition:i.id,seed:i.seed,rule:i.rule,anchorId:i.carrier,anchor:i.anchor,price:i.price,accepted:true,valid:true,due:F('reads.w.progress.minutes + 30 + 1440'),fee:i.fee,stage:2,firstUsed:false,secondUsed:false,breached:false},'conditions.notice':'你已接受这份超凡能力；它依赖眼前的载体，也需要你每日履行约定。'},chosen+' && args.method == "accept_price"'));
 }
 le.push(attention('hot',F('args.institution')));
 tx('roleplay.learn',{institution:S(32,['church','academy']),method:S(32,['study','accept_price']),acceptPrice:B},ready+' && ('+learnAllowed+')',le,'参加公开课程，了解能力的有限用途。正式获得力量前，须亲自核实见证、妥善保留载体，并明确接受代价；不因此获得职业身份或知晓隐秘真相。',30);
 const pe=[];
 for(const i of data.institutions){const cond='args.institution == "'+i.id+'"';pe.push(set(world.id,{['routes.'+i.id+'.witnessed']:true,['routes.'+i.id+'.sourceId']:i.carrier,'conditions.carrierPrepared':true,'conditions.notice':i.training},cond));}
 tx('roleplay.practice',{institution:S(32,['church','academy'])},ready+' && ('+data.institutions.map(i=>'(args.institution == "'+i.id+'" && reads.p.location == "'+i.place+'" && reads.w.routes.'+i.id+'.taught && !reads.w.routes.'+i.id+'.witnessed)').join(' || ')+')',pe,'在监督下亲自核实相互矛盾的独立证据，并分别保存。这次见证使你触及现实的裂隙，取得力量的种子，但还没有正式获得能力。',10);
 const carriers=data.institutions.flatMap(i=>[i.carrier,i.secondCarrier]).concat(data.illegal.carrier);
 const invokeAllowed='reads.w.claim.active && reads.w.claim.valid && ('+data.institutions.map(i=>'(reads.w.claim.tradition == "'+i.id+'" && (args.targetId == "'+i.carrier+'" || (args.targetId == "'+i.secondCarrier+'" && reads.p.location == "'+i.place+'")))').concat('(reads.w.claim.tradition == "personal" && args.targetId == "'+data.illegal.carrier+'" && (reads.w.claim.engineering != "narrow_condition" || reads.p.location == reads.w.claim.supportPlace))').join(' || ')+')';
 const ie=[set(world.id,{'claim.firstUsed':true,'claim.stage':F('max(3, reads.w.claim.stage)'),'conditions.notice':'你再次辨认出载体上那处亲自核实的矛盾。他人的心智、真名和过去都未因此改变。'},'args.targetId == reads.w.claim.anchorId && !reads.w.claim.firstUsed')];
 for(const i of data.institutions)ie.push(set(world.id,{'claim.secondUsed':true,'claim.stage':4,['routes.'+i.id+'.practised']:true,'conditions.notice':'你在监督下检验了第二件载体，并将同一条有限规则用于其上。这是一次新的稳定运用，能力范围并未扩大；重复练习也不会无限积累成长。'},'args.targetId == "'+i.secondCarrier+'" && reads.w.claim.firstUsed && !reads.w.claim.secondUsed'));
 tx('roleplay.invoke',{targetId:S(64,carriers)},ready+' && '+invokeAllowed,ie,'对亲自核实过的载体运用已有能力，或在监督下检验第二件载体。重复使用不会无限成长，也不能自行添加目标或效果。',5);
 const maintainAllowed='reads.w.claim.accepted && reads.w.economy.coins >= reads.w.claim.fee && ('+data.institutions.map(i=>'(reads.w.claim.tradition == "'+i.id+'" && reads.p.location == "'+i.place+'")').concat('(reads.w.claim.tradition == "personal" && !reads.w.conditions.carrierBroken)').join(' || ')+')';
 tx('roleplay.maintain',{method:S(32,['keep_price','deny_witness'])},ready+' && reads.w.claim.accepted && (args.method == "deny_witness" || ('+maintainAllowed+'))',[
  set(world.id,{'claim.active':true,'claim.valid':true,'claim.breached':false,'claim.due':F('reads.w.progress.minutes + 10 + 1440'),'economy.coins':F('reads.w.economy.coins - reads.w.claim.fee')},'args.method == "keep_price"'),
  set(world.id,{'claim.active':false,'claim.valid':false,'claim.breached':true,'conditions.notice':'你明知那是亲眼见证的事实，却仍予以否认。誓约已破，能力暂时失效；须履行相应的维护要求才能恢复。'},'args.method == "deny_witness"')
 ],'维护载体、履行约定，并支付所需校准费用。明知而否认见证会破坏誓约；错过维护期限也会使能力失效。',10);
 tx('roleplay.research',{engineering:S(32,['personal_carrier','narrow_condition','unsupported']),text:S(512)},ready+' && reads.w.conditions.illegalKnown',[
  set(world.id,{'conditions.notice':'这仍只是一个研究设想，尚不能施展超出现有规则的力量。机构也尚未收到有关违规实践的证据。'},'args.engineering == "unsupported"'),
  set(world.id,{'conditions.carrierPrepared':true,'conditions.notice':data.illegal.warning},'args.engineering != "unsupported" && (reads.w.routes.church.witnessed || reads.w.routes.academy.witnessed)')
 ],'在记忆与见证、命名与边界的范围内，研究已有的实践方案。提出设想不会直接创造新规则或新能力，也不代表他人同意或违规已被证实。',30);
 const risk=tx('risk.resolve',{seed:S(96,['claim.seed.unlost_evidence','claim.seed.name_mismatch']),engineering:S(32,['personal_carrier','narrow_condition']),method:S(32,['careful','force']),acceptPrice:{...B,enum:[true]},acknowledgeSevere:B},ready+' && reads.w.conditions.illegalKnown && reads.w.conditions.carrierPrepared && !reads.w.conditions.carrierBroken && !reads.w.claim.active && ((args.seed == "claim.seed.unlost_evidence" && reads.w.routes.church.witnessed) || (args.seed == "claim.seed.name_mismatch" && reads.w.routes.academy.witnessed)) && (reads.p.location == "location.signal_house" || reads.p.location == "location.old_ferry") && (args.method != "force" || !reads.w.conditions.injured || args.acknowledgeSevere)',[
  set(world.id,{claim:{engineering:F('args.engineering'),supportPlace:F('reads.p.location'),active:true,tradition:'personal',seed:F('args.seed'),rule:'仅对亲自核实过的载体使用力量：依照已取得的种子，保留对见证矛盾的识别，或辨认已检验的命名错位。不能干涉心智、发现真名、使人复生或改写过去。',anchorId:data.illegal.carrier,anchor:'亲自核实的个人载体，缺少外部见证的保护。',price:data.illegal.price,accepted:true,valid:true,due:F('reads.w.progress.minutes + 10 + 1440'),fee:4,stage:2,firstUsed:false,secondUsed:false,breached:false},'conditions.notice':'你付出了更重的代价，终于使个人能力稳定下来。若选择了限定场所，它只能在此处使用；这仍不等于获得机构资格。'},'resolution.outcome == "success"'),
  set(world.id,{'conditions.tired':true,'conditions.injured':true,'conditions.notice':'载体发生反噬，你在练习中受了轻伤。再次尝试前，先休息或找人照料伤口。'},'resolution.outcome == "failure" || resolution.outcome == "partial"'),
  set(world.id,{'conditions.carrierBroken':true,'conditions.notice':'你带伤强行再试，反噬夺走了你的性命。这一生已经结束。'},'resolution.outcome == "death"'),
  set(world.id,{'pursuit.stage':1,'pursuit.sourceId':'ferry_witness_report','pursuit.knownFact':'一位渡口工人目睹了未经许可的载体实践，并在报告上署了名。','pursuit.due':F('reads.w.progress.minutes + 10 + 60')},'reads.p.location == "location.old_ferry" && reads.w.pursuit.stage == 0'),
  set(world.id,{'pursuit.stage':1,'pursuit.sourceId':'signal_caretaker_report','pursuit.knownFact':'信号屋的看守报告了亲眼所见的反噬，以及损坏的练习载体。','pursuit.due':F('reads.w.progress.minutes + 10 + 60')},'reads.p.location == "location.signal_house" && reads.w.pursuit.stage == 0 && resolution.outcome != "success"'),
  set(world.id,{'pursuit.repeated':true},'reads.w.pursuit.stage == 3')
 ],data.illegal.warning,10);
 risk.resolution.kind='bounded_fortune';risk.resolution.sides=6;
 risk.resolution.cases.push({id:'fatal_repeat',when:'args.method == "force" && reads.w.conditions.injured && resolution.roll <= 2',outcome:'death'},{id:'prepared_success',when:'(args.engineering == "narrow_condition" && args.method == "careful" && resolution.roll >= 3) || resolution.roll >= 5 || (args.method == "careful" && resolution.roll >= 4)',outcome:'success'},{id:'partial',when:'resolution.roll == 3 || resolution.roll == 4',outcome:'partial'});risk.resolution.fallback='failure';
 risk.receipt.schema.properties.position=S(16);risk.receipt.schema.required.push('position');risk.receipt.projection.position='有风险；带伤强行再试时，危险极高';risk.receipt.schema.properties.position.maxLength=48;
 tx('roleplay.petition',{method:S(32,['request_supervision'])},'reads.p.started && reads.w.pursuit.stage >= 3 && !reads.w.pursuit.assisted',[set(world.id,{'pursuit.assisted':true,'pursuit.stage':5,'conditions.notice':'你的正式求助已获受理。相关证据仍会保留，拘留限制改为受监督的实践要求。这不等于无罪认定，也不会直接授予能力。'})],'收到有证据支持的传唤或拘留后，可正式申请协助。报告会继续保留，先前的实践记录也不会消失。',30);
 tx('roleplay.wait',{minutes:I(1,1440)},ready,[],'等待一段时间。生活开支、载体维护期限，以及有证据支持的机构处置都会随时间推进。','args.minutes');
 tx('roleplay.close_episode',{method:S(32,['conclude','continue'])},'reads.p.started && ((args.method == "conclude" && reads.w.progress.episode == "open") || (args.method == "continue" && reads.w.progress.episode == "closed"))',[
 set(world.id,{'progress.episode':'closed','progress.episodes':F('reads.w.progress.episodes + 1')},'args.method == "conclude"'),set(world.id,{'progress.episode':'open'},'args.method == "continue"')
 ],'为这段经历暂作结，或继续生活。已经发生的结果、关系、债务和义务都会保留；一段经历结束，并不意味着人生结束。',1);
 // Build-time helper passed to the world compiler, never shipped in Package.
 const ctx={manifest,contract,data,domains,automations,logic,world,player,Entity,Proposal,slotIds,read,set,effect,tx,W,P,fieldsFrom,attention};
 return ctx;
}
