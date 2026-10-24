// Local methods, names, prices and parameters are original game content.
// Restricted realm abilities never enter the ordinary learning or shop pools.
const art=(id,name,type,item,price,requirements,effect)=>({id,weight:1,status:'ready',conditions:{...requirements,rank:{min:effect.minRank||requirements.rank?.min||1},...(effect.attribute==='fire'?{fire:{min:3}}:{})},source:'game-original',value:{
 name,type,item,price,tier:'黄阶低级',attribute:'neutral',core:type==='cultivation'||type==='basic'?'basic':type==='combat'?'palm':'formula',
 minRank:1,arms:0,qiCost:0,power:0,priority:0,accuracy:94,range:1,category:'',...effect}});
const tech=(id,name,item,price,category,effect)=>art(id,name,'combat',item,price,{},{
 category,arms:1,qiCost:14,power:8,kind:'strike',...effect});
export const arts={id:'arts',version:2,entries:[
 art('steady','基础纳气','basic','manual',25,{}, {capacity:100,quality:100,recovery:100,xpRate:100,qiRate:100}),
 art('wood-breath','养木息法','cultivation','manual-wood',90,{rank:{min:10},wood:{min:1}},{attribute:'wood',capacity:105,quality:100,recovery:135,xpRate:105,qiRate:95}),
 art('stone-breath','沉石纳气法','cultivation','manual-stone',85,{rank:{min:10}},{capacity:130,quality:95,recovery:95,xpRate:95,qiRate:90}),
 art('fire-breath','引火诀','cultivation','manual-fire',110,{rank:{min:10},fire:{min:3}},{attribute:'fire',capacity:100,quality:125,recovery:90,xpRate:115,qiRate:115}),
 art('wind-breath','轻风息法','cultivation','manual-wind',100,{rank:{min:10},affinity:{in:['wind']}},{attribute:'wind',capacity:105,quality:105,recovery:110,drive:2,xpRate:105,qiRate:100}),
 art('deep-reservoir','涵海诀','cultivation','manual-deep',480,{rank:{min:19},soul:{min:3}},{tier:'玄阶低级',capacity:160,quality:110,recovery:100,xpRate:120,qiRate:115}),
 art('clear-essence','凝真诀','cultivation','manual-clear',520,{rank:{min:19},soul:{min:4}},{tier:'玄阶低级',capacity:115,quality:150,recovery:85,xpRate:120,qiRate:125}),
 art('steady-channel','稳息小周天','auxiliary','manual-channel',65,{rank:{min:10}},{group:'breathing',compatible:['neutral','wood','wind'],upkeep:1,recovery:35}),
 art('tempered-frame','淬体行功','auxiliary','manual-frame',80,{rank:{min:10}},{group:'body',compatible:['neutral','fire','wood','wind'],upkeep:3,defense:4}),
 art('clear-mind','澄心守意','auxiliary','manual-mind',75,{rank:{min:10},soul:{min:3}},{group:'breathing',compatible:['neutral','fire','wind'],upkeep:3,resistance:20}),
 tech('stone-palm','碎石掌','technique',60,'melee',{arms:2,power:12}),
 tech('short-fist','短桥拳','technique-short',45,'melee',{qiCost:8,power:5,priority:1,accuracy:98}),
 tech('point-finger','点脉指','technique-finger',80,'melee',{qiCost:17,power:5,accuracy:87,status:'unstable'}),
 tech('heavy-palm','叠岩掌','technique-heavy',120,'melee',{arms:2,minRank:10,qiCost:28,power:16,priority:-1,hits:2,prepare:true}),
 tech('blade-cut','断流刀','technique-blade',75,'melee',{weapon:'blade',qiCost:14,power:15}),
 tech('willow-step','柳影步','technique-willow',65,'movement',{kind:'evade',arms:0,qiCost:12,move:3,priority:2}),
 tech('rushing-step','追风突进','technique-rush',90,'movement',{kind:'rush',arms:1,minRank:10,qiCost:22,power:9,move:4,priority:1}),
 tech('withdraw-step','折返步','technique-withdraw',85,'movement',{kind:'withdraw',arms:0,qiCost:18,move:5,priority:2}),
 tech('return-parry','回锋招架','technique-parry',90,'defense',{kind:'parry',weapon:'blade',qiCost:13,power:6,priority:3,reactionCost:8}),
 tech('qi-veil','凝气护身','technique-veil',110,'defense',{kind:'shield',arms:0,minRank:19,qiCost:24,power:26,priority:3}),
 tech('covering-palm','援护掌','technique-cover',95,'defense',{kind:'cover',range:3,qiCost:18,power:12,priority:3}),
 tech('flying-knife','掷刃诀','technique-knife',85,'ranged',{kind:'projectile',material:'throwing-knife',range:6,qiCost:10,power:11,accuracy:93}),
 tech('flame-bolt','离火矢','technique-bolt',180,'ranged',{kind:'projectile',minRank:19,attribute:'fire',range:7,qiCost:25,power:20,accuracy:88}),
 tech('sweeping-blade','回环扫刃','technique-sweep',150,'area',{kind:'sweep',weapon:'blade',range:2,qiCost:26,power:12,accuracy:92}),
 tech('ember-field','落焰阵','technique-embers',380,'area',{kind:'area',tier:'玄阶低级',minRank:19,attribute:'fire',material:'fire-sand',prepare:true,range:6,radius:2,qiCost:38,power:24,accuracy:92,priority:-1}),
 tech('binding-thread','缚步气索','technique-bind',160,'control',{kind:'bind',minRank:10,range:4,qiCost:24,power:0,accuracy:88,status:'bound'}),
 tech('settled-breath','定息行气','technique-settle',70,'support',{kind:'stabilize',arms:0,qiCost:8,power:0,priority:2}),
 tech('guiding-signal','同息接应','technique-signal',90,'support',{kind:'signal',arms:0,range:5,qiCost:12,power:0,priority:2}),
 art('healing-formula','基础疗伤散丹方','formula','formula',45,{}, {recipe:'medicine'}),
 ...[
  ['realm-veil','斗气纱衣',19,'shield',24,22,0],
  ['realm-armor','斗气铠甲',28,'shield',32,38,0],
  ['realm-construct','斗气凝物',37,'projectile',28,32,8],
  ['realm-flight','斗气化翼',46,'flight',25,0,12],
 ].map(([id,name,minRank,kind,qiCost,power,range])=>({...art(id,name,'combat','',0,{}, {category:'realm',minRank,kind,qiCost,power,range,priority:kind==='shield'?3:1,arms:0}),weight:0})),
 ...[
  ['beast-lunge','扑咬','rush',12,11,1,3,''],
  ['beast-charge','冲撞','rush',18,17,1,4,'unstable'],
  ['beast-coil','缠绞','bind',22,8,2,0,'bound'],
  ['beast-gust','翅风','projectile',18,14,5,0,''],
  ['beast-sting','尾螫','strike',15,10,1,0,'unstable'],
  ['beast-roar','震吼','sweep',28,19,3,0,'unstable'],
 ].map(([id,name,kind,qiCost,power,range,move,status])=>({...art(id,name,'combat','',0,{}, {category:'innate',kind,qiCost,power,range,move,status,arms:0}),weight:0})),
 {id:'flame-mantra',weight:0,status:'reserve',conditions:{},source:'canon-reserve',value:{name:'焚诀',type:'cultivation',item:'',tier:'特殊',attribute:'fire',core:'basic',reason:'未实现异火取得与成长，不参与初始化或抽样'}}
]};
