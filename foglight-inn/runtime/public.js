export const places = {inn:'旅舍公共厅',store:'厨房与储物间',radio:'旧无线电室',lighthouse:'灯塔',pier:'避风码头'};
export const people = {
 zhou:{name:'周守川',role:'61 岁 · 退休灯塔管理员',description:'住在岛上，熟悉岸线和旧设备。说话慢，偶尔有一点干幽默。',greeting:'灯要修，人也要吃饭。先把手里的碗放稳。'},
 lin:{name:'林岚',role:'32 岁 · 修理技师',description:'来收拾修理铺的工具，也替海事站检查旧器材。利落直接，愿意把原理讲清楚。',greeting:'我能帮你查出来哪里坏了。能不能修好，得看东西和时间。'},
 xu:{name:'许澄',role:'26 岁 · 天气记录员',description:'带着纸质观测册与尺子。做事认真，判断变了，会把新的先讲清楚。',greeting:'窗边那把椅子先别挪，我还要量一次风。等我把湿袖子晾干。'},
 shen:{name:'沈遥',role:'35 岁 · 渡船邮务员',description:'带着邮袋和船务单，熟悉泊位与运输安排。习惯把能办到的事写在纸上。',greeting:'我先记上。能办到的事和想办到的事，得分开写。'}
};
export const schedule = [
 ['inn','inn','inn','inn'],['lighthouse','radio','pier','pier'],['inn','inn','radio','pier'],['radio','inn','inn','inn'],
 ['lighthouse','lighthouse','pier','radio'],['inn','store','radio','pier'],['inn','store','inn','inn'],['inn','radio','inn','inn'],
 ['lighthouse','radio','pier','pier'],['inn','store','radio','pier'],['inn','inn','inn','pier'],['inn','inn','inn','inn']
];
export const personIds = Object.keys(people);
export const descriptions = {
 inn:'窗下长桌留着四只杯子。叶姨把值守便笺贴在水壶旁：门闩往上抬一点，别跟它较劲。窗外是灯岬岛的海雾。',
 store:'干粮架与炉灶只隔一条短过道。封存应急餐按三晚分别放好，另有一批可清点的干粮。工具抽屉的纸签已经卷边。',
 radio:'右边是现用报务台，接点等待更换；左侧架上的退役接收机已不承担通信。防潮档案夹放在两张桌子之间。',
 lighthouse:'石阶只通向允许作业的检修层。断电挂牌和公开步骤贴在入口，不必登高就能完成接点与灯组检查。',
 pier:'外侧泊位与背风接驳点一眼可分。船务登记簿、转运登记和公开配货单放在有檐的值守台，寄存柜旁有防潮待发邮袋。'
};
export function period(g){return Math.min(11,Math.floor(g.spent_ap/2));}
export function timeLabel(g){return g.spent_ap===24?'第三夜结束 · 最后安排':'第'+(Math.floor(period(g)/4)+1)+'天 · '+['晨','午','暮','夜'][period(g)%4];}
export function whereabouts(g,id){if(g.final_plan)return g.location;const j=g.jobs.find(j=>j.npc===id&&j.status==='active');return j?(['light','pier','radio'].includes(j.target)?{light:'lighthouse',pier:'pier',radio:'radio'}[j.target]:j.target==='departure'?'inn':'pier'):schedule[period(g)][personIds.indexOf(id)];}
export function available(g,id){return !g.jobs.some(j=>j.npc===id&&j.status==='active');}
export function reserves(g){return g.jobs.filter(j=>j.status==='active').reduce((a,j)=>({parts:a.parts+j.parts,fuel:a.fuel+j.fuel}),{parts:0,fuel:0});}
export function routes(g){return {light:g.facilities.light===2&&g.ferry_registered&&g.departure_prepared,harbor:g.facilities.pier===2&&g.transfer_coordinated&&g.departure_prepared,stay:true};}
export function imageFor(g){if(g.final_plan)return 'end-'+g.final_plan;if(g.location==='lighthouse'&&g.facilities.light===2)return 'lighthouse-lit';if(g.location==='pier'&&g.facilities.pier===2)return 'pier-ready';if(g.location==='inn'&&g.spent_ap>=16)return 'inn-storm';return g.location+'-'+(period(g)%4>=2?(g.location==='inn'?'night-v2':'night'):'day');}
export const promiseNames={zhou:'归还值班本',lin:'整理公共工具抽屉',xu:'誊清一页观测',shen:'交付封缄信'};
