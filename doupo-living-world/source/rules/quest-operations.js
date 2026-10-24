import {qty,add,skill,learn,price,idleActivity} from './state.js';
import {capabilities,treatCondition,conditionAwareness} from './condition.js';
import {GEAR,repair} from './equipment.js';
import {ecologicalStock,sendMessage} from './life.js';
import {discoverRoutes,ROUTES} from '../content/catalog.js';
import {contentSha256} from './hash.js';
import {QUEST_STORIES} from '../pools/quests.js';
import {combatQuestEligible,performCombatQuest} from './quest-combat.js';
const person=(c,id)=>c.rows.find(r=>r.id===id)?.value;
const live=(c,id)=>person(c,id)?.alive;
const present=(c,id)=>{const n=person(c,id);return n?.alive&&n.place===c.p.place&&!n.destination;};
const willing=(c,id)=>{const n=person(c,id);return n?.alive&&!capabilities(n).communicate&&!n.control.holder&&(!c.level||c.level(n,c.p)>=-20);};
const free=n=>n&&!n.destination&&['','rest','work','quest_service'].includes(n.activity.kind);
const damaged=n=>n?.gear.filter(g=>GEAR[g.type]?.durability&&g.durability<GEAR[g.type].durability)||[];
const need=(n,item)=>Math.max(0,(item==='herb'?4:3)-qty(n,item));
const result=(text,spent=0,complete=false)=>({ok:true,code:complete?'quest_work_complete':'quest_progress',text,spent,complete});
const fail=text=>({ok:false,code:'quest_conditions',text,spent:0,complete:false});
const actorKey=c=>c.rows.find(r=>r.value===c.p)?.id||'player';
function evidence(c,q,kind,target,text){q.evidence.push({kind,target,place:c.p.place,at:c.w.time,text:text.slice(0,256)});if(q.evidence.length>8)q.evidence.shift();q.progress=text;c.history?.('quest_'+kind,[actorKey(c),q.id,target].filter(Boolean),text);}
function transfer(c,from,to,item,n){if(n<1||qty(from,item)<n)return false;add(from,item,-n);add(to,item,n);return true;}
function touch(c,...ids){for(const id of ids)c.touch(id==='player'?actorKey(c):id);}
function occupy(c,id,minutes,q){const n=person(c,id);touch(c,id);n.activity={...idleActivity(),kind:'quest_service',target:q.id,started:c.w.time,due:c.w.time+minutes,source:q.id};n.next=n.activity.due;}
const custodySeeds=['QC03','QC07','QC19','QC22'];
export function returnLoan(c,q){
 if(q.seed!=='QC13')return true;
 const loan=q.evidence.find(e=>e.kind==='loan');
 if(!loan||q.evidence.some(e=>e.kind==='returned'&&e.target===loan.target))return true;
 const owner=person(c,q.issuer),g=c.p.gear.find(g=>g.id===loan.target);
 if(!g||!owner?.alive||!c.near(owner)||owner.gear.length>=4)return false;
 touch(c,'player',q.issuer);c.p.gear.splice(c.p.gear.indexOf(g),1);g.equipped=false;owner.gear.push(g);
 evidence(c,q,'returned',g.id,'未结借物已以原实例归还；期间实际磨损保持。');return true;
}
export function eligibleQuest(c,t){
 // A personally discovered opportunity has no employer. A former competitor's
 // location, willingness or death cannot revoke the existing world resource.
 if(t.id==='QC26')return c.w.known.includes(t.destination)&&c.w.ecology.some(e=>e.place===t.destination)&&c.w.unique.some(u=>u.id==='redleaf');
 const n=person(c,t.issuer),target=person(c,t.target);
 if(t.issuer&&(!n?.alive||!willing(c,t.issuer)))return false;
 if(t.target&&!target?.alive)return false;
 switch(t.id){
  case 'QC28':case 'QC29':case 'QC30':return combatQuestEligible(c,t);
  case 'QC01':return need(n,'herb')>0||c.w.organizations.some(o=>o.leader===t.issuer&&o.herbs<4);
  case 'QC02':return need(n,'herb')>0&&need(person(c,'tang'),'herb')>0;
  case 'QC04':return c.w.history.some(h=>['quest_handover','delivery','trade','gift','promise_delivered'].includes(h.kind));
  case 'QC05':return c.w.unique.some(u=>u.id==='redleaf');
  case 'QC07':return qty(n,'herb')>=2&&qty(n,'medicine')<2;
  case 'QC08':return damaged(n).length>0;
  case 'QC10':return target.condition.wounds.some(w=>w.kind==='fracture'&&w.treatedAt<0);
  case 'QC11':return qty(target,'food')<4&&free(n);
  case 'QC12':return n.injury>10||qty(n,'food')<3;
  case 'QC13':return n.gear.length>0;
  case 'QC15':return damaged(person(c,'min')).length>0;
  case 'QC17':return qty(n,'food')<6;
  case 'QC18':return c.w.known.includes('mountain.cave');
  case 'QC19':return n.gold>=16;
  case 'QC20':return c.rows.some(r=>r.value.place===t.place&&r.value.alive&&damaged(r.value).length>0);
  case 'QC25':return c.w.ecology.some(e=>e.place===t.place&&e.herbs<=Math.ceil(e.capacity/2));
  case 'QC27':return c.w.promises.some(p=>p.status==='open'&&p.giver==='player')||(c.w.quests?.instances||[]).some(q=>q.status==='active');
  default:return !custodySeeds.includes(t.id)||qty(n,t.item)>=t.qty;
 }
}
export function acceptQuest(c,q,t){
 if(!eligibleQuest(c,t))return fail('真实需求或委托人的可履约条件已经改变。');
 if(custodySeeds.includes(t.id)){
  const n=person(c,t.issuer),item=t.id==='QC07'?'herb':t.item,amount=t.id==='QC07'?2:t.qty,gold=t.id==='QC19'?price(item)*amount:0;
  if(gold?n.gold<gold:qty(n,item)<amount)return fail('托付人没有本次所需财物。');
  touch(c,t.issuer);if(gold)n.gold-=gold;else add(n,item,-amount);
  q.custody={item:gold?'':item,qty:gold?0:amount,gold,owner:t.issuer,holder:'player'};
 }
 const story=QUEST_STORIES.find(s=>s.id===t.story&&s.actors.includes(t.issuer));
 if(story){
  const prior=(c.w.quests?.instances||[]).find(old=>old.id!==q.id&&old.status==='completed'&&story.seeds.includes(old.seed));
  const text=prior?'“上次的事已经按实际成果结清。今天的条件还要重新说。” '+story.opening:story.opening;
  evidence(c,q,'story',t.issuer,text);c.known?.(c.p,'story:'+story.id,text,person(c,t.issuer)?.name||'亲历');
 }
 return result('本次托付已经核实，财物与自有背包分开保管。');
}
// Only these checked operations produce progress. They never pay quest rewards.
export function performQuest(c,q,t,choice){
 choice=typeof choice==='string'?choice:choice?.id;
 const opt=t.choices.find(x=>x.id===choice);if(!opt)return fail('请选择当前工作允许的操作。');
 if(q.status!=='active'||q.workDue>c.w.time)return fail('当前工作尚未开放或上一步工时尚未完成。');
 if(capabilities(c.p).communicate)return fail('当前身体状况无法处理这份工作。');
 const {p,w}=c,n=person(c,q.issuer),target=person(c,q.target),alt=choice==='alternative';
 if(['QC28','QC29','QC30'].includes(t.id))return performCombatQuest(c,q,t,choice);
 if(q.issuer&&!live(c,q.issuer))return fail('委托人已无法参与，须先清算。');
 const atIssuer=()=>present(c,q.issuer)&&willing(c,q.issuer);
 let rewardSet=false;
 const mark=(kind,id,text,spent=30,complete=true)=>{q.choice=choice;if(complete&&!rewardSet&&!q.evidence.some(e=>e.kind==='earned'))q.earned=q.reward;evidence(c,q,kind,id,text);return result(text,spent,complete);};
 const paidAmount=ratio=>{rewardSet=true;q.earned=Math.min(q.reward,Math.floor(q.reward*ratio));evidence(c,q,'earned',q.issuer,String(q.earned));};
 const service=(id,minutes)=>free(person(c,id))&&willing(c,id)&&present(c,id)&&!capabilities(person(c,id)).care;
 switch(t.id){
  case 'QC01':{
   if(!atIssuer())return fail('需向在场药工交付。');const amount=Math.min(alt?1:t.qty,Math.max(1,need(n,'herb')));
   if(qty(p,'herb')<amount)return fail('先实际购买、采集或准备足够药草。');touch(c,'player',q.issuer);transfer(c,p,n,'herb',amount);q.cost+=amount*price('herb');paidAmount(amount/t.qty);
   return mark('handover',q.issuer,'药工收到'+amount+'份药草；未交缺口仍保留。');}
  case 'QC02':{
   if(!q.stage){if(!present(c,'ning')||qty(p,'herb')<(alt?1:2))return fail('先到宁素面前准备本次分配药草。');touch(c,'player','ning');const amount=alt?1:2;transfer(c,p,person(c,'ning'),'herb',amount);q.cost+=amount*8;q.stage=alt?1:2;q.choice=choice;
    return mark('allocation','ning','接诊处实际收到'+amount+'份药草，另一处需求未被抹去。',30,!alt);}
   if(q.stage!==1||!present(c,'tang')||qty(p,'herb')<1)return fail('分配尚有一份须本人送至唐汀。');touch(c,'player','tang');transfer(c,p,person(c,'tang'),'herb',1);q.cost+=8;q.stage=2;return mark('allocation','tang','唐汀收到另一份药草，两方分别记录有效贡献。');}
  case 'QC03':case 'QC22':{
   if(alt&&t.id==='QC03'){
    if(!atIssuer()||q.custody.qty<1)return fail('携余货回到实际委托人面前才能归还。');touch(c,q.issuer);add(n,q.custody.item,q.custody.qty);q.custody.qty=0;paidAmount(0);q.status='abandoned';return mark('returned',q.issuer,'未用封签货物已原物返还；没有完成配送。',15,false);}
   if(t.id==='QC22'&&alt){
    const consent=q.evidence.find(e=>e.kind==='receipt_agent');
    if(!consent){
     if(!present(c,q.target)||!willing(c,q.target)||q.custody.qty<1)return fail('请先与收件人当面商定代收，不能由发件人冒充授权。');
     const agent=c.rows.find(r=>r.id!==q.target&&r.id!==q.issuer&&r.id!==actorKey(c)&&present(c,r.id)&&willing(c,r.id)&&free(r.value));
     if(!agent)return fail('现场没有愿意且有时间的代收人，可当面交付或另约。');
     q.custody.holder=agent.id;q.stage=1;return mark('receipt_agent',agent.id,'收件人当面授权'+agent.value.name+'代收；货物仍在单独托付记录，尚未交到收件人。',30,false);
    }
    const agent=person(c,consent.target);
    if(!agent?.alive||!present(c,consent.target)||!present(c,q.target)||q.custody.holder!==consent.target)return fail('需实际代收人与收件人共同在场，不能远程签收。');
    if(q.custody.qty<1)return fail('托付物已经交接，不能重复交付。');touch(c,q.target);add(target,q.custody.item,q.custody.qty);q.custody.qty=0;q.custody.holder='player';q.stage=2;return mark('handover',q.target,'授权代收人当面交给收件人，两个交接时点分别留存。',15);
   }
   if(!present(c,q.target)||!willing(c,q.target))return fail('收件人尚未在场；可以等待、改约或按获准条款委托代交。');
   if(q.custody.qty<1)return fail('没有待交托付货物。');touch(c,q.target);add(target,q.custody.item,q.custody.qty);q.custody.qty=0;
   return mark('handover',q.target,alt?'收件人当面授权并签收，未越过其他代理权限。':'收件人当面验封并签收实际货物。',15);}
  case 'QC04':{
   if(!atIssuer())return fail('需回到谷茗身边核对。');const receipt=w.history.find(h=>h.refs?.includes('player')&&['quest_handover','delivery','trade','gift','promise_delivered'].includes(h.kind));
   if(!receipt&&!alt)return fail('没有本人可引用的交付事实，不能凭说法更正账目。');
   if(choice==='report'){
    const participant=receipt.refs.find(id=>id!==actorKey(c)&&id!==q.issuer&&present(c,id)&&willing(c,id));
    if(!participant)return fail('原交易另一位参与者须在场；不会向无关旁观者公开凭据。');
    c.known?.(person(c,participant),'account-correction',receipt.text,'原交易参与者出示的交付凭据');
    c.known?.(n,'account-correction',receipt.text,'本人可引用的交付凭据');
    return mark('disclosure',participant,'已向在场原交易当事人出示第'+receipt.at+'分钟的凭据；只澄清亲历事实，未认定他人欺诈。');
   }
   c.known?.(n,'quest-account',alt?'本次未能证实争议说法。':receipt.text,'本人提供的有限凭据');paidAmount(alt?0.5:1);return mark(alt?'uncertain':'correction',q.issuer,alt?'已明确告知尚不能证实，不给任何人虚构责任。':'更正仅引用交付于'+receipt.at+'的记录：'+receipt.text);}
  case 'QC05':{
   if(p.place!=='mountain.valley')return fail('必须本人到药谷核实，旧消息不能作当前证据。');const u=w.unique.find(x=>x.id==='redleaf');
   if(alt&&u.status==='available'&&!u.owner)return fail('眼前资源仍可取得，不能报告已经消失。');
   const observation=u.owner?'亲见赤叶已不在原处，旧线索被加注时点。':'核实当前仍有赤叶；报告不锁定资源归属。';
   if(choice==='report'){
    const actor=actorKey(c),contact=p.social.find(e=>e.a===actor&&e.b===q.issuer&&e.confidence!=='refuted');
    if(!contact?.place||p.gold<1||!sendMessage(c,actor,q.issuer,'correction','redleaf','第'+w.time+'分钟药谷亲历核实：'+observation,q.id+':correction',contact.place))return fail('需要已知联系地址、一金币邮资和可用信件名额；未向远方自动更正。');
    q.cost++;c.known?.(p,'quest-resource',observation,'亲历调查','witnessed');
    return mark('correction_sent',q.issuer,'付邮资寄出实地更正；收件人尚未获知，送达后才形成其所知。',60);
   }
   c.known?.(p,'quest-resource',observation,'亲历调查','witnessed');return mark('observation','redleaf',observation,60);}
  case 'QC06':{
   if(!q.stage){if(!atIssuer())return fail('必须先征得实际发信人的范围授权。');if(alt&&(!present(c,'xiaoli')||!willing(c,'xiaoli')))return fail('补充萧厉的近况需其本人在场同意。');q.stage=1;q.choice=choice;return mark('permission',q.issuer,alt?'兄弟分别允许转达本人此刻平安；未授权行程或财务。':'萧鼎仅授权转达本人此刻平安；不包含团务。',15,false);}
   if(!present(c,q.target))return fail('需到萧战面前送达，或使用已授权的实际代交。');c.known?.(target,'family-letter',q.evidence.find(e=>e.kind==='permission')?.text||'获准平安口信','萧鼎的口信');q.stage=2;return mark('message',q.target,'获准的有限平安口信已实际转达，家人所知更新。',15);}
  case 'QC07':{
   const ownMaterials=choice==='report';
   if(!atIssuer()||(ownMaterials?qty(p,'herb')<2:q.custody.item!=='herb'||q.custody.qty<2))return fail('委托药草不足时可明确选择自备两份药草重新开炉。');
   const actor=alt?person(c,q.helper):p,id=alt?q.helper:'player';if(!actor||alt&&!service(id,180)||actor.fire<3||actor.wood<1||actor.soul<3||!skill(actor,'formula')||!skill(actor,'refining')||actor.qi<20||capabilities(actor).refine)return fail('操作者须具备丹方、控火、灵魂、属性和斗气；助手须已同意分工且空闲。');
   touch(c,id,q.issuer);if(ownMaterials){add(p,'herb',-2);q.cost+=16;}else q.custody.qty-=2;actor.qi-=20;if(alt)occupy(c,id,180,q);const roll=parseInt(contentSha256(q.id+'|'+q.cycle+'|'+q.stage+'|'+w.time).slice(0,8),16)%100;q.stage++;
   if(roll>=65+actor.soul*3)return mark('consumption',id,'本炉失败，两份'+(ownMaterials?'自备':'委托')+'药草与斗气实际消耗，未产生疗伤散。',180,false);
   add(n,'medicine',1);learn(actor,'refining');return mark('production',q.issuer,'实际炼成疗伤散交归药铺，失败与成功均不退回已耗材料。',180);}
  case 'QC08':{
   if(!atIssuer())return fail('需接触器物持有人。');const gears=damaged(n),count=alt?gears.length:Math.min(1,gears.length),artisan=c.rows.find(r=>r.value.role==='artisan'&&service(r.id,180));
   if(!count||!artisan||qty(p,'herb')<count||p.gold<6*count)return fail('需要实际受损器物、在场工匠、每件一份药草和六金币。');touch(c,'player',q.issuer,artisan.id);add(p,'herb',-count);add(n,'herb',count);p.gold-=6*count;artisan.value.gold+=6*count;for(const g of gears.slice(0,count))repair(n,g.id);q.cost+=14*count;occupy(c,artisan.id,180*count,q);
   if(alt)n.next=Math.max(n.next,w.time+180*count);return mark('repair',q.issuer,'已修'+count+'件实际器物，原实例耐久增加，其余损耗保留。',180*count);}
  case 'QC09':{
   const learnerId=alt?'xuemei':'linfei',learner=person(c,learnerId);
   if(!present(c,learnerId)||!willing(c,learnerId)||!free(learner)||qty(p,'herb')<2)return fail('所选练习者须本人在场、愿意且有练习时间，需两份药草。');const teacher=alt?c.rows.find(r=>['frank','aotuo'].includes(r.id)&&present(c,r.id)&&free(r.value)&&skill(r.value,'refining')>0):{id:'player',value:p};
   if(!teacher||skill(teacher.value,'refining')<1||capabilities(learner).refine||learner.fire<3||learner.wood<1)return fail('实际指导者须会控火，练习者须满足本人练习条件。');touch(c,'player',learnerId,teacher.id);add(p,'herb',-2);learn(learner,'refining');q.cost+=16;occupy(c,learnerId,120,q);if(teacher.id!=='player')occupy(c,teacher.id,120,q);return mark('practice',learnerId,learner.name+'本人完成有限控火练习并耗材；另一人的记录和能力未改变，未取得认证。',120);}
  case 'QC10':{
   if(!present(c,q.target)||!willing(c,q.target))return fail('伤者须在场且同意评估。');const wound=target.condition.wounds.find(x=>x.kind==='fracture'&&x.treatedAt<0);
   if(!wound)return fail('目前没有可进行指定处置的骨折。');if(alt){c.known?.(p,'patient-assessment','仅确认伤者仍需医者指定处置。',target.name);paidAmount(0.25);return mark('assessment',q.target,'已当面确认仍需医者；没有治疗或恢复移动能力。',30);}
   const healer=c.rows.find(r=>skill(r.value,'healing')&&service(r.id,60));if(!healer||qty(p,'herb')<2||p.gold<12)return fail('还需实际到场医者、两份药草和十二金币。');touch(c,'player',q.target,healer.id);add(p,'herb',-2);p.gold-=12;healer.value.gold+=12;treatCondition(target,'splint',w.time,wound.id);target.health=conditionAwareness(target);q.cost+=28;occupy(c,healer.id,60,q);return mark('treatment',q.target,'医者对原伤处夹板处置；愈合仍按原身体规则推进。',60);}
  case 'QC11':{
   if(!atIssuer()||!present(c,q.target)||!free(n)||qty(p,'food')<1||capabilities(p).care)return fail('照护者与孩子须在场同意交接，玩家具备照护能力并备一份食物。');touch(c,'player',q.target,q.issuer);transfer(c,p,target,'food',1);const minutes=alt?60:120;q.cost+=3;paidAmount(alt?0.5:1);n.next=w.time+minutes;p.interaction={kind:'care',target:q.target,place:p.place,at:w.time,source:q.id,relation:'temporary'};return mark('care',q.target,'已接手'+minutes+'分钟有限照护，孩子得到实际食物；期满交还监护责任。',minutes);}
  case 'QC12':{
   if(q.stage===1){if(p.place!==t.destination||!present(c,q.target))return fail('本人和受助者须真实抵达青山镇才可交接。');q.stage=2;return mark('arrival',q.target,'本人和受助者实际返镇完成交接。',15);}
   if(!present(c,q.target)||!willing(c,q.target)||qty(p,'food')<2)return fail('先在现场征得受助者同意并准备两份食物。');if(!alt&&(capabilities(target).move||w.companions.length>=4))return fail('受助者当前不能主动同行或同行名额不足；不提供未实现搬运。');touch(c,'player',q.target);transfer(c,p,target,'food',2);q.cost+=6;
   if(alt){c.known?.(target,'rescue','已收到两份食物，可重新安排返程。',p.name);paidAmount(0.5);return mark('supply',q.target,'实际交付返程补给；没有声称援助者已收到消息或已返镇。',30);}
   if(!w.companions.includes(q.target))w.companions.push(q.target);q.stage=1;return mark('escort',q.target,'受助者同意同行；仍须实际旅行返镇，尚未交接。',15,false);}
  case 'QC13':{
   if(!atIssuer())return fail('借出、展期和归还均须物主同意。');
   if(!q.stage){if(p.gear.length>=4||!n.gear.length)return fail('没有可借器物或本人携带已满。');const g=n.gear.find(x=>!x.id.startsWith('loan:'));if(!g)return fail('没有可借器物。');touch(c,'player',q.issuer);n.gear.splice(n.gear.indexOf(g),1);g.equipped=false;p.gear.push(g);q.stage=1;evidence(c,q,'loan',g.id,'借出实际器物，物主仍为'+q.issuer);return result('器物已借出；使用后归还同一实例。',15,false);}
   const loan=q.evidence.find(e=>e.kind==='loan'),g=p.gear.find(x=>x.id===loan?.target);if(!g)return fail('原器物未在本人手中，不能抹去归还义务。');
   if(alt&&!q.evidence.some(e=>e.kind==='extension')){if(p.gold<3)return fail('展期补偿需三金币。');touch(c,'player',q.issuer);p.gold-=3;n.gold+=3;q.cost+=3;q.due+=1440;return mark('extension',q.issuer,'物主同意展期一天并收到三金币补偿，仍须归还。',15,false);}
   if(n.gear.length>=4)return fail('物主暂时没有接收器物的携带空间。');touch(c,'player',q.issuer);p.gear.splice(p.gear.indexOf(g),1);g.equipped=false;n.gear.push(g);q.stage=2;return mark('returned',g.id,'同一件借物已归原主，实际耐久保持。',15);}
  case 'QC14':{
   if(!atIssuer()||!free(n)||qty(n,'food')<1||capabilities(p).work)return fail('双方须在场愿意，居民须能提供约定食物服务。');
   if(!q.stage){q.stage=1;return mark('labor',q.issuer,'先投入互助劳动，满工时后才能兑现对方服务。',alt?60:120,false);}
   touch(c,'player',q.issuer);transfer(c,n,p,'food',1);q.stage=2;return mark('reciprocal',q.issuer,'对方交付实际一份口粮，双方已做部分两清。',15);}
  case 'QC15':{
   if(!atIssuer()||!present(c,q.target)||!willing(c,q.target))return fail('需双方在场同意处理，不能远程裁决。');const gear=damaged(target)[0];if(!gear)return fail('当前没有实际受损器物。');if(alt){paidAmount(0.5);c.known?.(n,'dispute','只确认当前器物受损，原因未证实。','在场核实');return mark('dispute',gear.id,'双方获知当前损坏事实；未证明责任，不强扣任何第三方财产。',30);}
   if(p.gold<6||qty(p,'herb')<1||!free(n))return fail('自愿修复方案需玩家六金币、一份药草和工匠工时。');touch(c,'player',q.issuer,q.target);p.gold-=6;n.gold+=6;transfer(c,p,target,'herb',1);repair(target,gear.id);q.cost+=14;occupy(c,q.issuer,180,q);return mark('mediation',gear.id,'双方接受玩家自愿承担本次修复；责任争议未被强制裁决。',180);}
  case 'QC16':{
   const destination=q.stage===1&&!alt?'mountain.camp':t.destination;
   if(p.place!==destination)return fail('必须亲至'+destination+'观察该段，不能提交后台地图。');discoverRoutes(w,p.place);c.known?.(p,'survey:'+p.place,'本人于'+w.time+'亲见该段路标与可见通路。','亲历','witnessed');
   if(!alt&&!q.stage){q.stage=1;return mark('survey',p.place,'哨棚段已亲见，完整报告还需实际走至外缘营地；也可协商只交本段。',60,false);}
   paidAmount(alt?0.5:1);q.stage=2;return mark('survey',p.place,alt?'只验收哨棚一段，营地方向仍未查。':'两处路段分别亲见并记录时点，仅覆盖实际走过部分。',60);}
  case 'QC17':{
   if(!atIssuer())return fail('向导需在场决定行程。');if(alt){touch(c,q.issuer);n.next=Math.max(n.next,w.time+1440);q.due+=1440;paidAmount(0.25);return mark('reschedule',q.issuer,'双方同意将本次准备推迟一天；补给缺口仍在，未替其他委托改期。',15);}
   const amount=Math.max(1,6-qty(n,'food'));if(qty(p,'food')<amount)return fail('需补齐实际缺额'+amount+'份干粮。');touch(c,'player',q.issuer);transfer(c,p,n,'food',amount);q.cost+=amount*3;return mark('provision',q.issuer,'实际补齐六份出行口粮；路线耗时与其他承诺未改。',30);}
  case 'QC18':{
   if(p.place!=='mountain.cave'||!w.known.includes(p.place))return fail('必须按已知线索实际到达支洞。');const u=w.unique.find(x=>x.id==='relic');if(u.status==='sealed')u.status='available';discoverRoutes(w,p.place);c.known?.(p,'cave-observation',u.owner?'支洞札记已不在原处。':'已调查支洞入口，札记机会仍须凭能力取得。','亲历','witnessed');
   if(alt){const listener=c.rows.find(r=>r.id!=='player'&&present(c,r.id)&&willing(c,r.id));if(!listener)return mark('observation','relic','完成本人调查；现场没有愿意求证者，线索仅自留。',60);c.known?.(listener.value,'cave-observation','来者报告自己亲见的支洞入口情况。',p.name);}
   return mark('exploration','relic',alt?'实际观察已向在场愿意听取者求证，不复制札记。':'调查记录自留，无雇主、工资或交付义务。',60);}
  case 'QC19':{
   if(q.stage===1){if(!atIssuer()||q.custody.qty<1)return fail('采购物须实际交回委托人。');touch(c,q.issuer);add(n,q.custody.item,q.custody.qty);n.gold+=q.custody.gold;q.custody.qty=0;q.custody.gold=0;q.stage=2;return mark('handover',q.issuer,'采购物与未用预算实际交回，未保证未来销路。',15);}
   const amount=alt?1:t.qty,shop=w.stocks.find(s=>s.place===p.place&&s.item===t.item&&s.qty>=amount),cost=price(t.item)*amount;
   if(!shop||q.custody.gold<cost)return fail('需到真实有货的商店，在授权预算内采购。');shop.qty-=amount;shop.gold+=cost;shop.quote++;q.custody.gold-=cost;q.custody.item=t.item;q.custody.qty=amount;q.stage=1;paidAmount(alt?0.5:1);return mark('purchase',t.item,'用托付预算购得'+amount+'份药草，归委托人所有，尚须交回。',30,false);}
  case 'QC20':{
   if(!atIssuer())return fail('需与在场筹备者协商。');const owners=c.rows.filter(r=>r.value.alive&&r.value.place===p.place&&damaged(r.value).length&&willing(c,r.id)),owner=owners[0];
   if(alt){if(!owners.length)return fail('目前没有已知待处理的器物缺口。');paidAmount(0.25);touch(c,q.issuer);n.next=w.time+1440;return mark('reschedule',q.issuer,'筹备者据实际器物缺口延后一天，仅保留非战斗项目；未宣告比赛举行。',30);}
   if(!owner||qty(p,'herb')<1||p.gold<6||!free(n))return fail('需实际损坏器物、工匠、工料及费用。');touch(c,'player',q.issuer,owner.id);p.gold-=6;n.gold+=6;transfer(c,p,owner.value,'herb',1);repair(owner.value,damaged(owner.value)[0].id);q.cost+=14;occupy(c,q.issuer,180,q);return mark('preparation',owner.id,'实际检修一件器物，筹备短单结清；完整演武仍未开放。',180);}
  case 'QC21':{
   if(!atIssuer())return fail('需到交流主办者面前登记。');const proof=w.history.some(h=>h.refs?.includes('player')&&['repair','quest_repair','quest_practice','quest_production'].includes(h.kind));
   if(!alt&&!proof)return fail('缺少本人可引用的实作经历，可先实作或选择旁听。');touch(c,'player');p.interaction={kind:alt?'exchange_observer':'exchange_participant',target:q.issuer,place:p.place,at:w.time,source:q.id,relation:''};c.known?.(p,'exchange-admission',alt?'仅获旁听许可，不担保工艺。':'凭本人实作记录获准参与交流。',n.name);return mark('admission',q.issuer,alt?'已获旁听权限，不能冒用担保或药师认证。':'核验实际经历后获准展示，权限仅限本次交流。',30);}
  case 'QC23':{
   if(q.stage===1){if(p.place!==t.destination||!present(c,q.target))return fail('须本人和同伴实际到达歇脚坡，失去接触不更新位置。');q.stage=2;return mark('convoy',q.target,'共同到达歇脚坡，确认这一段实际同行路线。',30);}
   if(!atIssuer())return fail('先与商人在场约定。');if(alt){if(qty(n,'food')>=3)return fail('商人补给充足，不接受无依据的缺粮改期。');touch(c,q.issuer);n.next=w.time+1440;paidAmount(0.25);return mark('reschedule',q.issuer,'商人依据实际缺粮同意改期；并未替其规划未知路线。',15);}
   if(qty(p,'food')<2||capabilities(n).move||w.companions.length>=4)return fail('同行需两份补给、移动能力和同行名额。');touch(c,'player',q.issuer);transfer(c,p,n,'food',2);q.cost+=6;if(!w.companions.includes(q.target))w.companions.push(q.target);q.stage=1;return mark('consent',q.target,'获准结伴观察，须亲历行程才能形成路线报告。',15,false);}
  case 'QC24':{
   if(!atIssuer()||!present(c,q.target)||!willing(c,q.target))return fail('两位当事人须实际在场同意见证。');if(alt){paidAmount(0.5);return mark('witness',q.target,'只见证两位当事人此刻在场，不证明交付、货源或品质。',15);}
   if(qty(target,'food')<1||n.gold<3)return fail('当事人缺少可实际交接的货物或价款。');touch(c,q.target,q.issuer);transfer(c,target,n,'food',1);n.gold-=3;target.gold+=3;c.known?.(p,'witness:'+q.id,'亲见一份干粮与三金币当面交割，未鉴定货源。','亲历','witnessed');return mark('witness',q.target,'亲见一份干粮与三金币真实交割，证词只覆盖本次。',15);}
  case 'QC25':{
   if(p.place!==t.place)return fail('须亲到生境观察。');const e=ecologicalStock(w,p.place,w.time);if(!e)return fail('此处没有真实采集生境。');
   if(alt){paidAmount(0);c.known?.(p,'ecology:'+p.place,'本次亲见可采量'+e.herbs+'，选择停止。','亲历','witnessed');return mark('conservation',p.place,'已如实报告当前生境并停止采收；没有材料或生态奖励。',30);}
   if(e.herbs<2||capabilities(p).gather)return fail('无法在保留至少一份的条件下采集；可改为报告停止。');if(!atIssuer())return fail('采后交料须药工本人在场。');touch(c,q.issuer);e.herbs--;add(n,'herb',1);paidAmount(0.5);return mark('conservation',q.issuer,'实际只采一份交付，剩余生境不因结单刷新。',120);}
  case 'QC26':{
   const u=w.unique.find(x=>x.id==='redleaf');
   if(choice==='report'){
    if(p.place!==t.destination||!u||!u.owner&&u.status==='available')return fail('须本人到药谷核实原处已无可采赤叶；仍在的资源不能报告消失。');
    paidAmount(0);c.known?.(p,'opportunity-absence','亲见原生境已无可采赤叶；未获知远方持有者的位置或后续用途。','亲历','witnessed');
    return mark('opportunity_absence','redleaf','现场核实本次已失先机，零工资结束追逐；不揭露远方持有者，不重刷唯一物。',30);
   }
   if(!alt){if(p.place!==t.destination||u.owner||u.status!=='available'||p.rank<6||p.injury>40||capabilities(p).gather)return fail('真实机缘已失、位置或能力不满足；不会重刷。');touch(c,'player');u.owner='player';u.status='claimed';add(p,'redleaf',1);return mark('opportunity','redleaf','取得唯一赤叶，其他竞争者不能再取第二份。',180);}
   const holder=person(c,u.owner);if(!holder||u.owner==='player'||!present(c,u.owner)||!willing(c,u.owner)||qty(holder,'redleaf')<1||p.gold<price('redleaf')*2)return fail('需找到实际愿意出售的持有者，并备七十金币；不公开远方位置。');touch(c,'player',u.owner);p.gold-=70;holder.gold+=70;transfer(c,holder,p,'redleaf',1);u.owner='player';q.cost+=70;return mark('trade','redleaf','七十金币与唯一赤叶当面成交，实物所有权转移。',30);}
  case 'QC27':{
   if(!atIssuer()||capabilities(p).work)return fail('雇主须在场，玩家须具备劳动能力。');const shop=w.stocks.find(s=>s.place===p.place&&s.item==='food');if(!shop)return fail('本地没有可服务的实际经营库存。');const minutes=alt?120:240;paidAmount(alt?0.5:1);touch(c,'player');p.interaction={kind:'extra_shift',target:q.issuer,place:p.place,at:w.time,source:q.id,relation:''};return mark('shift',q.issuer,'已安排'+minutes+'分钟额外班次，既有义务继续计时，工资须满工时后验收。',minutes);}
  default:return fail('该种子的操作依赖尚未实现。');
 }
}
