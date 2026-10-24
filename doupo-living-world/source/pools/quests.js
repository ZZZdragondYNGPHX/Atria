// Original game situations. Conditions are evaluated against live world facts by
// the quest rules; authored prose is never evidence or permission to mutate them.
const choice=(id,label,operation,detail)=>({id,label,operation,detail});
const rows=[
 ['QC01','缺一份的当班','daily','su','wutan.herbal','supply','herb',2,18,24,'当班的药草缺口须经药铺现有投入核实；交料不等于成药。',[
  choice('primary','交付自己的药草','deliver','从本人库存交付核定缺口，药铺取得所有权。'),choice('alternative','协商先供一部分','partial','只交约定部分，余量另约；工资随有效数量结算。')]],
 ['QC02','两处同时缺药','situation','ning','qingshan.inn','allocate','herb',2,12,48,'宁素和唐汀各有实际缺口时才成立；有限药草不能两边重复使用。',[
  choice('primary','优先接诊处','priority','交给宁素，唐汀的缺口仍在。'),choice('alternative','两处各留一份','split','分别交付两个收件人；保留各自尚缺数量。')]],
 ['QC03','带封签的包裹','daily','rong','wutan.depot','custody','food',2,16,72,'容青穗只托付现有物资，送到陈槐手里；所有权不因保管转移。',[
  choice('primary','当面交给收件人','deliver','核验陈槐在场后交接封存货物。'),choice('alternative','原物退回货栈','return','向容青穗归还未用货物，结清已发生费用。')]],
 ['QC04','多记的一笔','story','gu','wutan.teahouse','reconcile','',0,12,48,'谷茗听到的说法不等于收货记录；只核对已经发生的交付。',[
  choice('primary','查验并限定更正范围','correct','引用实际交付凭据，更正当事人收到的版本。'),choice('alternative','回报暂不能证实','uncertain','承认所查范围，留下争议，不能凭猜测定责。'),choice('report','向原交易当事人出示凭据','disclose','仅向在场原参与者出示本人凭据，不向旁观者传播私事，不凭此指控欺诈。')]],
 ['QC05','昨日的药谷','situation','lu','qingshan.herbal','verify','redleaf',1,12,96,'陆青的旧消息只指向药谷，实物可能已被取得；调查工资与取得机缘分开。',[
  choice('primary','实地核实药谷','observe','在药谷观察当前可见情况，保留时点。'),choice('alternative','核实后报告已无可取资源','absence','只有实际查证才能认定缺失，不重新生成赤叶。'),choice('report','寄出对旧线索的核实更正','correction','本人实地核实后，向已知联系人实际付邮资发信；寄出不等于对方已经收到或采信。')]],
 ['QC06','能说多少的口信','story','xiaoding','shimo.motie','consent','',0,10,240,'萧鼎希望给父亲一封近况；萧厉另有自己的转述意愿。',[
  choice('primary','只转达获准的平安消息','limited','只送发信人批准公开的近况，保留送达回执。'),choice('alternative','先向本人申请补充授权','permission','本人接受后才附加其可公开内容，拒绝不泄露原文。')]],
 ['QC07','少一炉材料','story','su','wutan.herbal','produce','medicine',1,22,48,'苏晚禾需要真实疗伤散，委托材料和未用余料仍归药铺。',[
  choice('primary','亲自完成本炉加工','refine','按既有配方、能力和损耗加工，交付实际产物。'),choice('alternative','邀请合格助手分工','assist','助手同意并占用工时后加工；原承接者仍负责。'),choice('report','自备两份药草重新开炉','retry','明确消耗自有药草重试，成品仍按原约交归药铺；不重复领取工资。')]],
 ['QC08','先修哪一件','daily','he','qingshan.guild','repair','',0,18,72,'何照川只对确实磨损的器物提出维修，不能凭接单制造损坏。',[
  choice('primary','先修最紧要的器物','critical','核定一件受损装备，花费真实工料恢复耐久。'),choice('alternative','延后行程再完整修复','postpone','取得改约同意后处理余件，承担额外工时与工料。')]],
 ['QC09','让学徒完成这一步','story','linfei','blackrock.guild','teach','herb',2,18,72,'琳菲希望完成本人实际练习；雪魅的记录须另获本人允许。',[
  choice('primary','指导琳菲亲自练习','practice','消耗获准材料并留下琳菲本人练习结果，不发认证。'),choice('alternative','为雪魅安排老师指导','teacher','雪魅与老师分别愿意且具备能力才安排，占用真实材料与时间，不改变琳菲的记录。')]],
 ['QC10','把人送到能接诊的人面前','situation','su','wutan.herbal','clinic','herb',1,18,120,'先确认苏守义的腿伤和移动能力，不能把交草写成治愈。',[
  choice('primary','协调医者当面接诊','treat','伤者同意、医者在场且药物充足时依法治疗。'),choice('alternative','先接诊评估再改约','assess','记录实际伤处与可处理范围，保留未治伤情。')]],
 ['QC11','腾出一段照护时间','situation','gao','wutan.market','care','food',1,16,24,'高嵩确有照护和工作冲突时，才可约一段高小满的日常照护。',[
  choice('primary','承担一段照护','full','实际占用约定工时并供应食物，使原照护者获空闲。'),choice('alternative','只承担半段并交回','partial','明确交接时点，结算实际工时，不永久替代监护。')]],
 ['QC12','只差最后一段路','event','zhou','mountain.camp','rescue','food',2,16,96,'周衡实际缺粮、受伤或中断行程才出现；只展示亲见位置。',[
  choice('primary','补给后同行返镇','escort','征得同行同意并完成真实旅行，在青山镇交接。'),choice('alternative','送粮并通知援助者','notify','真实交粮和发信，送信不等于救援已抵达。')]],
 ['QC13','到期的借物','situation','min','qingshan.guild','loan','',0,0,48,'闵修愿意借出自己的可用器物才订约，借出和赠予分别记账。',[
  choice('primary','借用后按期归还','return','借出实际装备实例，归还同一实例并核对损耗。'),choice('alternative','向物主申请展期','extend','物主同意且补偿实付才延长，不能单方刷新期限。')]],
 ['QC14','今天帮我，改日帮你','situation','shu','wutan.market','reciprocal','food',1,0,72,'舒雁只承诺本人有能力完成的有限服务；互助不是固定好感兑换。',[
  choice('primary','先做约定劳动再兑现服务','exchange','记录双方分别完成的工时与服务。'),choice('alternative','缩小互助范围当场两清','settle','双方同意后只交换当前能完成部分，未做不算完成。')]],
 ['QC15','同一件器物的两份说法','event','tie','qingshan.smithy','mediate','',0,10,72,'已有损坏与当事人分歧才成立；证词不能直接扣第三方的钱。',[
  choice('primary','提出修复分担方案','compensate','双方接受后真实付款修理，保留责任依据。'),choice('alternative','只澄清可证实经过','facts','传播亲见范围内事实，未获同意的赔偿不执行。')]],
 ['QC16','看得见的下一段路','story','he','qingshan.guild','survey','',0,20,96,'何照川要近期路段观察，未经过部分仍未知。',[
  choice('primary','亲走并提交路段报告','walk','实际走到山路哨棚，记录本人观察时点。'),choice('alternative','协商先交已走部分','partial','只验收亲历路段，未查路段和未付余款分开。')]],
 ['QC17','买粮还是绕路','story','he','qingshan.guild','itinerary','food',3,12,72,'根据何照川当下补给和已知可达路线制定行程，不创造捷径。',[
  choice('primary','补齐口粮后按原路出发','supply','实际交付缺额，按原路线耗时消耗。'),choice('alternative','建议延后并重排行程','delay','向导同意后调整出发承诺，不自动免除其他单。')]],
 ['QC18','一页没有交付对象的札记','exploration','','mountain.cave','explore','relic',1,0,0,'自主追查本人已知支洞，不设雇主、工资或强制期限。',[
  choice('primary','调查后自留所得线索','keep','真实调查与唯一物品归属分别结算。'),choice('alternative','将允许公开的线索求证','share','只传播已知观察，求证不复制札记。')]],
 ['QC19','这一批货要不要进','story','yafei','wutan.auction','procure','herb',2,20,96,'雅妃只给本次真实预算，采购量影响可用周转资金；不保证销路。',[
  choice('primary','按授权预算采购','purchase','花费托付资金购入约定品类，余款原路归还。'),choice('alternative','协商缩量保留周转金','reduce','获准后少买，未用资金归还，报酬按新约。')]],
 ['QC20','演武前的器具','activity','xu','wutan.clan','prepare','',0,18,48,'筹备的是器具检查和非战斗试炼；完整演武对战依D33。',[
  choice('primary','检修并确认参与者','ready','维修实际损坏，确认真实到场与非战斗项目准备。'),choice('alternative','缩小活动范围','reduce','组织者同意后减少项目，未就绪内容不冒充已举行。')]],
 ['QC21','谁来做担保','activity','zhu','blackrock.forge','admission','',0,0,72,'修器街交流需要公开资格或本人愿意的担保，仅交流、不授药师认证。',[
  choice('primary','用自己的可验证经历入场','proof','核验本人实作记录，权限只覆盖获准项目。'),choice('alternative','申请担保或选择旁听','sponsor','担保者同意并承担约定范围；无担保仅旁听。')]],
 ['QC22','等当事人自己回来','daily','song','blackrock.airfield','appointment','food',1,14,96,'宋轻羽有一份给裴青禾的实际包裹，收件人按自己的生活行动。',[
  choice('primary','等候后当面交付','wait','等待推进世界时间，收件人不在场不能交付。'),choice('alternative','申请授权代收','agent','收件人允许后交给真实代理，保留异地运输与回执。')]],
 ['QC23','这一回车队有没有走错','daily','shi','shimo.market','convoy','food',1,18,96,'石闻舟同意同行才可观察其路线；失去接触停止位置更新。',[
  choice('primary','同行至歇脚坡再报告','accompany','本人随队真实旅行，基于已见路段报告。'),choice('alternative','在出发处建议补给后改期','redirect','商人依据实际补给接受或拒绝建议，不能控制其私密目标。')]],
 ['QC24','只为亲见的一刻作证','story','gu','wutan.teahouse','witness','food',1,10,48,'谷茗请玩家见证实际交接，只为亲见内容负责。',[
  choice('primary','在场见证交接数量','quantity','当事人同意并真实转移物资后形成限定证词。'),choice('alternative','仅证明双方在场','presence','只记亲见身份和时点，不担保货源或未知质量。')]],
 ['QC25','采够就停','situation','sha','tager.oasis','conserve','herb',2,14,96,'沙青芦只在实际生境供给紧张时提出节制；不凭结单恢复生态。',[
  choice('primary','保留生境余量并少交','reserve','实际少采，按约验收；留下未采资源和未满足需求。'),choice('alternative','调查后回报不宜继续采收','stop','依据本人生态观察改约，零采收不虚构材料收入。')]],
 ['QC26','同一个机会，两种安排','exploration','lu','mountain.valley','compete','redleaf',1,0,0,'赤叶只有一份，陆青和薄尧仍可自主行动；这是机缘而非独占付费单。',[
  choice('primary','依真实条件争取赤叶','claim','由合法取得规则确定唯一归属，不保证成功。'),choice('alternative','向现有持有者提出交易','trade','持有者愿意且双方实付实交才交换；拒绝保留归属。'),choice('report','实地核实已失先机并结束追逐','observe_absence','原生境已无可采赤叶时记录本人所见，零工资结清；不揭露远方持有者或重刷唯一物。')]],
 ['QC27','多做这一班值不值','daily','yan','wutan.inn','shift','',0,18,24,'燕宁提出有资金来源的额外班次，已有期限冲突须由玩家决定。',[
  choice('primary','确认冲突后做完一班','full','实际工时占用且由雇主支付，其他承诺继续计时。'),choice('alternative','协商缩短班次','short','获准后缩短工时与工资，不擅自取消另一项约定。')]],
 ['QC28','护人而非清场','situation','zhou','mountain.camp','combat-protect','',0,22,48,'本人目击守营者遭遇真实冲突时才提出援助；目标是使受援者抵达出口。',[
  choice('primary','实际介入并护送撤离','protect','在轮间进入正在发生的冲突；让受援者依实际路径到出口。'),choice('alternative','援护并请求受援者撤离','cover','传达短令后，由受援者依意愿和条件实际撤离。')]],
 ['QC29','让争斗停下来','situation','ning','qingshan.inn','combat-stop','',0,16,48,'当本人可见的真实冲突威胁闵修时，宁素请你止争；双方存活是验收条件。',[
  choice('primary','轮间介入并劝离','mediate','实际传达停战请求，对方可拒绝，不因旁白和解。'),choice('alternative','限制接触并促成分离','separate','以合法行动迫使双方停止接触，保留持续伤势和责任。')]],
 ['QC30','在约定规则内证明自己','story','shen','qingshan.guild','combat-proof','',0,12,48,'沈原主持与闵修的自愿徒手三轮演武，禁止兵刃、道具、远程和强控；伤势仍有风险。',[
  choice('primary','请求双方同意后开始演武','spar','三轮徒手对招或一方失去作战能力后结束；双方真实存活才可验收。'),choice('alternative','按约防守与调位','defend','允许真实防守、位移和调息，仍须完成同一场约定演武。')]],
];
const targets={QC02:'tang',QC03:'chen',QC04:'yan',QC06:'xiaozhan',QC09:'linfei',QC10:'su-father',QC11:'gao-child',QC12:'zhou',QC13:'min',QC14:'shu',QC15:'min',QC19:'yafei',QC20:'xu',QC22:'pei',QC23:'shi',QC24:'rong',QC28:'zhou',QC29:'min',QC30:'min'};
const destinations={QC03:'wutan.market',QC05:'mountain.valley',QC06:'wutan.clan',QC10:'wutan.herbal',QC12:'qingshan.guild',QC16:'qingshan.trail',QC18:'mountain.cave',QC22:'blackrock.inn',QC23:'tager.pass',QC25:'tager.oasis',QC26:'mountain.valley'};
const stories={QC01:'su',QC07:'su',QC10:'su',QC08:'he',QC16:'he',QC17:'he',QC04:'gu',QC24:'gu',QC19:'yafei',QC09:'students',QC06:'brothers'};
const hints={QC08:'可邀请愿意同行的何照川前往青山镇修器铺；工匠、器物和工料须同地。',QC10:'伤者不能行走时，可邀请愿意同行的医者前来；本项目不提供搬运。',QC11:'父亲与孩子须在同地正式交接；可与愿意同行的父亲约在客栈。',QC16:'完整报告依次亲至山路哨棚、外缘营地；只查哨棚可选半程验收。',QC19:'先去真实有药草库存的药铺采购，再携物与余款回到雅妃面前。',QC22:'可以等待实际收件人，也可与其当面约定一位在场代收者；代收后仍须完成第二次交接。',QC24:'可邀请愿意同行的谷茗去货栈，或邀请货主来茶棚；双方在场才可见证。'};
export const quests={id:'quests.templates',version:2,entries:rows.map(([id,title,source,issuer,place,operation,item,qty,reward,deadlineHours,premise,choices])=>({id,weight:1,status:'ready',conditions:{},value:{id,title,source,issuer,place,operation,item,qty,reward,deadlineHours,premise,choices,target:targets[id]||issuer,destination:destinations[id]||place,mode:id==='QC26'?'opportunity':id==='QC18'?'personal':'exclusive',payment:reward?(['QC01','QC03','QC07','QC20'].includes(id)?'escrow':'credit'):'none',remoteDelivery:['QC01','QC03','QC06','QC07','QC16','QC19','QC22'].includes(id),repeatable:['QC01','QC02','QC07','QC08','QC11','QC16','QC19','QC22','QC25','QC27'].includes(id),story:stories[id]||'',duration:id==='QC27'?240:id==='QC11'?120:60,discovery:['QC01','QC20','QC21','QC27'].includes(id)?'notice':['QC12','QC15','QC18','QC25','QC26','QC28','QC29'].includes(id)?'observation':'conversation',authorship:'original-game-story',evidence:'rule-produced-fact',settlement:'actual-work-and-custody',consequences:choices.map(c=>({choice:c.id,text:c.detail}))}}))};
for(const e of quests.entries)e.value.hint=hints[e.id]||'先核实当事人、材料与真实需求，操作的工时、耗材和结果会保留。';
// Dependencies are explicit and never enter the ready pool.
export const QUEST_RESERVES=[];
export const QUEST_STORIES=[
 {id:'su',title:'父亲旧伤与自己的时间',actors:['su','su-father'],seeds:['QC01','QC07','QC10'],opening:'苏晚禾把药盘往里收了收：“先说清这一炉的事。父亲的腿，我还得听医者怎么说。”',choices:['自己备料，留出她的照护时间','请愿意的药工协助，实际支付分工费用','如实说明能力不足，协商改排'],followup:{requires:'father-still-injured-and-supply-accepted',seeds:['QC10','QC11'],text:'父亲仍需照护且双方愿意时，再约有限排班；药铺稳定后才讨论练习。'},ending:'本次工料和工时独立结清。照护、学习与亲密关系由后续真实经历决定。'},
 {id:'he',title:'同行的底线',actors:['he'],seeds:['QC08','QC16','QC17'],opening:'何照川没有先问能走多快：“回来也要吃饭。先把你亲眼见过的路说清楚。”',choices:['先核实路段再决定出发','补粮修器后另约','明确未查部分并放弃同行'],followup:{requires:'known-traveler-actually-stranded',seeds:['QC12'],text:'只在收到真实受困消息后接应，不预写同行必然遇险。'},ending:'真实准备、行程和守约情况成为以后合作依据；完整护送战仍依D33。'},
 {id:'gu',title:'我只担保看见的事',actors:['gu'],seeds:['QC04','QC24'],opening:'谷茗按住账角：“这句是我听来的。你若要替人担保，先把听说与亲见分开。”',choices:['引用交付凭据更正有限范围','仅担保亲见的一刻','明确无法证实，不替任何人定罪'],followup:{requires:'disputed-report-actually-received',seeds:['QC06'],text:'新证据只能更正实际收到旧说法的人；来源拒绝授权时不公开私事。'},ending:'更正进入各自收到的消息，不把全城声望同时改写。'},
 {id:'yafei',title:'商誉与一笔不该轻率承诺的生意',actors:['yafei','qiao'],seeds:['QC19','QC24','QC03'],opening:'雅妃将预算单转向你：“价钱可以谈，没核过的货源却不能替货主保证。你愿意担哪一段？”',choices:['核实货源后承担有限采购','缩量保留周转金','拒绝不清楚的条件并返还托款'],followup:{requires:'accepted-trade-evidence-and-live-auction',activities:['auction'],text:'依实际库存、授权与预算接入买家、寄售、代拍、鉴定、运送或寻访买家；并不保证成交。'},ending:'实际钱物与未付债务继续存在，合作依据只对知情者生效。'},
 {id:'students',title:'同题不同解',actors:['linfei','xuemei'],seeds:['QC09','QC07'],opening:'琳菲想先试一次，雪魅却把记录留下：“要交换经验，也得先说清哪些是自己做过的。”',choices:['只帮助琳菲完成本人练习','另约雪魅，不占用同一份材料或时间','经双方同意分享有限记录'],followup:{requires:'individually-consenting-and-exam-eligible',activities:['examination'],text:'各自报名和尝试，四阶段结果决定补练或改期；准备完成不等于取得资格。'},ending:'实际耗材、独立练习与获准分享的记录保留，不预定谁优谁劣。'},
 {id:'brothers',title:'远行之前的两本账',actors:['xiaoding','xiaoli'],seeds:['QC06','QC19','QC03'],opening:'萧鼎把补给单摆在桌上，萧厉另抽出一张信纸：“行程是一回事，答应家里的话也是一回事。”',choices:['只承接获准送达的近况','按预算准备真实补给','请求缩减或延期，保留已发生义务'],followup:{requires:'supplies-or-family-commitment-still-open',seeds:['QC17','QC22'],activities:['trial'],text:'仅当实际行程压力或家人回信继续时协调；团内自愿组织后才进入非战斗试炼。'},ending:'团产、个人资金和家人所知分别处理，不预写后期仇家、伤残或团体结局。'},
].map(s=>({...s,authorship:'original-game-story',repeatOpening:false}));
