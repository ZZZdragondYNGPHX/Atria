import {qty,add,price} from './state.js';
import {capabilities} from './condition.js';
import {DAY} from '../content/catalog.js';
const active=o=>o.status==='open';
const answer=(ok,code,text,spent=0)=>({ok,code,text,spent});
const read=(c,id)=>c.rows.find(r=>r.id===id)?.value;
const local=(c,o)=>c.p.place===o.place&&read(c,o.issuer)?.place===o.place;
function observe(c,o){if(local(c,o)){o.observedAt=c.w.time;o.observedRemaining=o.remaining;o.observedStatus=o.status;}}
function refund(c,o,status){const n=read(c,o.issuer);if(n?.alive&&o.escrow){c.touch(o.issuer);n.gold+=o.escrow;o.escrow=0;}o.status=status;observe(c,o);}
function settle(c,o,actor,amount){
 const n=read(c,o.issuer),p=read(c,actor),prior=o.contributions.find(r=>r.actor===actor);
 if(!active(o)||!n?.alive||!p?.alive||n.place!==o.place||p.place!==o.place||p.destination||capabilities(p).communicate||actor===o.issuer||!Number.isInteger(amount)||amount<1||amount>o.remaining||qty(p,o.item)<amount||o.escrow<amount*o.unitReward||o.kind==='single'&&amount!==o.remaining||!prior&&o.contributions.length>=16)return false;
 const paid=amount*o.unitReward;c.touch(actor);c.touch(o.issuer);add(p,o.item,-amount);add(n,o.item,amount);p.gold+=paid;o.escrow-=paid;o.remaining-=amount;
 if(n.needitem===o.item)n.needqty=Math.max(0,n.needqty-amount);
 if(prior){prior.qty+=amount;prior.paid+=paid;prior.at=c.w.time;}else o.contributions.push({actor,qty:amount,paid,at:c.w.time});
 c.history('public_contribution',[o.id,actor,o.issuer],actor+'交付'+amount+'份'+o.item+'，从已交存预算实收'+paid+'金币。');
 if(!o.remaining)refund(c,o,'completed');observe(c,o);return true;
}
export function runPublicQuest(c,a){
 const list=c.w.quests.publicOffers;
 if(a.detail==='public_discover'){
  // Publication and observation are one local, checked action. No global board.
  let found=0;
  for(const r of c.rows){const n=r.value;
   if(r.id==='player'||!n.alive||n.place!==c.p.place||n.destination||capabilities(n).communicate||n.needqty<1||!['food','herb','medicine'].includes(n.needitem))continue;
   const old=list.find(o=>o.issuer===r.id&&active(o));if(old){observe(c,old);continue;}
   if(list.some(o=>o.issuer===r.id&&c.w.time-o.created<DAY))continue;
   const quantity=Math.min(8,n.needqty),unitReward=price(n.needitem)+2,budget=quantity*unitReward;
   if(n.gold<budget)continue;
   if(list.length>=12){const i=list.findIndex(o=>!active(o)&&o.escrow===0);if(i<0)break;list.splice(i,1);}
   c.touch(r.id);n.gold-=budget;
   const o={id:'public-'+(++c.w.quests.serial),seed:'QC02',issuer:r.id,item:n.needitem,quantity,remaining:quantity,unitReward,escrow:budget,kind:quantity===1?'single':'contribution',status:'open',place:c.p.place,created:c.w.time,due:c.w.time+3*DAY,observedAt:c.w.time,observedRemaining:quantity,observedStatus:'open',contributions:[]};list.push(o);found++;
   c.history('public_offer',[o.id,r.id],n.name+'对实际'+n.needitem+'缺口交存'+budget+'金币并发布'+(o.kind==='single'?'单一有效成果':'按有效数量贡献')+'公告。');
   if(found>=2)break;
  }
  return answer(true,'public_discovered',found?'已当场读到'+found+'份真实托管悬赏，条款对所有人相同。':'没有新成立的当地公开悬赏；已知公告已按当场可见情况核实。',5);
 }
 const o=list.find(o=>o.id===a.target);
 if(a.detail!=='public_contribute'||!o)return answer(false,'public_unknown','没有这份本人已经读到的公开悬赏。');
 if(c.w.time>o.due){if(active(o))refund(c,o,'expired');return answer(false,'public_expired','原公告期限已过，未用预算退还发布者。');}
 if(!local(c,o)||!c.near(read(c,o.issuer)))return answer(false,'public_location','必须实际接触发布者交付；旧公告不提供实时位置。');
 if(!settle(c,o,'player',a.qty||1))return answer(false,'public_rejected','成果、余量、库存或原公告条款不满足，未扣物也未发款。');
 return answer(true,'public_contributed',o.kind==='single'?'首份有效实物已经验收付款，后续不能重复领奖。':'按实际收到的数量付款，剩余缺口'+o.remaining+'份。',10);
}
export function stepPublicQuests(c,r){
 if(!r)return false;
 for(const o of c.w.quests.publicOffers){
  if(!active(o))continue;
  const issuer=read(c,o.issuer);
  if(c.w.time>o.due){if(r.id!==o.issuer)continue;refund(c,o,'expired');return false;}
  if(!issuer?.alive){o.status='issuer_unavailable';observe(c,o);return false;}
  // Others compete only after publication has existed for an hour. No virtual
  // contributions: one willing local actor supplies actual surplus inventory.
  if(c.w.time<o.created+60||issuer.place!==o.place)continue;
  const candidate=r.id!=='player'&&r.id!==o.issuer&&r.value.alive&&r.value.place===o.place&&!r.value.destination&&!capabilities(r.value).communicate&&['','rest','work'].includes(r.value.activity.kind)&&qty(r.value,o.item)>Math.max(2,r.value.needitem===o.item?r.value.needqty:0);
  if(candidate&&settle(c,o,r.id,1)){r.value.next=Math.max(r.value.next,c.w.time+60);return true;}
  observe(c,o);
 }
 return false;
}
export function publicQuestView(w,rows,p){const c={w,rows,p};return (w.quests.publicOffers||[]).map(o=>{const status=local(c,o)?o.status:o.observedStatus,remaining=local(c,o)?o.remaining:o.observedRemaining,paid=o.contributions.filter(r=>r.actor==='player').reduce((n,r)=>n+r.paid,0);return {id:o.id,seed:o.seed,title:o.kind==='single'?'首份有效成果悬赏':'按量公开募集',issuer:o.issuer,status,due:o.due,source:'当地公开公告',observedAt:local(c,o)?w.time:o.observedAt,place:o.place,terms:(o.kind==='single'?'提交首份完整有效成果者获酬':'按实际交付数量分配报酬')+'；'+o.item+'共'+o.quantity+'份，每份'+o.unitReward+'金币；发行时预算实际托管；不得私改公告条款。',progress:(local(c,o)?'现场核实':'上次核实')+'剩余'+remaining+'份；本人已收'+paid+'金币。',tracked:false,alternatives:[],options:status==='open'?[{label:'交付一份实际成果',detail:'public_contribute',item:'',qty:1,text:''}]:[]};});}
export function publicQuestSchemas(S,I,B,O,A){return {
 state:A(O({id:S(),seed:S(),issuer:S(),item:S(),quantity:I(1,8),remaining:I(0,8),unitReward:I(),escrow:I(),kind:S(16,['single','contribution']),status:S(),place:S(),created:I(),due:I(),observedAt:I(),observedRemaining:I(0,8),observedStatus:S(),contributions:A(O({actor:S(),qty:I(),paid:I(),at:I()}),16)}),12),
 view:A(O({id:S(),seed:S(),issuer:S(),item:S(),quantity:I(1,8),remaining:I(0,8),unitReward:I(),kind:S(16,['single','contribution']),status:S(),place:S(),at:I(),due:I(),stale:B,contributed:I(),paid:I()}),12)
};}
