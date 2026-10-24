// Names/affiliations cite SOURCES.md. Layout, services, stock and travel are
// authored sandbox parameters; none claims a surveyed map of the novel.
const entry=(id,value,source='original')=>({id,weight:1,status:'ready',conditions:{},source,value:value.arrival?{...value,overview:overview[id]}:value});
const overview={wutan:'wutan-overview',qingshan:'map-first-regions',mountain:'map-first-regions',blackrock:'blackrock-overview',shimo:'shimo-overview',tager:'tager-overview'};
export const regions={id:'world.regions',version:1,entries:[
 entry('wutan',{name:'乌坦城',arrival:'wutan.inn',supply:'wutan.market',herbal:'wutan.herbal',habitat:'mountain.valley'},'jiama'),
 entry('qingshan',{name:'青山镇',arrival:'qingshan.inn',supply:'qingshan.inn',herbal:'qingshan.herbal',habitat:'mountain.valley'},'qingshan'),
 entry('mountain',{name:'魔兽山脉',arrival:'mountain.camp',supply:'qingshan.inn',herbal:'qingshan.herbal',habitat:'mountain.valley'},'jiama'),
 entry('blackrock',{name:'黑岩城',arrival:'blackrock.inn',supply:'blackrock.inn',herbal:'blackrock.herbal',habitat:'mountain.valley'},'blackrock'),
 entry('shimo',{name:'石漠城',arrival:'shimo.inn',supply:'shimo.market',herbal:'shimo.clinic',habitat:'tager.oasis'},'xiao-brothers'),
 entry('tager',{name:'塔戈尔沙漠外缘',arrival:'tager.oasis',supply:'tager.oasis',herbal:'shimo.clinic',habitat:'tager.oasis'},'jiama'),
]};
// id, name, services, stock, description, public notice, source, ecology.
const rows=[
 ['wutan.inn','乌坦城·客栈',['rest','trade','work'],['food'],'往来商客歇脚的院落，灶间承接短工。','商队在城门集结；药铺收购药草，修器坊承接受损器物。'],
 ['wutan.market','乌坦城·坊市',['trade','work'],['food','herb','medicine'],'摊棚之间留出装卸通道，常用物资在此流转。','药草与干粮各有库存，买卖以当时报价为准。'],
 ['wutan.herbal','乌坦城·药铺',['trade','refine'],['herb','medicine','formula'],'切药案与烘药架分设两侧，雇工照看药材。','苏家药铺以药草加工疗伤散；骨折仍需医者指定处置。'],
 ['wutan.auction','乌坦城·米特尔拍卖分号',['trade'],['manual','manual-wood','manual-stone','manual-fire','manual-wind','manual-channel','manual-frame','manual-mind'],'拍卖行前厅设有寄售接待柜，普通抄本按实际库存流通。','正式主修需要斗者资格；研习和换修分别占用真实时间。','yafei'],
 ['wutan.clan','乌坦城·家族接待与演武区',['train'],[],'萧家来客在前院候见，族中子弟在演武区修行。','族中子弟刚参加本轮测试，前院仍在接待来客。','opening'],
 ['wutan.gate','乌坦城·城门',['investigate'],[],'车辙汇入城门，值守者核对往来行旅。','青山镇的陆路商队从这里出发，出门前应备足干粮。'],
 ['qingshan.inn','青山镇·商街客栈',['rest','trade','work','treat'],['food'],'佣兵卸下行囊休整，医者偶在客栈照护伤者。','宁素能处置伤处，但须本人在场、能够接诊且备好药草。'],
 ['qingshan.herbal','青山镇·药材铺',['trade','refine'],['food','herb','medicine','formula'],'新采的药草按批次入柜，收购款与成药各自记账。','采药者先核实收购库存与补给，再前往山脉。'],
 ['qingshan.guild','青山镇·佣兵集结处',['trade','train'],['food','technique','technique-short','technique-finger','technique-heavy','technique-blade','technique-willow','technique-rush','technique-withdraw','technique-parry','technique-cover','technique-signal'],'佣兵在遮雨棚下商议行程，各人保留自己的打算。','徒手切磋须双方同意；身法、援护和兵刃斗技各有实际条件。','qingshan'],
 ['mountain.camp','魔兽山脉·外缘营地',['gather','rest'],[],'山脚避风处留有帐位，附近可辨认常见药草。','山道足迹通向药谷和支洞，线索不保证机缘尚在。','original',24],
 ['mountain.valley','魔兽山脉·药谷',['gather'],[],'湿润谷地生有药草，采集痕迹时常交错。','赤叶药材只有一份实际归属；普通药草也会枯竭。','original',24],
 ['mountain.cave','魔兽山脉·支洞',['gather','investigate'],[],'洞口岩缝生草，深处遗留普通修炼札记。','入口岩壁有前人留下的刻痕，深处情形需要亲自探查。','original',24],
 ['wutan.workshop','乌坦城·修器坊',['repair','trade','work'],['food','herb'],'炉台旁堆着待修兵刃，学徒给来客登记损坏处。','杜衡接修受损器物；工料交付后需要等待，未完成可取消。'],
 ['wutan.teahouse','乌坦城·听雨茶棚',['trade','work'],['food'],'街角茶棚兼售旅途干粮，商客会在这里交换路况。','听到的风闻不等于眼前事实；远方人物位置应以亲见或信件更新。'],
 ['wutan.depot','乌坦城·商队货栈',['trade','work'],['food'],'包裹按去向垒放，搬运工检查绑绳和封签。','从城门可转往黑岩城陆路驿站，路线与天数是本局行旅安排。'],
 ['qingshan.wanyao','青山镇·万药斋前堂',['trade','treat'],['herb','medicine'],'前堂收治寻常伤患，药柜与候诊席之间留出通道。','小医仙照护寻常伤患；就诊前请当面问清药草、诊金和可接诊的伤处。','little-fairy'],
 ['qingshan.smithy','青山镇·佣兵修器铺',['repair','trade','work'],['food','herb'],'磨石与铆钉分置两侧，返镇佣兵送来磨损的装备。','维修需要工匠实际在场；有药草和工钱也不能凭空修复器物。'],
 ['qingshan.trail','青山镇·山路哨棚',['investigate'],[],'棚外竖着山道指向木牌，向导在檐下清点行装。','前方是山脉外缘营地；旅途风险并非接取任务后才开始。'],
 ['blackrock.gate','黑岩城·石门驿站',['investigate'],[],'深色城石围住车马通道，驿牌注明城内常用去处。','入城可到客栈补给、炼药师公会前厅访人，或去修器街。','blackrock'],
 ['blackrock.inn','黑岩城·行旅客栈',['trade','rest','work'],['food'],'商旅在院中晒行囊，炉灶为远行者准备耐放的干粮。','东去陆路通往石漠城；具体耗时为游戏压缩参数。'],
 ['blackrock.guild','黑岩城·炼药师公会前厅',['trade','refine'],['herb','formula','manual-deep','manual-clear','technique-veil','technique-knife','technique-bolt','technique-sweep','technique-embers','technique-bind','technique-settle','throwing-knife','fire-sand'],'药师在前厅交流常用药材，也有带来源的法门抄本寄售。','玄阶主修需斗师资格；投掷短刃与赤焰砂使用后实际消耗。','blackrock'],
 ['blackrock.herbal','黑岩城·药材处理院',['trade','refine'],['food','herb','medicine'],'晾架围着加工院铺开，雇工将常见药材清理入库。','处理院会投入真实药草加工疗伤散，原料不足便不能生产。'],
 ['blackrock.forge','黑岩城·修器街',['trade','repair','work'],['food','herb'],'修器匠沿街开炉，行人可以对照旧器物询价。','这里承接既有器物维修；锻造新品和高阶宝器尚未开放。'],
 ['blackrock.airfield','黑岩城·飞行运输候场',['trade','work','investigate'],['food'],'候场外有货物点验棚，远行者在栏边查看告示。','飞行运输属于原著背景；当前仅开放候场补给、做工与调查，没有飞行购票。','blackrock'],
 ['shimo.gate','石漠城·沙路城门',['investigate'],[],'风沙从门洞掠过，护卫检查行囊上的遮沙布。','城外可走塔戈尔外缘商道；这里不提供通往蛇人核心领地的路线。','xiao-brothers'],
 ['shimo.inn','石漠城·遮沙客栈',['trade','rest','work'],['food'],'低檐院落用帘幕挡沙，商客在背风处修整行装。','出城前补足干粮；绿洲可采普通药草，也需留意生境存量。'],
 ['shimo.market','石漠城·行商集市',['trade','work'],['food','herb','manual-wind'],'驮队在摊棚边分卸货物，常用药材与基础功法在此交换。','城内诊舍收药，漠铁佣兵团驻地可访人；团中事务由成员自行决定。'],
 ['shimo.motie','石漠城·漠铁佣兵团前院',['trade','train','work'],['food','technique-short'],'佣兵在前院整理行装，兄弟二人照看团中日常。','萧鼎与萧厉是萧炎的兄长；访客可到前院通报，同行要先商议补给。','xiao-brothers'],
 ['shimo.clinic','石漠城·沙行诊舍',['trade','treat','refine'],['food','herb','medicine'],'诊席背风而设，药工晾晒从绿洲带回的常见药草。','安绫可处置伤处；石漠城采药者往返绿洲和诊舍，货物不会凭空传送。'],
 ['tager.pass','塔戈尔外缘·商道歇脚坡',['investigate','rest'],[],'风蚀石坡遮住部分来风，木桩标出返回石漠城的方向。','离开歇脚坡可去绿洲补给或登上瞭望坡；路标只说明道路。','jiama'],
 ['tager.oasis','塔戈尔外缘·行旅绿洲',['gather','trade','work','rest'],['food'],'浅水边生有耐旱草木，旅人按需补给并采收普通药草。','绿洲采集受实际生境存量约束，暂缺药草时需要等待恢复。','original',16],
 ['tager.watch','塔戈尔外缘·沙丘瞭望坡',['investigate'],[],'沙脊上能辨认近处商道，远方地貌仍藏在风沙里。','风沙中难辨远方细节，近处木桩标示返回绿洲的方向。'],
];
export const locations={id:'world.places',version:1,entries:rows.map(([id,name,services,stock,description,notice,source='original',ecology=0])=>{
 const region=id.split('.')[0],hidden=['mountain.valley','mountain.cave'].includes(id);
 return entry(id,{id,name,region,scene:'scene-'+id.replace('.','-'),services,stock,description,notice,ecology,hidden,width:20,height:14,spawn:{x:2,y:7},exit:{x:1,y:7},
  blocks:region==='tager'?[{x:9,y:2,w:3,h:3},{x:14,y:9,w:2,h:2}]:[{x:8,y:3,w:4,h:3},{x:13,y:9,w:3,h:2}],
  objects:[{id:'notice',name:ecology||region==='tager'?'行路标记':'当地告示',x:4,y:4,kind:'investigate'},
   {id:'resource',name:ecology?'药材生境':stock.length?'交易柜台':services.includes('repair')?'修器台':'访客等候处',x:16,y:5,kind:ecology?'gather':stock.length?'trade':'investigate'}]},source);
})};
const links=[];
function connect(from,to,hours,risk=0){for(const [a,b] of [[from,to],[to,from]])links.push(entry(a+'--'+b,{id:a+'>'+b,from:a,to:b,ticks:hours*60,risk}));}
// Preserve existing local travel durations and add short branches.
for(const region of ['wutan','qingshan','mountain']){
 const ps=rows.slice(0,12).filter(p=>p[0].startsWith(region+'.'));
 for(let n=1;n<ps.length;n++)connect(ps[n-1][0],ps[n][0],region==='mountain'?3:1,region==='mountain'?2:0);
}
connect('wutan.gate','qingshan.inn',72,1);connect('qingshan.guild','mountain.camp',8,2);
for(const [a,b] of [['wutan.market','wutan.workshop'],['wutan.market','wutan.teahouse'],['wutan.gate','wutan.depot'],['qingshan.herbal','qingshan.wanyao'],['qingshan.guild','qingshan.smithy'],['qingshan.guild','qingshan.trail']])connect(a,b,1);
connect('qingshan.trail','mountain.camp',7,2);
for(const region of ['blackrock','shimo']){
 const ps=rows.filter(p=>p[0].startsWith(region+'.'));for(let n=1;n<ps.length;n++)connect(ps[0][0],ps[n][0],1);
}
connect('wutan.gate','blackrock.gate',96,1);connect('qingshan.inn','blackrock.gate',72,1);
connect('blackrock.gate','shimo.gate',120,2);connect('shimo.gate','tager.pass',8,2);
connect('tager.pass','tager.oasis',6,2);connect('tager.oasis','tager.watch',4,3);
export const routes={id:'world.routes',version:1,entries:links};
