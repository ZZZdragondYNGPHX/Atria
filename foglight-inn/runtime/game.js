import {places,people,personIds,period,timeLabel,whereabouts,available,reserves,routes,imageFor,promiseNames,descriptions} from './public.js';
import {opening,notices,topics,clues,endings} from './story.js';

export function initial(){return {started:false,name:'',preference:'',spent_ap:0,location:'inn',stock:{supplies:6,fuel:4,parts:3},facilities:{light:0,pier:0,radio:0},
 ferry_registered:false,transfer_coordinated:false,departure_prepared:false,stay_prepared:false,exchanged:false,supply_taken:false,ration_pending:0,rations:['','',''],meals:[false,false,false],
 jobs:[],work_counts:{zhou:0,lin:0,xu:0,shen:0},promises:{zhou:'none',lin:'none',xu:'none',shen:'none'},topics:{zhou:false,lin:false,xu:false,shen:false},
 knowledge:[],memories:[],npc_known:{zhou:[],lin:[],xu:[],shen:[]},events:[],investigated:[],shared:[],final_plan:'',echo:'',sequence:0,
 last:{token:'',title:'三天的托付',summary:'先认识你，再开始代管。',body:'',changes:'',before:0,after:0}};}
const cap={supplies:8,fuel:6,parts:5},costNames={supplies:'储粮',fuel:'燃料',parts:'零件'};
const idOf=(kind,target='',detail='')=>[kind,target,detail].join(':');
const blocked=(g)=>g.final_plan?'本局已收束':g.spent_ap>=24?'普通行动窗口已结束':g.ration_pending?'先单独安排当夜配给':'';
function addKnowledge(g,id,title,kind,source,text){if(g.knowledge.some(k=>k.id===id))return;g.knowledge.push({id,title,kind,source,at:timeLabel(g),text});}
function remember(g,npc,event,text,source='当面经历'){g.memories.push({npc,event,text,source,at:timeLabel(g)});}
function announce(g,t){const n=notices[t];if(!n||g.events.includes('public_'+t))return '';g.events.push('public_'+t);addKnowledge(g,'public_'+t,n[0],'公共通知',n[0],n[1]);for(const npc of personIds)g.npc_known[npc].push('public_'+t);return n[0]+'：'+n[1];}
function jobPlace(target){return {light:'lighthouse',pier:'pier',radio:'radio',departure:'inn',ferry:'pier',transfer:'pier'}[target];}
function workCost(g,target){return target==='light'?{parts:2-g.facilities.light,fuel:g.facilities.light<2?1:0}:target==='pier'?{parts:g.facilities.pier<2?1:0,fuel:0}:target==='radio'?{parts:1-g.facilities.radio,fuel:0}:{parts:0,fuel:0};}
function isDone(g,t){return t==='light'?g.facilities.light===2:t==='pier'?g.facilities.pier===2:t==='radio'?g.facilities.radio===1:t==='ferry'?g.ferry_registered:t==='transfer'?g.transfer_coordinated:g.departure_prepared;}
const workNames={light:'灯塔剩余检修',pier:'码头剩余工作',radio:'现用报务台接点',ferry:'末班船登记',transfer:'避风转运协调',departure:'离岛行装'};
function finishWork(g,t){if(t==='light')g.facilities.light=2;else if(t==='pier')g.facilities.pier=2;else if(t==='radio')g.facilities.radio=1;else if(t==='ferry')g.ferry_registered=true;else if(t==='transfer')g.transfer_coordinated=true;else g.departure_prepared=true;}
function occupied(g,t){return g.jobs.some(j=>j.status==='active'&&j.target===t);}
function costText(c){return Object.entries(c).filter(([,n])=>n).map(([k,n])=>costNames[k]+' '+n+' 份').join('、')||'不消耗物资';}
function jobTargets(g,n){if(n==='lin')return ['light','pier','radio'];if(n==='zhou')return ['light','pier'];if(n==='xu')return ['pier'];return ['ferry','transfer','departure'];}
function canWork(g,n,t){if(n==='zhou'&&t==='light'&&g.facilities.light!==1)return '先完成灯塔电源检修';if(['zhou','xu'].includes(n)&&t==='pier'&&g.facilities.pier!==0)return '仅能承担码头第一步';return '';}
export function options(g){
 const out=[],r=reserves(g),free={...g.stock,parts:g.stock.parts-r.parts,fuel:g.stock.fuel-r.fuel};
 function add(kind,target,detail,label,ap=0,cost={},reason='',note=''){
  reason=reason||(ap?blocked(g):g.final_plan&&!['echo'].includes(kind)?'本局已收束':'');
  for(const [k,n] of Object.entries(cost))if(n>free[k])reason=reason||costNames[k]+'可用量不足（需 '+n+'，可用 '+free[k]+'）';
  out.push({id:idOf(kind,target,detail),kind,target,detail,label,ap,cost:{supplies:cost.supplies||0,fuel:cost.fuel||0,parts:cost.parts||0},enabled:!reason,reason,note,costText:(ap?'行动 '+ap+' 次；':'不推进行动时间；')+costText(cost)});
 }
 if(!g.started){add('start','','','开始代管',0,{},'', '以普通临时代管者的身份开始三天。');return out;}
 if(g.final_plan){if(!g.echo)for(const [target,label]of(g.final_plan==='stay'?[['respond','轻声回应'],['listen','静听最后的回响'],['off','关掉退役机']]:[['listen','读叶姨转来的便笺'],['respond','给叶姨回一行字'],['off','把便笺收好']]))add('echo',target,'',label);return out;}
 for(const [p,name] of Object.entries(places))if(g.location!==p)add('move',p,'','前往'+name,0,{},'', '普通移动不调查、不推进工作。');
 if(g.ration_pending){for(const [type,label,cost] of [['warm','暖餐与炉火',{supplies:1,fuel:1}],['cold','冷餐，节省燃料',{supplies:1}],['emergency','当晚封存应急简餐',{}]])add('ration',type,'',label,0,cost,'','独立于刚才的工作确认；不另耗 AP。灯塔备用供电仍需 1 份燃料。');return out;}
 if(g.spent_ap===24){const rs=routes(g);for(const [k,l] of [['light','依灯塔航标登末班船'],['harbor','依避风方案短程转运'],['stay','留在旅舍等风停']]){
  const missing=k==='light'?[g.facilities.light!==2?'灯组未就绪':'',!g.ferry_registered?'尚未登记末班船':'',!g.departure_prepared?'行装未备齐':'']:k==='harbor'?[g.facilities.pier!==2?'转运位未就绪':'',!g.transfer_coordinated?'尚未协调转运':'',!g.departure_prepared?'行装未备齐':'']:[];
  add('final',k,'',l,0,{},rs[k]?'':missing.filter(Boolean).join('；'),'最终决定不可逆。查看和取消都不会结束；留守的最低安排免费补齐。');}return out;}
 const facilities={lighthouse:'light',pier:'pier',radio:'radio'},t=facilities[g.location];
 if(t){const done=isDone(g,t),stage=g.facilities[t],cost=t==='light'?(stage===0?{parts:1}:{parts:1,fuel:1}):t==='pier'?(stage===0?{}:{parts:1}):{parts:1};
  const label=t==='light'?(stage===0?'检修灯塔电源接点':'检查灯组与备用供电'):t==='pier'?(stage===0?'清理码头通道':'固定码头转运位'):'检修现用报务台';
  add('repair',t,'',label,1,cost,done?'已完成，可免费查看状态':occupied(g,t)?'已有协助承担这一设施':'','只完成这一步。按公开断电、防护步骤作业，不登高、不带电冒险。');}
 if(g.location==='pier')add('exchange','','','按配货单置换备用零件',1,{supplies:1},g.exchanged?'这批备用零件已经领取':g.stock.parts===5?'零件库存已满':'','留下储粮一批，领取寄存柜明确的一包备用零件；全局仅一次。');
 if(g.location==='store')add('supply','','','清点封存干粮',1,{},g.supply_taken?'这批干粮已清点':g.stock.supplies===8?'储粮没有接收空间':'','实际得到储粮 '+Math.min(2,8-g.stock.supplies)+' 份；封存应急餐另存，不转为库存。');
 if(g.location==='pier'||g.location==='radio'){
  const radioReason=g.location==='radio'&&g.facilities.radio!==1?'现用报务台尚未修好，可到码头纸面登记':'';
  add('register','','','登记末班船',1,{},g.ferry_registered?'已有登记回执':occupied(g,'ferry')?'沈遥正在登记':radioReason,'仅登记第三夜末已知班次，不创造船期。');
  add('coordinate','','','协调避风短程转运',1,{},g.transfer_coordinated?'已有协调回执':occupied(g,'transfer')?'沈遥正在协调':radioReason,'登记范围限于约定的背风接驳。');}
 if(['inn','store'].includes(g.location))add('pack','','','整理离岛行装',1,{},g.departure_prepared?'行装已准备':occupied(g,'departure')?'沈遥正在整理':'','两条离岛路线共用，不扣食物。');
 if(g.location==='inn')add('stay','','','提前商量留守',1,{},g.stay_prepared?'已提前安排':'','不排斥后来离岛；不消耗物资。最后决定时也可免费补最低安排。');
 if(period(g)%4===3&&g.location==='inn')add('meal','','','一起围坐一会儿',1,{},g.meals[Math.floor(period(g)/4)]?'今晚已围坐':'','只花行动点，使用已确认配给，不再扣粮和燃料。');
 for(const [id,c] of Object.entries(clues))if(c.place===g.location&&g.spent_ap>=c.min&&g.spent_ap<=c.max)add('investigate',id,'',c.title,1,{},g.investigated.includes(id)?'已经调查，请到记事免费重读':'','花一次行动，记录现场可见事实及其来源。');
 for(const n of personIds){const onSite=whereabouts(g,n)===g.location&&available(g,n);if(!onSite)continue;
  add('talk',n,'public','与'+people[n].name+'核对眼前的事',1,{},g.shared.includes('public_'+n)?'本次事项已谈过，可在记事回看':'','只核对其专业范围与现有记录，不取得私人秘密。');
  if(g.spent_ap>=8&&['shen','xu'].includes(n))add('talk',n,'archive',n==='shen'?'征得同意查阅旧邮务副本':'请许澄核对旧天气记录',1,{},g.shared.includes('archive_'+n)?'已经核对，可免费回看':'','只查对方可提供的资料，保留来源；不要求透露私人心事。');
  if(g.spent_ap>=8)add('talk',n,'private',topics[n].title,1,{},g.topics[n]?'已经交流，可在记事回看':'','可以倾听、停止或保持距离。不保证替对方解决人生选择。');
  for(const target of jobTargets(g,n)){
   let reason=isDone(g,target)?'该事项已就绪':occupied(g,target)?'这项工作已有人承担':g.jobs.filter(j=>j.status==='active').length>=2?'同时最多两项协助':g.work_counts[n]>=2?'已承担过两次正式工作':g.spent_ap+3>24?'窗口前来不及完成':canWork(g,n,target);
   add('assist',n,target,'请'+people[n].name+'承担'+workNames[target],1,['zhou','xu'].includes(n)&&target==='pier'?{parts:0,fuel:0}:workCost(g,target),reason,'接受后预留物资，再推进两次有效行动才交付；免费取消释放预留，已用行动不返还。');
  }
  const st=g.promises[n];if(st==='offered')add('promise',n,'accept','答应'+promiseNames[n],0,{},g.spent_ap>=(['zhou','lin'].includes(n)?22:24)?'窗口不足，不再新接约定':'','承诺不额外收费；实际交付另用 1 AP。期限：'+(['zhou','lin'].includes(n)?'第三天暮段结束前':'第三夜最后一次普通行动结算前')+'。');
 }
 for(const j of g.jobs.filter(j=>j.status==='active'))add('cancelJob',j.npc,j.target,'取消'+people[j.npc].name+'的'+workNames[j.target],0,{},'','释放未消耗的预留资源，已用 AP 不返还；取消前没有半成品奖励。');
 for(const n of personIds){const st=g.promises[n];if(['offered','accepted','overdue'].includes(st))add('promise',n,'cancel',(st==='offered'?'婉拒':'取消')+promiseNames[n],0,{},'','只影响这一具体约定，不撤回安全帮助。');
  const loc=n==='zhou'?['radio']:n==='lin'?['store']:n==='xu'?['inn','radio']:['pier'];
  if(['accepted','overdue'].includes(st)&&loc.includes(g.location))add('deliver',n,'','完成'+promiseNames[n],1,{},'','使用已有剧情物件，不消耗零件，不新增物资；逾期交付会如实记为迟交。');
 }
 for(const k of g.knowledge.filter(k=>!k.id.startsWith('public_')&&k.kind!=='行动回执')){for(const n of personIds)if(available(g,n)&&whereabouts(g,n)===g.location&&!g.npc_known[n].includes(k.id))add('share',n,k.id,'向'+people[n].name+'转述「'+k.title+'」',1,{},'', '保留原来源，记为由你告知；不代表对方亲见或同意。');}
 add('wait','','','歇一会儿，等候一次行动',1,{},'','不发资源、不刷关系；推进已安排工作和公共阶段。');return out;
}
function settleDue(g,parts){for(const j of g.jobs){if(j.status!=='active'||j.due>g.spent_ap)continue;g.stock.parts-=j.parts;g.stock.fuel-=j.fuel;if(['zhou','xu'].includes(j.npc)&&j.target==='pier')g.facilities.pier=1;else finishWork(g,j.target);j.status='done';const s=people[j.npc].name+'完成了'+workNames[j.target]+'，预留物资已实际使用。';parts.push(s);remember(g,j.npc,'work_'+j.target,s);}}
function epilogues(g){return personIds.map(n=>{
 const fulfilled=['done','late'].includes(g.promises[n]),late=g.promises[n]==='late';let text;
 if(n==='zhou')text=fulfilled?'后来，周守川在值班本旁多夹了一页你们一起整理的索引。他仍有会难过的日子，却愿意把那一页借给后来的人。':g.topics.zhou?'周守川按便条收回了值班本。他没把错过的约定当成灾难，也没有说十八年的事已经过去。':'周守川留下了灯塔安全说明，照常在自己能力内帮忙。你没有问尽他的旧事。';
 if(n==='lin')text=fulfilled?'工具抽屉留着你补好的标签。林岚寄来新工作台的一张照片，背面只写：“这边也总有人找不到螺丝刀。”':g.topics.lin?'林岚留下简短清单，按自己的计划去内陆工作。她没有为了等一张标签放弃离开。':'林岚完成承担的技术工作，收好自己的工具。公共抽屉留下几件常用小工具。';
 if(n==='xu')text=fulfilled?'许澄收到了字迹各异的交接便笺。你诚实留空的地方仍留着，没有被改成一个好看的数字。':g.topics.xu?'许澄带走了受潮原页，继续整理能辨认的部分。她的最后一份海况记录如期交接。':'许澄完成最后观测，留下简单的记录办法。后来旅舍寄来一张写着风向的明信片。';
 if(n==='shen')text=fulfilled?'沈遥的封缄信随邮件交运。后来他转来一张便条：“收到了。”除此之外，他没有许诺什么。':g.topics.shen?'信还在沈遥自己手里，由他决定以后寄不寄。他先替大家把去向交接清楚。':'沈遥把邮件和人员名单交接妥当，带来叶姨的回信：“水壶旁那页，还替我留着。”';
 if(late)text='约定的时间错过了，你在剩余窗口里迟交并承认了这件事。'+text;
 return {id:n,name:people[n].name,text};});}
export function projection(g){const r=reserves(g);return {actions:options(g),time:timeLabel(g),place:g.final_plan?(g.final_plan==='stay'?'旅舍 · 安全留守':g.final_plan==='light'?'末班船 · 离岛途中':'避风接驳 · 离岛途中'):places[g.location],description:g.location==='radio'&&g.facilities.radio?'右侧现用报务台已可正常通联岸台。左侧退役接收机仍与它分开；防潮档案夹放在两张桌子之间。':descriptions[g.location],image:imageFor(g),weather:g.spent_ap>=16?'风暴逼近':g.spent_ap>=8?'风雨加重':'海雾与阵雨',
 people:personIds.map(n=>({id:n,...people[n],place:places[whereabouts(g,n)],here:whereabouts(g,n)===g.location,available:available(g,n),status:!available(g,n)?'工作中；预计第 '+g.jobs.find(j=>j.status==='active'&&j.npc===n).due+' AP 交付':'可交谈',promise:g.promises[n]})),
 availableStock:{supplies:g.stock.supplies,fuel:g.stock.fuel-r.fuel,parts:g.stock.parts-r.parts},reserved:r,routes:routes(g),epilogues:g.final_plan?epilogues(g):[]};}
export function execute(g,input){
 const a=options(g).find(o=>o.kind===input.kind&&o.target===input.target&&o.detail===input.detail);if(!a?.enabled)throw Error(a?.reason||'当前不支持这个行动');
 const next=JSON.parse(JSON.stringify(g)),before=next.spent_ap,notes=[],changes=[];let body='',title=a.label;
 if(input.kind==='start'){
  let name=input.text.trim(),preference='平和';if(name.startsWith('{')){const data=JSON.parse(name);name=typeof data.name==='string'?data.name.trim():'';preference=data.preference;}if(!name||name.length>48||!['平和','简洁直接'].includes(preference))throw Error('请写下 1—48 字称呼并选择表达偏好');next.name=name;next.preference=preference;next.started=true;body=opening;notes.push(announce(next,0));
 }else if(input.kind==='move'){next.location=input.target;body=descriptions[next.location];}
 else if(input.kind==='ration'){
  const day=next.ration_pending-1;if(day<0||next.rations[day])throw Error('配给已结算');next.rations[day]=input.target;next.ration_pending=0;body=input.target==='warm'?'炉火添好了。热汤递到每个人手里；没在公共厅的人也留了那一碗。':input.target==='cold'?'你们分好冷餐，把燃料留给还要用的地方。沈遥把杯子递来：“热水还在，先喝一口。”':'当晚那批封存简餐按便笺打开。食物不丰盛，足够所有人。周守川把桌子腾出一半：“坐着吃，别站门口。”';next.events.push('ration_'+day);changes.push('当晚配给仅结算一次');
 }else if(input.kind==='repair'){const t=input.target;next.facilities[t]++;body=t==='radio'?'按林岚留的步骤断电、更换接点，现用报务台重新接通岸台。退役机仍留在另一张架子上。':t==='light'?next.facilities.light===1?'接点检修完成，电源检查单上划去第一项。灯组和备用供电还要再检查一步。':'灯组与备用供电就绪。燃料封存在常规发电储备处；这盏灯没有替海面改变天气。':next.facilities.pier===1?'通道清理完成，背风台阶露出来。转运位还需要固定。':'转运位已固定，绳具与踏板按现有步骤复核，可以配合已协调的接驳安排。';}
 else if(input.kind==='exchange'){next.exchanged=true;next.stock.parts++;body='配货单上留下一批储粮的记录，寄存柜那包备用零件交到你手里。领取栏划上日期，不会再有第二包。';}
 else if(input.kind==='supply'){const n=Math.min(2,8-next.stock.supplies);next.supply_taken=true;next.stock.supplies+=n;body='清点并接收可分配干粮 '+n+' 份。三晚的封存应急餐仍分别存放，没有混入库存。';}
 else if(input.kind==='assist'){
  const n=input.target,t=input.detail;next.work_counts[n]++;next.jobs.push({npc:n,target:t,due:before+3,parts:a.cost.parts,fuel:a.cost.fuel,status:'active'});body=people[n].name+'接下'+workNames[t]+'，预计你再安排两次有效行动后交付。材料只预留，现在尚未消耗；工作期间不能同时请其进行私人交谈。';remember(next,n,'assist_'+next.work_counts[n],body);
 }else if(input.kind==='cancelJob'){const j=next.jobs.find(j=>j.status==='active'&&j.npc===input.target&&j.target===input.detail);j.status='cancelled';body='你取消了未交付协助，预留物资已释放。此前请求用过的行动点不返还，亲自完成过的设施步骤仍保留。';}
 else if(input.kind==='register'){next.ferry_registered=true;body='第三夜末末班船的登记回执已确认。'+(next.location==='pier'?'你在公开登记簿留下人数与旅舍名称。':'岸台在现用报务台回报了登记。')+'灯塔与行装条件仍须分别准备。';}
 else if(input.kind==='coordinate'){next.transfer_coordinated=true;body='避风侧短程转运回执已确认，范围是登记过的小艇接驳和外侧渡船会合。转运位与行装仍须分别就绪。';}
 else if(input.kind==='pack'){next.departure_prepared=true;body='你把人、行李和同行顺序核对清楚，沉重的箱子留在便于接手的位置。两种离岛安排共用这份清单，不再扣一份行装费。';}
 else if(input.kind==='stay'){next.stay_prepared=true;body='大家把留守的轮值、门窗复查和报平安方式商量好。原有建筑足以避风，不必为了证明负责再去冒险加固。以后决定登船，这份商量也不作废。';}
 else if(input.kind==='meal'){next.meals[Math.floor(period(next)/4)]=true;body=next.rations[Math.floor(period(next)/4)]==='warm'?'围坐时，周守川先把你的碗添满。林岚指着一只焦了边的面包：“这个归我，算我修坏的。”窗外的雨隔着玻璃，终于像是在远处。':'你们把杯子围成小小一圈。许澄看着沈遥晾在椅背上的袜子笑了：“这不能算风向标。”简单的饭也容得下坐一会儿。';for(const n of personIds.filter(n=>whereabouts(next,n)==='inn'&&available(next,n)))remember(next,n,'meal_'+Math.floor(period(next)/4),'与你在公共厅围坐，用的是当晚已确认的配给。');}
 else if(input.kind==='investigate'){const c=clues[input.target];next.investigated.push(input.target);body=c.body;for(const [id,t,k,text] of c.items)addKnowledge(next,id,t,k,c.title,text);
  if(input.target==='unplugged'){const checked=next.investigated.includes('power');addKnowledge(next,'unplugged_power',checked?'亲见条件与异常并列':'供电条件仍为林岚说明',checked?'亲见 / 检查':'人物证词','第二夜现场',checked?'此前亲自核实拔下电源、无电池，此后未接电；同一退役机短暂亮灯发声。来源未明。':'你看见亮灯并听见呼号；“电源已拔下、无电池且未重接”仍是林岚的说明，不能全部写作亲见。');}
 }else if(input.kind==='talk'){
  const n=input.target;if(input.detail==='private'){next.topics[n]=true;body=topics[n].body;for(const [id,t,k,text] of topics[n].knowledge){addKnowledge(next,id,t,k,people[n].name,text);next.npc_known[n].push(id);}if(before<(['zhou','lin'].includes(n)?21:23))next.promises[n]='offered';remember(next,n,'private_topic','向你讲述了自己愿意分享的事；是否答应具体请求仍由你决定。');}
  else if(input.detail==='archive'){next.shared.push('archive_'+n);body=n==='shen'?'沈遥征得你的同意后摊开旧邮务副本。船名与日期对应归鹭七号，三份渔民报平安信的转交记录仍在。他十七岁时在临时收信点帮过忙，记忆只作补充：“这三个人后来确实上岸了。其他人的最后一句话，我不知道。”':'许澄把可公开查阅的旧天气页与事故摘要放在一起。当年的海况快速恶化，有明确记录；她不能替周讲当班细节，也不能从一个风向数字推断所有人的选择。';addKnowledge(next,n==='shen'?'rescued_three_post':'storm_context_xu',n==='shen'?'旧邮务副本与三份报平安信':'旧天气记录',n==='shen'?'实物记录':'实物记录',people[n].name+'提供的公开资料',body);next.npc_known[n].push(n==='shen'?'rescued_three_post':'storm_context_xu');}
  else {next.shared.push('public_'+n);body=people[n].name+'把眼前的事再讲了一遍。\n“'+people[n].greeting+'”\n'+(n==='lin'?'灯塔需要两步，报务台只换接点；材料不足就如实记下，不能带电试错。':n==='xu'?'她把最新海况的来源与时间写给你；不确定的部分仍留着。':n==='shen'?'码头登记簿和配货单有公开权限，不必等他在场。': '他指出检修层与登高区的界线，不赞成拿危险换一个好看的进度。');addKnowledge(next,'public_talk_'+n,'与'+people[n].name+'核对事项','人物证词',people[n].name,body);}
 }else if(input.kind==='share'){const k=next.knowledge.find(k=>k.id===input.detail);next.npc_known[input.target].push(k.id);next.shared.push(input.target+'_'+k.id);body='你把「'+k.title+'」按原来源转告'+people[input.target].name+'。这份所知记为由你告知，不等于对方亲见。';remember(next,input.target,'shared_'+k.id,k.text,'由'+next.name+'转述；原来源：'+k.source);}
 else if(input.kind==='promise'){next.promises[input.target]=input.detail==='accept'?'accepted':'cancelled';body=input.detail==='accept'?'你明确答应了'+promiseNames[input.target]+'。期限与交付地点已经记下，物件不会变成可交换库存。':'你把无法承担的事说清楚。'+people[input.target].name+'收回了这项请求，公共安全安排照常。';remember(next,input.target,'promise_'+input.detail,body);}
 else if(input.kind==='deliver'){const n=input.target,late=next.promises[n]==='overdue';next.promises[n]=late?'late':'done';body=(late?'你先承认错过了约定时间，再把事情做完。':'你在期限内完成了约定。')+({zhou:'值班本放回防潮档案夹，借阅便条登记归还。',lin:'工具归槽，抽屉清单与纸签补齐。',xu:'原页对照誊清，看不清的地方诚实留空，放入交接册。',shen:'封缄信未拆，交进防潮待发邮袋，记录的是待发，不保证收件人已经收到。'})[n];remember(next,n,'promise_delivered',body);}
 else if(input.kind==='wait')body='你坐下来，把杯沿的水擦干。没有新的物资凭空出现；已经安排的工作照常推进。';
 else if(input.kind==='final'){next.final_plan=input.target;next.location=input.target==='stay'?'inn':'pier';if(input.target==='stay')next.stay_prepared=true;title=endings[input.target].title;body=endings[input.target].body;next.events.push('ending_'+input.target);changes.push('最终方案已锁定；普通行动结束');}
 else if(input.kind==='echo'){next.echo=input.target;body=next.final_plan==='stay'?'夜里，你在退役机旁听到短短的前半句，随后只余底噪。'+({respond:'你轻声说：“人在这里，灯会有人看着。”没有新的答案。',listen:'你没有插话，安静地听到最后。',off:'你把设备关好，让房间安静下来。'})[input.target]+'它没有给出天气、路线或新秘密。':'风停后，叶姨的便笺随沈遥转来：“那晚退役机又响过一小声，还是原来的前半句。后来只剩底噪。”这是一份转述；你不曾从船上折返去亲见。'+(input.target==='respond'?'你在回信里写：“这里的人，都平安。”':input.target==='off'?'你把便笺收在行李夹层。':'你把便笺读完，留住那一点停顿。');addKnowledge(next,'last_echo','最后的回响',next.final_plan==='stay'?'亲见 / 收听':'人物转述',next.final_plan==='stay'?'你在旅舍':'叶姨便笺，经沈遥转交',body);}
 if(input.kind!=='assist')for(const [k,n] of Object.entries(a.cost)){next.stock[k]-=n;if(n)changes.push(costNames[k]+' −'+n);}
 else changes.push('预留 '+costText(a.cost));
 next.spent_ap+=a.ap;if(a.ap)changes.push('行动 +1');settleDue(next,notes);
 for(const n of personIds)if(next.promises[n]==='accepted'&&next.spent_ap>=(['zhou','lin'].includes(n)?22:24)){next.promises[n]='overdue';notes.push(people[n].name+'的约定已过期；仍有普通行动时可按原入口迟交。');}
 if(a.ap&&[6,14,22].includes(next.spent_ap)&&!next.rations[Math.floor(next.spent_ap/8)])next.ration_pending=Math.floor(next.spent_ap/8)+1;
 if(a.ap&&next.spent_ap%2===0){const s=announce(next,next.spent_ap);if(s)notes.push(s);}
 if(a.ap&&[8,16].includes(next.spent_ap)){const recap='库存：储粮 '+next.stock.supplies+'、燃料 '+next.stock.fuel+'、零件 '+next.stock.parts+'。当晚配给：'+({warm:'暖餐与炉火',cold:'冷餐',emergency:'封存应急简餐'})[next.rations[next.spent_ap/8-1]]+'。未完成协助 '+next.jobs.filter(j=>j.status==='active').length+' 项；未交付约定 '+personIds.filter(n=>['accepted','overdue'].includes(next.promises[n])).length+' 项。次日已知消息见公共通知，普通行动仍由你安排。';addKnowledge(next,'recap_'+next.spent_ap,'上一日小结','正式进度','日终核对',recap);notes.push('上一日小结：'+recap);}
 if(next.ration_pending)notes.push('工作已结算。现在需要单独选择并确认当夜配给，可先查看或保存。');
 next.sequence++;next.last={token:input.token,title,summary:changes.join('；')||'不消耗行动和物资',body:[body,...notes].filter(Boolean).join('\n\n'),changes:changes.join('；'),before,after:next.spent_ap};
 if(a.ap||['start','ration','final'].includes(input.kind))addKnowledge(next,'action_'+next.sequence,title,'行动回执','正式安排 · '+before+' → '+next.spent_ap+' AP',next.last.summary+'\n'+next.last.body);
 return next;
}
export default {
 precondition({args,reads}){try{execute(reads.game.state,args);return true;}catch{return false;}},
 compute({args,reads}){const state=execute(reads.game.state,args);return {state,view:projection(state),receipt:state.last};},
 invariant({reads}){const g=reads.game.state,r=reserves(g);return g.spent_ap>=0&&g.spent_ap<=24&&Object.entries(cap).every(([k,max])=>g.stock[k]>=0&&g.stock[k]<=max)&&r.parts<=g.stock.parts&&r.fuel<=g.stock.fuel&&g.jobs.filter(j=>j.status==='active').length<=2;}
};
