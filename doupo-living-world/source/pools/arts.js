// Executable authored rules. Reserve entries never enter random draws or shops.
const art=(id,name,type,item,price,requirements,effect)=>({id,weight:1,status:'ready',conditions:requirements,value:{name,type,item,price,tier:'黄阶',attribute:'neutral',core:type==='cultivation'?'basic':type==='combat'?'palm':'formula',...effect}});
export const arts={id:'arts',version:1,entries:[
 art('steady','平息诀','cultivation','manual',75,{age:{min:18}},{xpRate:100,qiRate:100}),
 art('wood-breath','养木息法','cultivation','manual-wood',90,{age:{min:18},wood:{min:1}},{attribute:'wood',xpRate:110,qiRate:85}),
 art('stone-breath','沉石纳气法','cultivation','manual-stone',65,{age:{min:18}},{xpRate:90,qiRate:75}),
 art('fire-breath','引火诀','cultivation','manual-fire',110,{age:{min:18},fire:{min:3}},{attribute:'fire',xpRate:125,qiRate:130}),
 art('wind-breath','轻风息法','cultivation','manual-wind',95,{age:{min:18},soul:{min:2}},{attribute:'wind',xpRate:115,qiRate:110}),
 art('stone-palm','碎石掌','combat','technique',60,{age:{min:18}},{qiCost:15,power:4,arms:2}),
 art('short-fist','短桥拳','combat','technique-short',45,{age:{min:18}},{qiCost:8,power:2,arms:1}),
 art('point-finger','点脉指','combat','technique-finger',80,{age:{min:18},soul:{min:3}},{qiCost:12,power:3,arms:1}),
 art('heavy-palm','叠岩掌','combat','technique-heavy',100,{age:{min:18},rank:{min:8}},{qiCost:22,power:6,arms:2}),
 art('healing-formula','基础疗伤散丹方','formula','formula',45,{age:{min:18}},{recipe:'medicine'}),
 {id:'flame-mantra',weight:0,status:'reserve',conditions:{},value:{name:'焚诀',type:'cultivation',tier:'特殊',attribute:'fire',core:'basic',reason:'未实现异火成长与取得条件，不参与初始化或生成'}}
]};
