// Novel names describe setting; all local layouts, routes, timings and formulas
// below are authored game rules, not distances or statistics from the novel.
export const PERIOD = '萧家本轮斗气测试当日晚间，来客会面之前；后续历史不锁定原著结果。';
export const PLAYER = 'actor_4fba8c0c4b6a5dc93ab17ea610f99d08';
export const BACKGROUNDS = [
 {id:'clan',name:'小族旁支',place:'wutan.clan',gold:90,rank:4,fire:2,wood:0,soul:2,contact:'lin',description:'在乌坦城族产做事的成年旁支，得一份家传基础功法。'},
 {id:'apprentice',name:'药铺学徒',place:'wutan.herbal',gold:55,rank:3,fire:4,wood:1,soul:4,contact:'su',description:'成年学徒，熟悉药材，有炼药潜质，仍须学习丹方与控火。'},
 {id:'mercenary',name:'佣兵后辈',place:'qingshan.guild',gold:70,rank:5,fire:1,wood:0,soul:2,contact:'he',description:'成年佣兵的后辈，识路而不等于能独闯山脉。'},
 {id:'wanderer',name:'落脚散修',place:'wutan.inn',gold:115,rank:4,fire:2,wood:0,soul:3,contact:'yan',description:'成年散修，自行负担住食，城中尚无稳固人脉。'},
];
const places = [
 ['wutan.inn','乌坦城·客栈','wutan'],['wutan.market','乌坦城·坊市','wutan'],['wutan.herbal','乌坦城·药铺','wutan'],
 ['wutan.auction','乌坦城·米特尔拍卖分号','wutan'],['wutan.clan','乌坦城·家族接待与演武区','wutan'],['wutan.gate','乌坦城·城门','wutan'],
 ['qingshan.inn','青山镇·商街客栈','qingshan'],['qingshan.herbal','青山镇·药材铺','qingshan'],['qingshan.guild','青山镇·佣兵集结处','qingshan'],
 ['mountain.camp','魔兽山脉·外缘营地','mountain'],['mountain.valley','魔兽山脉·药谷','mountain'],['mountain.cave','魔兽山脉·支洞','mountain'],
];
export const PLACES = places.map(([id,name,region])=>({id,name,region,width:20,height:14,spawn:{x:2,y:7},
 blocks:[{x:8,y:3,w:4,h:3},{x:13,y:9,w:3,h:2}],exit:{x:1,y:7},
 objects: [{id:'notice',name:region==='mountain'?'旧路标':'消息栏',x:4,y:4,kind:'investigate'},
  {id:'resource',name:region==='mountain'?'药材生境':'交易柜台',x:16,y:5,kind:region==='mountain'?'gather':'trade'}],
 description:'原创场所布局；可玩区域以内的路线与遮挡均有规则。'}));
export const ROUTES = [];
function route(from,to,hours,risk=0){ROUTES.push({id:from+'>'+to,from,to,ticks:hours*60,risk});ROUTES.push({id:to+'>'+from,from:to,to:from,ticks:hours*60,risk});}
for (const region of ['wutan','qingshan','mountain']) {const ps=PLACES.filter(p=>p.region===region);for(let n=1;n<ps.length;n++)route(ps[n-1].id,ps[n].id,region==='mountain'?3:1,region==='mountain'?2:0);}
route('wutan.gate','qingshan.inn',72,1);route('qingshan.guild','mountain.camp',8,2);
export const ITEMS = [
 {id:'food',name:'干粮',price:3,kind:'supply'}, {id:'herb',name:'常用药草',price:8,kind:'material'},
 {id:'redleaf',name:'赤叶药材',price:35,kind:'unique'}, {id:'medicine',name:'基础疗伤散',price:22,kind:'medicine'},
 {id:'manual',name:'黄阶基础功法抄本',price:75,kind:'manual'}, {id:'technique',name:'黄阶碎石掌抄本',price:60,kind:'manual'},
 {id:'formula',name:'基础疗伤散丹方',price:45,kind:'manual'}, {id:'relic',name:'支洞遗留的修炼札记',price:180,kind:'unique'},
];
export const KINDS = ['create','move','approach','travel','talk','work','promise','deliver','buy','sell','gift','allocate',
 'investigate','gather','claim','train','learn','breakthrough','rest','refine','consume','attack','technique','guard','retreat','surrender',
 'invite','confess','engage','marry','separate','conceive','care','treat','teach','wait','continue','cancel','clarify','browse','recall','condition'];
// Each person has a livelihood, finite resources, an origin and a preference.
// Canon characters are not automatically romance candidates or omniscient.
export const CAST = [
 ['xiaoyan','萧炎','wutan.clan','cultivator',15,3,false,'萧家少年；本轮测试三段，仍在努力修炼。'],
 ['xiaozhan','萧战','wutan.clan','leader',40,25,false,'萧家族长、萧炎之父；精确年龄与境界未锁定为小说数值。'],
 ['xuner','萧薰儿','wutan.clan','cultivator',14,9,false,'萧家少女；本轮测试九段，支持萧炎。'],
 ['su','苏晚禾','wutan.herbal','herbalist',23,5,true,'原创：药铺帮手，想治好父亲的旧伤，拒绝只用礼物买亲密。'],
 ['lin','林砚','wutan.clan','cultivator',25,7,true,'原创：族产账房，重履约，希望养家与修炼兼顾。'],
 ['yan','燕宁','wutan.inn','innkeeper',28,4,true,'原创：客栈伙计，愿在稳定生活与外出见闻之间协商。'],
 ['he','何照川','qingshan.guild','guide',29,12,true,'原创：山路向导，重同行者的准备与救援，不接受无偿冒险。'],
 ['lu','陆青','qingshan.herbal','rival',24,11,true,'原创：寻找赤叶药材的竞争修炼者，有自己的线索与行程。'],
 ['chen','陈槐','wutan.market','merchant',36,6,true,'原创：商贩，进货与家中开销同样要紧。'],
 ['ning','宁素','qingshan.inn','healer',27,10,true,'原创：给佣兵疗伤，反感无故伤害与隐瞒伤亡。'],
 ['zhou','周衡','mountain.camp','mercenary',32,14,true,'原创：守营佣兵，缺补给时会退回青山镇。'],
 ['su-father','苏守义','wutan.herbal','elder',61,8,false,'原创：有旧伤的药材商，苏晚禾的父亲。'],
 ['lin-mother','林秀','wutan.inn','artisan',56,3,false,'原创：林砚的母亲，能自谋生计并承担家庭照护。'],
 ['gao','高嵩','wutan.market','porter',34,4,true,'原创：坊市搬运者，供养幼女。'],
 ['gao-child','高小满','wutan.inn','child',8,1,false,'原创：高嵩之女，长大后才有成年活动。'],
 ['tang','唐汀','qingshan.herbal','merchant',31,8,true,'原创：经营药材铺，给采药者付款。'],
 ['min','闵修','qingshan.guild','mercenary',22,9,true,'原创：愿意结伴，也会自行接受佣兵工作。'],
 ['qiao','乔澜','wutan.auction','merchant',30,10,true,'原创：拍卖分号接待者，并非替代雅妃的原著身份。'],
 ['wu','吴伯','wutan.gate','guard',52,13,false,'原创：城门守卫，珍惜来往人物的平安。'],
 ['xu','许弦','wutan.clan','artisan',26,6,true,'原创：修缮演武器具，以收入换取修炼时间。'],
 ['lian','连芷','qingshan.inn','innkeeper',26,5,true,'原创：客栈经营者，宁素的友人。'],
 ['bo','薄尧','mountain.camp','gatherer',35,11,true,'原创：长期采药者，会与陆青竞争生境。'],
 ['shu','舒雁','wutan.market','artisan',24,5,true,'原创：有自己的谋生安排与家庭愿望。'],
 ['shen','沈原','qingshan.guild','cultivator',43,15,true,'原创：佣兵教头，收徒取决于意愿与实际能力。'],
];
export const YEAR = 365*24*60, DAY=24*60;
export const POLICY = {liveCap:96,low:48,high:84,regionalCap:64,adultYears:18,gestationDays:270,immigrationDays:90};
export const START_KNOWLEDGE = [
 {kind:'novel_memory',text:'你记得小说中的萧炎、古戒与后来的成长，但记忆不等于本局事实，也不向本土人物公开。',source:'玩家创建时选择穿越者'},
 {kind:'rumor',text:'乌坦城与青山镇有药材来往，山脉外缘的赤叶药材有竞争者。',source:'原创本地传闻'},
];
