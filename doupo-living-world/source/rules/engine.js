import {BACKGROUNDS,PLACES,ROUTES,PLAYER,DAY,YEAR,POLICY,KINDS,START_KNOWLEDGE} from '../content/catalog.js';
import {copy,qty,add,skill,learn,age,record,price,person,infoItem,NEW_PERSON_FIELDS,idleActivity,freeControl} from './state.js';
import {packPerson,unpackPerson,packWorld,unpackWorld,MIND_FIELDS} from './records.js';
import {project,pathTo,observePerson,intentProjection} from './projection.js';
import {contentSha256 as sha,canonical} from './hash.js';
import {capabilities,conditionDetail,conditionAwareness,injure,recoverCondition,treatCondition} from './condition.js';
import {stepLife,deliverMessage,settleConflict,refreshOrganizations,ecologicalStock,know,sendMessage,reserveRepair,endServices,cancelRepairs} from './life.js';
import {causalLedger} from './causality.js';
import {canPerceive} from './perception.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const emptyPerson=()=>person('none','未入场','wutan.inn','none',20,1,'unavailable');
const zero='0'.repeat(64);
const authorMeta=seed=>({origin:'author',invocationId:seed,taskId:'doupo.rules',variantId:'v1',profileId:'doupo.social',profileRevision:'v1',modelProfileId:'rules',modelProfileHash:zero,requestSnapshotHash:zero,previousHash:zero,promptId:'rules',promptRevision:'v1',generationId:'rules',generationRevision:'v1'});
export const blankRelation=()=>({actor:PLAYER,target:'sub_'+zero.slice(0,32),dimension:'trust',level:0,status:'active',text:'尚未交往',rationale:'规则基线',basis:{viewId:'personal',anchor:{sessionId:'ses_'+zero.slice(0,32),packageVersionId:'pkgv_'+zero.slice(0,32),revisionId:'rev_'+zero.slice(0,32),branchId:'br_'+zero.slice(0,32),scopeEpochs:{session:0}},sourceRefs:[]},appraisal:authorMeta('initial')});
export const blankInfo=()=>({actor:PLAYER,target:'',status:'known',channel:'witnessed',kind:'event',text:'',at:0,source:'规则'});
function run(input){
 const {reads,seed,anchor}=input,args=copy(input.args),w=unpackWorld(copy(reads.game)),loadedMinds=new Map(reads.minds.records.map(r=>[r.id,copy(r.value.state.mind)])),relations=copy(reads.relations.records),memories=copy(reads.personal.records);
 const unknownMind=packPerson(emptyPerson()).state.mind;
 const rows=[0,1,2].flatMap(i=>reads['people'+i].records).map(r=>({id:r.id,value:unpackPerson({actor:r.value.actor,alive:r.value.alive,state:{body:copy(r.value.state.body),mind:copy(loadedMinds.get(r.id)||unknownMind)}})}));
 const changed=new Map(),events=new Map(),relUpdates=new Map(),p=rows.find(r=>r.id==='player').value;
 const causal=causalLedger(w,rows);
 let result={code:'ok',text:'',spent:0,at:w.time,partial:false,steps:[]},newcomer=null,admit=false,accepted=true,executingPlan=false;
 const row=key=>rows.find(r=>r.id===key),touch=key=>{const r=row(key);if(r)changed.set(key,r);return r?.value;};
 const say=(code,text)=>{result.code=code;result.text=text;};
 const reject=(code,text)=>{accepted=false;say(code,text);return false;};
 const event=(who,target,kind,text,source='亲历',channel='witnessed')=>{
  if(!who.actor)return;const id='m-'+sha(who.actor+'|'+target+'|'+kind).slice(0,40);
  const value={actor:who.actor,target,status:'known',channel,kind,text:text.slice(0,2048),at:w.time,source};
  const e={id,value};events.set(id,e);const prior=memories.findIndex(r=>r.id===id);if(prior<0)memories.push(e);else memories[prior]=e;return e;};
 const appraisal=(from,to,dimension,delta,text)=>{
  if(!from?.actor||!to?.actor||from.actor===to.actor)return;
  const e=event(from,to.actor,'social-'+dimension,text,'本人的交往经历');
  w.appraisals.push({actor:from.actor,target:to.actor,dimension,delta,text,eventId:e.id,fingerprint:sha(JSON.stringify(infoItem(e.id,e.value)))});
 };
 function settleAppraisals(){
  const pending=w.appraisals.splice(0,2);
  for(const change of pending){
   if(!rows.some(r=>r.value.actor===change.actor&&r.value.alive))continue;
   const existing=relations.find(r=>r.value.actor===change.actor&&r.value.target===change.target&&r.value.dimension===change.dimension);
   const id=existing?.id||'r-'+sha(change.actor+change.target+change.dimension).slice(0,40);
   const viewId=change.actor===PLAYER?'protagonist':'perspective.'+sha(JSON.stringify([change.actor,'person'])).slice(0,32);
   const value={actor:change.actor,target:change.target,dimension:change.dimension,level:clamp((existing?.value.level||0)+change.delta,-100,100),status:'active',text:change.text,rationale:'根据已发生且本人知道的具体交往形成评价。',
    basis:{viewId,anchor:copy(anchor),sourceRefs:[{itemId:'personal:'+change.eventId,fingerprint:change.fingerprint}]},
    appraisal:{...authorMeta(seed),previousHash:reads.relations.records.find(r=>r.id===id)?.hash||sha(canonical(blankRelation()))}};
   const r={id,value};relUpdates.set(id,r);if(existing)existing.value=value;else relations.push(r);
  }
  say('appraised','当事人已依据自己的经历形成评价。');
 }
 const level=(from,to,dimension='trust')=>relations.find(r=>r.value.actor===from.actor&&r.value.target===to.actor&&r.value.dimension===dimension&&r.value.status==='active')?.value.level||0;
 const relationKey=(from,to,dimension)=>'r-'+sha(from+to+dimension).slice(0,40);
 const compatible=(a,b)=>a!==b&&![a.parentA,a.parentB,a.ward].filter(Boolean).some(k=>rows.find(r=>r.id===k)?.value===b)&&![b.parentA,b.parentB,b.ward].filter(Boolean).some(k=>rows.find(r=>r.id===k)?.value===a)&&![a.parentA,a.parentB].filter(Boolean).some(k=>[b.parentA,b.parentB].includes(k));
 const contactFor=r=>rows.filter(other=>other.id!==r.id&&other.id!=='player'&&other.value.alive&&other.value.place===r.value.place&&other.value.preference==='reciprocal'&&age(other.value,w.time)>=18&&age(other.value,w.time)<=45&&!other.value.partner&&compatible(r.value,other.value)).sort((a,b)=>a.id.localeCompare(b.id))[0];
 function planRelations(){
  const keys=w.appraisals.map(a=>relationKey(a.actor,a.target,a.dimension));
  const next=rows.filter(r=>r.id!=='player'&&r.value.alive).sort((a,b)=>Math.min(a.value.next,a.value.deathAt)-Math.min(b.value.next,b.value.deathAt)||a.id.localeCompare(b.id))[0];
  const contact=next&&contactFor(next);
  if(contact)for(const dimension of ['trust','affinity']){keys.push(relationKey(next.value.actor,contact.value.actor,dimension),relationKey(contact.value.actor,next.value.actor,dimension));}
  w.relationKeys=[...new Set(keys)];
  const nextMessage=w.messages.filter(m=>['pending','waiting'].includes(m.status)).sort((a,b)=>a.due-b.due||a.id.localeCompare(b.id))[0];
  const nextConflict=w.conflicts.filter(f=>f.status==='active').sort((a,b)=>a.next-b.next||a.id.localeCompare(b.id))[0];
  const nextBirth=w.reservations.slice().sort((a,b)=>a.due-b.due||a.id.localeCompare(b.id))[0];
  const subject=nextConflict&&row(nextConflict.a)?.value;
  const witness=nextConflict&&rows.filter(r=>r.id!==nextConflict.a&&r.id!==nextConflict.b&&r.value.alive&&subject&&row(nextConflict.b)&&canPerceive(r.value,subject)&&canPerceive(r.value,row(nextConflict.b).value)).slice(0,1);
  w.mindKeys=[...new Set(['player',next?.id,nextMessage?.receiver,nextConflict?.a,nextConflict?.b,...(witness||[]).map(r=>r.id),nextBirth?.a,nextBirth?.b].filter(Boolean))];
  if(w.releases.length)w.mindKeys=['player',w.releases[0]];
  const alive=rows.filter(r=>r.id!=='player'&&r.value.alive).map(r=>r.id).sort();if(admit&&newcomer)alive.push(newcomer.id);
  if(alive.length>96)throw Error('living population read capacity');
  for(let i=0;i<3;i++)w['peopleKeys'+i]=[...(i===0?['player']:[]),...alive.slice(i*32,i*32+32)];
 }
 const near=t=>t&&t.alive&&canPerceive(p,t)&&Math.abs(t.x-p.x)+Math.abs(t.y-p.y)<=2;
 const target=()=>row(args.target)?.value;
 const known=(who,kind,text,source,channel='told_by')=>event(who,'',kind,text,source,channel);
 const history=(kind,refs,text)=>{record(w,kind,refs,text);causal.fact(kind,refs,text);};
 const capable=(who,kind)=>{const reason=capabilities(who)[kind];return !reason||reject('condition_unavailable',reason);};
 function harm(key,part,kind,severity,cause){
  const receipt=causal.capture('cause-'+sha(key+'|'+w.time+'|'+cause).slice(0,40),'bodily',[key],cause,key==='player'?'owner':'scene');
  const who=touch(key),id='w-'+sha(key+'|'+w.time+'|'+cause).slice(0,40);
  if(injure(who,{id,part,kind,severity,at:w.time,source:'cause:'+receipt,cause})){
   history('bodily_harm',[key,id],who.name+'的身体受到持续损伤。');
   event(who,'','condition:'+id,conditionDetail(who).wounds.find(w=>w.id===id).symptom,'本人的身体感受');
  }
 }
 function death(key,cause){const d=touch(key);if(!d?.alive)return;
  causal.capture('death-'+sha(key+'|'+w.time).slice(0,40),'death',[key],cause);
  d.alive=false;d.hp=0;d.plan='已故：'+cause;w.combat.enemy=w.combat.enemy===key?'':w.combat.enemy;
  endServices(lifeContext(),row(key));
  d.activity=idleActivity();d.suspended=idleActivity();d.destination='';d.arriveAt=0;d.control=freeControl();
  for(const r of rows.filter(r=>r.value.alive&&r.value.control.holder===key))if(!w.releases.includes(r.id))w.releases.push(r.id);
  history('death',[key],d.name+'因'+cause+'死亡。');
  const kin=rows.filter(r=>r.value.alive&&(r.value.partner===key||r.value.parentA===key||r.value.parentB===key));
  const heir=kin.sort((a,b)=>a.id.localeCompare(b.id))[0];
  if(heir){causal.capture('death-'+sha(key+'|'+w.time).slice(0,40),'death',[heir.id],cause);const h=touch(heir.id);h.gold+=d.gold;d.gold=0;for(const inv of d.inventory){add(h,inv.item,inv.qty);inv.qty=0;}while(d.gear.length&&h.gear.length<4){const item=d.gear.shift();item.equipped=false;h.gear.push(item);}if(age(h,w.time)<POLICY.adultYears)h.ward=d.partner&&row(d.partner)?.value.alive?d.partner:'community';}
  for(const f of w.families.filter(f=>f.a===key||f.b===key)){f.status='bereaved';const survivor=touch(f.a===key?f.b:f.a);if(survivor?.alive)survivor.partner='';}
  for(const promise of w.promises.filter(r=>r.status==='open'&&(r.giver===key||r.receiver===key)))promise.status='ended_by_death';
  if(canPerceive(p,d)){event(p,d.actor,'death',d.name+'已死亡。','现场');event(p,d.actor,'person',JSON.stringify(observePerson(key,d,w.time)),'现场');}
 }
 function feed(key,n,days,until){
  let needed=days;const f=w.families.find(f=>['active','strained','bereaved'].includes(f.status)&&[f.a,f.b,...f.children].includes(key));
  if(f&&n.place===f.home){const shared=Math.min(f.food,needed);f.food-=shared;needed-=shared;}
  const eats=Math.min(qty(n,'food'),needed);add(n,'food',-eats);needed-=eats;
  const cost=needed*3;
  if(n.gold<cost&&n.role==='child'){
   const guardian=[n.ward,n.parentA,n.parentB].map(id=>row(id)).find(r=>r?.value.alive&&r.value.place===n.place&&r.value.gold>=cost-n.gold);
   if(guardian){const g=touch(guardian.id);g.gold-=cost-n.gold;n.gold=cost;}
  }
  const stock=w.stocks.find(s=>s.place===n.place&&s.item==='food');
  const meals=Math.min(needed,Math.floor(n.gold/3),stock?.qty||0);n.gold-=meals*3;if(stock&&meals){stock.gold+=meals*3;stock.qty-=meals;stock.quote++;}needed-=meals;
  if(needed){n.injury=clamp(n.injury+needed*2,0,100);n.needitem='food';n.needqty=Math.min(100,needed);n.plan='缺粮，寻求低风险工作与照护';if(f&&f.status!=='bereaved')f.status='strained';}
  if(n.injury>=80)n.deathAt=Math.min(n.deathAt,until+7*DAY);
  return needed===0;
 }
 const lifeContext=()=>({w,rows,touch,event,history,harm,death,appraisal,level,capture:causal.capture,currentCause:causal.current});
 function scheduleNpc(r,until){
  if(!loadedMinds.has(r.id))return;
  const n=touch(r.id),days=Math.floor(until/DAY)-Math.floor(n.updated/DAY);n.updated=until;
  if(!n.alive)return;
  if(n.deathAt<=until){death(r.id,n.injury>=80?'伤势恶化':'寿尽');return;}
  if(n.role==='child'&&age(n,until)>=18){n.role='apprentice';n.preference='reciprocal';n.plan='成年，开始谋生与求学';learn(n,'basic');history('adulthood',[r.id],n.name+'成年后开始选择自己的生活。');}
  if(days){
   const nourished=feed(r.id,n,days,until);recoverCondition(n,until,nourished);
   if(n.injury>=80)n.deathAt=Math.min(n.deathAt,until+7*DAY);
   if(nourished&&n.injury<80){n.injury=Math.max(0,n.injury-days);n.hp=Math.min(100,n.hp+days);}
  }
  refreshOrganizations(lifeContext(),r.id);
  stepLife({...lifeContext(),r});
  if(n.destination||n.control.holder||capabilities(n).communicate||until-n.lastSocial<7*DAY)return;
  n.lastSocial=until;
  if(n.partner){
   const f=w.families.find(f=>[f.a,f.b].includes(r.id)&&[f.a,f.b].includes(n.partner)&&['active','strained'].includes(f.status));
   if(f&&n.gold>=20&&f.gold<180){n.gold-=20;f.gold+=20;}
   if(f&&qty(n,'food')>=4&&f.food<40){add(n,'food',-4);f.food+=4;}
   const mate=row(n.partner)?.value,live=rows.filter(p=>p.id!=='player'&&p.value.alive).length;
   if(w.reservations.length<16&&f&&mate?.alive&&n.partner!=='player'&&n.sex!==mate.sex&&age(n,until)<=45&&age(mate,until)<=45&&f.gold>=90&&f.food>=20&&f.children.length<2&&!w.reservations.some(b=>[b.a,b.b].includes(r.id))&&live+w.reservations.length<w.cap){
    const last=f.children.map(k=>row(k)?.value.born||0).sort((a,b)=>b-a)[0];
    if(!f.children.length||until-last>3*YEAR){f.gold-=30;w.consumedGold+=30;w.reservations.push({id:'npc-birth-'+sha(f.id+'|'+f.children.length).slice(0,32),a:r.id,b:n.partner,due:until+POLICY.gestationDays*DAY});history('pregnancy',[r.id,n.partner],'两位居民在生活条件允许时安排养育。');}
   }
  }else if(age(n,until)>=18&&age(n,until)<=45&&n.preference==='reciprocal'){
   const contact=contactFor(r);
   if(contact){const c=contact.value;
    if(level(n,c)>=25&&level(c,n)>=25&&level(n,c,'affinity')>=10&&level(c,n,'affinity')>=10&&n.gold>=30&&c.gold>=30&&qty(n,'food')>=4&&qty(c,'food')>=4){
     touch(contact.id);n.partner=contact.id;c.partner=r.id;n.gold-=30;c.gold-=30;add(n,'food',-4);add(c,'food',-4);
     w.families.push({id:'npc-family-'+sha([r.id,contact.id].sort().join('|')).slice(0,32),a:r.id,b:contact.id,home:n.home,gold:60,food:8,status:'active',children:[]});history('marriage',[r.id,contact.id],n.name+'与'+c.name+'协商后成家。');
    }else{appraisal(n,c,'trust',4,n.name+'在共同生活圈中更了解'+c.name+'的为人。');appraisal(n,c,'affinity',3,'日常来往积累了熟悉与亲近。');}
   }
  }
 }
 function startOperation(kind,targetKey,end,detail=''){w.op={kind,target:targetKey,end,detail,stopped:false};}
 function advance(requested){
  if(w.releases.length){
   const key=w.releases.shift(),released=touch(key);
   if(released){causal.capture('release-'+sha(key+'|'+w.time).slice(0,40),'control',[key],released.control.source);released.control=freeControl();released.next=w.time;history('released',[key],'原控制者死亡，拘束已在当前时点解除。');}
   return;
  }
  const initial=w.time;let until=Math.min(requested,w.op.kind?w.op.end:requested);
  const interrupted=w.op.kind&&capabilities(p)[w.op.kind==='travel'?'move':w.op.kind];
  if(interrupted){w.op={kind:'',target:'',end:0,detail:'',stopped:true};w.plan=[];reject('condition_interrupted',interrupted);return;}
  const deadlines=[p.deathAt,w.nextMarket,...w.reservations.map(r=>r.due),...w.promises.filter(r=>r.status==='open').map(r=>r.due),w.nextImmigration,...w.messages.filter(m=>['pending','waiting'].includes(m.status)).map(m=>m.due),...w.conflicts.filter(f=>f.status==='active').map(f=>f.next)].filter(t=>t>=initial);
  if(deadlines.length)until=Math.min(until,...deadlines);
  // Resolve one due resident per commit. Equal-time work is drained before
  // another action is admitted; persisted operation state explains the wait.
  const due=rows.filter(r=>r.id!=='player'&&r.value.alive&&Math.min(r.value.next,r.value.deathAt)<=until)
   .sort((a,b)=>Math.min(a.value.next,a.value.deathAt)-Math.min(b.value.next,b.value.deathAt)||a.id.localeCompare(b.id));
  if(due.length)until=Math.max(initial,Math.min(until,Math.min(due[0].value.next,due[0].value.deathAt)));
  const births=w.reservations.filter(r=>r.due<=until).sort((a,b)=>a.due-b.due||a.id.localeCompare(b.id));
  if(births.length>1)until=Math.min(until,births[0].due);
  w.time=until;result.spent+=until-initial;
  const elapsedDays=Math.floor(until/DAY)-Math.floor(initial/DAY);
  if(w.op.kind==='work'&&elapsedDays>0){touch('player');p.gold+=elapsedDays*12;w.producedGold+=elapsedDays*12;}
  if(elapsedDays>0){touch('player');const nourished=feed('player',p,elapsedDays,until);recoverCondition(p,until,nourished);if(p.injury>=80)p.deathAt=Math.min(p.deathAt,until+7*DAY);}
  if(w.op.kind==='move'&&until>initial){const [x,y]=w.op.detail.split(',').map(Number),path=pathTo(p.place,p,{x,y});if(path?.length){touch('player');const step=path[Math.min(path.length,until-initial)-1];p.x=step.x;p.y=step.y;}}
  if(w.op.kind==='train'&&elapsedDays>0){touch('player');const productive=Math.min(elapsedDays,p.qi);p.xp+=productive*Math.max(1,skill(p,'basic'))*p.soul;p.qi-=productive;if(!p.qi)w.op.end=until;}


  const conflictDue=w.conflicts.some(f=>f.status==='active'&&f.next<=until),messageDue=w.messages.some(m=>['pending','waiting'].includes(m.status)&&m.due<=until);
  if(conflictDue)settleConflict(lifeContext());
  else if(messageDue)deliverMessage(lifeContext());
  const selected=conflictDue||messageDue||births.length?[]:due.filter(r=>Math.min(r.value.next,r.value.deathAt)<=until).slice(0,1);
  for(const r of selected){if(events.size>3||changed.size>3||w.appraisals.length>10)break;scheduleNpc(r,until);}
  for(const pr of w.promises.filter(pr=>pr.status==='open'&&pr.due<=until).slice(0,1)){
   pr.status='missed';const giver=row(pr.giver)?.value,receiver=row(pr.receiver)?.value;
   if(giver?.alive&&receiver?.alive)appraisal(receiver,giver,'trust',-12,receiver.name+'记得对方未在约定前交付。');history('missed',[pr.giver,pr.receiver],'约定到期未履行。');
  }
  const birth=!conflictDue&&!messageDue&&w.reservations.find(r=>r.due<=until);
  if(birth){
   causal.capture(birth.id,'birth',[birth.a,birth.b],'reservation:'+birth.id,'scene',true);
   w.reservations=w.reservations.filter(r=>r.id!==birth.id);const a=row(birth.a)?.value,b=row(birth.b)?.value;
   if(a?.alive&&b?.alive){const key='child-'+sha(birth.id).slice(0,36);newcomer={id:key,value:person(key,(a.name.slice(0,1)||'林')+'初'+sha(key).slice(0,4),a.home,'child',0,1,'unavailable')};
    newcomer.value.born=until;newcomer.value.parentA=birth.a;newcomer.value.parentB=birth.b;newcomer.value.ward=birth.a;newcomer.value.gold=0;newcomer.value.next=until+30*DAY;newcomer.value.deathAt=until+82*YEAR;admit=true;
    for(const parent of [birth.a,birth.b]){const relative=touch(parent);know(newcomer.value,{a:key,b:parent,kind:'family',place:relative.home,at:until,source:'birth:'+birth.id,confidence:'known'});know(relative,{a:parent,b:key,kind:'family',place:newcomer.value.home,at:until,source:'birth:'+birth.id,confidence:'known'});}
    const f=w.families.find(f=>[f.a,f.b].includes(birth.a)&&[f.a,f.b].includes(birth.b));if(f)f.children.push(key);history('birth',[birth.a,birth.b,key],'家庭迎来一名新生儿。');
    if([birth.a,birth.b].includes('player'))known(p,'family','家中孩子出生，抚养需要持续的粮食与照护。','家人');
   }else history('pregnancy_ended',[birth.a,birth.b],'家庭变故使原定的新生事件终止，预留名额释放。');
  }
  if(until>=w.nextMarket){for(const stock of w.stocks.filter(s=>s.qty<8)){const count=8-stock.qty,cost=Math.max(1,Math.floor(price(stock.item)/2))*count;if(stock.gold>=cost){stock.gold-=cost;stock.qty+=count;stock.quote++;w.consumedGold+=cost;}}w.nextMarket=until+30*DAY;history('supply',[],'定期商路带来补货，店铺按实际资金支付进货成本。');}
  if(!admit&&until>=w.nextImmigration){
   const live=rows.filter(r=>r.id!=='player'&&r.value.alive).length;
   if(live+w.reservations.length<Math.min(w.cap,POLICY.high)){
    const key='arrival-'+Math.floor(until/DAY),region=rows.filter(r=>r.value.alive&&r.value.home.startsWith('qingshan')).length<POLICY.regionalCap?'qingshan.inn':'wutan.inn';
    const day=Math.floor(until/DAY);newcomer={id:key,value:person(key,'行客'+day,region,'artisan',22+day%16,4,'reciprocal','外地迁入，寻求生计与安稳生活')};newcomer.value.born=until-(22+day%16)*YEAR;newcomer.value.next=until+7*DAY;newcomer.value.updated=until;newcomer.value.deathAt=until+50*YEAR;admit=true;history('immigration',[key],'一名有来历的成年行客迁入。');
   }w.nextImmigration=until+(rows.filter(r=>r.value.alive).length<POLICY.low?45:90)*DAY;
  }
  const backlog=w.releases.length||rows.some(r=>r.id!=='player'&&r.value.alive&&Math.min(r.value.next,r.value.deathAt)<=until)||w.reservations.some(r=>r.due<=until)||w.promises.some(r=>r.status==='open'&&r.due<=until)||w.messages.some(m=>['pending','waiting'].includes(m.status)&&m.due<=until)||w.conflicts.some(f=>f.status==='active'&&f.next<=until);
  if(w.op.kind&&until>=w.op.end&&!backlog){
   if(w.op.kind==='travel'){
    const who=touch('player');who.place=w.op.target;who.x=2;who.y=7;w.peoplePage=0;if(!who.visited.includes(who.place))who.visited.push(who.place);
    for(const key of w.companions){const c=touch(key);if(c?.alive){c.place=who.place;c.destination='';c.arriveAt=0;c.x=3;c.y=7;}}
    const risk=Number(w.op.detail)||0,roll=parseInt(sha(w.op.target+'|'+w.op.end+'|travel').slice(0,8),16)%100;
    if(risk&&roll<risk*10){const severity=Math.max(1,risk*15-Math.floor(who.rank/3));harm('player','left_leg',roll<risk*3?'fracture':'trauma',severity,'旅途中遇险');history('travel_risk',['player'],'旅途中遇险，按实力减轻伤势。');if(!who.hp)death('player','旅途伤势');}
    if(!w.known.includes(who.place))w.known.push(who.place);history('travel',['player'],who.name+'抵达'+(PLACES.find(s=>s.id===who.place)?.name||who.place));
   }else if(w.op.kind==='train'){touch('player');history('training',['player'],'完成一段修炼，积累由资质与功法决定。');}
   else if(w.op.kind==='rest'){touch('player');p.hp=100;p.qi=100;p.injury=Math.max(0,p.injury-10);}
   w.op={kind:'',target:'',end:0,detail:'',stopped:false};
  }
  if(backlog&&!w.op.kind)startOperation('catchup','',until);
  if(w.time>=p.deathAt&&p.alive)death('player',p.injury>=80?'伤势恶化':'寿尽');
 }
 function timed(ticks){if(ticks<=0)return;startOperation('action','',w.time+ticks);advance(w.time+ticks);}
 function adultPair(t){return age(p,w.time)>=18&&age(t,w.time)>=18&&t.preference!=='unavailable';}
 function social(kind,t){
  if(!near(t))return reject('out_of_reach','请先接近仍在此地的人物。');
  if(!capable(p,['care','treat','teach'].includes(kind)?'care':kind==='gift'?'grip':'communicate'))return false;
  if(kind==='talk'){
   if(!capable(t,'communicate'))return false;
   if(args.detail==='acknowledge'){
    if(!t.decision)return reject('reply_pending','对方还没有可接纳的回应。');
    const spoken=t.decision;touch(args.target);event(p,t.actor,'conversation',t.name+'说：'+spoken,t.name,'direct_message');event(t,p.actor,'said',spoken,t.name,'direct_message');
    if(t.choice!=='refuse'&&w.time-t.lastSocial>=7*DAY){appraisal(t,p,'affinity',2,t.name+'愿意继续与你了解彼此。');t.lastSocial=w.time;}
    t.decision='';t.choice='';say('npc_replied',spoken);return true;
   }
   if(!args.text.trim())return reject('empty_text','写下想对这位人物说的话。');
   const current=row(w.agenda.record);if(current?.value.chat)return reject('conversation_pending','已有一句话正在等待回应；可以等待，或结束等候后再开始交谈。');
   const key=args.target;touch(key);t.chat=args.text;t.decision='';t.choice='';w.agenda={actor:t.actor,record:key,due:w.time};
   event(t,p.actor,'heard',args.text,p.name,'direct_message');
   say('awaiting_npc','话已带到，等待对方回应。');timed(5);return true;
  }
  if(kind==='gift'){
   const n=args.qty;if(!n||qty(p,args.item)<n)return reject('insufficient_items','没有足够物品。');
   touch('player');touch(args.target);add(p,args.item,-n);add(t,args.item,n);
   const meaningful=t.injury>10&&args.item==='medicine'||args.item==='food'&&qty(t,'food')<5;
   if(meaningful&&w.time-t.lastSocial>=DAY){appraisal(t,p,'trust',5,t.name+'记得收到急需的帮助。');t.lastSocial=w.time;}
   history('gift',['player',args.target],'物品已赠与，礼物不自动换取亲密或同意。');say('gifted','物品已交到对方手中。');timed(5);return true;
  }
  if(kind==='invite'){
   if(!capable(t,'move'))return false;
   if(level(t,p)<10||t.injury>30||qty(p,'food')<2)return reject('npc_refused','对方顾虑准备、信任或自身状况，拒绝同行。');
   if(w.companions.includes(args.target))return reject('already_invited','对方已在同行安排中。');if(w.companions.length>=4)return reject('party_full','目前的补给安排不能再接纳同行者。');
   touch('player');touch(args.target);add(p,'food',-2);add(t,'food',2);w.companions.push(args.target);t.plan='与'+p.name+'约定同行';known(p,'companion',t.name+'愿意同行，仍保留自己的安排。',t.name);say('agreed','对方答应了同行提议，补给已经交付。');timed(10);return true;
  }
  if(kind==='care'){
   if(t.injury<10&&!(t.role==='child'&&qty(t,'food')<4))return reject('care_unneeded','对方目前不需要这类照护。');
   if(t.injury>=10&&qty(p,'medicine')<1)return reject('care_materials','照护这项伤势需要疗伤散。');
   if(t.injury<10&&qty(p,'food')<2)return reject('care_materials','照护孩子需要两份干粮。');
   if(qty(p,'medicine')<1&&qty(p,'food')<2)return reject('care_materials','照护需要疗伤散或两份干粮。');
   touch('player');touch(args.target);if(qty(p,'medicine')&&t.injury>=10){add(p,'medicine',-1);treatCondition(t,'medicine',w.time);}else{add(p,'food',-2);add(t,'food',2);}
   p.interaction={kind:'care',target:args.target,place:p.place,at:w.time,source:'care:'+sha(args.target+'|'+w.time).slice(0,32),relation:''};
   appraisal(t,p,'trust',12,t.name+'记得你实际投入物资的照护。');appraisal(p,t,'affinity',4,'照护使你更了解对方的生活。');
   const witness=rows.find(r=>r.value.alive&&r.value.place===t.place&&[r.value.parentA,r.value.parentB].includes(args.target));if(witness){appraisal(witness.value,p,'trust',6,witness.value.name+'看见你实际照护了家人。');appraisal(witness.value,p,'affinity',4,'实际照护家人的经历使彼此亲近。');}say('cared','照护已结算。');timed(60);return true;
  }
  if(kind==='promise'){
   if(args.item!==t.needitem||args.qty!==t.needqty||t.needqty<1||w.promises.some(pr=>pr.receiver===args.target&&pr.status==='open')||w.promises.filter(x=>x.status==='open').length>=16)return reject('invalid_promise','请明确所需物品与数量；当前约定也可能过多。');
   const pr={id:'promise-'+w.serial,giver:'player',receiver:args.target,item:args.item,qty:args.qty,due:w.time+Math.max(1,Number(args.detail)||7)*DAY,status:'open'};w.promises.push(pr);say('promised','约定已记下，期限内可以履行，也可能失约。');timed(5);return true;
  }
  if(kind==='deliver'){
   const pr=w.promises.find(x=>x.receiver===args.target&&x.giver==='player'&&x.status==='open');
   if(!pr||qty(p,pr.item)<pr.qty)return reject('delivery_unavailable','没有可履行的约定或物资不足。');
   touch('player');touch(args.target);add(p,pr.item,-pr.qty);add(t,pr.item,pr.qty);pr.status='fulfilled';t.needqty=Math.max(0,t.needqty-pr.qty);
   if(pr.item==='medicine'){const patient=row(t.parentA)?.value?.injury>0?touch(t.parentA):t;if(patient.injury>0){add(t,'medicine',-1);treatCondition(patient,'medicine',w.time);}}
   appraisal(t,p,'trust',15,t.name+'记得你如期履约。');appraisal(t,p,'affinity',6,'相处中多了一次可靠的经历。');say('fulfilled','物资与约定一并结清。');timed(10);return true;
  }
  if(['confess','engage','marry','conceive','separate'].includes(kind)){
   if(!adultPair(t))return reject('adult_relationship_required','这项共同生活提议只对合适的成年人物开放。');
   if(kind==='separate'){
    if(p.partner!==args.target)return reject('not_partners','双方没有婚姻关系。');touch('player');touch(args.target);p.partner='';t.partner='';for(const f of w.families.filter(f=>f.a==='player'||f.b==='player'))f.status='separated';history('separation',['player',args.target],'双方分离，亲属与共同经历保留。');say('separated','共同生活结束，已有子女与过去事实仍然存在。');timed(60);return true;
   }
   if(t.partner&&t.partner!=='player'||p.partner&&p.partner!==args.target)return reject('existing_commitment','已有伴侣与共同义务使对方不愿接受。');
   if(level(t,p)<25||level(t,p,'affinity')<10)return reject('npc_refused','对方尚未形成接受这项提议的意愿。');
   if(kind==='confess'){known(p,'relationship',t.name+'愿意认真了解你的心意，尚不等于婚约。',t.name);say('affection_received','对方愿意继续相处。');timed(30);return true;}
   if(kind==='engage'){if(!w.promises.some(pr=>pr.item==='engagement'&&pr.receiver===args.target&&pr.status==='open'))w.promises.push({id:'engagement-'+w.serial,giver:'player',receiver:args.target,item:'engagement',qty:1,due:w.time+90*DAY,status:'open'});say('engaged','双方同意商议住处、谋生与家庭安排。');timed(60);return true;}
   if(kind==='marry'){
    const bet=w.promises.find(pr=>pr.item==='engagement'&&pr.receiver===args.target&&pr.status==='open');
    if(!bet||p.gold<60||qty(p,'food')<8)return reject('household_unready','需要双方婚约、六十金币与八份干粮来建立生活。');
    touch('player');touch(args.target);p.gold-=60;add(p,'food',-8);p.partner=args.target;t.partner='player';t.home=p.home;bet.status='fulfilled';
    w.families.push({id:'family-'+w.serial,a:'player',b:args.target,home:p.home,gold:60,food:8,status:'active',children:[]});history('marriage',['player',args.target],'双方在协商后建立家庭。');say('married','共同居所与家庭物资已经建立。');timed(120);return true;
   }
   if(kind==='conceive'){
    const live=rows.filter(r=>r.id!=='player'&&r.value.alive).length;
    if(p.partner!==args.target||t.partner!=='player'||p.sex===t.sex||t.injury>20||p.injury>20||age(t,w.time)>45||w.reservations.some(r=>[r.a,r.b].includes('player')))return reject('family_conditions','双方意愿、婚姻、年龄或身体条件不允许安排生育。');
    const f=w.families.find(f=>f.status==='active'&&(f.a==='player'||f.b==='player'));
    if(!f||f.gold<90||f.food<20)return reject('family_supplies','家庭需要九十金币与二十份干粮的准备。');
    if(live+w.reservations.length>=w.cap)return reject('population_wait','当前世界条件暂不接纳新的生育安排，尚未宣布怀孕或出生。');
    f.gold-=30;w.consumedGold+=30;w.reservations.push({id:'birth-'+w.serial,a:'player',b:args.target,due:w.time+POLICY.gestationDays*DAY});history('pregnancy',['player',args.target],'双方商议后安排养育，新生名额已预留。');say('pregnancy','家庭进入养育准备，过程有持续时间与生活后果。');timed(30);return true;
   }
  }
  if(kind==='teach'){
   if(![t.parentA,t.parentB,t.ward].includes('player')||age(t,w.time)<6||!skill(p,args.item))return reject('teaching_conditions','需要监护关系、孩子年龄与自己已掌握的技艺。');
   touch(args.target);learn(t,args.item);appraisal(t,p,'respect',6,t.name+'记得你投入时间传授自己掌握的技艺。');appraisal(p,t,'respect',4,'你看见孩子在有条件的学习中进步。');say('taught','一次有条件的传授已经完成。');timed(DAY);return true;
  }
  return reject('unknown_social','这项提议尚无可执行规则。');
 }
 function act(a){
  const saveArgs=copy(args);Object.assign(args,a);const done=()=>Object.assign(args,saveArgs);
  const t=target(),kind=args.kind;
  if(!KINDS.includes(kind)){reject('unsupported','这个意图还不能由现有规则执行。');done();return;}
  if(kind==='browse'){if(args.detail==='clues')w.cluesPage=args.qty;else w.peoplePage=args.qty;say('browsed','已读取玩家已知记录页，世界时间不变。');done();return;}
  if(kind==='recall'){const entry=memories.find(r=>r.id===args.target&&r.value.actor===PLAYER&&r.value.kind!=='person');if(entry)say('recalled',entry.value.text);else reject('unknown_record','没有这条已知记录。');done();return;}
  if(kind==='condition'){say('condition_read','身体详情已更新：'+p.condition.wounds.length+'处持续伤病，'+p.condition.missing.length+'处肢体缺失；各项行动限制见身体详情。');done();return;}
  if(kind==='profile'){say('profile_read','人物详情已更新，可查看身体、器物、当前活动、本人所知的关系与目标。');done();return;}
  if(!p.alive){reject('player_dead','主角已死亡，可以读取整个世界的存档。');done();return;}
  if((w.op.kind||w.appraisals.length||w.plan.length&&!executingPlan)&&!['continue','cancel','clarify'].includes(kind)){reject('activity_pending','先继续或停止当前长期活动。');done();return;}
  if(kind==='clarify'){say('clarification',args.text.slice(0,256)||'请明确对象和一个可结算的打算。');done();return;}
  if(kind==='create'){
   const bg=BACKGROUNDS.find(x=>x.id===args.target);
   if(w.created||!bg||!['native','transmigrator'].includes(args.detail)||!args.text.trim()||args.text.length>48||args.item&&!['male','female'].includes(args.item)){reject('creation_invalid','请提供未创建的新局、有效出身、本土或穿越身份与姓名。');done();return;}
   touch('player');w.created=true;w.origin=args.detail;w.background=bg.id;p.name=args.text.trim();p.sex=args.item==='female'?'female':'male';p.home=bg.place;p.place=bg.place;p.rank=bg.rank;p.gold=bg.gold;p.fire=bg.fire;p.wood=bg.wood;p.soul=bg.soul;p.visited=[bg.place,'person:'+bg.contact];
   if(bg.id==='apprentice'){learn(p,'refining');learn(p,'formula');}if(bg.id==='mercenary')learn(p,'palm');
   known(p,'rumor',START_KNOWLEDGE[1].text,START_KNOWLEDGE[1].source,'rumor');
   if(w.origin==='transmigrator')known(p,'novel_memory',START_KNOWLEDGE[0].text,START_KNOWLEDGE[0].source,'inference');
   const c=row(bg.contact).value;know(p,{a:'player',b:bg.contact,kind:'contact',place:c.place,at:w.time,source:'creation:background',confidence:'known'});event(p,c.actor,'person',JSON.stringify(observePerson(bg.contact,c,w.time)),'出身联系');appraisal(c,p,'trust',8,c.name+'知道你的出身与最初联系。');history('creation',['player',bg.contact],p.name+'以'+bg.name+'身份开始生活。');say('created','已进入'+PLACES.find(s=>s.id===p.place).name+'。');done();return;
  }
  if(!w.created){reject('creation_required','先创建自己的角色。');done();return;}
  if(kind==='continue'){
   if(w.appraisals.length){settleAppraisals();done();return;}
   if(!w.op.kind&&w.plan.length){runPlanStep();done();return;}
   if(!w.op.kind){reject('no_activity','没有待推进的活动。');done();return;}
   advance(w.op.end);if(accepted)say(w.op.kind?'advancing':'completed',w.op.kind?'已推进一段世界事件，可以继续或停止。':'这段活动已经完成。');done();return;
  }
  if(kind==='cancel'){
   const repairCancelled=cancelRepairs(lifeContext(),'player');
   const waiting=row(w.agenda.record);
   if(!w.op.kind&&!w.plan.length&&!w.appraisals.length&&waiting?.value.chat){touch(waiting.id);waiting.value.chat='';w.agenda={actor:'',record:'',due:0};say('conversation_cancelled','已结束等候；已经说出的话仍保留在对方经历中。');done();return;}
   if(repairCancelled&&!w.op.kind&&!w.plan.length&&!w.appraisals.length){say('repair_cancelled','尚未完成的维修已停止，未使用的工料已退回。');done();return;}
   result.partial=w.planResults.some(r=>r.accepted);
   if(w.plan.length){w.plan=[];result.partial=w.planResults.some(r=>r.accepted);if(!w.op.kind&&!w.appraisals.length){say('stopped','剩余步骤已停止，已结算的步骤保留。');done();return;}}
   if(!w.op.kind&&w.appraisals.length){say('settling','交往已经发生，将先结清个人评价。');done();return;}
   if(!w.op.kind){reject('no_activity','没有可停止的活动。');done();return;}
   const due=rows.some(r=>r.id!=='player'&&r.value.alive&&Math.min(r.value.next,r.value.deathAt)<=w.time);
   w.op=due?{kind:'catchup',target:'',end:w.time,detail:'',stopped:true}:{kind:'',target:'',end:0,detail:'',stopped:true};
   say('stopped',due?'后续计划已停止，正在结清当前时点已到期的事件。':'后续计划已停止，已发生的时间与后果保留。');done();return;
  }
  if(w.combat.enemy&&!['attack','technique','guard','retreat','surrender','consume'].includes(kind)){reject('in_combat','交锋中先应对当前阶段或尝试脱离。');done();return;}
  if(kind==='treat'){
   const patient=args.target==='player'?p:t,healer=rows.find(r=>r.id!=='player'&&near(r.value)&&skill(r.value,'healing')&&!capabilities(r.value).care&&['','rest'].includes(r.value.activity.kind));
   if(!patient||patient!==p&&!near(patient)||!healer||qty(p,'herb')<2||p.gold<12){reject('treatment_conditions','需要接近能够接诊的医者、两份药草和十二金币；病人也须在可接触范围。');done();return;}
   const wound=patient.condition.wounds.find(w=>(!args.detail||w.id===args.detail)&&w.kind==='fracture'&&w.treatedAt<0);
   if(!wound){reject('treatment_unavailable','医者检查后没有可进行这项指定处置的伤处。');done();return;}
   if(!capable(p,'communicate')){done();return;}
   causal.capture('treatment-'+sha(wound.id+'|'+w.time).slice(0,40),'treatment',['player',args.target,healer.id],wound.source);
   touch('player');touch(args.target);touch(healer.id);add(p,'herb',-2);p.gold-=12;healer.value.gold+=12;
   treatCondition(patient,'splint',w.time,wound.id);history('treatment',['player',args.target,healer.id,wound.id],'医者已对指定伤处进行处置，恢复仍需游戏时间与生活条件。');
   event(patient,'','condition','医者已处置'+conditionDetail(patient).wounds.find(w=>w.id===wound.id).symptom,healer.value.name);
   say('treated','医者完成指定处置，恢复过程已开始，不会立即恢复行动能力。');timed(60);done();return;
  }
  if(['talk','gift','invite','care','promise','deliver','confess','engage','marry','conceive','separate','teach'].includes(kind)){social(kind,t);done();return;}
  const required={move:'move',approach:'move',travel:'move',work:'work',train:'train',learn:'learn',breakthrough:'breakthrough',refine:'refine',gather:'gather',claim:'gather',attack:'attack',technique:'technique',guard:'grip',retreat:'retreat',consume:'grip',equip:'grip',repair:'communicate',message:'communicate',release:'communicate'}[kind];
  if(required&&!capable(p,required)){done();return;}
  if(kind==='release'){
   if(!t?.alive||t.control.holder!=='player'||!near(t)){reject('release_unavailable','只能解除自己实际控制且仍在身边的对象。');done();return;}
   touch(args.target);t.control=freeControl();t.next=w.time;history('released',['player',args.target],'拘束已实际解除。');say('released','对象的行动限制已重新计算。');done();return;
  }
  if(kind==='message'){
   const contact=p.social.find(e=>e.b===args.target&&e.confidence!=='refuted');
   if(!contact||!args.text.trim()||!sendMessage(lifeContext(),'player',args.target,'letter','player',args.text,'player:'+w.time,contact.place)){reject('message_unavailable','没有可用的已知联系地址、邮资或信件空位。');done();return;}
   say('message_sent','信件已寄出，尚未送达或获得答复。');timed(5);done();return;
  }
  if(kind==='equip'){
   const g=p.gear.find(g=>g.id===args.target);if(!g){reject('equipment_unavailable','没有持有这件器物。');done();return;}
   touch('player');if(args.detail==='remove')g.equipped=false;else{for(const other of p.gear)if(other.slot===g.slot)other.equipped=false;g.equipped=true;}say('equipment_changed','器物穿戴已更新，效果依据实际状态计算。');done();return;
  }
  if(kind==='repair'){
   const artisan=rows.find(r=>r.id!=='player'&&near(r.value)&&r.value.role==='artisan'&&!capabilities(r.value).care&&['','rest','work'].includes(r.value.activity.kind));
   if(!reserveRepair(lifeContext(),'player',args.target,artisan)){reject('repair_unavailable','需要接近能接修的工匠、受损器物、一份药草和六枚金币。');done();return;}
   say('repair_started','工匠已接修并预留工料，完成前不能再接另一份工作。');timed(180);done();return;
  }
  if(kind==='move'||kind==='approach'){
   let to={x:args.x,y:args.y};
   if(kind==='approach'){
    if(!t?.alive||t.place!==p.place){reject('target_stale','目标已经不在此处或不能接近。');done();return;}
    const cells=[[t.x-1,t.y],[t.x+1,t.y],[t.x,t.y-1],[t.x,t.y+1]].map(([x,y])=>pathTo(p.place,p,{x,y})).filter(Boolean).sort((a,b)=>a.length-b.length);
    if(!cells.length){reject('path_blocked','找不到可达的接近路线。');done();return;}to=cells[0].at(-1)||{x:p.x,y:p.y};
   }
   const path=pathTo(p.place,p,to);if(!path){reject('path_blocked','落点或路线被阻挡。');done();return;}
   touch('player');if(kind==='approach'&&!p.visited.includes('person:'+args.target))p.visited.push('person:'+args.target);if(path.length){startOperation('move',kind==='approach'?args.target:'',w.time+path.length,to.x+','+to.y);advance(w.op.end);}say(w.op.kind?'moving':'moved',w.op.kind?'已经走完的路程保留，可以继续或停止。':'沿可达路线抵达。');done();return;
  }
  if(kind==='travel'){
   const r=ROUTES.find(r=>r.from===p.place&&r.to===args.target);
   if(!r||!w.known.includes(args.target)){reject('route_unavailable','当前位置没有已知可用路线通往那里。');done();return;}
   if(p.injury>60||qty(p,'food')<Math.floor(r.ticks/DAY)){reject('travel_unprepared','伤势过重或干粮不足，请先准备。');done();return;}
   w.companions=w.companions.filter(key=>{const c=row(key)?.value;return c?.alive&&c.place===p.place&&!capabilities(c).move&&c.injury<=30&&qty(c,'food')>=Math.floor(r.ticks/DAY);});
   startOperation('travel',r.to,w.time+r.ticks,String(r.risk));advance(w.op.end);say(w.op.kind?'travelling':'arrived',w.op.kind?'旅途已开始，世界事件正在沿时间顺序推进。':'抵达目的地。');done();return;
  }
  if(kind==='wait'||kind==='train'||kind==='rest'){
   const days=args.qty||1;if(kind==='train'&&(p.injury>40||!skill(p,'basic')||p.qi<1)){reject('training_conditions','伤势、斗气或功法条件不允许当前修炼。');done();return;}
   startOperation(kind,'',w.time+days*DAY,String(days));advance(w.op.end);say(w.op.kind?'advancing':'completed',w.op.kind?'这段活动已推进部分时间。':'活动完成。');done();return;
  }
  if(kind==='work'){
   if(p.injury>60){reject('work_injury','当前伤势不适合做工。');done();return;}
   if(args.qty>0){startOperation('work','',w.time+args.qty*DAY);advance(w.op.end);say(w.op.kind?'advancing':'worked','长期谋生按已发生的时间取得报酬并维持生活。');done();return;}
   touch('player');p.gold+=6;w.producedGold+=6;history('production',['player'],'完成半日劳动，获得六金币报酬。');timed(DAY/2);say('worked','做工所得已经入账。');done();return;
  }
  if(kind==='buy'||kind==='sell'){
   const quote=w.stocks.find(s=>s.place===p.place&&s.item===args.item),n=args.qty;
   if(!quote||!price(args.item)||!n){reject('trade_unavailable','此处没有该物品的有效报价。');done();return;}
   if(String(quote.quote)!==args.detail){reject('quote_changed','提交的报价标识与当前记录不匹配，本次没有交易；请按当前报价重试。');done();return;}
   const cost=price(args.item)*n,paid=kind==='sell'?Math.floor(cost*0.6):cost;
   if(kind==='buy'&&(quote.qty<n||p.gold<cost)||kind==='sell'&&(qty(p,args.item)<n||quote.gold<paid)){reject('insufficient_resources','货物、金币或商家可付款额度不足。');done();return;}
   touch('player');if(kind==='buy'){p.gold-=cost;quote.gold+=cost;quote.qty-=n;add(p,args.item,n);}else{p.gold+=paid;quote.gold-=paid;quote.qty+=n;add(p,args.item,-n);}quote.quote++;const trade=(kind==='buy'?'购入':'售出')+n+'份'+args.item+'，'+(kind==='buy'?'支付':'收到')+paid+'枚金币。';history('trade',['player'],trade);say('traded',trade);timed(10);done();return;
  }
  if(kind==='allocate'){
   const f=w.families.find(f=>f.id===args.target&&(f.a==='player'||f.b==='player')&&f.status!=='separated');
   if(!f||!args.qty||args.item!=='gold'&&args.item!=='food'){reject('household_unavailable','请选择自己的家庭及金币或干粮。');done();return;}
   if(args.detail==='withdraw'){
    if((args.item==='gold'?f.gold:f.food)<args.qty){reject('household_shortage','共同物资不足。');done();return;}
    touch('player');if(args.item==='gold'){f.gold-=args.qty;p.gold+=args.qty;}else{f.food-=args.qty;add(p,'food',args.qty);}
   }else{
    if((args.item==='gold'?p.gold:qty(p,'food'))<args.qty){reject('insufficient_resources','自己没有足够物资。');done();return;}
    touch('player');if(args.item==='gold'){p.gold-=args.qty;f.gold+=args.qty;}else{add(p,'food',-args.qty);f.food+=args.qty;}
   }say('allocated','个人与共同物资已核对分配。');timed(5);done();return;
  }
  if(['learn','breakthrough','refine','consume'].includes(kind)){
   if(kind==='learn'){
    const mapped={manual:'basic',technique:'palm',formula:'formula'},id=mapped[args.item];
    if(!id||qty(p,args.item)<1||p.injury>40){reject('learning_conditions','缺少秘籍或当前伤势不适合学习。');done();return;}
    touch('player');learn(p,id);if(id==='formula'&&p.fire>=3&&p.wood>=1&&p.soul>=3)learn(p,'refining');timed(DAY);say('learned','秘籍已学习，运用仍受修为和资源限制。');
   }else if(kind==='breakthrough'){
    const need=p.rank*30;if(p.rank>=19||p.xp<need||p.injury>20||p.qi<40){reject('breakthrough_conditions','积累、伤势或斗气不满足条件；本版本可玩到斗师阶段。');done();return;}
    touch('player');p.xp-=need;p.qi-=40;p.rank++;p.deathAt=Math.max(p.deathAt,w.time+(p.rank>=10?110:82)*YEAR);history('growth',['player'],'主角突破一个阶段。');timed(DAY);say('advanced','突破已结算。');
   }else if(kind==='refine'){
    if(p.fire<3||p.wood<1||p.soul<3||!skill(p,'formula')||!skill(p,'refining')||qty(p,'herb')<2||p.qi<20){reject('refining_conditions','炼药需要火中带木、灵魂、已学丹方与控火、两份药草和斗气。');done();return;}
    touch('player');add(p,'herb',-2);p.qi-=20;const roll=parseInt(sha(seed+'refine').slice(0,8),16)%100;
    if(roll<65+p.soul*3){add(p,'medicine',1);learn(p,'refining');say('refined','炼得一份基础疗伤散。');}else say('refining_failed','火候失控，材料与斗气已消耗。');timed(180);
   }else{
    if(args.item!=='medicine'||qty(p,'medicine')<1){reject('medicine_unavailable','没有可服用的疗伤散。');done();return;}
    if(w.time-p.lastMedicine<60){reject('medicine_interval','药效尚在作用，暂时不能再次服用。');done();return;}
    touch('player');add(p,'medicine',-1);p.lastMedicine=w.time;treatCondition(p,'medicine',w.time);history('medicine',['player'],'服用基础疗伤散，不会复原缺失部位或治愈未经指定处置的骨折。');timed(5);say('consumed','疗伤散按实际伤势生效。');
   }done();return;
  }
  if(['investigate','gather','claim'].includes(kind)){
   if(kind==='investigate'){
    if(p.place.startsWith('mountain')){known(p,'opportunity',p.place==='mountain.valley'?'药谷中有赤叶药材的生境，留意采集者的行踪。':'外缘支洞有前人修炼札记的线索，需要调查入口。','现场足迹');
     if(!w.known.includes('mountain.valley'))w.known.push('mountain.valley');if(!w.known.includes('mountain.cave'))w.known.push('mountain.cave');
     if(p.place==='mountain.cave')w.unique.find(u=>u.id==='relic').status=w.unique.find(u=>u.id==='relic').status==='sealed'?'available':w.unique.find(u=>u.id==='relic').status;
    }else known(p,'opportunity','青山镇的采药者谈起药谷的赤叶药材；传闻可能过时，竞争者会自行出发。','消息栏','rumor');say('investigated','记录了当前所得的线索与来源。');timed(30);done();return;
   }
   if(!p.place.startsWith('mountain')){reject('gather_location','需要进入实际的山中生境。');done();return;}
   if(kind==='gather'&&args.item==='herb'){const e=ecologicalStock(w,p.place,w.time);if(!e?.herbs){reject('resource_depleted','此地药草需要时间恢复。');done();return;}touch('player');e.herbs--;add(p,'herb',1);history('production',['player'],'从有限药草生境采得一份药草。');timed(120);say('gathered','采得一份普通药草。');done();return;}
   const id=kind==='claim'?'relic':'redleaf',place=id==='relic'?'mountain.cave':'mountain.valley',u=w.unique.find(u=>u.id===id);
   if(p.place!==place||u.status!=='available'||u.owner){reject('opportunity_gone','此处机会不满足条件，可能已经被别人取得。');done();return;}
   if(p.rank<6||p.injury>40){reject('exploration_conditions','当前实力或伤势不足以安全取得这份资源。');done();return;}
   touch('player');u.owner='player';u.status='claimed';add(p,id,1);known(p,'opportunity',id==='relic'?'亲自取得支洞修炼札记。':'亲自采得赤叶药材。','现场');history('opportunity',['player'],'取得'+id+'的唯一归属。');timed(180);say('claimed','资源归属已确定，不会因失败或离开重刷。');done();return;
  }
  if(['attack','technique','guard','retreat','surrender'].includes(kind)){
   const enemy=row(w.combat.enemy||args.target)?.value,key=w.combat.enemy||args.target;
   if(!near(enemy)){reject('combat_target_stale','目标已不在交锋距离内。');done();return;}
   if(kind==='technique'&&(!skill(p,'palm')||p.qi<15)){reject('technique_conditions','未掌握碎石掌或斗气不足。');done();return;}
   touch('player');touch(key);
   if(kind==='surrender'){const paid=Math.floor(p.gold/4);p.gold-=paid;enemy.gold+=paid;w.combat={enemy:'',round:0,guard:false};history('surrender',['player',key],'主角放弃交锋并付出财物。');timed(5);say('surrendered','对方收下财物，交锋结束。');done();return;}
   if(kind==='retreat'){
    const success=p.rank+4>=enemy.rank||w.combat.guard||!!capabilities(enemy).move;
    if(success){p.x=2;p.y=7;w.combat={enemy:'',round:0,guard:false};say('retreated','成功脱离当前交锋。');}
    else{p.hp=Math.max(0,p.hp-Math.max(4,enemy.rank-p.rank));p.injury=Math.min(100,p.injury+5);say('retreat_failed','撤退受阻，受到追击。');}
   }else{
    w.combat.enemy=key;w.combat.round++;w.combat.guard=kind==='guard';
    if(kind!=='guard'){const damage=Math.max(1,p.rank*2+skill(p,'palm')*(kind==='technique'?4:1)-enemy.rank);
     enemy.hp=Math.max(0,enemy.hp-damage);enemy.injury=Math.min(100,enemy.injury+Math.floor(damage/3));if(kind==='technique')p.qi-=15;
     appraisal(enemy,p,'trust',-20,enemy.name+'亲历了你的攻击。');}
    if(!enemy.hp){death(key,'交锋重伤');w.combat={enemy:'',round:0,guard:false};say('enemy_died','对方死亡，物资、家庭与约定按后果处理。');}
    else{const counter=capabilities(enemy).attack?0:Math.max(1,enemy.rank*2-p.rank-(w.combat.guard?8:0));p.hp=Math.max(0,p.hp-counter);p.injury=Math.min(100,p.injury+Math.floor(counter/3));say('combat_round','一段交锋已经结算。');}
   }
   if(!p.hp)death('player','交锋重伤');timed(5);done();return;
  }
  reject('unsupported','这个意图暂不能由现有规则执行。');done();
 }
 return execute();
 function runPlanStep(){
  const step=w.plan.shift(),before=result.spent;executingPlan=true;accepted=true;
  act({...step,text:w.planText,steps:[]});executingPlan=false;
  w.planResults.push({kind:step.kind,code:result.code,text:result.text,spent:result.spent-before,accepted});
  if(!accepted){result.partial=w.planResults.slice(0,-1).some(r=>r.accepted);w.plan=[];}
 }
 function execute(){
  const requested=copy(args); // assigned to a local mutable binding by compute wrapper
  const continuingStep=args.kind==='continue'&&w.op.kind&&w.planResults.length>0&&!w.appraisals.length;
  w.serial++;
  if(args.steps.length){
   if(w.op.kind||w.appraisals.length||w.plan.length)reject('activity_pending','先继续或停止当前活动。');
   else{w.plan=copy(args.steps);w.planText=args.text;w.planResults=[];runPlanStep();}
  }else{if(!['continue','cancel','browse','recall','condition','profile'].includes(args.kind))w.planResults=[];act(requested);}
  if(continuingStep){const step=w.planResults[w.planResults.length-1];step.spent+=result.spent;step.code=result.code;step.text=result.text;}
  result.steps=copy(w.planResults);
  const seen=row(requested.target);if(seen&&seen.id!=='player'&&near(seen.value)&&p.visited.includes('person:'+seen.id)&&events.size<6)event(p,seen.value.actor,'person',JSON.stringify(observePerson(seen.id,seen.value,w.time)),'现场');
  planRelations();
  for(const u of w.unique){const owners=rows.filter(r=>qty(r.value,u.id)>0);if(owners.reduce((n,r)=>n+qty(r.value,u.id),0)>1)throw Error('unique duplicate');if(owners.length)u.owner=owners[0].id;}
  const mindUpdates=[];
  for(const r of changed.values()){
   r.value.health=conditionAwareness(r.value);
   r.value.speechReady=!capabilities(r.value).communicate;
   if(loadedMinds.has(r.id)){
    const mind=Object.fromEntries(MIND_FIELDS.map(key=>[key,r.value[key]]));
    if(canonical(mind)!==canonical(loadedMinds.get(r.id)))mindUpdates.push({id:r.id,value:{mind}});
   }else if(canonical(Object.fromEntries(MIND_FIELDS.map(key=>[key,r.value[key]])))!==canonical(unknownMind))throw Error('ungranted personal cognition mutation');
  }
  if(mindUpdates.length>4)throw Error('bounded cognition resolution capacity');
  if(changed.size>6||events.size>6||relUpdates.size>2)throw Error('bounded resolution capacity');
  result.at=w.time;if(admit&&!w.op.kind)startOperation('refresh','',w.time);
  const actualRows=rows;
  const causalUpdates=causal.finish(newcomer?[newcomer]:[]);
  const visible=project(w,actualRows,memories,result);
  const admission=newcomer?.value||emptyPerson();
  return {world:packWorld(w),people:[...changed.values()].map(r=>{const packed=packPerson(r.value);return {id:r.id,value:{actor:packed.actor,alive:packed.alive,state:{body:packed.state.body,health:packed.state.health}}};}),minds:mindUpdates,causes:causalUpdates,relations:[...relUpdates.values()],information:[...events.values()],
   view:JSON.stringify(visible),intent:intentProjection(visible),ticks:w.time-reads.game.state.time,admit,newPerson:{id:newcomer?.id||'none',value:Object.fromEntries(NEW_PERSON_FIELDS.map(key=>[key,admission[key]]))},
   personCount:changed.size,mindCount:mindUpdates.length,causeCount:causalUpdates.length,relationCount:relUpdates.size,informationCount:events.size};
 }
}
export default {
 precondition(){return true;},
 compute(input){return run({...input,args:copy(input.args)});},
 invariant({reads}){
  const people=reads.population.records,live=people.filter(r=>r.id!=='player'&&r.value.alive).length;
  return live+reads.game.state.reservations.length<=reads.game.state.cap&&new Set(people.map(r=>r.id)).size===people.length;
 }
};
