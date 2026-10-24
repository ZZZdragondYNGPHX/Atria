import {qty,add,skill,learn,price} from './state.js';
import {capabilities} from './condition.js';
import {ITEMS} from '../content/catalog.js';

// Game parameters, not canon or user-confirmed numerical requirements.
export const ACTIVITY_RULES={version:1,activeCap:8,historyCap:24,commission:0.05,examPass:60};
import {initialQuestActivities} from './quest-state.js';
export {initialQuestActivities} from './quest-state.js';
const terminal=a=>['completed','failed','cancelled','unsold'].includes(a.status);
const actions={auction:['auction_bid','auction_close','auction_authorize','auction_cancel'],exam:['exam_prepare','exam_fire','exam_fuse','exam_inspect'],trial:['trial_prepare','trial_survey','trial_finish'],exchange:['exchange_show','exchange_finish']};
const label={auction:'公开拍卖',exam:'基础药师实操考核',trial:'补给与路勘试炼',exchange:'市井交流会',auction_work:'拍卖周边工作'};
const jobs={auction_appraise:['鉴定拍品',4],auction_provenance:['核实来源',3],auction_buyers:['寻访买家',4],auction_transport:['筹备物资运送',6],auction_assist:['协助寄售',4],auction_delivery:['成交后交付',5]};
const options={exam_prepare:['careful','generous','quick'],exam_fire:['steady','strong','gentle'],exam_fuse:['layered','swift','patient'],trial_prepare:['light','prepared'],trial_survey:['cautious','direct'],exchange_show:['herb','medicine','route']};
const optionLabel={careful:'仔细分拣（2份）',generous:'增料筛选（3份）',quick:'快速处理',steady:'稳火',strong:'猛火',gentle:'文火',layered:'分次融合',swift:'快速收丹',patient:'耐心温养',light:'轻装（1份粮）',prepared:'备足补给（2份粮）',cautious:'谨慎核对',direct:'直接赶路',herb:'展示药材',medicine:'展示药品',route:'交流亲历路况'};
const actionLabel={auction_bid:'提交出价',auction_close:'推进竞价／落槌',auction_authorize:'请求代拍授权',auction_cancel:'撤拍清算',exam_inspect:'请考官验收',activity_exit:'退出并清算',trial_finish:'交接试炼',exchange_finish:'完成交流'};
const option=(detail,item='',qty=0)=>({label:optionLabel[item]||actionLabel[detail]||detail,detail,item,qty,text:''});
const monetaryOption=(detail,amount)=>({...option(detail,'',amount<=100?amount:0),text:amount>100?String(amount):''});
const monetaryAmount=args=>{
 const text=(args.text||'').trim();if(text&&!/^\d{1,10}$/.test(text))return NaN;
 const amount=Number(text||args.qty);return Number.isSafeInteger(amount)&&amount>=1&&amount<=1000000000?amount:NaN;
};
export function questActivityView(w,rows,p){
 const state=w.questActivities||initialQuestActivities();
 const openings=[];
 if(p.place==='wutan.auction')openings.push({...option('auction_open','manual'),label:'查看现场拍品并开拍'},{...option('auction_consign','herb',1),label:'寄售自己的物品'});
 if(p.place==='blackrock.guild')openings.push({...option('exam_start'),label:'报名基础药师考核'});
 if(['wutan.clan','shimo.motie','qingshan.guild'].includes(p.place))openings.push({...option('trial_start'),label:'报名补给路勘试炼'});
 if(['wutan.workshop','wutan.teahouse','qingshan.herbal','blackrock.guild'].includes(p.place))openings.push({...option('exchange_start'),label:'参加市井交流'});
 return {openings,certificates:state.certificates.filter(x=>x.holder==='player'),history:state.history.slice(-6),instances:state.instances.filter(a=>a.participant==='player'||a.place===p.place).map(a=>({
  id:a.id,type:a.type,title:a.type==='auction_work'?jobs[a.mode][0]:label[a.type],place:a.place,host:a.host,status:a.status,stage:a.stage,role:a.role,item:a.item,quantity:a.quantity,price:a.price,bidder:a.bidder,round:a.round,score:a.score,material:a.material,spent:a.spent,summary:(a.workUntil>w.time?'工作尚需'+(a.workUntil-w.time)+'分钟。':'')+a.reason,at:a.at,due:a.due,workUntil:a.workUntil,destination:a.destination,
  budget:a.participant==='player'?a.budget:0,principal:a.participant==='player'?a.principal:'',
  options:a.workUntil>w.time?[{...option('activity_wait'),label:'继续工作／等待'},option('activity_exit')]:a.type==='auction_work'?terminal(a)?[]:[{...option(a.stage===0?'auction_job_perform':'auction_job_finish'),label:a.stage===0?'执行工作':'交接与结算'},option('activity_exit')]:terminal(a)?a.type==='auction'&&a.status==='completed'&&!a.steps.includes('job:auction_delivery')?[{...option('auction_delivery'),label:jobs.auction_delivery[0]}]:[]:a.type==='auction'?[...(a.role==='seller'?[]:[monetaryOption('auction_bid',a.price+(a.bidder?1:0))]),option('auction_close'),...(a.role==='buyer'?[option('auction_authorize')]:[]),option('auction_cancel'),...Object.keys(jobs).filter(k=>k!=='auction_delivery'&&!a.steps.includes('job:'+k)).map(k=>({...option(k),label:jobs[k][0]}))]:[...(options[actions[a.type]?.[a.stage]]||['']).map(item=>option(actions[a.type][a.stage],item)),option('activity_exit')],combatDependency:a.type==='trial'?'D33：战斗型分支后续独立实施':''
 }))};
}

/** Mutates the same world/person authorities. Caller advances returned spent via
 * the existing world clock and uses its normal atomic commit/idempotency guard. */
export function runQuestActivity(c,args){
 const {w,rows}=c,p=rows.find(r=>r.id==='player')?.value;
 const s=w.questActivities||(w.questActivities=initialQuestActivities()),choice=args.choice||args.detail||'',find=id=>rows.find(r=>r.id===id)?.value;
 const fail=text=>({ok:false,code:'activity_conditions',text,spent:0,id:''});
 const success=(a,text,spent=10)=>{if(terminal(a))spent=0;a.workUntil=Math.max(a.workUntil||0,w.time+spent);return {ok:true,code:'activity_updated',text,spent,id:a.id};};
 const local=n=>n?.alive&&n.place===p.place&&!capabilities(n).communicate;
 const hostAvailable=a=>local(find(a.host));
 const write=id=>c.touch(id);
 const log=(a,text)=>{a.reason=text;c.history?.('quest_activity',['player',a.id,a.host],text);};
 const finish=(a,status,text)=>{
  a.status=status;log(a,text);s.history.push({id:a.id,type:a.type,status,at:w.time,score:a.score,text});
  if(s.history.length>ACTIVITY_RULES.historyCap)s.history.splice(0,s.history.length-ACTIVITY_RULES.historyCap);
 };
 const create=(type,host,place)=>{
  // Only settled entries are evicted. No live escrow or obligations are dropped.
  const active=s.instances.filter(a=>!terminal(a)),recent=s.instances.filter(terminal),room=ACTIVITY_RULES.activeCap-active.length-1;
  s.instances=[...active,...(room>0?recent.slice(-room):[])];
  const a={id:'activity-'+(++s.serial),type,version:1,host,place,participant:'player',status:'active',stage:0,role:'participant',item:'',quantity:0,seller:'',stock:false,price:0,bidder:'',escrow:0,round:0,budget:0,principal:'',funds:0,score:0,material:0,spent:0,quality:0,mode:'',reason:'',at:w.time,due:w.time+1440,steps:[],workUntil:0,source:'',destination:'',cargo:false};
  s.instances.push(a);return a;
 };
 if(!p?.alive||capabilities(p).communicate||p.control?.holder)return fail('当前身体或受控状态不允许参加活动。');
 const opening=['auction_open','auction_consign','exam_start','trial_start','exchange_start'].includes(choice);
 if(opening&&s.instances.filter(a=>!terminal(a)).length>=ACTIVITY_RULES.activeCap)return fail('活动容量已满，请先完成或退出已有活动。');
 if(opening&&s.instances.some(a=>!terminal(a)&&a.place===p.place&&a.type===(choice.startsWith('auction')?'auction':choice.split('_')[0])))return fail('这里已有进行中的同类活动，请继续该场。');
 if(choice==='auction_open'||choice==='auction_consign'){
  if(p.place!=='wutan.auction'||!local(find('yafei')))return fail('需要在米特尔分号，且雅妃能够主持。');
  const item=args.item||'manual',n=choice==='auction_consign'?Number(args.qty||1):1;
  const stock=w.stocks.find(x=>x.place===p.place&&x.item===item);
  if(!Number.isSafeInteger(n)||n<1||n>10||!ITEMS.some(x=>x.id===item&&x.kind!=='unique')||!price(item))return fail('请选择一至十份可交易的普通物品。唯一物和装备实例不在本场寄售范围。');
  if(choice==='auction_open'&&(!stock||stock.qty<n)||choice==='auction_consign'&&qty(p,item)<n)return fail('没有足够的真实拍品可托管。');
  const a=create('auction','yafei',p.place);a.item=item;a.quantity=n;a.seller=choice==='auction_consign'?'player':'yafei';a.stock=choice==='auction_open';a.price=Math.max(1,Math.floor(price(item)*n*0.7));a.role=choice==='auction_consign'?'seller':'buyer';
  if(a.stock){stock.qty-=n;stock.quote++;}else{write('player');add(p,item,-n);}
  log(a,'拍品已实际移交托管；公开递增竞价，每次至少加一金币，三轮后可落槌。佣金为成交价的5%向上取整，流拍不收费。');return success(a,a.reason,15);
 }
 if(choice==='exam_start'){
  const examiner=['frank','aotuo'].find(id=>local(find(id)));
  if(p.place!=='blackrock.guild'||!examiner)return fail('考核须在黑岩公会，由在场且有能力的弗兰克或奥托主持。');
  if(capabilities(p).refine||p.fire<3||p.wood<1||p.soul<3||!skill(p,'formula')||!skill(p,'refining'))return fail('须先掌握丹方与控火，具备火中带木、灵魂和当前身体条件。');
  const a=create('exam',examiner,p.place);a.item='medicine';log(a,'本人四阶段实操报名成立。材料自备，处理阶段实际耗材；公布合格线60分，验收依据本次过程。');return success(a,a.reason);
 }
 if(choice==='trial_start'){
  const hosts=p.place==='wutan.clan'?['lin','xiaozhan']:p.place==='shimo.motie'?['xiaoding','xiaoli']:p.place==='qingshan.guild'?['he']:[];
  const host=hosts.find(id=>local(find(id)));
  if(!host||capabilities(p).move)return fail('需到家族或佣兵驻地，且负责人在场、自己能够行动。');
  if(p.place==='wutan.clan'&&w.background!=='clan'&&!p.visited.includes('person:lin'))return fail('家族试炼须有旁支身份或先与林砚建立实际接触。');
  const a=create('trial',host,p.place);a.mode=p.place==='wutan.clan'?'clan':'mercenary';log(a,'报名补给整理、现场路线勘核与交接试炼。战斗型分支保留D33依赖，不以后台冲突代替。');return success(a,a.reason);
 }
 if(choice==='exchange_start'){
  if(!['wutan.workshop','wutan.teahouse','qingshan.herbal','blackrock.guild'].includes(p.place))return fail('请到修器坊、听雨茶棚、青山药铺或黑岩公会交流场所。');
  const host=rows.find(r=>r.id!=='player'&&local(r.value));if(!host)return fail('需要实际在场的交流参与者。');
  const a=create('exchange',host.id,p.place);log(a,'交流会开始；可展示真实药材辨识、炼药成果，或已经走访的路况，然后交换可核实知识。');return success(a,a.reason);
 }
 const a=s.instances.find(a=>a.id===args.target);
 if(jobs[choice]){
  if(!a||a.type!=='auction'||a.steps.includes('job:'+choice)||s.instances.filter(x=>!terminal(x)).length>=ACTIVITY_RULES.activeCap)return fail('须选择真实拍品，本项工作只委托一次，且活动名额不能已满。');
  if(p.place!==a.place||!hostAvailable(a)||a.workUntil>w.time)return fail('需到拍卖现场，主持人能够沟通，且上一段工作时间已经完成。');
  if(choice==='auction_delivery'?a.status!=='completed':terminal(a))return fail('此项工作不适用于当前拍品阶段。');
  const buyer=a.bidder==='proxy'?a.principal:a.bidder,payer=choice==='auction_delivery'?buyer:a.host,n=find(payer),wage=jobs[choice][1];
  if(!n?.alive||!local(n)||payer==='player'||n.gold<wage)return fail('实际付款人须在场、同意且有足够报酬；不能由玩家伪造授权。');
  let item=a.item,quantity=a.quantity,destination=a.place,budget=0;
  if(choice==='auction_transport'){
   item=n.needitem;quantity=Math.min(2,Math.max(0,n.needqty-qty(n,item)));const stock=w.stocks.find(x=>x.place==='wutan.market'&&x.item===item);
   budget=price(item)*quantity;
   if(!quantity||!stock||stock.qty<quantity||n.gold<wage+budget)return fail('筹备运送只针对主持人真实未满足需求；市场货源和实际采购预算须足够。');
  }
  if(choice==='auction_assist'){
   item=args.item||'herb';quantity=1;
   if(!ITEMS.some(x=>x.id===item&&x.kind!=='unique')||qty(n,item)<=Math.max(1,n.needitem===item?n.needqty:0))return fail('协助寄售须有主持人可处分的真实余货；不能出售其必要补给或唯一物。');
  }
  if(choice==='auction_delivery'){
   if(qty(n,item)<quantity||n.home===a.place)return fail('买家须仍持有成交物，且有异地登记住所，才能同意实际送货。');destination=n.home;
  }
  if(choice==='auction_appraise'&&!(ITEMS.find(x=>x.id===item)?.kind==='manual'?skill(p,'basic'):skill(p,'formula')))return fail('鉴定该类拍品需要已经具备的功法或药材知识。');
  a.steps.push('job:'+choice);write(payer);n.gold-=wage+budget;
  const job=create('auction_work',a.host,a.place);job.source=a.id;job.mode=choice;job.seller=payer;job.item=item;job.quantity=quantity;job.destination=destination;job.escrow=wage;job.funds=budget;
  if(choice==='auction_delivery'||choice==='auction_assist'){add(n,item,-quantity);job.cargo=true;}
  log(job,jobs[choice][0]+'已由实际付款方同意，'+wage+'金币报酬托管。'+(budget?'另有'+budget+'金币采购专款。':'')+'实际执行、耗时与签收后结算。');return success(job,job.reason,10);
 }
 if(!a||terminal(a))return fail('该活动不存在或已经结清；不能重复领取或提交旧阶段。');
 if(a.participant!=='player')return fail('没有这场活动的参与权限。');
 if(choice==='activity_exit'||choice==='auction_cancel'){
  if(a.type==='auction_work'){
   const payer=find(a.seller);
   if(!payer)return fail('付款权利人记录暂不可读取，托管钱物保留。');
   if(a.cargo&&(!local(payer)||p.place!==a.place))return fail('须携实际托付货物回到原交接地点并联系物主，不能远程归还或抹除责任。');
   write(a.seller);payer.gold+=a.escrow+a.funds;a.escrow=0;a.funds=0;
   if(a.cargo){add(payer,a.item,a.quantity);a.cargo=false;}
  }
  if(a.type==='auction'){
   const bidder=a.bidder==='proxy'?a.principal:a.bidder;
   const invalid=!!a.bidder&&(!find(bidder)?.alive||!find(a.host)?.alive||a.bidder==='proxy'&&find(a.principal)?.needitem!==a.item);
   if(a.bidder&&!invalid)return fail('已有有效出价的拍品不能单方撤拍，请按规则落槌交割。');
   if(a.escrow&&!find(bidder)||a.funds&&!find(a.principal))return fail('退款权利人当前不可读取，钱物继续托管，须恢复合法权利人记录后清算。');
   if(a.escrow){write(bidder);find(bidder).gold+=a.escrow;a.escrow=0;}
   if(a.stock){const stock=w.stocks.find(x=>x.place===a.place&&x.item===a.item);stock.qty+=a.quantity;stock.quote++;}else{write(a.seller);add(find(a.seller),a.item,a.quantity);}
   if(a.funds){write(a.principal);find(a.principal).gold+=a.funds;a.funds=0;}
  }
  finish(a,'cancelled','退出活动；尚存托管钱物已按原所有权归还，实际已耗材料与时间不回滚。');return success(a,a.reason,0);
 }
 if(a.workUntil>w.time){
  if(choice==='activity_wait')return {ok:true,code:'activity_working',text:'工作按主世界时钟继续，至'+a.workUntil+'分钟才可进行下一阶段。',spent:a.workUntil-w.time,id:a.id};
  return fail('本段实际工作尚需'+(a.workUntil-w.time)+'分钟；取消推进不免除工时，请继续工作或等待。');
 }
 if(a.type==='auction_work'){
  const payer=find(a.seller);
  if(!payer)return fail('付款人记录不可读取，工作与托管保留。');
  if(choice==='auction_job_perform'&&a.stage===0){
   if(capabilities(p).work)return fail('当前身体不能执行本项实际工作。');
   if(a.mode==='auction_transport'){
    const stock=w.stocks.find(x=>x.place==='wutan.market'&&x.item===a.item),cost=price(a.item)*a.quantity;
    if(p.place!=='wutan.market'||!stock||stock.qty<a.quantity||a.funds<cost)return fail('须亲赴乌坦坊市，从实际库存提取已授权的物资。');
    stock.qty-=a.quantity;stock.gold+=cost;stock.quote++;a.funds-=cost;a.cargo=true;
   }else if(a.mode==='auction_delivery'){
    if(p.place!==a.destination)return fail('须实际携托付拍品抵达买家登记地点：'+a.destination+'。');
   }else{
    if(p.place!==a.place||!hostAvailable(a))return fail('须回拍卖现场与实际主持人完成工作。');
    if(a.mode==='auction_buyers'){
     const contact=rows.find(r=>!['player',a.host,a.seller].includes(r.id)&&local(r.value)&&r.value.needitem===a.item&&r.value.needqty>qty(r.value,a.item)&&r.value.gold>=price(a.item));
     if(!contact)return fail('现场尚无对该拍品有真实需求和支付能力的买家；寻访不能保证有人愿买。');
     a.principal=contact.id;c.known?.(p,'auction_buyer',contact.value.name+'对'+a.item+'有实际采购需求，已获知公开拍品。','本人现场寻访');
    }
    if(a.mode==='auction_appraise'){
     const required=ITEMS.find(x=>x.id===a.item)?.kind==='manual'?'basic':'formula';
     if(!skill(p,required)||p.qi<5)return fail('鉴定需要相应已知知识与5斗气。');write('player');p.qi-=5;a.score=skill(p,required);
    }
    if(a.mode==='auction_provenance'){
     const lot=s.instances.find(x=>x.id===a.source);
     if(!lot)return fail('原托管记录不可读取，不能编造来源证明。');
     a.principal=lot.seller;c.known?.(p,'auction_source','拍品'+a.item+'的托管来源已由现场记录核对：'+(lot.stock?'分号实际库存':'寄售人'+lot.seller)+'。','现场托管凭据');
    }
   }
   a.stage=1;log(a,'实际操作已经提交，须完成'+(a.mode==='auction_appraise'?30:20)+'分钟工作后交接；货物仍在托管，未提前发报酬。');return success(a,a.reason,a.mode==='auction_appraise'?30:20);
  }
  if(choice==='auction_job_finish'&&a.stage===1){
   if(a.mode==='auction_delivery'){
    if(p.place!==a.destination||!local(payer)||!a.cargo)return fail('实际收货人须在登记地点接收；货物与报酬保持托管，不能远程签收。');
   }else if(p.place!==a.place||!hostAvailable(a))return fail('须回拍卖现场向实际主持人交接。');
   if(a.mode==='auction_assist'&&s.instances.filter(x=>!terminal(x)).length>=ACTIVITY_RULES.activeCap)return fail('排拍容量已满；货物与报酬继续托管，请先清结其他活动。');
   write('player');write(a.seller);
   if(a.cargo&&a.mode!=='auction_assist'){add(payer,a.item,a.quantity);a.cargo=false;}
   if(a.mode==='auction_assist'){
    const lot=create('auction',a.host,a.place);lot.item=a.item;lot.quantity=a.quantity;lot.seller=a.seller;lot.role='buyer';lot.price=Math.max(1,Math.floor(price(a.item)*a.quantity*0.7));a.cargo=false;lot.reason='协助寄售形成的新拍品，原物主真实余货已托管。';
   }
   p.gold+=a.escrow;const paid=a.escrow;a.escrow=0;payer.gold+=a.funds;a.funds=0;a.stage=2;
   finish(a,'completed',jobs[a.mode][0]+'已按真实操作与签收结清，收到预先托管的'+paid+'金币；本项不可重复领取。');return success(a,a.reason,0);
  }
  return fail('请按该周边工作的实际阶段操作。');
 }
 if(p.place!==a.place)return fail('须回到活动场所亲自执行；考核与试炼不能由异地代理代做。');
 if(!hostAvailable(a))return fail('负责人当前不在场或失能。活动暂停，可等待、追踪或退出清算。');
 const step=(expected)=>a.stage===expected;
 if(a.type==='auction'){
  const refund=()=>{if(!a.bidder)return;if(a.bidder==='proxy')a.funds+=a.escrow;else{write(a.bidder);find(a.bidder).gold+=a.escrow;}a.escrow=0;};
  if(choice==='auction_authorize'){
   const id=args.item,n=find(id),budget=monetaryAmount(args);
   if(a.role!=='buyer'||a.bidder||a.principal||id===a.seller||id==='player'||!local(n)||n.needitem!==a.item||n.needqty<=qty(n,a.item)||!Number.isSafeInteger(budget)||budget<a.price||budget>Math.min(n.gold,price(a.item)*a.quantity*2))return fail('授权须由在场、有真实采购需求与资金的委托人同意；目标一致、无利益冲突且预算合理。');
   write(id);n.gold-=budget;a.principal=id;a.budget=budget;a.funds=budget;a.role='proxy';log(a,n.name+'同意代拍本件拍品，专款已实际托管；预算'+budget+'金币，所得直接归委托人。');return success(a,a.reason);
  }
  if(choice==='auction_bid'){
   if(a.seller==='player')return fail('禁止寄售者自买抬价。可推进竞价轮次，等待真实买家。');
   const amount=monetaryAmount(args),bidder=a.role==='proxy'?'proxy':'player';
   const minimum=a.bidder?a.price+1:a.price,available=(bidder==='proxy'?a.funds:p.gold)+(a.bidder===bidder?a.escrow:0);
   if(!Number.isSafeInteger(amount)||amount<minimum||amount>available||bidder==='proxy'&&amount>a.budget)return fail('出价须达到最低加价且有真实可用资金，代拍不得越过授权预算。');
   if(bidder==='proxy'&&(!find(a.principal)?.alive||find(a.principal).needitem!==a.item))return fail('委托人或授权采购需求已失效，请退出清算。');
   refund();if(bidder==='proxy')a.funds-=amount;else{write('player');p.gold-=amount;}a.bidder=bidder;a.escrow=amount;a.price=amount;a.round++;
   log(a,'有效最高出价'+amount+'金币已实际占用；资金不可同时花在其他交易。');return success(a,a.reason,5);
  }
  if(choice==='auction_close'){
   if(a.round<3){
    // Demand and catalogue price set a public-information valuation. Never read
    // player money or proxy maximum to choose an NPC bid.
    const candidate=rows.filter(r=>!['player',a.seller,a.host,a.principal,a.bidder].includes(r.id)&&local(r.value)&&r.value.needitem===a.item&&r.value.needqty>qty(r.value,a.item)).sort((x,y)=>x.id.localeCompare(y.id)).find(r=>r.value.gold>=a.price+(a.bidder?1:0)&&price(a.item)*Math.min(a.quantity,r.value.needqty-qty(r.value,a.item))>=a.price+(a.bidder?1:0));
    if(candidate){const amount=a.price+(a.bidder?1:0);refund();write(candidate.id);candidate.value.gold-=amount;a.bidder=candidate.id;a.escrow=amount;a.price=amount;}
    a.round++;log(a,candidate?'真实需求买家提出有效加价，前一最高价资金已释放。':'本轮无人继续加价。');return success(a,a.reason,5);
   }
   if(!a.bidder){
    if(a.stock){const stock=w.stocks.find(x=>x.place===a.place&&x.item===a.item);stock.qty+=a.quantity;stock.quote++;}else{write(a.seller);add(find(a.seller),a.item,a.quantity);}
    if(a.funds){write(a.principal);find(a.principal).gold+=a.funds;a.funds=0;}
    finish(a,'unsold','三轮无有效买家，流拍拍品与未用代拍预算已归还原主。');return success(a,a.reason);
   }
   const buyer=a.bidder==='proxy'?a.principal:a.bidder,recipient=find(buyer);
   if(!recipient?.alive)return fail('得主无法接收，拍品和资金继续托管，不能将失败写成完成。');
   const fee=Math.ceil(a.escrow*ACTIVITY_RULES.commission),net=a.escrow-fee;
   write(buyer);add(recipient,a.item,a.quantity);write(a.host);find(a.host).gold+=fee;
   if(a.stock){const stock=w.stocks.find(x=>x.place===a.place&&x.item===a.item);stock.gold+=net;stock.quote++;}else{write(a.seller);find(a.seller).gold+=net;}
   if(a.funds){write(a.principal);find(a.principal).gold+=a.funds;a.funds=0;}
   a.escrow=0;finish(a,'completed','落槌成交：原托管拍品交给得主，价款与佣金实际到账，剩余代理预算退还；本场不可重复结算。');return success(a,a.reason,10);
  }
 }
 if(a.type==='exam'){
  if(capabilities(p).refine)return fail('当前身体不支持实操；可保留过程等待恢复或退出。');
  if(choice==='exam_prepare'&&step(0)){
   const mode=args.item||'careful',n=mode==='generous'?3:2;if(!options.exam_prepare.includes(mode)||qty(p,'herb')<n)return fail('材料处理需要两份药草，增料筛选需要三份；请明确处理方式。');
   write('player');add(p,'herb',-n);a.material=n;a.spent=n;a.mode=mode;a.quality=skill(p,'formula')*3+(mode==='generous'?24:mode==='careful'?20:5);a.score=a.quality;a.stage=1;a.steps.push(mode);log(a,'药材已投入并处理；投入'+n+'份，材料状态评分'+a.quality+'，不能回滚为背包原料。');return success(a,a.reason,mode==='quick'?10:30);
  }
  if(choice==='exam_fire'&&step(1)){
   const mode=args.item||'steady',qi=mode==='strong'?25:15;if(!options.exam_fire.includes(mode)||p.qi<qi)return fail('请选择火候并准备足够斗气：稳火/文火15，猛火25。');
   write('player');p.qi-=qi;a.score+=skill(p,'refining')*3+Math.min(12,p.fire*2)+(mode==='steady'?20:mode==='gentle'?12:p.fire>=6?24:-15);a.stage=2;a.steps.push(mode);log(a,'控火提炼已消耗'+qi+'斗气，前序材料质量持续计入。');return success(a,a.reason,25);
  }
  if(choice==='exam_fuse'&&step(2)){
   const mode=args.item||'layered';if(!options.exam_fuse.includes(mode)||p.qi<10)return fail('融合需要10斗气和明确收丹方式。');
   write('player');p.qi-=10;a.score+=Math.min(12,p.soul*2)+(mode==='layered'?15:mode==='patient'?20:-10);a.stage=3;a.steps.push(mode);log(a,'融合成丹过程完成，待获准考官验收；旧背包成品不能替换本次成果。');return success(a,a.reason,mode==='patient'?40:20);
  }
  if(choice==='exam_inspect'&&step(3)){
   const passed=a.score>=ACTIVITY_RULES.examPass;write('player');if(passed){add(p,'medicine',1);learn(p,'refining');if(!s.certificates.some(x=>x.holder==='player'&&x.kind==='basic-alchemist'))s.certificates.push({holder:'player',kind:'basic-alchemist',issuer:a.host,at:w.time,evidence:a.id,version:1});}
   a.stage=4;finish(a,passed?'completed':'failed',(passed?'通过基础实操，取得本次实际成品与公会基础认证。':'考核未通过，不产生合格丹药或资格，已投入药材实际损失。')+'过程评分'+a.score+'，合格线60。');return success(a,a.reason,15);
  }
 }
 if(a.type==='trial'){
  if(capabilities(p).work)return fail('当前身体无法执行试炼负重和路勘。');
  if(choice==='trial_prepare'&&step(0)){
   const mode=args.item||'prepared',n=mode==='prepared'?2:1;if(!options.trial_prepare.includes(mode)||qty(p,'food')<n)return fail('稳妥准备需两份干粮，轻装需一份。');write('player');add(p,'food',-n);a.material=n;a.spent=n;a.score=mode==='prepared'?25:10;a.stage=1;log(a,'试炼补给已实际投入；下一步核对本人已走访的路段。');return success(a,a.reason,20);
  }
  if(choice==='trial_survey'&&step(1)){
   const route=a.mode==='clan'?'wutan.depot':a.place==='shimo.motie'?'shimo.gate':'qingshan.trail';
   if(!p.visited.includes(route))return fail('需要本人先走访'+route+'，再回来提交现场路勘，文字描述不能替代实际到访。');
   const mode=args.item||'cautious';if(!options.trial_survey.includes(mode))return fail('请选择谨慎核对或直接赶路。');a.score+=mode==='cautious'?35:20;a.stage=2;a.steps.push(route,mode);log(a,'已核验本人走访记录，路线准备进入负责人交接。');return success(a,a.reason,mode==='cautious'?40:15);
  }
  if(choice==='trial_finish'&&step(2)){
   const passed=a.score>=45;write('player');if(passed){learn(p,'basic');c.appraisal?.(find(a.host),p,'trust',4,'亲自完成了补给与路线交接试炼。');}a.stage=3;finish(a,passed?'completed':'failed',passed?'非完整战斗试炼合格，获得基础训练经验与负责人的履约信任。':'补给和勘核不足，试炼未合格；实际补给投入不返还，可重新准备。');return success(a,a.reason,15);
  }
 }
 if(a.type==='exchange'){
  if(choice==='exchange_show'&&step(0)){
   const mode=args.item||'herb';
   if(mode==='herb'&&(qty(p,'herb')<1||!skill(p,'formula'))||mode==='medicine'&&(qty(p,'medicine')<1||!skill(p,'refining'))||mode==='route'&&p.visited.filter(x=>!x.startsWith('person:')).length<3||!options.exchange_show.includes(mode))return fail('药材展示需真实样品与丹方知识，药品展示需实际成品与控火，路况交流需至少三个本人到访地点。');
   if(mode!=='route'){write('player');write(a.host);add(p,mode,-1);add(find(a.host),mode,1);}a.item=mode;a.stage=1;a.score=mode==='medicine'?3:1;log(a,'展示依据已经核实；药材/药品样本实际交给交流对象，路况仅来自本人到访。');return success(a,a.reason,20);
  }
  if(choice==='exchange_finish'&&step(1)){
   write('player');if(a.item==='medicine')learn(p,'refining');else if(a.item==='herb')learn(p,'formula');else learn(p,'basic');c.appraisal?.(find(a.host),p,'trust',a.score,'交流会上分享了可核实的实际成果。');a.stage=2;finish(a,'completed','交流已结清：依据展示获得相应练习经验及现场参与者信任，不公开他人秘密或自动取得高级知识。');return success(a,a.reason,20);
  }
 }
 return fail('该操作不属于当前活动阶段，或已执行；请使用当前可用选项。');
}
