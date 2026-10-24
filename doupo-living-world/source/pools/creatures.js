// Explicit original adaptations: these are not assertions about novel species.
const beast=(id,name,tier,habitat,behavior,body,ability,resistance=0)=>({id,status:'ready',weight:1,conditions:{place:{in:habitat}},source:'game-original',value:{
 name,tier,habitat,behavior,body,ability,resistance,vision:behavior==='ambush'?6:9,food:['rock-boar','iron-bear'].includes(id)?'herb':'meat'}});
export const creatures={id:'creatures',version:1,entries:[
 beast('ridge-wolf','脊灰狼',1,['mountain.camp','qingshan.trail'],'pack','quadruped','beast-lunge'),
 beast('rock-boar','岩背豕',1,['mountain.valley','mountain.camp'],'territorial','quadruped','beast-charge',10),
 beast('thorn-vine','棘藤灵蟒',2,['mountain.valley'],'ambush','serpent','beast-coil',15),
 beast('cliff-hawk','崖风隼',2,['mountain.cave','qingshan.trail'],'kite','winged','beast-gust'),
 beast('sand-scorpion','赤尾砂蝎',2,['tager.oasis','tager.pass'],'ambush','arthropod','beast-sting',20),
 beast('iron-bear','铁脊山熊',3,['mountain.cave','tager.watch'],'territorial','quadruped','beast-roar',30),
]};
