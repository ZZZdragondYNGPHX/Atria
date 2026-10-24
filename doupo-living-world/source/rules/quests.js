import {DAY,ROUTES,PLACES} from '../content/catalog.js';
import {quests} from '../pools/quests.js';
import {qty,add,skill,idleActivity,copy,price} from './state.js';
import {capabilities} from './condition.js';
import {travelWear} from './equipment.js';
import {canPerceive} from './perception.js';
import {performQuest,acceptQuest,eligibleQuest,returnLoan} from './quest-operations.js';

import {initialQuests,settledQuest} from './quest-state.js';
export {initialQuests} from './quest-state.js';
import {runPublicQuest,stepPublicQuests,publicQuestView} from './quest-public.js';
import {sendQuestInvitation,deliveredQuestInvitations} from './quest-discovery.js';
const terminal=settledQuest;
const template=q=>quests.entries.find(e=>e.id===q.seed)?.value;
const answer=(ok,code,text,spent=0)=>({ok,code,text,spent});
const ev=(w,q,kind,target,text)=>{q.evidence.push({kind,target,place:q.place,at:w.time,text:text.slice(0,256)});if(q.evidence.length>8)q.evidence.shift();};
function compact(w){
 const s=w.quests;
 while(s.instances.length>=48){const i=s.instances.findIndex(terminal);if(i<0)return false;const q=s.instances.splice(i,1)[0];s.history.push({id:q.id,seed:q.seed,status:q.status,at:w.time,paid:q.paid,text:q.progress.slice(0,256)});if(s.history.length>24)s.history.shift();}
 return true;
}
function pay(c,q){
 const receiver=c.row(q.owner||'player')?.value,issuer=c.row(q.issuer)?.value;if(!receiver)return 0;
 let amount=Math.min(Math.max(0,q.earned-q.paid),q.escrow);q.escrow-=amount;
 const inContact=issuer?.alive&&canPerceive(receiver,issuer)&&Math.abs(receiver.x-issuer.x)+Math.abs(receiver.y-issuer.y)<=2;
 const credit=Math.min(Math.max(0,q.earned-q.paid-amount),inContact?issuer.gold:0);
 if(credit){c.touch(q.issuer);issuer.gold-=credit;amount+=credit;}
 if(amount){c.touch(q.owner||'player');receiver.gold+=amount;q.paid+=amount;ev(c.w,q,'payment',q.owner,String(amount)+'金币实际到账');}
 return amount;
}
function refund(c,q){const issuer=c.row(q.issuer)?.value;if(q.escrow&&issuer?.alive){c.touch(q.issuer);issuer.gold+=q.escrow;q.escrow=0;}}
function close(c,q,status){
 q.status=q.earned>q.paid?'debt':status;q.notice=status;
 if(q.earned===q.paid)refund(c,q);
 const total=c.w.quests.totals.find(x=>x.seed===q.seed),previousAt=total?.lastAt;
 if(status==='completed'&&!q.evidence.some(e=>e.kind==='closed')){
  if(total){total.completed++;total.paid+=q.paid;total.lastAt=c.w.time;total.choice=q.choice;}
  else c.w.quests.totals.push({seed:q.seed,completed:1,paid:q.paid,lastAt:c.w.time,choice:q.choice});
  const n=c.row(q.issuer)?.value;
  if(n&&c.near(n)&&(!total||c.w.time-previousAt>=DAY))c.appraisal(n,c.p,'trust',4,'完成了'+template(q).title+'，实际成果已验收。');
 }
 ev(c.w,q,'closed',q.issuer,status);c.history('quest_settled',[q.id,q.issuer],q.progress+'；实付'+q.paid+'，待付'+(q.earned-q.paid));
}
function accessible(c,q){const n=c.row(q.issuer)?.value;return !q.issuer||!!n?.alive&&c.near(n)&&!capabilities(n).communicate;}
function returnCustody(c,q){
 if(!returnLoan(c,q))return false;
 if(!q.custody.qty&&!q.custody.gold)return true;
 const owner=c.row(q.custody.owner)?.value;
 if(q.custody.holder!=='player'||!owner?.alive||!c.near(owner))return false;
 c.touch(q.custody.owner);if(q.custody.qty)add(owner,q.custody.item,q.custody.qty);owner.gold+=q.custody.gold;
 q.custody.qty=0;q.custody.gold=0;ev(c.w,q,'returned',q.custody.owner,'未用托付财物已当面归还');return true;
}
function instance(c,t,source){
 const s=c.w.quests;
 return {id:'quest-'+(++s.serial),seed:t.id,issuer:t.mode==='opportunity'?'':t.issuer||'',target:t.target||t.issuer||'',place:t.place,status:'offered',owner:'',created:c.w.time,observedAt:c.w.time,source,tracked:false,version:1,reward:t.reward||0,due:t.deadlineHours?c.w.time+t.deadlineHours*60:0,alternative:'',stage:0,progress:'已获知提议，尚未承接。',choice:'',cost:0,earned:0,paid:0,escrow:0,custody:{item:'',qty:0,gold:0,owner:t.issuer||'',holder:'player'},evidence:[],helper:'',assignment:'',workDue:0,workRemaining:0,workPlace:'',deliveryPlace:t.destination||t.place,notice:'',agreement:'',period:7*DAY,nextDue:0,cycle:0};
}
export function runQuest(c,a){
 const {w,p}=c,s=w.quests,cmd=a.detail;
 if(cmd.startsWith('public_'))return runPublicQuest(c,a);
 if(cmd==='guide_skip'){s.skipped=true;return answer(true,'guide_skipped','已收起引导，已有合同和托付仍保留。');}
 if(cmd==='page'){s.page=a.qty;return answer(true,'quest_page','已整理本人已知记录。');}
 if(cmd==='discover'){
  const channel=a.item||'notice',speaker=c.row(a.target)?.value;
  if(!['notice','talk','witness','letter'].includes(channel)||channel==='talk'&&(!speaker||!c.near(speaker)||capabilities(speaker).communicate))return answer(false,'discovery_unavailable','需要实际接近愿意交流的人物。');
  if(channel==='letter'){
   let found=0;
   for(const mail of deliveredQuestInvitations(c)){
    if(s.instances.some(q=>q.evidence.some(e=>e.kind==='letter'&&e.target===mail.receipt)))continue;
    const existing=s.instances.find(q=>q.seed===mail.template.id&&!terminal(q));
    if(existing){ev(w,existing,'letter',mail.receipt,mail.text);continue;}
    if(!compact(w))break;
    const q=instance(c,mail.template,mail.source);q.created=mail.created;q.observedAt=mail.receivedAt;q.due=mail.due;q.place=mail.place;q.progress=mail.text;ev(w,q,'letter',mail.receipt,mail.text);s.instances.push(q);found++;
   }
   return answer(true,'letters_checked',found?'从实际送达来信整理出'+found+'项寄信时的提议。':'没有新的已送达任务邀约。',5);
  }
  let found=0,urgent=false;
  const ordered=quests.entries.slice().sort((a,b)=>Number(['QC28','QC29'].includes(b.id))-Number(['QC28','QC29'].includes(a.id)));
  for(const entry of ordered){
   const t=entry.value;if(entry.status!=='ready'||t.place!==p.place||channel==='talk'&&t.issuer!==a.target||channel==='notice'&&t.discovery!=='notice'||channel==='witness'&&(t.discovery!=='observation'||!['personal','opportunity'].includes(t.mode)&&(!c.row(t.issuer)?.value||!canPerceive(p,c.row(t.issuer).value)))||!eligibleQuest(c,t))continue;
   urgent||=['QC28','QC29'].includes(t.id);
   const existing=s.instances.find(q=>q.seed===entry.id&&!terminal(q));
   if(existing){existing.observedAt=w.time;continue;}
   const prior=s.totals.find(x=>x.seed===entry.id);if(prior&&(!t.repeatable||w.time-prior.lastAt<7*DAY))continue;
   if(!compact(w))break;const q=instance(c,{...t,id:entry.id},channel==='talk'?speaker.name+'的交谈':channel==='witness'?'本人现场观察':'当地公开告示');s.instances.push(q);found++;urgent||=['QC28','QC29'].includes(t.id);if(found===3)break;
  }
  return answer(true,'quests_discovered',found?'获知'+found+'项实际机会；查看条款后可自由选择。':'此处没有新获知且当前成立的机会。',urgent?0:5);
 }
 const q=s.instances.find(q=>q.id===a.target),t=q&&template(q);
 if(!q||!t)return answer(false,'quest_unknown','没有这项本人已知的任务。');
 if(cmd==='track'){q.tracked=!q.tracked;return answer(true,'quest_tracked',q.tracked?'已追踪最后核实地点，不提供远方实时定位。':'已取消追踪。');}
 if(['negotiate','accept','submit','collect','cooperate','subcontract','withdraw'].includes(cmd)&&!accessible(c,q))return answer(false,'issuer_unavailable','请按最后所知地点实际联系当事人；目前不能当面确认。');
 if(cmd==='negotiate'){
  if(!['offered','active'].includes(q.status)||t.mode==='public'||t.mode==='opportunity'||q.stage||q.helper)return answer(false,'terms_fixed','公告条款、已做工作或正在协作的义务不能单方改写。');
  const n=c.row(q.issuer)?.value,reward=a.qty||q.reward,days=Number(a.text)||Math.ceil((q.due-w.time)/DAY),choice=a.item;
  if(!n||reward>q.reward+Math.max(2,Math.floor(q.reward/4))||reward>n.gold+q.escrow||days<1||days>14||choice&&!(t.choices||[]).some(x=>x.id===choice))return answer(false,'terms_declined','对方未同意这项报酬、期限或替代成果，原条款继续有效。',5);
  if(q.escrow){const difference=reward-q.escrow;c.touch(q.issuer);n.gold-=difference;q.escrow=reward;}
  q.reward=reward;q.due=w.time+days*DAY;q.alternative=choice;q.version++;ev(w,q,'agreement',q.issuer,'双方同意第'+q.version+'版条款');
  return answer(true,'terms_agreed','双方已同意并保存新条款；未接单的提议仍需承接。',5);
 }
 if(cmd==='accept'){
  if(q.status!=='offered'||q.owner)return answer(false,'quest_taken','这份工作已被承接或结束，不能重复接单。');
  if(s.instances.filter(x=>['active','working','paused_work','ready'].includes(x.status)).length>=12)return answer(false,'quest_capacity','同时履行的工作已达12项，请先处理已有工作。');
  if(q.due&&w.time>q.due||!eligibleQuest(c,t))return answer(false,'quest_changed','当前条件已变化，请重新核实或选择其他机会。');
  const n=c.row(q.issuer)?.value;
  if(t.payment==='escrow'&&(!n||n.gold<q.reward))return answer(false,'escrow_unfunded','尚未交存足额报酬，本次未成立。');
  const accepted=acceptQuest(c,q,t);if(accepted&&!accepted.ok)return accepted;
  if(t.payment==='escrow'){c.touch(q.issuer);n.gold-=q.reward;q.escrow=q.reward;}
  q.owner='player';q.status='active';q.progress=(q.evidence.find(e=>e.kind==='story')?.text||'双方已承接。')+' 按约完成实际操作后提交验收。';ev(w,q,'accepted',q.issuer,'双方同意第'+q.version+'版');
  return answer(true,'quest_accepted','已承接；'+(q.escrow?'报酬已实际托管。':'报酬按约验收后由付款人实际支付。'),['QC28','QC29'].includes(q.seed)?0:5);
 }
 if(cmd==='resume_work'){
  if(q.status!=='paused_work'||q.workPlace!==p.place)return answer(false,'work_resume_unavailable','需回到实际工作地点续做剩余工时。');
  q.workDue=w.time+q.workRemaining;q.status='working';return answer(true,'work_resumed','继续尚未完成的工时，已用材料不重复消耗。',q.workRemaining);
 }
 if(cmd==='perform'){
  if(q.owner!=='player'||q.status!=='active'||q.helper)return answer(false,'quest_not_actionable','当前阶段不能重复执行，或正在等待已同意的协作。');
  const choice=(t.choices||[]).find(x=>x.id===a.item);if(!choice||q.alternative&&q.alternative!==choice.id)return answer(false,'quest_choice_invalid','请选择当前条款允许的实际操作。');
  const previousEarned=q.earned,r=performQuest(c,q,t,choice);if(!r.ok)return r;
  if(['abandoned','withdrawn','return_pending'].includes(q.status))return r;
  q.choice=choice.id;
  if(r.spent){ev(w,q,'work_started',q.id,previousEarned+'|'+r.spent);q.workDue=w.time+r.spent;q.workPlace=p.place;q.status='working';q.notice=r.complete?'ready':'active';}
  else q.status=r.complete?'ready':'active';
  return r;
 }
 if(cmd==='submit'){
  if(q.status!=='ready'||q.owner!=='player'||q.helper)return answer(false,'quest_unfinished','尚无已完成且可验收的本人成果，不能凭描述结算。');
  if(!returnCustody(c,q))return answer(false,'custody_outstanding','请先当面处理未使用托付财物。');
  pay(c,q);close(c,q,'completed');return answer(true,q.earned>q.paid?'quest_debt':'quest_completed','成果已验收，实付'+q.paid+'金币，尚欠'+(q.earned-q.paid)+'金币。',5);
 }
 if(cmd==='collect'){
  if(q.earned<=q.paid)return answer(false,'no_debt','没有待收款项。');
  const paid=pay(c,q);if(q.earned===q.paid){q.status=q.notice||'completed';refund(c,q);}return answer(true,'debt_checked','按原成果凭据对账，本次实际收到'+paid+'金币，仍欠'+(q.earned-q.paid)+'金币。',5);
 }
 if(['abandon','withdraw'].includes(cmd)){
  if(!['active','working','paused_work','ready','return_pending'].includes(q.status))return answer(false,'quest_closed','任务已停止或未承接。');
  if(q.helper)return answer(false,'work_in_transit','协作或运输尚未完成，请先联系承运者处理真实在途财物。');
  if(cmd==='withdraw'&&eligibleQuest(c,t))return answer(false,'withdraw_declined','委托人当前仍需要这项工作，没有主动撤回。');
  if(['working','paused_work'].includes(q.status)){
   const work=q.evidence.filter(e=>e.kind==='work_started').slice(-1)[0],parts=(work?.text||'0|1').split('|'),base=Number(parts[0]),duration=Math.max(1,Number(parts[1]));
   const remaining=q.status==='paused_work'?q.workRemaining:Math.max(0,q.workDue-w.time);
   q.earned=base+Math.floor(Math.max(0,q.earned-base)*Math.max(0,duration-remaining)/duration);
   q.workDue=0;q.workRemaining=0;
  }
  if(cmd==='withdraw'&&!q.evidence.some(e=>e.kind==='withdrawal_charge')){const worked=q.evidence.some(e=>!['story','accepted','agreement','payment'].includes(e.kind));q.earned=Math.max(q.earned,worked?Math.floor(q.reward/2):0)+q.cost;ev(w,q,'withdrawal_charge',q.issuer,'已做工作和真实投入一次列账');}
  const returned=returnCustody(c,q);pay(c,q);q.progress=cmd==='withdraw'?'委托人撤回，已做劳动和实际投入已列入清算。':'玩家主动停止，既有成果和真实损耗保留；不将能力不足判为恶意。';
  if(returned)close(c,q,cmd==='withdraw'?'withdrawn':'abandoned');else{q.status='return_pending';q.notice=cmd==='withdraw'?'withdrawn':'abandoned';}
  return answer(true,'quest_stopped',q.progress+(returned?'':'未用托付物仍待当面归还。'),5);
 }
 if(cmd==='return'){
  if(q.status!=='return_pending'||!returnCustody(c,q))return answer(false,'return_unavailable','需要携带原托付财物当面归还给所有者。');close(c,q,q.notice||'abandoned');return answer(true,'custody_returned','托付财物已实际归还，未付款项仍保留。',5);
 }
 if(['assist','subcontract','dispatch'].includes(cmd))return assign(c,q,t,a,cmd);
 if(cmd==='recall'){
  const helper=c.row(q.helper)?.value;
  if(!helper||helper.destination||helper.place!==p.place||Math.abs(helper.x-p.x)+Math.abs(helper.y-p.y)>2)return answer(false,'helper_contact_required','须实际找到协作者或其遗留财物，不能远程解除在途保管。');
  if(q.owner!=='player'&&(!accessible(c,q)||helper.alive&&capabilities(helper).communicate))return answer(false,'transfer_contact_required','重新接手须当面联系委托人及仍在世的接手者。');
  c.touch(q.helper);helper.activity=idleActivity();helper.next=w.time+60;
  ev(w,q,'recalled',q.helper,'实际交回未交托付物和回执；已付工料不重复退还，未完成义务继续保留');
  q.owner='player';q.helper='';q.assignment='';q.custody.holder='player';q.workDue=0;
  if(['working','paused_work'].includes(q.status))q.status='active';
  return answer(true,'helper_recalled','已当面接回现存财物与工作；可继续履行或退出清算。',5);
 }
 if(cmd==='cooperate'){
  if(!t.repeatable||q.status!=='completed'||q.agreement)return answer(false,'cooperation_unavailable','需要已结清的可重复合作，且没有现存协议。');
  q.agreement='active';q.nextDue=w.time+q.period;q.cycle=1;ev(w,q,'cooperation',q.issuer,'双方同意每七日按当时真实需求续一期；暂停不积压未来期次');return answer(true,'cooperation_agreed','已同意七日周期；到期仍按真实需求、资金和本人获知安排下一期。',5);
 }
 if(['pause','resume','terminate'].includes(cmd)){
  if(!q.agreement)return answer(false,'no_agreement','没有长期合作协议。');
  q.agreement=cmd==='pause'?'paused':cmd==='resume'?'active':'ended';q.nextDue=w.time+q.period;return answer(true,'cooperation_changed','未来期次已'+(cmd==='pause'?'暂停':cmd==='resume'?'恢复':'终止')+'，本期与欠款仍按原约处理。');
 }
 if(cmd==='renew'){
  if(q.agreement!=='active'||w.time<q.nextDue||!terminal({...q,agreement:''})||!accessible(c,q)||!eligibleQuest(c,t))return answer(false,'period_unavailable','本期未清、未到约期或当前需求不成立，不能生成新一期。');
  if(!compact(w))return answer(false,'quest_capacity','尚有未清义务，请先清算。');
  const next=instance(c,{...t,id:q.seed},'已同意的周期合作');next.reward=q.reward;next.alternative=q.alternative;next.period=q.period;next.agreement='active';next.cycle=q.cycle+1;next.nextDue=w.time+q.period;s.instances.push(next);const accepted=runQuest(c,{...a,detail:'accept',target:next.id});if(!accepted.ok){s.instances.splice(s.instances.indexOf(next),1);return accepted;}q.agreement='ended';return answer(true,'period_started','按既有协议成立下一期，无需重复协商；暂停期间没有补造订单。',accepted.spent);
 }
 return answer(false,'quest_action_unknown','没有这项可执行的任务操作。');
}

function route(from,to){const queue=[{at:from,path:[]}],seen=new Set([from]);for(let i=0;i<queue.length;i++){const x=queue[i];if(x.at===to)return x.path;for(const r of ROUTES.filter(r=>r.from===x.at)){if(!seen.has(r.to)){seen.add(r.to);queue.push({at:r.to,path:[...x.path,r]});}}}return null;}
function assign(c,q,t,a,cmd){
 if(t.operation.startsWith('combat-'))return answer(false,'helper_unavailable','这项成果需要本人实际参与；同伴援护须在真实交锋中请求，不能委托代打。');
 const n=c.row(a.item)?.value;
 if(q.owner!=='player'||q.helper||!n||a.item===q.issuer||a.item==='player'||!c.near(n)||!n.alive||n.destination||n.control.holder||!['','rest','watch'].includes(n.activity.kind)||capabilities(n).communicate||capabilities(n).move)return answer(false,'helper_unavailable','协作者必须可联系、愿意且身体与时间允许；不能重复占用工作。');
 const fee=8+(t.operation==='supply'?price(t.item)*t.qty:0);
 if(c.level(n,c.p)<0||c.p.gold<fee)return answer(false,'helper_declined','对方未同意，或无法支付本次工料与工作费用。');
 const cargoDispatch=cmd==='dispatch'&&['custody','appointment'].includes(t.operation)&&q.status==='active'&&q.custody.qty>0;
 if(cmd==='dispatch'&&(!t.remoteDelivery||q.status!=='ready'&&!cargoDispatch))return answer(false,'delivery_forbidden','此项不允许代交，或本人应做的成果尚未完成。');
 if(cmd!=='dispatch'&&(q.status!=='active'||!['supply','produce','repair','shift','survey'].includes(t.operation)))return answer(false,'helper_scope','此项工作需本人实操或当前没有可交接的有限分工。');
 if(cmd==='subcontract'&&(c.level(c.row(q.issuer).value,n)<0||!accessible(c,q)))return answer(false,'subcontract_declined','委托人尚未同意这位接手人。');
 const destination=cmd==='dispatch'?(cargoDispatch?q.deliveryPlace:q.place):t.operation==='survey'?(q.stage===1&&q.alternative!=='alternative'?'mountain.camp':t.destination):q.place,path=route(n.place,destination);
 if(!path||qty(n,'food')<Math.floor(path.reduce((sum,r)=>sum+r.ticks,0)/DAY))return answer(false,'courier_route','承运者没有可执行路线或旅途补给。');
 c.touch('player');c.touch(a.item);c.p.gold-=fee;n.gold+=fee;q.cost+=fee;q.helper=a.item;q.assignment=cargoDispatch?'dispatch_cargo':cmd;q.workDue=c.w.time+5;q.workPlace=destination;
 c.w.companions=c.w.companions.filter(key=>key!==a.item);
 q.custody.holder=a.item;n.activity={...idleActivity(),kind:'quest',target:q.id,started:c.w.time,due:q.workDue,source:q.id};n.next=c.w.time+1;
 if(cmd==='subcontract'){q.owner=a.item;ev(c.w,q,'transfer',a.item,'委托人、原承接人与新承接人当面同意转包，既有投入不抹除');}
 return answer(true,'helper_agreed','对方已接受有限工作，'+fee+'金币工料与费用已支付；行动、抵达和验收尚未完成。',5);
}

function approachWorker(c,n,person){
 if(!person?.alive||person.place!==n.place||person.destination){n.next=c.w.time+60;return false;}
 if(canPerceive(n,person)&&Math.abs(n.x-person.x)+Math.abs(n.y-person.y)<=2)return true;
 const path=c.pathTo?.(n.place,n,person);if(path?.length){n.x=path[0].x;n.y=path[0].y;n.next=c.w.time+1;}else n.next=c.w.time+60;return false;
}

// Called only for the resident already selected by the shared simulation scheduler.
export function stepQuestWorker(c,r){
 const q=c.w.quests.instances.find(q=>q.helper===r.id),n=r.value;if(!q||n.activity.kind!=='quest')return sendQuestInvitation(c,r)||stepPublicQuests(c,r);
 c.touch(r.id);const target=q.workPlace;
 if(capabilities(n).move||n.control.holder){n.next=c.w.time+60;return true;}
 if(n.destination){if(c.w.time<n.arriveAt){n.next=n.arriveAt;return true;}travelWear(n,ROUTES.find(r=>'route:'+r.id===n.place)?.risk||0);n.place=n.destination;n.destination='';n.arriveAt=0;n.x=2;n.y=7;if(!n.visited.includes(n.place))n.visited.push(n.place);}
 if(n.place!==target){const leg=route(n.place,target)?.[0];if(!leg||qty(n,'food')<Math.floor(leg.ticks/DAY)){n.next=c.w.time+DAY;return true;}n.place='route:'+leg.id;n.destination=leg.to;n.arriveAt=c.w.time+leg.ticks;n.next=n.arriveAt;return true;}
 if(c.w.time<q.workDue){n.next=q.workDue;return true;}
 if(['assist_work','subcontract_work'].includes(q.assignment)){
  q.status=q.notice==='ready'?'ready':'active';q.workDue=0;
  if(q.status==='active'&&template(q).operation==='survey'&&q.stage===1&&q.alternative!=='alternative'){q.assignment=q.owner==='player'?'assist':'subcontract';q.workPlace='mountain.camp';n.next=c.w.time+1;return true;}
  if(q.status==='ready'&&q.owner!=='player'){q.assignment='subcontract_submit';q.workPlace=q.place;n.next=c.w.time+1;return true;}
  q.assignment='report';q.workPlace=c.p.home;n.next=c.w.time+5;return true;
 }
 if(q.assignment==='subcontract_submit'){
  const issuer=c.row(q.issuer)?.value;if(!approachWorker(c,n,issuer))return true;
  pay(c,q);close(c,q,'completed');q.assignment='report';q.workPlace=c.p.home;n.next=c.w.time+5;return true;
 }
 if(['dispatch','dispatch_cargo'].includes(q.assignment)){
  const receiver=q.assignment==='dispatch_cargo'?q.target:q.issuer,issuer=c.row(receiver)?.value;if(!approachWorker(c,n,issuer))return true;
  // Custody is kept separate from carrier belongings, including on death or delay.
  if(q.custody.qty){c.touch(receiver);add(issuer,q.custody.item,q.custody.qty);q.custody.qty=0;}
  if(q.custody.gold){c.touch(receiver);issuer.gold+=q.custody.gold;q.custody.gold=0;}
  if(q.assignment==='dispatch_cargo')q.earned=q.reward;
  q.assignment='approval';q.workPlace=q.place;n.next=c.w.time+5;ev(c.w,q,'received',receiver,'授权收件人收到原物与成果，回执尚在路上');return true;
 }
 if(q.assignment==='approval'){
  const issuer=c.row(q.issuer)?.value;if(!approachWorker(c,n,issuer))return true;
  const deposit=Math.min(Math.max(0,q.earned-q.paid-q.escrow),issuer.gold);if(deposit){c.touch(q.issuer);issuer.gold-=deposit;q.escrow+=deposit;}
  q.assignment='receipt';q.workPlace=c.p.home;n.next=c.w.time+5;ev(c.w,q,'accepted_delivery',q.issuer,'委托人验收，实际付给承运者的款项随回执交回');return true;
 }
 if(q.assignment==='report'){
  if(c.p.place!==target){n.next=c.w.time+60;return true;}
  q.helper='';q.assignment='';q.custody.holder='player';
 }else if(q.assignment==='receipt'){
  if(c.p.place!==target){n.next=c.w.time+60;return true;}
  pay(c,q);q.progress='承运人实际到达并交回签收凭据。';q.helper='';q.assignment='';q.custody.holder='player';close(c,q,'completed');
 }else{
  const t=template(q),choice=t.choices?.find(x=>x.id===(q.alternative||'primary'));
  const workerContext={...c,p:n,near:who=>!!who?.alive&&canPerceive(n,who)&&Math.abs(n.x-who.x)+Math.abs(n.y-who.y)<=2};
  const ownCost=q.cost,result=performQuest(workerContext,q,t,choice);q.cost=ownCost;
  if(!result.ok){q.notice='协助遇到条件不足，请当面核实';n.next=c.w.time+DAY;return true;}
  q.notice=result.complete?'ready':'active';q.status='working';q.progress=result.text;
  q.assignment=q.owner==='player'?'assist_work':'subcontract_work';q.workDue=c.w.time+Math.max(1,result.spent||0);n.next=q.workDue;return true;
 }
 n.activity=idleActivity();n.next=c.w.time+60;return true;
}
export function finishQuestWork(c){
 for(const q of c.w.quests.instances){if(q.status==='working'&&q.workDue<=c.w.time&&!q.helper&&q.workPlace===c.p.place&&c.w.op.kind==='quest'&&c.w.op.target===q.id){q.status=q.notice==='ready'?'ready':'active';q.workDue=0;}}
}
export function interruptQuestWork(w){for(const q of w.quests.instances)if(q.status==='working'&&!q.helper){q.status='paused_work';q.workRemaining=Math.max(1,q.workDue-w.time);q.workDue=0;}}
export function questWarnings(w,ticks){return w.quests.instances.filter(q=>q.owner==='player'&&['active','working','paused_work','ready'].includes(q.status)&&q.due>0&&q.due<=w.time+ticks).slice(0,8).map(q=>template(q).title+'：已知期限为第'+q.due+'分钟，本次行动可能跨期。');}
export function questView(w,rows,p){
 const s=w.quests||initialQuests(),all=s.instances.slice().sort((a,b)=>Number(b.tracked)-Number(a.tracked)||b.created-a.created),pages=Math.max(1,Math.ceil(all.length/12)),page=Math.min(s.page,pages-1);
 const option=(label,detail,item='',qty=0,text='')=>({label,detail,item,qty,text});
 const known=all.map(q=>{const t=template(q),options=[option(q.tracked?'取消追踪':'追踪已知地点','track')];
  if(q.status==='offered')options.push(option('承接这份工作','accept'),option('协商条款','negotiate','',q.reward));
  if(q.status==='active'&&!q.helper){for(const ch of t.choices||[])options.push(option(ch.label,'perform',ch.id));if(t.remoteDelivery&&q.custody.qty&&['custody','appointment'].includes(t.operation))options.push(option('托付原物异地送达','dispatch'));options.push(option('协商改约','negotiate','',q.reward),option('邀请助手','assist'),option('协商转包','subcontract'));}
  if(q.status==='paused_work')options.push(option('继续剩余工时','resume_work'));
  if(q.status==='ready'&&!q.helper)options.push(option('当面提交验收','submit'),...(t.remoteDelivery?[option('委托异地代交','dispatch')]:[]));
  if(['active','working','paused_work','ready'].includes(q.status))options.push(option('退出并清算','abandon'),option('核实委托人是否撤单','withdraw'));
  if(q.status==='return_pending')options.push(option('归还未用托付财物','return'));
  if(q.helper)options.push(option('当面接回协作与托付','recall'));
  if(q.earned>q.paid)options.push(option('联系付款人追偿','collect'));
  if(q.status==='completed'&&t.repeatable&&!q.agreement)options.push(option('商议长期合作','cooperate'));
  if(q.agreement==='active')options.push(option('暂停未来期次','pause'),option('核实下一期','renew'),option('终止未来合作','terminate'));
  if(q.agreement==='paused')options.push(option('恢复合作','resume'),option('终止未来合作','terminate'));
  return {id:q.id,seed:q.seed,title:t.title,status:q.helper?'active':q.status,due:q.due,source:q.source,observedAt:q.observedAt,place:q.place,issuer:q.issuer,terms:'报酬'+q.reward+'金币；'+(q.due?'期限第'+q.due+'分钟':'无固定期限')+'；'+(t.mode==='opportunity'?'机缘竞争，无保底报酬':t.mode==='public'?'公开贡献结算':'普通工作独占')+'；'+(q.escrow?'已实际托管'+q.escrow+'金币':t.payment==='escrow'?'承接时核实托管':'私人信用/无托管')+'；'+(t.remoteDelivery?'允许合格代交':'本人完成与交付')+'。'+(q.alternative?'已同意替代：'+q.alternative:'')+' 第'+q.version+'版',progress:(q.helper?'已安排协作，等待合法回执。':q.progress)+(q.earned>q.paid?' 尚欠'+(q.earned-q.paid)+'金币。':'')+(q.agreement?' 合作：'+q.agreement:''),tracked:q.tracked,alternatives:(t.choices||[]).map(ch=>({id:ch.id,label:ch.label})),options:options.slice(0,16)};}).concat(publicQuestView(w,rows,p));const allPages=Math.max(1,Math.ceil(known.length/12)),allPage=Math.min(s.page,allPages-1);
 return {known:known.slice(allPage*12,allPage*12+12),guide:{skipped:s.skipped,text:s.skipped?'':'可以先读当地告示、接近人物交谈或观察现场。只选择你愿意做的短事，也可直接探索。'},counts:{active:s.instances.filter(q=>['active','working','paused_work','ready'].includes(q.status)).length,completed:s.totals.reduce((n,t)=>n+t.completed,0)},warnings:questWarnings(w,DAY),page:allPage,pages:allPages,deadlines:s.instances.filter(q=>q.owner==='player'&&['active','working','paused_work','ready'].includes(q.status)).map(q=>({id:q.id,title:template(q).title,due:q.due}))};
}
