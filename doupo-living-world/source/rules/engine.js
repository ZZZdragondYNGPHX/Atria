import {BACKGROUNDS,PLACES,ROUTES,PLAYER,DAY,YEAR,POLICY,KINDS,START_KNOWLEDGE} from '../content/catalog.js';
import {copy,qty,add,skill,learn,age,record,price,person,infoItem} from './state.js';
import {packPerson,unpackPerson,packWorld,unpackWorld} from './records.js';
import {project,pathTo} from './projection.js';
import {contentSha256 as sha,canonical} from './hash.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const emptyPerson=()=>person('none','未入场','wutan.inn','none',20,1,'unavailable');
const zero='0'.repeat(64);
const authorMeta=seed=>({origin:'author',invocationId:seed,taskId:'doupo.rules',variantId:'v1',profileId:'doupo.social',profileRevision:'v1',modelProfileId:'rules',modelProfileHash:zero,requestSnapshotHash:zero,previousHash:zero,promptId:'rules',promptRevision:'v1',generationId:'rules',generationRevision:'v1'});
export const blankRelation=()=>({actor:PLAYER,target:'sub_'+zero.slice(0,32),dimension:'trust',level:0,status:'active',text:'尚未交往',rationale:'规则基线',basis:{viewId:'personal',anchor:{sessionId:'ses_'+zero.slice(0,32),packageVersionId:'pkgv_'+zero.slice(0,32),revisionId:'rev_'+zero.slice(0,32),branchId:'br_'+zero.slice(0,32),scopeEpochs:{session:0}},sourceRefs:[]},appraisal:authorMeta('initial')});
export const blankInfo=()=>({actor:PLAYER,target:'',status:'known',channel:'witnessed',kind:'event',text:'',at:0,source:'规则'});
function run(input){
 const {reads,seed,anchor}=input,args=copy(input.args),w=unpackWorld(copy(reads.game)),rows=reads.people.records.map(r=>({id:r.id,value:unpackPerson(copy(r.value))})),relations=copy(reads.relations.records),memories=copy(reads.personal.records);
 const changed=new Map(),events=new Map(),relUpdates=new Map(),p=rows.find(r=>r.id==='player').value;
 let result={code:'ok',text:'',spent:0,at:w.time},newcomer=null,admit=false;
 const row=key=>rows.find(r=>r.id===key),touch=key=>{const r=row(key);if(r)changed.set(key,r);return r?.value;};
 const say=(code,text)=>{result.code=code;result.text=text;};
 const reject=(code,text)=>{say(code,text);return false;};
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
  const pending=w.appraisals.splice(0,4);
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
 const near=t=>t&&t.alive&&t.place===p.place&&Math.abs(t.x-p.x)+Math.abs(t.y-p.y)<=2;
 const target=()=>row(args.target)?.value;
 const known=(who,kind,text,source,channel='told_by')=>event(who,'',kind,text,source,channel);
 const history=(kind,refs,text)=>record(w,kind,refs,text);
 function death(key,cause){const d=touch(key);if(!d?.alive)return;d.alive=false;d.hp=0;d.plan='已故：'+cause;w.combat.enemy=w.combat.enemy===key?'':w.combat.enemy;
  history('death',[key],d.name+'因'+cause+'死亡。');
  const kin=rows.filter(r=>r.value.alive&&(r.value.partner===key||r.value.parentA===key||r.value.parentB===key));
  const heir=kin.sort((a,b)=>a.id.localeCompare(b.id))[0];
  if(heir){const h=touch(heir.id);h.gold+=d.gold;d.gold=0;for(const inv of d.inventory){add(h,inv.item,inv.qty);inv.qty=0;}if(age(h,w.time)<POLICY.adultYears)h.ward=d.partner&&row(d.partner)?.value.alive?d.partner:'community';}
  for(const f of w.families.filter(f=>f.a===key||f.b===key)){f.status='bereaved';const survivor=touch(f.a===key?f.b:f.a);if(survivor?.alive)survivor.partner='';}
  for(const promise of w.promises.filter(r=>r.status==='open'&&(r.giver===key||r.receiver===key)))promise.status='ended_by_death';
  if(p.place===d.place)known(p,'death',d.name+'已死亡。','现场');
 }
 function feed(key,n,days,until){
  let needed=days;const f=w.families.find(f=>f.status!=='separated'&&[f.a,f.b,...f.children].includes(key));
  if(f){const shared=Math.min(f.food,needed);f.food-=shared;needed-=shared;const meals=Math.min(needed,Math.floor(f.gold/3));f.gold-=meals*3;w.consumedGold+=meals*3;needed-=meals;}
  const eats=Math.min(qty(n,'food'),needed);add(n,'food',-eats);needed-=eats;
  const cost=needed*3;
  if(n.gold<cost&&n.role==='child'){
   const guardian=[n.ward,n.parentA,n.parentB].map(id=>row(id)).find(r=>r?.value.alive&&r.value.gold>=cost-n.gold);
   if(guardian){const g=touch(guardian.id);g.gold-=cost-n.gold;n.gold=cost;}
  }
  const meals=Math.min(needed,Math.floor(n.gold/3));n.gold-=meals*3;w.consumedGold+=meals*3;needed-=meals;
  if(needed){n.injury=clamp(n.injury+needed*2,0,100);n.needItem='food';n.needQty=Math.min(100,needed);n.plan='缺粮，寻求低风险工作与照护';if(f&&f.status!=='bereaved')f.status='strained';}
  if(n.injury>=80)n.deathAt=Math.min(n.deathAt,until+7*DAY);
 }
 function scheduleNpc(r,until){
  const n=touch(r.id),elapsed=Math.max(0,until-n.updated),days=Math.floor(elapsed/DAY);n.updated=until;
  if(!n.alive)return;
  if(n.deathAt<=until){death(r.id,n.injury>=80?'伤势恶化':'寿尽');return;}
  if(n.role==='child'&&age(n,until)>=18){n.role='apprentice';n.plan='成年，开始谋生与求学';history('adulthood',[r.id],n.name+'成年后开始选择自己的生活。');}
  if(days){
   // Livelihood outputs have an explicit production source; consumption does
   // not transfer another person's finite inventory by narrative fiat.
   if(n.role!=='child'){const income=days*(n.role==='merchant'?5:rows.filter(r=>r.value.alive).length<POLICY.low?4:3);n.gold+=income;w.producedGold+=income;n.xp+=days*(n.role==='cultivator'?4:1);}
   feed(r.id,n,days,until);
   if(n.injury>=80)n.deathAt=Math.min(n.deathAt,until+7*DAY);n.injury=Math.max(0,n.injury-Math.min(days,3));n.hp=Math.min(100,n.hp+days);n.qi=100;
   if(n.xp>=n.rank*30&&n.rank<19&&n.injury<20){n.xp-=n.rank*30;n.rank++;history('growth',[r.id],n.name+'修为精进。');}
  }
  if(['rival','gatherer'].includes(n.role)){
   const u=w.unique.find(u=>u.id==='redleaf'),hasClue=['rival','gatherer'].includes(n.role);
   if(n.destination&&until>=n.arriveAt){n.place=n.destination;n.destination='';n.arriveAt=0;n.x=15;n.y=5;}
   if(u?.status==='available'&&hasClue){
    if(n.place==='mountain.valley'){
     u.owner=r.id;u.status='claimed';add(n,'redleaf',1);n.plan='取得赤叶药材，准备返镇';history('opportunity',[r.id],n.name+'抢先采得赤叶药材。');event(n,'','opportunity','我取得了药谷中的赤叶药材。','亲自采集');
    }else if(!n.destination&&qty(n,'food')>=2){add(n,'food',-2);n.destination='mountain.valley';n.arriveAt=until+24*60;n.place='route:'+n.home+'>mountain.valley';n.plan='沿已知山路前往药谷';}
   }else n.plan='筹资、采药与修炼';
  }else if(n.injury>=30){n.plan='养伤并请求照护';}
  else if(n.partner&&row(n.partner)?.value.alive&&qty(n,'food')>=2){n.plan='谋生、修炼与照料家人';}
  else n.plan=n.role==='cultivator'?'修炼与拜访熟人':n.role==='child'?'成长与求学':'谋生后修炼、休息';
  if(n.role==='merchant'){for(const stock of w.stocks.filter(s=>s.place===n.home&&s.qty<8)){const replenish=8-stock.qty,cost=Math.max(1,Math.floor(price(stock.item)/2))*replenish;if(stock.gold>=cost){stock.gold-=cost;stock.qty+=replenish;stock.quote++;w.consumedGold+=cost;}}}
  if(n.injury>=20){n.needItem='medicine';n.needQty=1;}else if(qty(n,'food')<3){n.needItem='food';n.needQty=3;}
  const dependent=rows.find(other=>other.value.alive&&other.id!==r.id&&[n.parentA,n.parentB,n.ward].includes(other.id)&&other.value.place===n.place&&other.value.injury>=20);
  if(dependent&&qty(n,'herb')>=1){const d=touch(dependent.id);add(n,'herb',-1);d.injury=Math.max(0,d.injury-8);n.plan='照护受伤家人后谋生';appraisal(d,n,'trust',8,d.name+'记得家人实际投入药材的照护。');}
  if(n.partner){
   const f=w.families.find(f=>[f.a,f.b].includes(r.id)&&f.status!=='separated');
   if(f&&n.gold>=20&&f.gold<180){n.gold-=20;f.gold+=20;}
   if(f&&qty(n,'food')>=4&&f.food<40){add(n,'food',-4);f.food+=4;}
   const mate=row(n.partner)?.value,live=rows.filter(p=>p.id!=='player'&&p.value.alive).length;
   if(w.reservations.length<16&&f&&mate?.alive&&n.partner!=='player'&&n.sex!==mate.sex&&age(n,until)<=45&&age(mate,until)<=45&&f.gold>=90&&f.food>=20&&f.children.length<2&&!w.reservations.some(b=>[b.a,b.b].includes(r.id))&&live+w.reservations.length<w.cap){
    const last=f.children.map(k=>row(k)?.value.born||0).sort((a,b)=>b-a)[0];
    if(!f.children.length||until-last>3*YEAR){f.gold-=30;w.reservations.push({id:'npc-birth-'+f.id+'-'+f.children.length,a:r.id,b:n.partner,due:until+POLICY.gestationDays*DAY});history('pregnancy',[r.id,n.partner],'两位居民在生活条件允许时安排养育。');}
   }
  }else if(age(n,until)>=18&&age(n,until)<=45&&n.preference==='reciprocal'){
   const contact=rows.filter(other=>other.id!==r.id&&other.id!=='player'&&other.value.alive&&other.value.place===n.place&&other.value.preference==='reciprocal'&&age(other.value,until)>=18&&age(other.value,until)<=45&&!other.value.partner&&![n.parentA,n.parentB,n.ward].includes(other.id)&&![other.value.parentA,other.value.parentB].includes(r.id)).sort((a,b)=>a.id.localeCompare(b.id))[0];
   if(contact){const c=contact.value;
    if(level(n,c)>=25&&level(c,n)>=25&&level(n,c,'affinity')>=10&&level(c,n,'affinity')>=10&&n.gold>=30&&c.gold>=30&&qty(n,'food')>=4&&qty(c,'food')>=4){
     touch(contact.id);n.partner=contact.id;c.partner=r.id;n.gold-=30;c.gold-=30;add(n,'food',-4);add(c,'food',-4);
     w.families.push({id:'npc-family-'+[r.id,contact.id].sort().join('-'),a:r.id,b:contact.id,home:n.home,gold:60,food:8,status:'active',children:[]});history('marriage',[r.id,contact.id],n.name+'与'+c.name+'协商后成家。');
    }else{appraisal(n,c,'trust',4,n.name+'在共同生活圈中更了解'+c.name+'的为人。');appraisal(n,c,'affinity',3,'日常来往积累了熟悉与亲近。');}
   }
  }
  n.next=until+30*DAY;
  if(n.arriveAt>until)n.next=Math.min(n.next,n.arriveAt);
 }
 function startOperation(kind,targetKey,end,detail=''){w.op={kind,target:targetKey,end,detail,stopped:false};}
 function advance(requested){
  const initial=w.time;let until=Math.min(requested,w.op.kind?w.op.end:requested);
  const deadlines=[p.deathAt,w.nextMarket,...w.reservations.map(r=>r.due),...w.promises.filter(r=>r.status==='open').map(r=>r.due),w.nextImmigration].filter(t=>t>=initial);
  if(deadlines.length)until=Math.min(until,...deadlines);
  // Bound one commit to eight due people. Equal-time work is drained before
  // another action is admitted; persisted operation state explains the wait.
  const due=rows.filter(r=>r.id!=='player'&&r.value.alive&&Math.min(r.value.next,r.value.deathAt)<=until)
   .sort((a,b)=>Math.min(a.value.next,a.value.deathAt)-Math.min(b.value.next,b.value.deathAt)||a.id.localeCompare(b.id));
  if(due.length)until=Math.max(initial,Math.min(until,Math.min(due[0].value.next,due[0].value.deathAt)));
  const births=w.reservations.filter(r=>r.due<=until).sort((a,b)=>a.due-b.due||a.id.localeCompare(b.id));
  if(births.length>1)until=Math.min(until,births[0].due);
  w.time=until;result.spent+=until-initial;
  const elapsedDays=Math.floor(until/DAY)-Math.floor(initial/DAY);
  if(w.op.kind==='work'&&elapsedDays>0){touch('player');p.gold+=elapsedDays*12;w.producedGold+=elapsedDays*12;}
  if(elapsedDays>0){touch('player');feed('player',p,elapsedDays,until);}
  if(w.op.kind==='train'&&elapsedDays>0){touch('player');p.xp+=elapsedDays*Math.max(1,skill(p,'basic'))*p.soul;p.qi=Math.max(0,p.qi-elapsedDays);}


  const selected=due.filter(r=>Math.min(r.value.next,r.value.deathAt)<=until).slice(0,3);
  for(const r of selected)scheduleNpc(r,until);
  for(const pr of w.promises.filter(pr=>pr.status==='open'&&pr.due<=until).slice(0,1)){
   pr.status='missed';const giver=row(pr.giver)?.value,receiver=row(pr.receiver)?.value;
   if(giver?.alive&&receiver?.alive)appraisal(receiver,giver,'trust',-12,receiver.name+'记得对方未在约定前交付。');history('missed',[pr.giver,pr.receiver],'约定到期未履行。');
  }
  const birth=w.reservations.find(r=>r.due<=until);
  if(birth){
   w.reservations=w.reservations.filter(r=>r.id!==birth.id);const a=row(birth.a)?.value,b=row(birth.b)?.value;
   if(a?.alive&&b?.alive){const key='child-'+birth.id;newcomer={id:key,value:person(key,(a.name.slice(0,1)||'林')+'初'+w.serial,a.home,'child',0,1,'unavailable')};
    newcomer.value.born=until;newcomer.value.parentA=birth.a;newcomer.value.parentB=birth.b;newcomer.value.ward=birth.a;newcomer.value.gold=0;newcomer.value.next=until+30*DAY;newcomer.value.deathAt=until+82*YEAR;admit=true;
    const f=w.families.find(f=>[f.a,f.b].includes(birth.a)&&[f.a,f.b].includes(birth.b));if(f)f.children.push(key);history('birth',[birth.a,birth.b,key],'家庭迎来一名新生儿。');
    if([birth.a,birth.b].includes('player'))known(p,'family','家中孩子出生，抚养需要持续的粮食与照护。','家人');
   }else history('pregnancy_ended',[birth.a,birth.b],'家庭变故使原定的新生事件终止，预留名额释放。');
  }
  if(until>=w.nextMarket){for(const stock of w.stocks.filter(s=>s.qty<8)){const count=8-stock.qty,cost=Math.max(1,Math.floor(price(stock.item)/2))*count;if(stock.gold>=cost){stock.gold-=cost;stock.qty+=count;stock.quote++;w.consumedGold+=cost;}}w.nextMarket=until+30*DAY;history('supply',[],'定期商路带来补货，店铺按实际资金支付进货成本。');}
  if(!admit&&until>=w.nextImmigration){
   const live=rows.filter(r=>r.id!=='player'&&r.value.alive).length;
   if(live+w.reservations.length<Math.min(w.cap,POLICY.high)){
    const key='arrival-'+Math.floor(until/DAY),region=rows.filter(r=>r.value.alive&&r.value.home.startsWith('qingshan')).length<POLICY.regionalCap?'qingshan.inn':'wutan.inn';
    newcomer={id:key,value:person(key,'行客'+w.serial,region,'artisan',22+w.serial%16,4,'reciprocal','外地迁入，寻求生计与安稳生活')};newcomer.value.born=until-(22+w.serial%16)*YEAR;newcomer.value.next=until+7*DAY;newcomer.value.updated=until;newcomer.value.deathAt=until+50*YEAR;admit=true;history('immigration',[key],'一名有来历的成年行客迁入。');
   }w.nextImmigration=until+(rows.filter(r=>r.value.alive).length<POLICY.low?45:90)*DAY;
  }
  const backlog=rows.some(r=>r.id!=='player'&&r.value.alive&&Math.min(r.value.next,r.value.deathAt)<=until)||w.reservations.some(r=>r.due<=until)||w.promises.some(r=>r.status==='open'&&r.due<=until);
  if(w.op.kind&&until>=w.op.end&&!backlog){
   if(w.op.kind==='travel'){
    const who=touch('player');who.place=w.op.target;who.x=2;who.y=7;if(!who.visited.includes(who.place))who.visited.push(who.place);
    if(!w.known.includes(who.place))w.known.push(who.place);history('travel',['player'],who.name+'抵达'+(PLACES.find(s=>s.id===who.place)?.name||who.place));
   }else if(w.op.kind==='train'){touch('player');history('training',['player'],'完成一段修炼，积累由资质与功法决定。');}
   else if(w.op.kind==='rest'){touch('player');p.hp=100;p.qi=100;p.injury=Math.max(0,p.injury-10);}
   w.op={kind:'',target:'',end:0,detail:'',stopped:false};
  }
  if(backlog&&!w.op.kind)startOperation('catchup','',until);
  if(w.time>=p.deathAt&&p.alive)death('player','寿尽');
 }
 function timed(ticks){if(ticks<=0)return;startOperation('action','',w.time+ticks);advance(w.time+ticks);}
 function adultPair(t){return age(p,w.time)>=18&&age(t,w.time)>=18&&t.preference!=='unavailable';}
 function social(kind,t){
  if(!near(t))return reject('out_of_reach','请先接近仍在此地的人物。');
  if(kind==='talk'){
   if(args.detail==='acknowledge'){
    if(!t.decision)return reject('reply_pending','对方还没有可接纳的回应。');
    const spoken=t.decision;touch(args.target);event(p,t.actor,'conversation',t.name+'说：'+spoken,t.name,'direct_message');
    if(t.choice!=='refuse'&&w.time-t.lastSocial>=7*DAY){appraisal(t,p,'affinity',2,t.name+'愿意继续与你了解彼此。');t.lastSocial=w.time;}
    t.decision='';t.choice='';say('npc_replied',spoken);return true;
   }
   if(!args.text.trim())return reject('empty_text','写下想对这位人物说的话。');
   const key=args.target;touch(key);t.chat=args.text;t.decision='';t.choice='';w.agenda={actor:t.actor,record:key,due:w.time};
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
   if(level(t,p)<10||t.injury>30||qty(p,'food')<2)return reject('npc_refused','对方顾虑准备、信任或自身状况，拒绝同行。');
   touch(args.target);t.plan='与'+p.name+'约定同行';known(p,'companion',t.name+'愿意同行，仍保留自己的安排。',t.name);say('agreed','对方答应了同行提议。');timed(10);return true;
  }
  if(kind==='care'){
   if(t.injury<10&&!(t.role==='child'&&qty(t,'food')<4))return reject('care_unneeded','对方目前不需要这类照护。');
   if(t.injury>=10&&qty(p,'medicine')<1)return reject('care_materials','照护这项伤势需要疗伤散。');
   if(t.injury<10&&qty(p,'food')<2)return reject('care_materials','照护孩子需要两份干粮。');
   if(qty(p,'medicine')<1&&qty(p,'food')<2)return reject('care_materials','照护需要疗伤散或两份干粮。');
   touch('player');touch(args.target);if(qty(p,'medicine')&&t.injury>=10){add(p,'medicine',-1);t.injury=Math.max(0,t.injury-20);t.hp=Math.min(100,t.hp+25);}else{add(p,'food',-2);add(t,'food',2);}
   appraisal(t,p,'trust',12,t.name+'记得你实际投入物资的照护。');appraisal(p,t,'affinity',4,'照护使你更了解对方的生活。');
   const witness=rows.find(r=>r.value.alive&&r.value.place===t.place&&[r.value.parentA,r.value.parentB].includes(args.target));if(witness){appraisal(witness.value,p,'trust',6,witness.value.name+'看见你实际照护了家人。');appraisal(witness.value,p,'affinity',4,'实际照护家人的经历使彼此亲近。');}say('cared','照护已结算。');timed(60);return true;
  }
  if(kind==='promise'){
   if(args.item!==t.needItem||args.qty!==t.needQty||t.needQty<1||w.promises.some(pr=>pr.receiver===args.target&&pr.status==='open')||w.promises.filter(x=>x.status==='open').length>=16)return reject('invalid_promise','请明确所需物品与数量；当前约定也可能过多。');
   const pr={id:'promise-'+w.serial,giver:'player',receiver:args.target,item:args.item,qty:args.qty,due:w.time+Math.max(1,Number(args.detail)||7)*DAY,status:'open'};w.promises.push(pr);say('promised','约定已记下，期限内可以履行，也可能失约。');timed(5);return true;
  }
  if(kind==='deliver'){
   const pr=w.promises.find(x=>x.receiver===args.target&&x.giver==='player'&&x.status==='open');
   if(!pr||qty(p,pr.item)<pr.qty)return reject('delivery_unavailable','没有可履行的约定或物资不足。');
   touch('player');touch(args.target);add(p,pr.item,-pr.qty);add(t,pr.item,pr.qty);pr.status='fulfilled';t.needQty=Math.max(0,t.needQty-pr.qty);
   if(pr.item==='medicine'){const patient=row(t.parentA)?.value?.injury>0?touch(t.parentA):t;if(patient.injury>0){add(t,'medicine',-1);patient.injury=Math.max(0,patient.injury-10);}}
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
    f.gold-=30;w.reservations.push({id:'birth-'+w.serial,a:'player',b:args.target,due:w.time+POLICY.gestationDays*DAY});history('pregnancy',['player',args.target],'双方商议后安排养育，新生名额已预留。');say('pregnancy','家庭进入养育准备，过程有持续时间与生活后果。');timed(30);return true;
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
  if((w.op.kind||w.appraisals.length)&&!['continue','cancel','clarify'].includes(kind)){reject('activity_pending','先继续或停止当前长期活动。');done();return;}
  if(!p.alive){reject('player_dead','主角已死亡，可以读取整个世界的存档。');done();return;}
  if(kind==='clarify'){say('clarification',args.text||'请明确对象和一个可结算的打算。');done();return;}
  if(kind==='create'){
   const bg=BACKGROUNDS.find(x=>x.id===args.target);
   if(w.created||!bg||!['native','transmigrator'].includes(args.detail)||!args.text.trim()||args.text.length>48){reject('creation_invalid','请提供未创建的新局、有效出身、本土或穿越身份与姓名。');done();return;}
   touch('player');w.created=true;w.origin=args.detail;w.background=bg.id;p.name=args.text.trim();p.sex=args.item==='female'?'female':'male';p.home=bg.place;p.place=bg.place;p.rank=bg.rank;p.gold=bg.gold;p.fire=bg.fire;p.wood=bg.wood;p.soul=bg.soul;p.visited=[bg.place,'person:'+bg.contact];
   if(bg.id==='apprentice'){learn(p,'refining');learn(p,'formula');}if(bg.id==='mercenary')learn(p,'palm');
   known(p,'rumor',START_KNOWLEDGE[1].text,START_KNOWLEDGE[1].source,'rumor');
   if(w.origin==='transmigrator')known(p,'novel_memory',START_KNOWLEDGE[0].text,START_KNOWLEDGE[0].source,'inference');
   const c=row(bg.contact).value;appraisal(c,p,'trust',8,c.name+'知道你的出身与最初联系。');history('creation',['player',bg.contact],p.name+'以'+bg.name+'身份开始生活。');say('created','已进入'+PLACES.find(s=>s.id===p.place).name+'。');done();return;
  }
  if(!w.created){reject('creation_required','先创建自己的角色。');done();return;}
  if(kind==='continue'){
   if(w.appraisals.length){settleAppraisals();done();return;}
   if(!w.op.kind){reject('no_activity','没有待推进的活动。');done();return;}
   advance(w.op.end);say(w.op.kind?'advancing':'completed',w.op.kind?'已推进一段世界事件，可以继续或停止。':'这段活动已经完成。');done();return;
  }
  if(kind==='cancel'){
   if(!w.op.kind&&w.appraisals.length){say('settling','交往已经发生，将先结清个人评价。');done();return;}
   if(!w.op.kind){reject('no_activity','没有可停止的活动。');done();return;}
   const due=rows.some(r=>r.id!=='player'&&r.value.alive&&Math.min(r.value.next,r.value.deathAt)<=w.time);
   w.op=due?{kind:'catchup',target:'',end:w.time,detail:'',stopped:true}:{kind:'',target:'',end:0,detail:'',stopped:true};
   say('stopped',due?'后续计划已停止，正在结清当前时点已到期的事件。':'后续计划已停止，已发生的时间与后果保留。');done();return;
  }
  if(w.combat.enemy&&!['attack','technique','guard','retreat','surrender','consume'].includes(kind)){reject('in_combat','交锋中先应对当前阶段或尝试脱离。');done();return;}
  if(['talk','gift','invite','care','promise','deliver','confess','engage','marry','conceive','separate','teach'].includes(kind)){social(kind,t);done();return;}
  if(kind==='move'||kind==='approach'){
   let to={x:args.x,y:args.y};
   if(kind==='approach'){
    if(!t?.alive||t.place!==p.place){reject('target_stale','目标已经不在此处或不能接近。');done();return;}
    const cells=[[t.x-1,t.y],[t.x+1,t.y],[t.x,t.y-1],[t.x,t.y+1]].map(([x,y])=>pathTo(p.place,p,{x,y})).filter(Boolean).sort((a,b)=>a.length-b.length);
    if(!cells.length){reject('path_blocked','找不到可达的接近路线。');done();return;}to=cells[0].at(-1)||{x:p.x,y:p.y};
   }
   const path=pathTo(p.place,p,to);if(!path){reject('path_blocked','落点或路线被阻挡。');done();return;}
   touch('player');if(kind==='approach'&&!p.visited.includes('person:'+args.target))p.visited.push('person:'+args.target);p.x=to.x;p.y=to.y;timed(path.length);say('moved','沿可达路线抵达。');done();return;
  }
  if(kind==='travel'){
   const r=ROUTES.find(r=>r.from===p.place&&r.to===args.target);
   if(!r||!w.known.includes(args.target)){reject('route_unavailable','当前位置没有已知可用路线通往那里。');done();return;}
   if(p.injury>60||qty(p,'food')<Math.floor(r.ticks/DAY)){reject('travel_unprepared','伤势过重或干粮不足，请先准备。');done();return;}
   startOperation('travel',r.to,w.time+r.ticks,String(r.risk));advance(w.op.end);say(w.op.kind?'travelling':'arrived',w.op.kind?'旅途已开始，世界事件正在沿时间顺序推进。':'抵达目的地。');done();return;
  }
  if(kind==='wait'||kind==='train'||kind==='rest'){
   const days=args.qty||1;if(kind==='train'&&(p.injury>40||!skill(p,'basic'))){reject('training_conditions','伤势或功法条件不允许当前修炼。');done();return;}
   startOperation(kind,'',w.time+days*DAY,String(days));advance(w.op.end);say(w.op.kind?'advancing':'completed',w.op.kind?'这段活动已推进部分时间。':'活动完成。');done();return;
  }
  if(kind==='work'){
   if(args.qty>0){startOperation('work','',w.time+args.qty*DAY);advance(w.op.end);say(w.op.kind?'advancing':'worked','长期谋生按已发生的时间取得报酬并维持生活。');done();return;}
   if(p.injury>60){reject('work_injury','当前伤势不适合做工。');done();return;}touch('player');p.gold+=6;w.producedGold+=6;history('production',['player'],'完成半日劳动，获得六金币报酬。');timed(DAY/2);say('worked','做工所得已经入账。');done();return;
  }
  if(kind==='buy'||kind==='sell'){
   const quote=w.stocks.find(s=>s.place===p.place&&s.item===args.item),n=args.qty;
   if(!quote||!price(args.item)||!n){reject('trade_unavailable','此处没有该物品的有效报价。');done();return;}
   if(String(quote.quote)!==args.detail){reject('quote_changed','报价已变化，请重新查看后提交。');done();return;}
   const cost=price(args.item)*n,paid=kind==='sell'?Math.floor(cost*0.6):cost;
   if(kind==='buy'&&(quote.qty<n||p.gold<cost)||kind==='sell'&&(qty(p,args.item)<n||quote.gold<paid)){reject('insufficient_resources','货物、金币或商家可付款额度不足。');done();return;}
   touch('player');if(kind==='buy'){p.gold-=cost;quote.gold+=cost;quote.qty-=n;add(p,args.item,n);}else{p.gold+=paid;quote.gold-=paid;quote.qty+=n;add(p,args.item,-n);}quote.quote++;history('trade',['player'],(kind==='buy'?'购入':'售出')+n+'份'+args.item+'。');say('traded','交易原子结清。');timed(10);done();return;
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
    touch('player');add(p,'medicine',-1);p.injury=Math.max(0,p.injury-20);p.hp=Math.min(100,p.hp+30);timed(5);say('consumed','疗伤散按实际伤势生效。');
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
   if(kind==='gather'&&args.item==='herb'){touch('player');add(p,'herb',1);history('production',['player'],'从普通药草生境采得一份药草。');timed(120);say('gathered','采得一份普通药草。');done();return;}
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
    const success=p.rank+4>=enemy.rank||w.combat.guard;
    if(success){p.x=2;p.y=7;w.combat={enemy:'',round:0,guard:false};say('retreated','成功脱离当前交锋。');}
    else{p.hp=Math.max(0,p.hp-Math.max(4,enemy.rank-p.rank));p.injury=Math.min(100,p.injury+5);say('retreat_failed','撤退受阻，受到追击。');}
   }else{
    w.combat.enemy=key;w.combat.round++;w.combat.guard=kind==='guard';
    if(kind!=='guard'){const damage=Math.max(1,p.rank*2+skill(p,'palm')*(kind==='technique'?4:1)-enemy.rank);
     enemy.hp=Math.max(0,enemy.hp-damage);enemy.injury=Math.min(100,enemy.injury+Math.floor(damage/3));if(kind==='technique')p.qi-=15;
     appraisal(enemy,p,'trust',-20,enemy.name+'亲历了你的攻击。');}
    if(!enemy.hp){death(key,'交锋重伤');w.combat={enemy:'',round:0,guard:false};say('enemy_died','对方死亡，物资、家庭与约定按后果处理。');}
    else{const counter=Math.max(1,enemy.rank*2-p.rank-(w.combat.guard?8:0));p.hp=Math.max(0,p.hp-counter);p.injury=Math.min(100,p.injury+Math.floor(counter/3));say('combat_round','一段交锋已经结算。');}
   }
   if(!p.hp)death('player','交锋重伤');timed(5);done();return;
  }
  reject('unsupported','这个意图暂不能由现有规则执行。');done();
 }
 return execute();
 function execute(){
  const requested=copy(args); // assigned to a local mutable binding by compute wrapper
  w.serial++;
  if(args.steps.length){for(const step of args.steps){const before=w.time;act({...step,text:args.text,steps:[]});if(result.code!=='ok'&&!['moved','gifted','fulfilled','learned','worked','combat_round','traded','consumed','cared','investigated','claimed','gathered'].includes(result.code)||w.op.kind||!p.alive)break;if(relUpdates.size>=2||events.size>=5||changed.size>=5)break;}}
  else act(requested);
  for(const u of w.unique){const owners=rows.filter(r=>qty(r.value,u.id)>0);if(owners.reduce((n,r)=>n+qty(r.value,u.id),0)>1)throw Error('unique duplicate');if(owners.length)u.owner=owners[0].id;}
  if(changed.size>8||events.size>8||relUpdates.size>4)throw Error('bounded resolution capacity');
  result.at=w.time;if(admit&&!w.op.kind)startOperation('refresh','',w.time);
  const actualRows=rows;
  const visible=project(w,actualRows,memories,result);
  return {world:packWorld(w),people:[...changed.values()].map(r=>({id:r.id,value:packPerson(r.value)})),relations:[...relUpdates.values()],information:[...events.values()],
   view:JSON.stringify(visible),ticks:w.time-reads.game.state.time,admit,newPerson:newcomer?{id:newcomer.id,value:packPerson(newcomer.value)}:{id:'none',value:packPerson(emptyPerson())},
   personCount:changed.size,relationCount:relUpdates.size,informationCount:events.size};
 }
}
export default {
 precondition(){return true;},
 compute(input){return run({...input,args:copy(input.args)});},
 invariant({reads}){
  const people=reads.people.records,live=people.filter(r=>r.id!=='player'&&r.value.alive).length;
  return live+reads.game.state.reservations.length<=reads.game.state.cap&&people.every(r=>r.value.state.gold>=0&&r.value.state.inventory.every(i=>i.qty>=0))&&new Set(people.map(r=>r.id)).size===people.length;
 }
};
