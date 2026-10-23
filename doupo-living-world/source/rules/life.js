import {DAY,YEAR,ROUTES} from '../content/catalog.js';
import {qty,add,skill,learn,age,idleActivity,freeControl,price,copy} from './state.js';
import {capabilities,treatCondition} from './condition.js';
import {combatAbility,wear,ward,repair,GEAR} from './equipment.js';
import {contentSha256 as sha} from './hash.js';
import {canPerceive} from './perception.js';

import {pool} from '../pools/index.js';
import {eligible} from './pools.js';
import {artByItem,artContext,learnArt,artKnown,trainingEffort,combatArt} from './progression.js';
const active=m=>['pending','waiting'].includes(m.status);
const bound=(list,max)=>{if(list.length>=max)return false;return true;};
export function know(p,edge){
 const old=p.social.find(e=>e.a===edge.a&&e.b===edge.b&&e.kind===edge.kind);
 if(old){if(edge.at>=old.at)Object.assign(old,edge);return true;}
 if(!bound(p.social,16)){
  if(edge.kind!=='family')return false;
  // Keep mandatory family knowledge in the bounded current graph. An inactive
  // casual contact remains in prior Native revisions; active purposes retain
  // their evidence and cannot be displaced by a later birth.
  const old=p.social.filter(e=>e.kind==='contact'&&!p.goals.some(g=>g.status==='active'&&[e.a,e.b].includes(g.target))&&!p.motives.some(m=>m.intensity>0&&[e.a,e.b].includes(m.target))).sort((a,b)=>a.at-b.at)[0];
  if(!old)return false;p.social.splice(p.social.indexOf(old),1);
 }
 p.social.push(edge);return true;
}
function motive(p,target,kind,source,at,intensity){
 const old=p.motives.find(m=>m.target===target&&m.kind===kind);
 if(old){old.intensity=Math.max(old.intensity,intensity);old.at=at;old.source=source;return;}
 if(bound(p.motives,6))p.motives.push({target,kind,intensity,at,source});
}
function goal(p,kind,target,priority,source){
 const old=p.goals.find(g=>g.kind===kind&&g.target===target);
 if(old){if(old.status!=='active')old.source=source;old.status='active';old.priority=priority;return old;}
 if(!bound(p.goals,6)){const completed=p.goals.findIndex(g=>g.status==='completed');if(completed<0)return null;p.goals.splice(completed,1);}
 const g={id:'goal-'+sha(kind+'|'+target+'|'+source).slice(0,32),kind,target,priority,source,status:'active'};p.goals.push(g);return g;
}
function finishGoal(p,kind,target){const g=p.goals.find(g=>g.kind===kind&&g.target===target);if(g)g.status='completed';}
function settleEffort(c,r,a){
 const n=r.value,units=Math.floor((Math.min(c.w.time,a.due)-a.started)/(DAY/4)),delta=Math.max(0,units-a.progress);
 if(!delta||!['work','train'].includes(a.kind))return;
 a.progress=units;
 if(a.kind==='work'){
  const payer=c.w.stocks.find(s=>s.place===n.place&&s.item==='food'),paid=Math.min(delta,Math.floor((payer?.gold||0)/3));
  if(payer&&paid){payer.gold-=paid*3;n.gold+=paid*3;payer.qty+=paid;payer.quote++;c.history('npc_work',[r.id,n.place],n.name+'完成实际劳动片段，补给产出与工钱已经结算。');}
 }else if(skill(n,'basic')){
  const productive=trainingEffort(n,delta,2);
  if(productive)c.history('npc_training',[r.id],n.name+'只按已发生的修炼片段积累修为与消耗斗气。');
 }
}
function pauseActivity(c,r){
 const a=r.value.activity;if(!a.kind||a.kind==='conflict')return;
 if(a.kind==='rest'&&r.value.suspended.kind)return;
 settleEffort(c,r,a);r.value.suspended={...copy(a),pausedAt:c.w.time};
}
function completeRepair(c,artisan,a,perform){
 c.capture('service-'+sha(a.source+'|'+(perform?'done':'cancel')+'|'+c.w.time).slice(0,40),'repair',[a.target,artisan.id],a.source);
 const customer=c.rows.find(r=>r.id===a.target&&r.value.alive);
 if(!customer){artisan.value.gold+=6;c.history('repair_ended',[artisan.id,a.target,a.item],'委托人无法接收，已投入的工料按终止服务结算。');return;}
 const n=c.touch(customer.id);add(n,'herb',1);
 for(const slot of ['activity','suspended'])if(n[slot].kind==='repair_wait'&&n[slot].item===a.item)n[slot]=idleActivity();
 if(customer.id!=='player')n.next=Math.min(n.next,c.w.time);
 if(perform&&n.place===artisan.value.place&&repair(n,a.item)){artisan.value.gold+=6;c.history('repair',[customer.id,a.item,artisan.id],'工匠完成实际维修，器物保留原身份与剩余状态。');}
 else{n.gold+=6;c.history('repair_cancelled',[customer.id,a.item,artisan.id],'服务条件失效，未使用的材料与预付款退回原委托人。');}
}
export function reserveRepair(c,key,itemId,artisan){
 const customer=c.rows.find(r=>r.id===key),n=customer?.value,g=n?.gear.find(g=>g.id===itemId),spec=g&&GEAR[g.type];
 if(!customer||!artisan||[n.activity,n.suspended].some(a=>a.kind==='repair_wait')||artisan.id===key||artisan.value.place!==n.place||artisan.value.role!=='artisan'||capabilities(artisan.value).care||!['','rest','work'].includes(artisan.value.activity.kind)||!spec?.durability||g.durability>=spec.durability||qty(n,'herb')<1||n.gold<6)return false;
 const receipt=c.capture('service-'+sha(key+'|'+itemId+'|'+c.w.time).slice(0,40),'repair',[key,artisan.id],'request:'+key);
 c.touch(key);c.touch(artisan.id);pauseActivity(c,artisan);n.gold-=6;add(n,'herb',-1);
 artisan.value.activity={...idleActivity(),kind:'repair_service',target:key,item:itemId,started:c.w.time,due:c.w.time+180,source:'cause:'+receipt};artisan.value.next=artisan.value.activity.due;artisan.value.plan='接修实际交付的器物';
 n.activity={...idleActivity(),kind:'repair_wait',target:artisan.id,item:itemId,started:c.w.time,due:c.w.time+180,source:'cause:'+receipt};
 n.plan='等候器物维修';
 c.history('repair_started',[key,itemId,artisan.id],'预留一份材料与六枚金币工钱，工匠原活动暂停。');return true;
}
export function cancelRepairs(c,key){
 let cancelled=false;
 for(const artisan of c.rows)for(const slot of ['activity','suspended']){
  const a=artisan.value[slot];if(a.kind!=='repair_service'||a.target!==key)continue;
  c.touch(artisan.id);completeRepair(c,artisan,a,false);artisan.value[slot]=idleActivity();
  if(slot==='activity')artisan.value.next=c.w.time;cancelled=true;
 }
 return cancelled;
}
export function endServices(c,r){
 cancelRepairs(c,r.id);
 settleEffort(c,r,r.value.activity);
 for(const a of [r.value.activity,r.value.suspended]){
  if(a.kind==='repair_service')completeRepair(c,r,a,false);
  if(a.kind==='produce'){const o=c.w.organizations.find(o=>o.id===a.target);if(o){o.herbs+=2;o.gold+=6;}}
 }
}
export function routeTo(from,to){
 if(from===to)return [];
 const queue=[{place:from,path:[]}],seen=new Set([from]);
 for(let i=0;i<queue.length;i++)for(const r of ROUTES.filter(r=>r.from===queue[i].place)){
  if(seen.has(r.to))continue;const path=[...queue[i].path,r];if(r.to===to)return path;
  seen.add(r.to);queue.push({place:r.to,path});
 }
 return null;
}
export function sendMessage(c,sender,receiver,kind,target,text,source,place){
 const {w,rows,history}=c,a=rows.find(r=>r.id===sender),b=rows.find(r=>r.id===receiver);
 if(!a||!b||!a.value.alive||!b.value.alive||capabilities(a.value).communicate||!place||w.messages.some(m=>(active(m)||m.status==='delivered')&&m.sender===sender&&m.receiver===receiver&&m.kind===kind&&m.target===target&&m.source===source))return false;
 w.messages=w.messages.filter(m=>active(m)||m.created>=w.time-30*DAY);
 if(!bound(w.messages,16)||a.value.gold<1)return false;
 const route=routeTo(a.value.place,place);if(route===null)return false;
 const id='msg-'+sha(sender+'|'+receiver+'|'+kind+'|'+w.time+'|'+source).slice(0,36);
 const evidence=c.capture(id+'.sent','message',[sender,receiver],source,sender==='player'?'owner':'private');
 c.touch(sender);a.value.gold--;w.consumedGold++;
 const subject=rows.find(r=>r.id===target),aboutPlace=subject?.value.place===a.value.place?a.value.place:a.value.social.find(e=>e.b===target&&e.confidence!=='refuted')?.place||'';
 const relation=a.value.social.find(e=>e.a===sender&&e.b===target&&e.kind==='family'&&e.confidence!=='refuted')?'family':'';
 w.messages.push({id,sender,receiver,kind,target,place,origin:a.value.place,aboutPlace,relation,text:text.slice(0,512),source,evidence,receipt:'',created:w.time,due:w.time+Math.max(60,route.reduce((n,r)=>n+r.ticks,0)),status:'pending'});
 history('message_sent',[sender,receiver,id],'信件已付费寄出，送达与是否采信尚待后续。');history('message_content',[sender,receiver,id],text);return true;
}
export function deliverMessage(c){
 const {w,rows,touch,event,history}=c,m=w.messages.filter(m=>active(m)&&m.due<=w.time).sort((a,b)=>a.due-b.due||a.id.localeCompare(b.id))[0];
 if(!m)return;
 const receiver=rows.find(r=>r.id===m.receiver),sender=rows.find(r=>r.id===m.sender);
 if(!receiver?.value.alive){c.capture(m.id+'.receipt','message',[m.sender,m.receiver],m.evidence,'private',true);m.status='undeliverable';history('message_failed',[m.id,m.receiver],'收件人无法接收，消息没有变成其所知。');return;}
 if(receiver.value.place!==m.place){
  if(w.time-m.created>=14*DAY){c.capture(m.id+'.receipt','message',[m.sender,m.receiver],m.evidence,'private',true);m.status='expired';history('message_failed',[m.id,m.receiver],'旧地址未能送达，信件失效。');}
  else {m.status='waiting';m.due=w.time+DAY;}
  return;
 }
 const receipt=c.capture(m.id+'.receipt','message',[m.receiver,m.sender],m.evidence,m.receiver==='player'?'owner':'private',true);
 m.receipt=receipt;const p=touch(m.receiver);m.status='delivered';
 event(p,sender?.value.actor||'',m.kind,m.text,'cause:'+receipt,'told_by');
 if(m.kind==='help'){
  motive(p,m.target,'help','cause:'+receipt,w.time,65);goal(p,'help',m.target,85,'cause:'+receipt);
 }else if(m.kind==='harm'){
  motive(p,m.target,'grievance','cause:'+receipt,w.time,Math.floor(p.traits.care/2));
  goal(p,'help',m.sender,75,'cause:'+receipt);
  know(p,{a:m.sender,b:m.target,kind:'reported_conflict',place:m.origin,at:m.created,source:'cause:'+receipt,confidence:'reported'});
 }else if(m.kind==='invite'){
  goal(p,'visit',m.sender,35,'cause:'+receipt);
 }else if(m.kind==='threat'){
  goal(p,'help',m.target,95,'cause:'+receipt);motive(p,m.sender,'grievance','cause:'+receipt,w.time,60);
 }
 // A letter is a report, not an objective relationship or a live position feed.
 if(sender)know(p,{a:m.receiver,b:m.sender,kind:'contact',place:m.origin,at:m.created,source:'cause:'+receipt,confidence:'reported'});
 if(m.aboutPlace)know(p,{a:m.receiver,b:m.target,kind:'contact',place:m.aboutPlace,at:m.created,source:'cause:'+receipt,confidence:'reported'});
 if(m.relation)know(p,{a:m.sender,b:m.target,kind:m.relation,place:m.aboutPlace,at:m.created,source:'cause:'+receipt,confidence:'reported'});
 p.next=Math.min(p.next,w.time);
 if(m.receiver!=='player'&&['help','harm','threat'].includes(m.kind)&&p.activity.kind&&!['travel','conflict','repair_service'].includes(p.activity.kind)){
  pauseActivity(c,receiver);p.activity=idleActivity();
  history('activity_interrupted',[m.receiver,m.id],'实际收到的重要消息中断当前活动，已投入与已结算片段保留。');
 }
 history('message_received',[m.id,m.receiver],'收件人实际收到一条有来源的消息。');
 history('message_content',[m.receiver,m.sender,m.id],m.text);
}
export function ecologicalStock(w,place,at){
 const e=w.ecology.find(e=>e.place===place);if(!e)return null;
 const days=Math.floor((at-e.updated)/DAY);if(days>0){e.herbs=Math.min(e.capacity,e.herbs+days*2);e.updated+=days*DAY;}return e;
}
export function refreshOrganizations(c,key){
 const {w,rows,history}=c;
 for(const o of w.organizations){
  const leader=rows.find(r=>r.id===o.leader);
  if(key&&o.leader!==key&&leader?.value.alive)continue;
  if(!leader?.value.alive){
   const successor=o.members.map(id=>rows.find(r=>r.id===id)).find(r=>r?.value.alive&&age(r.value,w.time)>=18);
   if(successor){o.leader=successor.id;history('succession',[o.id,successor.id],'组织由现有成年成员接续，物资与项目保留。');}
   else{o.status='unattended';continue;}
  }
  const actor=rows.find(r=>r.id===o.leader);
  o.status=actor&&capabilities(actor.value).work?'restricted':'active';
  if(o.status==='active'&&o.herbs<2){
   const stock=w.stocks.find(s=>s.place===o.place&&s.item==='herb');
   const cost=Math.floor(price('herb')/2);if(stock?.qty&&o.gold>=cost){stock.qty--;stock.gold+=cost;stock.quote++;o.gold-=cost;o.herbs++;}
  }
  // Processing is performed by an actual available member; no passive monthly output.
  if(o.output){const stock=w.stocks.find(s=>s.place===o.place&&s.item==='medicine'),count=Math.min(o.output,Math.floor((stock?.gold||0)/18));if(stock&&count){stock.qty+=count;stock.gold-=count*18;stock.quote++;o.gold+=count*18;o.output-=count;}}
  o.updated=w.time;
 }
}
export function stepLife(c){
 const {w,rows,r,touch,event,history,appraisal}=c,n=r.value,key=r.id,at=w.time;
 const row=id=>rows.find(other=>other.id===id),ability=()=>capabilities(n);
 const start=(kind,target='',ticks=DAY,item='',source='need:'+kind)=>{
  n.activity={...idleActivity(),kind,target,item,started:at,due:at+ticks,source};n.plan=labels[kind]||'处理自己的安排';
  if(kind==='train')add(n,'food',-1);
 };
 function travel(place,source){
  if(ability().move||n.destination||!place||place===n.place)return false;
  const path=routeTo(n.place,place),leg=path?.[0];if(!leg)return false;
  if(qty(n,'food')<Math.max(1,Math.ceil(leg.ticks/DAY)))return false;
  cancelRepairs(c,key);
  n.destination=leg.to;n.arriveAt=at+leg.ticks;n.place='route:'+leg.id;
  start('travel',place,leg.ticks,'',source);return true;
 }
 function observe(){
  const local=rows.filter(o=>o.id!==key&&o.value.alive&&canPerceive(n,o.value)).sort((a,b)=>a.id.localeCompare(b.id));
  for(const other of local.slice(0,3)){
   know(n,{a:key,b:other.id,kind:'contact',place:n.place,at,source:'seen:'+key+':'+at,confidence:'known'});
  }
  return local;
 }
 function buy(item,need){
  const stock=w.stocks.find(s=>s.place===n.place&&s.item===item),count=stock?Math.min(need,stock.qty,Math.floor(n.gold/price(item))):0;
  if(count<1)return false;n.gold-=count*price(item);stock.gold+=count*price(item);stock.qty-=count;stock.quote++;add(n,item,count);
  history('npc_trade',[key,item],n.name+'按实际库存和资金买入补给。');return true;
 }
 function requestHelp(patient,source){
  const contact=n.social.find(e=>e.a===key&&e.kind==='healer'&&e.confidence!=='refuted')||n.social.find(e=>e.a===key&&e.kind==='family'&&e.confidence!=='refuted');
  return contact&&sendMessage(c,key,contact.b,'help',patient,n.name+'请求照看伤者，请到'+(row(patient)?.value.place===n.place?n.place:'信中所述旧住处')+'确认情况。',source,contact.place);
 }
 function clearActivity(reason){
  settleEffort(c,r,n.activity);
  if(n.activity.kind==='repair_service')completeRepair(c,r,n.activity,false);
  if(n.activity.kind==='produce'){const o=w.organizations.find(o=>o.id===n.activity.target);if(o){o.herbs+=2;o.gold+=6;}}
  if(n.activity.kind)history('activity_interrupted',[key,n.activity.kind],n.name+'的活动中止：'+reason);
  n.activity=idleActivity();
 }
 const requirement={travel:'move',gather:'gather',forage:'gather',work:'work',train:'train',learn:'learn',breakthrough:'breakthrough',refine:'refine',produce:'refine',treat:'care',repair_service:'care',watch:'communicate',guard_control:'attack',conflict:'attack'}[n.activity.kind];
 if(requirement&&ability()[requirement]){
  if(n.activity.kind==='travel'&&n.destination){
   // A traveler stays on the traversed route; loss of mobility is not arrival.
   n.plan='途中身体受限，等待恢复或帮助';n.next=at+60;return;
  }
  clearActivity(ability()[requirement]);
 }
 if(n.control.holder){
  const holder=row(n.control.holder);
  if(!holder?.value.alive||holder.value.place!==n.place||capabilities(holder.value).attack||!['','guard_control','conflict'].includes(holder.value.activity.kind)||at>=n.control.until){n.control=freeControl();history('released',[key],'拘束条件结束，活动重新检查。');}
  else if(!ability().communicate&&n.qi>=15&&at-n.control.since>=60){n.qi-=15;if(n.rank>holder.value.rank){n.control=freeControl();history('escaped',[key,holder.id],'受控者付出斗气后挣脱拘束。');}else{n.control.since=at;n.plan='脱离尝试受阻，等待下一机会';n.next=Math.min(at+60,n.control.until);return;}}
  else {n.plan='受到拘束，等待脱离机会或协商';n.next=Math.min(at+60,n.control.until);return;}
 }
 if(n.activity.kind&&n.activity.due>at){n.next=Math.min(n.activity.due,(Math.floor(at/DAY)+1)*DAY);return;}
 if(n.activity.kind==='repair_wait'){
  const artisan=row(n.activity.target),job=artisan&&[artisan.value.activity,artisan.value.suspended].find(a=>a.kind==='repair_service'&&a.target===key&&a.item===n.activity.item);
  if(job){n.activity.due=Math.max(at+1,job.due);n.next=Math.min(n.activity.due,(Math.floor(at/DAY)+1)*DAY);return;}
 }
 if(n.activity.kind){
  const a=copy(n.activity);n.activity=idleActivity();
  const req={work:'work',gather:'gather',forage:'gather',train:'train',learn:'learn',breakthrough:'breakthrough',refine:'refine',produce:'refine',repair_service:'care',treat:'care'}[a.kind];
  if(req&&ability()[req])history('activity_failed',[key,a.kind],n.name+'因身体或拘束条件改变而没有取得活动产出。');
  else if(a.kind==='travel'){
   n.place=n.destination;n.destination='';n.arriveAt=0;n.x=2;n.y=7;if(!n.visited.includes(n.place))n.visited.push(n.place);
   history('npc_arrival',[key,n.place],n.name+'沿实际路段抵达。');
  }else if(a.kind==='buy'){buy(a.item,a.item==='food'?8:2);}
  else if(a.kind==='forage'){const e=ecologicalStock(w,n.place,at);if(e?.herbs){e.herbs--;add(n,'food',1);history('foraging',[key,n.place],'实际采得一份途中补给。');}}else if(a.kind==='work'||a.kind==='train'){
   settleEffort(c,r,a);
  }else if(a.kind==='rest'){
   n.qi=Math.min(100,n.qi+20);if(n.injury<80)n.hp=Math.min(100,n.hp+8);
  }else if(a.kind==='learn'){
   const e=artByItem(a.item);if(e&&qty(n,a.item)&&eligible(e,artContext(n,at))){learnArt(n,e);history('npc_learning',[key],n.name+'通过实际学习掌握已有秘籍中的能力。');}
  }else if(a.kind==='breakthrough'){
   const need=n.rank*30;if(n.rank<19&&n.xp>=need&&n.qi>=40&&n.injury<=20){n.xp-=need;n.qi-=40;n.rank++;n.deathAt=Math.max(n.deathAt,at+(n.rank>=10?110:82)*YEAR);history('growth',[key],n.name+'完成准备后突破。');finishGoal(n,'growth',key);}
  }else if(a.kind==='gather'){
   const e=ecologicalStock(w,n.place,at),count=Math.min(3,e?.herbs||0);
   if(count){e.herbs-=count;add(n,'herb',count);history('npc_gather',[key,n.place],n.name+'从有限生境采得'+count+'份药草。');}
   const u=w.unique.find(u=>u.id==='redleaf');
   if(n.place==='mountain.valley'&&u?.status==='available'&&n.rank>=6){const receipt=c.capture('opportunity-'+sha(key+'|'+at).slice(0,40),'opportunity',[key],a.source);u.owner=key;u.status='claimed';add(n,'redleaf',1);history('opportunity',[key],n.name+'实际取得赤叶药材。');event(n,'','opportunity','我亲自采得药谷中的赤叶药材。','cause:'+receipt);finishGoal(n,'redleaf','mountain.valley');}
   n.suspended={...idleActivity(),kind:'return',target:n.home,item:'herb',started:at,due:at,source:a.source};
  }else if(a.kind==='refine'){
   if(qty(n,'herb')>=2&&n.qi>=20&&skill(n,'refining')&&skill(n,'formula')&&n.fire>=3&&n.wood>=1&&n.soul>=3){add(n,'herb',-2);n.qi-=20;add(n,'medicine',1);n.displayed='medicine';n.displayedAt=at;learn(n,'refining');history('npc_refining',[key],n.name+'以真实药材和斗气炼出一份基础疗伤散。');}
  }else if(a.kind==='produce'){
   const o=w.organizations.find(o=>o.id===a.target);
   if(o&&n.qi>=20&&n.place===o.place){n.qi-=20;o.output++;n.gold+=6;history('production',[key,o.id],n.name+'完成已投入药材的药铺生产，取得已预留的六枚金币工钱。');}
   else if(o){o.herbs+=2;o.gold+=6;history('production_failed',[key,o.id],'加工未能完成，未使用的组织原料与工钱退回。');}
  }else if(a.kind==='repair_service'){
   completeRepair(c,r,a,true);
  }else if(a.kind==='watch'){
   const receipt=c.capture('watch-'+sha(key+'|'+a.target+'|'+at).slice(0,40),'observation',[key,a.target],a.source,'private');
   const subject=row(a.target),last=subject?.value.interaction;
   if(last&&canPerceive(n,subject.value)&&last.place===n.place&&last.at>=a.started&&last.at<=at&&last.target){
    know(n,{a:a.target,b:last.target,kind:last.relation||last.kind,place:last.place,at:last.at,source:'cause:'+receipt,confidence:last.relation?'reported':'known'});
    history('social_observation',[key,a.target,last.target,last.source],'目击了'+last.at+'分钟时发生的'+last.kind+'交往；关系说法为'+(last.relation||'未说明')+'。');
   }
   motive(n,a.target,'investigation',a.source,at,20);
   if(subject&&canPerceive(n,subject.value)){know(n,{a:key,b:a.target,kind:'contact',place:n.place,at,source:'cause:'+receipt,confidence:'known'});history('contact_observation',[key,a.target],'完成观察，确认此时仍能看见该人。');}
   else if(subject){const departure=ROUTES.find(route=>'route:'+route.id===subject.value.place&&route.from===n.place);
    if(departure&&canPerceive(n,{...subject.value,place:n.place})&&subject.value.activity.started>=a.started&&subject.value.activity.started<=at){goal(n,'follow',a.target,55,a.source);if(travel(departure.to,'follow:'+a.target)){history('follow',[key,a.target],'根据亲眼看见的出发方向追随实际路段，不读取目标的后续路线。');return schedule();}}
    else history('trail_lost',[key,a.target],'目标离开后未保留可靠接触，没有取得其秘密实时位置。');
   }
  }else if(a.kind==='treat'){
   const patient=row(a.target);
   if(patient?.value.alive&&patient.value.place===n.place&&skill(n,'healing')&&qty(n,'herb')>=2){
    const wound=patient.value.condition.wounds.find(v=>v.kind==='fracture'&&v.treatedAt<0);
    if(wound){const receipt=c.capture('treatment-'+sha(wound.id+'|'+at).slice(0,40),'treatment',[key,patient.id],wound.source);touch(patient.id);add(n,'herb',-2);treatCondition(patient.value,'splint',at,wound.id);n.interaction={kind:'care',target:patient.id,place:n.place,at,source:'cause:'+receipt,relation:''};history('treatment',[key,patient.id,wound.id],'医者投入药材完成骨折处置；恢复仍需要时间。');event(patient.value,n.actor,'treatment', '医者已经处置伤处。','cause:'+receipt);finishGoal(n,'help',patient.id);
     const player=rows.find(r=>r.id==='player');if(player&&canPerceive(player.value,n)&&canPerceive(player.value,patient.value)){touch('player');know(player.value,{a:key,b:patient.id,kind:'care',place:n.place,at,source:'cause:'+receipt,confidence:'known'});event(player.value,n.actor,'witnessed_care','亲眼看见'+n.name+'投入药材为'+patient.value.name+'处置伤处。','cause:'+receipt);}
    }
   }
  }
 }
 const local=observe();
 // Recovery and daily sustenance are settled by the common clock before planning.
 if(n.injury>=20||n.condition.wounds.length){goal(n,'heal',key,95,'body:'+key);n.needitem='medicine';n.needqty=1;}
 else finishGoal(n,'heal',key);
 if(qty(n,'food')<4){goal(n,'supply',key,90,'food:'+key);n.needitem='food';n.needqty=4-qty(n,'food');}
 else {finishGoal(n,'supply',key);if(n.needitem==='food')n.needqty=0;}
 const fracture=n.condition.wounds.find(v=>v.kind==='fracture'&&v.treatedAt<0);
 if(fracture){requestHelp(key,fracture.id);}
 if(n.injury>=20&&qty(n,'medicine')&&at-n.lastMedicine>=60&&!ability().grip){add(n,'medicine',-1);n.lastMedicine=at;treatCondition(n,'medicine',at);history('npc_medicine',[key],'人物实际使用自己持有的疗伤散，缺失部位与未处置骨折仍保留。');}
 const relative=n.social.filter(e=>e.a===key&&e.kind==='family'&&e.confidence!=='refuted').map(e=>row(e.b)).find(o=>o?.value.alive&&canPerceive(n,o.value)&&o.value.condition.wounds.some(v=>v.kind==='fracture'&&v.treatedAt<0));
 if(relative&&n.traits.care>=35){goal(n,'help',relative.id,85,'seen-body:'+relative.id);requestHelp(relative.id,relative.value.condition.wounds[0].id);}
 const dependent=n.social.filter(e=>e.a===key&&e.kind==='family'&&e.confidence!=='refuted').map(e=>row(e.b)).find(o=>o?.value.alive&&canPerceive(n,o.value)&&o.value.needitem==='food'&&o.value.needqty>=2&&(o.value.role==='child'||capabilities(o.value).work));
 if(dependent&&n.traits.care>=35&&qty(n,'food')>=4&&!ability().care){const receipt='interaction:'+sha(key+'|'+dependent.id+'|'+at).slice(0,40);touch(dependent.id);add(n,'food',-2);add(dependent.value,'food',2);dependent.value.needqty-=2;n.interaction={kind:'support',target:dependent.id,place:n.place,at,source:receipt,relation:'family'};history('family_supply',[key,dependent.id],n.name+'从自己的行囊给家人补充两份干粮。');}
 if(qty(n,'food')<4&&!n.destination&&w.stocks.some(s=>s.place===n.place&&s.item==='food'&&s.qty&&n.gold>=price('food'))){start('buy','',30,'food');return schedule();}
 if(qty(n,'food')<2&&!ability().move&&!w.stocks.some(s=>s.place===n.place&&s.item==='food'&&s.qty)){
  if(n.place.startsWith('mountain.')&&qty(n,'food')<1&&!ability().gather){start('forage','',180,'food','ecology:'+n.place);return schedule();}
  const town=n.home.startsWith('mountain.')?'qingshan.herbal':n.home;if(travel(town,'need:food'))return schedule();
 }
 if(ability().work){start('rest','',DAY);return schedule();}
 const held=rows.find(r=>r.value.alive&&r.value.control.holder===key&&r.value.place===n.place);
 if(held){
  if(qty(n,'food')<1||n.traits.care>75||at>=held.value.control.until){touch(held.id);held.value.control=freeControl();history('released',[key,held.id],'看守者依自身准备与意愿放开拘束。');}
  else {const leverage=n.goals.find(g=>g.kind==='leverage'&&g.status==='active'),contact=leverage&&n.social.find(e=>e.b===leverage.target&&e.confidence!=='refuted');
   if(contact)sendMessage(c,key,contact.b,'threat',held.id,n.name+'要求就被限制行动的亲属进行交涉，是否回应仍由收件人决定。',held.value.control.source,contact.place);
   start('guard_control',held.id,60,'',held.value.control.source);return schedule();
  }
 }
 const childContact=n.social.find(e=>e.a===key&&e.kind==='family'&&e.confidence==='known'&&row(e.b)?.value.role==='child');
 if(childContact&&n.traits.care>=35&&qty(n,'food')>=4&&n.place!==childContact.place){goal(n,'support',childContact.b,85,childContact.source);if(travel(childContact.place,childContact.source))return schedule();}
 const helping=n.goals.filter(g=>g.kind==='help'&&g.status==='active').sort((a,b)=>b.priority-a.priority)[0];
 if(helping){
  const knownPatient=n.social.find(e=>e.b===helping.target&&e.confidence!=='refuted'),patient=row(helping.target);
  if(patient?.value.place===n.place&&patient.value.alive){
   const holder=patient.value.control.holder?row(patient.value.control.holder):null;
   if(holder?.value.alive&&holder.value.place===n.place&&n.traits.care>=50&&n.hp>=40&&n.qi>=15&&!ability().attack&&startConflict(holder,'rescue:'+patient.id))return schedule();
   const untreated=patient.value.condition.wounds.some(v=>v.kind==='fracture'&&v.treatedAt<0);
   if(untreated&&skill(n,'healing')&&qty(n,'herb')<2&&w.stocks.some(s=>s.place===n.place&&s.item==='herb'&&s.qty)&&n.gold>=price('herb')){start('buy','',30,'herb');return schedule();}
   if(untreated&&skill(n,'healing')&&qty(n,'herb')>=2&&!ability().care){start('treat',patient.id,180,'',helping.source);return schedule();}
   if(qty(n,'medicine')&&patient.value.injury>=10&&!ability().care){touch(patient.id);add(n,'medicine',-1);treatCondition(patient.value,'medicine',at);appraisal(patient.value,n,'trust',6,'实际收到照护。');}
   if(!patient.value.condition.wounds.some(v=>v.kind==='fracture'&&v.treatedAt<0)){finishGoal(n,'help',patient.id);}
   else if(!skill(n,'healing'))requestHelp(patient.id,helping.source);
  }else if(knownPatient&&travel(knownPatient.place,helping.source))return schedule();
 }
 if(n.injury>=30||n.condition.wounds.some(w=>w.severity>=30)){
  if(!qty(n,'medicine')&&n.gold>=price('medicine')&&w.stocks.some(s=>s.place===n.place&&s.item==='medicine'&&s.qty)){start('buy','',30,'medicine');return schedule();}
  start('rest','',DAY);return schedule();
 }
 if(n.qi<50){start('rest','',DAY);return schedule();}
 const visibleSupply=local.find(o=>o.id!=='player'&&o.value.displayed==='medicine'&&qty(o.value,'medicine')>0);
 if(visibleSupply&&['mercenary','rival','gatherer'].includes(n.role)&&n.traits.ambition>75&&n.traits.caution<45&&n.traits.care<45&&n.injury>=10&&!qty(n,'medicine')&&n.hp>=40){
  goal(n,'obtain_medicine',visibleSupply.id,70,'seen:'+visibleSupply.id+':'+visibleSupply.value.displayedAt);
  if(startConflict(visibleSupply,'opportunity:medicine:'+visibleSupply.id))return schedule();
 }
 if(n.suspended.kind&&!['return','conflict'].includes(n.suspended.kind)){
  const a=copy(n.suspended),required={work:'work',train:'train',learn:'learn',breakthrough:'breakthrough',refine:'refine',produce:'refine',treat:'care',repair_service:'care',gather:'gather',travel:'move'}[a.kind];
  if(!required||!ability()[required]){const pause=Math.max(0,at-a.pausedAt);a.started+=pause;a.due+=pause;a.pausedAt=0;n.activity=a;n.suspended=idleActivity();n.plan='条件允许，继续先前中断的活动';return schedule();}
 }
 const grievance=n.motives.filter(m=>m.kind==='grievance'&&m.intensity>=25).sort((a,b)=>b.intensity-a.intensity)[0];
 if(grievance&&n.traits.caution>=n.traits.ambition&&qty(n,'food')>=2&&n.gold>=12){
  const feared=n.motives.some(m=>m.kind==='fear'&&m.target===grievance.target&&m.intensity>=50),kin=n.social.find(e=>e.a===grievance.target&&e.kind==='family'&&e.confidence!=='refuted');
  if(feared&&kin&&n.traits.care<40){goal(n,'leverage',grievance.target,60,kin.source);const relative=local.find(o=>o.id===kin.b&&o.id!=='player'&&age(o.value,at)>=18);
   if(relative&&startConflict(relative,'leverage:'+grievance.source))return schedule();if(!relative&&travel(kin.place,kin.source))return schedule();
  }
  const subject=local.find(o=>o.id===grievance.target),last=n.motives.find(m=>m.kind==='investigation'&&m.target===grievance.target);
  if(subject&&(!last||at-last.at>=DAY)){goal(n,'investigate',subject.id,50,grievance.source);start('watch',subject.id,60,'',grievance.source);return schedule();}
 }
 if(grievance&&n.traits.ambition>n.traits.caution){
  const knownTarget=n.social.find(e=>e.b===grievance.target&&e.confidence==='known');
  if(knownTarget){goal(n,'confront',grievance.target,55,grievance.source);const target=local.find(o=>o.id===grievance.target&&o.id!=='player');
   if(target&&at-grievance.at>=DAY&&startConflict(target,grievance.source))return schedule();
   if(at-knownTarget.at<=7*DAY&&travel(knownTarget.place,grievance.source))return schedule();
   if(at-knownTarget.at>7*DAY)grievance.intensity=Math.max(0,grievance.intensity-5);
  }
 }
 const unique=w.unique.find(u=>u.id==='redleaf');
 if(['rival','gatherer'].includes(n.role)){
  const depot=n.home.startsWith('mountain.')?'qingshan.herbal':n.home;
  if(unique?.status==='available')goal(n,'redleaf','mountain.valley',60,'opening:herb-clue');
  const competitor=local.find(o=>o.id!=='player'&&['rival','gatherer'].includes(o.value.role)&&o.value.activity.kind==='gather');
  if(competitor&&n.traits.ambition>75&&n.traits.caution<50&&startConflict(competitor,'observed:resource-competition'))return schedule();
  if(n.suspended.kind==='return'||qty(n,'herb')>=7||qty(n,'redleaf')){
   if(n.place===depot){
    for(const s of w.shipments.filter(s=>s.carrier===key&&s.status==='transit')){c.capture(s.id+'.receipt','shipment',[key],s.source);s.status=qty(n,s.item)>=s.qty?'arrived':'short';history('shipment_arrival',[s.id,key],'货运到达后按实际存货清点，不补刷丢失货物。');}
    const stock=w.stocks.find(s=>s.place===depot&&s.item==='herb'),count=Math.min(Math.max(0,qty(n,'herb')-1),Math.floor((stock?.gold||0)/(price('herb')*0.5)));
    if(stock&&count){const paid=count*4;add(n,'herb',-count);n.gold+=paid;stock.gold-=paid;stock.qty+=count;stock.quote++;history('npc_delivery',[key,n.home],'采药者返家交付真实携带的药草并取得货款。');}
    if(qty(n,'redleaf')){add(n,'redleaf',-1);n.xp+=15;const u=w.unique.find(u=>u.id==='redleaf');u.status='consumed';history('opportunity_used',[key],'取得者实际使用赤叶药材辅助修炼，该唯一物不会刷新。');}
    n.suspended=idleActivity();
    // Unsold cargo stays at the buyer. Starting a fresh outbound trip here
    // would turn back at its first waypoint with the same full inventory.
    if(qty(n,'herb')>=7){n.plan='等待收购方恢复支付能力，保留未售出的药草';start('rest','',DAY);return schedule();}
   }else {const from=n.place,path=routeTo(from,depot);if(travel(depot,'return:'+key)){
    // Closed voyages already exist in prior Native revisions. Retire their hot
    // scheduling rows when accepting a later voyage; never discard active cargo.
    w.shipments=w.shipments.filter(s=>s.status==='transit');
    if(bound(w.shipments,8)&&!w.shipments.some(s=>s.carrier===key&&s.status==='transit'))w.shipments.push({id:'cargo-'+key+'-'+at,carrier:key,from,to:depot,item:'herb',qty:qty(n,'herb'),due:at+(path||[]).reduce((sum,r)=>sum+r.ticks,0),status:'transit',source:'gather:'+key+':'+at});
    return schedule();
   }}
  }
  if(n.place.startsWith('mountain.')&&ecologicalStock(w,n.place,at)?.herbs){start('gather','',180,'herb','ecology:'+n.place);return schedule();}
  if(travel('mountain.valley','opening:herb-clue'))return schedule();
 }
 const friendEdge=n.social.find(e=>e.a===key&&e.kind==='friend'&&e.confidence!=='refuted'),lastVisit=n.motives.find(m=>m.kind==='affiliation'&&m.target===friendEdge?.b);
 if(friendEdge&&qty(n,'medicine')>1&&n.traits.care>=40&&(!lastVisit||at-lastVisit.at>=30*DAY))goal(n,'visit',friendEdge.b,40,'sharing:'+key+':'+Math.floor(at/(30*DAY)));
 const visit=n.goals.find(g=>g.kind==='visit'&&g.status==='active');
 if(visit){const contact=n.social.find(e=>e.b===visit.target&&e.confidence!=='refuted'),friend=local.find(o=>o.id===visit.target);
  if(friend){if(qty(n,'medicine')>1){touch(friend.id);add(n,'medicine',-1);add(friend.value,'medicine',1);appraisal(friend.value,n,'trust',5,'朋友来访并实际分享丹药。');history('npc_share',[key,friend.id],'来访者从自有库存分享丹药。');}motive(n,friend.id,'affiliation',visit.source,at,30);finishGoal(n,'visit',visit.target);}
  else if(contact&&travel(contact.place,visit.source))return schedule();
 }
 const damaged=n.gear.find(g=>GEAR[g.type].durability&&g.durability<GEAR[g.type].durability/2);
 if(damaged&&n.gold>=6&&qty(n,'herb')){const artisan=local.find(o=>o.value.role==='artisan'&&['','rest','work'].includes(o.value.activity.kind));if(reserveRepair(c,key,damaged.id,artisan))return schedule();}
 if(skill(n,'refining')&&skill(n,'formula')&&qty(n,'herb')>=2&&qty(n,'medicine')<2&&!ability().refine){start('refine','',180,'medicine');return schedule();}
 const manual=pool('arts').entries.find(e=>e.status==='ready'&&qty(n,e.value.item)&&!artKnown(n,e)&&eligible(e,artContext(n,at)));
 if(manual&&!ability().learn){start('learn','',DAY,manual.value.item);return schedule();}
 if(n.xp>=n.rank*30&&n.rank<19&&!ability().breakthrough&&n.qi>=40){goal(n,'growth',key,60,'cultivation:'+key);start('breakthrough',key,DAY);return schedule();}
 const workshop=w.organizations.find(o=>o.leader===key&&o.place===n.place&&o.status==='active'&&o.herbs>=2&&o.gold>=6&&o.output<4);
 if(workshop&&skill(n,'refining')&&!ability().refine){workshop.herbs-=2;workshop.gold-=6;start('produce',workshop.id,180,'medicine','organization:'+workshop.id);return schedule();}
 if(age(n,at)>=6&&skill(n,'basic')&&!ability().train&&n.gold>=18&&qty(n,'food')>=4&&(n.traits.ambition>=50||n.role==='cultivator')){start('train',key,DAY);return schedule();}
 if(age(n,at)>=18){start('work','',DAY/2);return schedule();}
 start('rest','',DAY);return schedule();

 function schedule(){n.next=Math.min(n.activity.due,(Math.floor(at/DAY)+1)*DAY);}
 function startConflict(target,source){
  if(ability().attack||target.value.control.holder||w.conflicts.some(f=>f.status==='active'&&[f.a,f.b].some(id=>id===key||id===target.id)))return false;
  w.conflicts=w.conflicts.filter(f=>f.status==='active'||f.next>=at-30*DAY);if(!bound(w.conflicts,4))return false;
  const id='fight-'+sha(key+'|'+target.id+'|'+at).slice(0,36);w.conflicts.push({id,a:key,b:target.id,place:n.place,started:at,next:at+5,round:0,status:'active',cause:source});
  c.capture(id+'.start','conflict',[key,target.id],source,'scene',true);
  const other=touch(target.id);pauseActivity(c,target);other.activity={...idleActivity(),kind:'conflict',target:key,item:'',started:at,due:at+5,source:id};other.next=Math.min(other.next,at+5);
  pauseActivity(c,r);start('conflict',target.id,5,'',id);
  history('conflict_started',[key,target.id,id],'实际相遇使人物改变原活动并发生争执，尚未判定胜负。');return true;
 }
}
const labels={buy:'采购实际需要的补给',work:'投入时间谋生',rest:'休息与恢复',train:'运转已学功法修炼',learn:'研读持有的秘籍',breakthrough:'准备并尝试突破',travel:'沿已知路线赶路',gather:'在生境采药',refine:'以已有材料炼药',produce:'为药铺加工药材',treat:'为实际在场伤者处置伤处',repair_service:'修理器物',repair_wait:'等候器物维修',watch:'观察已知人物的交往',guard_control:'维持当前看守',conflict:'应对当前争执'};

export function settleConflict(c){
 const {w,rows,touch,history,harm,death,event}=c,f=w.conflicts.filter(f=>f.status==='active'&&f.next<=w.time).sort((a,b)=>a.next-b.next||a.id.localeCompare(b.id))[0];
 if(!f)return;
 const a=rows.find(r=>r.id===f.a),b=rows.find(r=>r.id===f.b);
 const receipt=c.capture(f.id+'.r'+(f.round+1),'conflict',[f.a,f.b],f.cause,'scene',true);
 if(!a?.value.alive||!b?.value.alive||a.value.place!==f.place||b.value.place!==f.place){close('separated');return;}
 touch(a.id);touch(b.id);f.round++;
 for(const [attacker,defender] of [[a,b],[b,a]]){
  const n=attacker.value,t=defender.value;if(!n.alive||!t.alive)break;
  if(n.hp<=30||capabilities(n).attack){
   const leg=routeTo(n.place,n.home)?.[0];
   if(!capabilities(n).move&&leg&&qty(n,'food')>=Math.max(1,Math.ceil(leg.ticks/DAY))){cancelRepairs(c,attacker.id);n.place='route:'+leg.id;n.destination=leg.to;n.arriveAt=w.time+leg.ticks;n.activity={...idleActivity(),kind:'travel',target:n.home,item:'',started:w.time,due:n.arriveAt,source:f.id};history('conflict_retreat',[attacker.id,f.id],'人物开始沿实际路段撤离，未获得对方物品。');close('retreated');return;}
   if(n.rank<t.rank&&(t.traits.ambition>75||f.cause.startsWith('leverage:'))){n.control={holder:defender.id,since:w.time,until:w.time+DAY,source:'cause:'+receipt};n.activity=idleActivity();history('captured',[attacker.id,defender.id,f.id],'败者留在当前位置受到有限拘束，未被瞬移或自动搜走财物。');}
   close('yielded',attacker.id);return;
  }
  if(n.hp<60&&qty(n,'medicine')&&w.time-n.lastMedicine>=60&&!capabilities(n).grip){add(n,'medicine',-1);n.lastMedicine=w.time;treatCondition(n,'medicine',w.time);continue;}
  const art=combatArt(n),technique=art.level&&n.qi>=art.qiCost&&!capabilities(n).technique;
  if(technique)n.qi-=art.qiCost;
  const atk=combatAbility(n,technique),def=combatAbility(t),shield=ward(t),damage=Math.max(1,atk.attack-def.defense-shield);
  const noticed=canPerceive(t,n);
  wear(n,'hand',2);wear(t,'body',3);
  const roll=parseInt(sha(f.id+'|'+f.round+'|'+attacker.id).slice(0,8),16)%100;
  const part=roll%2?'left_arm':'left_leg',kind=damage>=35&&roll<10?'loss':damage>=16&&roll<45?'fracture':'trauma';
  if(t.condition.wounds.length<8&&!t.condition.missing.includes(part))harm(defender.id,part,kind,Math.min(100,damage),'conflict:'+f.id+':'+f.round+':'+attacker.id);
  else {t.hp=Math.max(0,t.hp-damage);t.injury=Math.min(100,t.injury+Math.ceil(damage/4));}
  if(noticed){motive(t,attacker.id,'grievance','cause:'+receipt,w.time,Math.min(100,30+damage));
   know(t,{a:defender.id,b:attacker.id,kind:'contact',place:f.place,at:w.time,source:'cause:'+receipt,confidence:'known'});
   event(t,n.actor,'conflict','我与'+n.name+'在此发生冲突并受伤。','cause:'+receipt);
  }
  if(!t.hp)death(defender.id,'NPC冲突重伤');
 }
 history('conflict_round',[f.a,f.b,f.id],'双方依实际功法、斗气、身体和器物结算一个分段，消耗与伤势持续。');
 for(const observer of rows.filter(r=>r.id!==f.a&&r.id!==f.b&&r.value.alive&&r.value.place===f.place&&canPerceive(r.value,a.value)&&canPerceive(r.value,b.value)).slice(0,1)){
  touch(observer.id);event(observer.value,a.value.actor,'witnessed_conflict','我目击'+a.value.name+'与'+b.value.name+'发生冲突。','cause:'+receipt);
  know(observer.value,{a:f.a,b:f.b,kind:'conflict',place:f.place,at:w.time,source:'cause:'+receipt,confidence:'known'});
 }
 if(!a.value.alive||!b.value.alive){close('ended');return;}
 if(f.round>=4&&a.value.traits.caution+b.value.traits.caution>80){close('disengaged');return;}
 f.next=w.time+5;for(const r of [a,b]){r.value.activity.due=f.next;r.value.next=f.next;}
 function close(status,yielding=''){
  f.status=status;f.next=w.time;
  if(yielding){const loser=yielding===f.a?a:b,winner=yielding===f.a?b:a;if(loser&&winner)motive(loser.value,winner.id,'fear','cause:'+receipt,w.time,65);}
  if(status==='yielded'&&yielding===f.b&&f.cause.startsWith('opportunity:medicine:')&&a?.value.alive&&b?.value.alive&&a.value.place===b.value.place&&!capabilities(a.value).grip&&qty(b.value,'medicine')){
   add(b.value,'medicine',-1);add(a.value,'medicine',1);a.value.displayed='medicine';a.value.displayedAt=w.time;
   history('seizure',[f.a,f.b,f.id],'败者让出实际持有的一份疗伤散，后续赠送与自用从同一库存检查。');event(b.value,a.value.actor,'seizure','冲突中失去一份实际持有的疗伤散。','cause:'+receipt);finishGoal(a.value,'obtain_medicine',f.b);
  }
  for(const r of [a,b].filter(Boolean)){
   const n=touch(r.id);if(!n.alive)continue;if(!n.destination)n.activity=idleActivity();n.next=n.destination?n.arriveAt:w.time+60;
   if(n.suspended.kind&&n.suspended.kind!=='conflict'){n.plan='争执之后重新检查原计划';}
   for(const edge of n.social.filter(e=>e.a===r.id&&e.kind==='family').slice(0,1))sendMessage(c,r.id,edge.b,'harm',r.id===f.a?f.b:f.a,n.name+'在冲突后需要帮助；责任归因仍是发信者的说法。','cause:'+receipt,edge.place);
  }
  history('conflict_closed',[f.id],'冲突当前接触结束：'+status+'；后果继续进入生活。');
 }
}
