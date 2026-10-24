import {DAY} from '../content/catalog.js';
import {creatures} from '../pools/creatures.js';

export const PARTS=['head','torso','left_arm','right_arm','left_leg','right_leg','whole'];
const names={head:'头部',torso:'躯干',left_arm:'左臂',right_arm:'右臂',left_leg:'左腿',right_leg:'右腿',whole:'全身'};
const anatomy=p=>creatures.entries.find(e=>e.id===p.species)?.value.body||'human';
const partName=(p,id)=>({quadruped:{left_arm:'左前肢',right_arm:'右前肢',left_leg:'左后肢',right_leg:'右后肢'},winged:{left_arm:'左翼',right_arm:'右翼',left_leg:'左足',right_leg:'右足'},arthropod:{left_arm:'左螯',right_arm:'右螯',left_leg:'左侧步足',right_leg:'右侧步足'},serpent:{torso:'蛇躯'}}[anatomy(p)]?.[id]||names[id]);
export const initialCondition=()=>({missing:[],wounds:[]});
export function injure(p,{id,part,kind,severity,at,source,cause}){
 if(!id||!PARTS.includes(part)||!['trauma','fracture','loss'].includes(kind)||!Number.isInteger(severity)||severity<1||severity>100||!Number.isSafeInteger(at)||at<0)throw Error('invalid bodily effect');
 if(anatomy(p)==='serpent'&&!['head','torso','whole'].includes(part))throw Error('part absent in species anatomy');
 if(p.condition.wounds.some(w=>w.id===id))return false;
 if(kind==='loss'&&!['left_arm','right_arm','left_leg','right_leg'].includes(part))throw Error('invalid missing part');
 if(p.condition.missing.includes(part))return false;
 if(p.condition.wounds.length>=8)throw Error('active wound capacity');
 p.condition.wounds.push({id,part,kind,severity,started:at,updated:at,treatedAt:-1,source,cause});
 if(kind==='loss')p.condition.missing.push(part);
 p.injury=Math.min(100,p.injury+Math.ceil(severity/4));
 p.hp=Math.max(0,p.hp-Math.ceil(severity/3));
 return true;
}
// Only settled game-time intervals heal wounds. Healing a loss wound never
// changes structural integrity; ordinary medicine does not mend fractures.
export function recoverCondition(p,until,nourished=true){
 const healed=[];
 for(const wound of p.condition.wounds){
  const days=Math.floor((until-wound.updated)/DAY);
  if(days<=0)continue;
  wound.updated+=days*DAY;
  if(!nourished)continue;
  const rate=wound.kind==='fracture'?(wound.treatedAt>=0?2:0):wound.treatedAt>=0?6:2;
  wound.severity=Math.max(0,wound.severity-days*rate);
  if(!wound.severity)healed.push(wound.id);
 }
 p.condition.wounds=p.condition.wounds.filter(w=>w.severity>0);
 return healed;
}
export function treatCondition(p,kind,at,woundId=''){
 if(kind==='splint'){
  const wound=p.condition.wounds.find(w=>w.id===woundId&&w.kind==='fracture'&&w.treatedAt<0);
  if(!wound)return false;
  wound.treatedAt=at;wound.updated=at;return true;
 }
 if(kind!=='medicine')return false;
 for(const wound of p.condition.wounds)if(wound.kind!=='fracture'){
  wound.severity=Math.max(1,wound.severity-10);wound.treatedAt=at;wound.updated=at;
 }
 p.injury=Math.max(0,p.injury-20);p.hp=Math.min(100,p.hp+25);
 return true;
}
export const awarenessRestriction=p=>!p.alive?'人物已死亡':p.hp<=10||p.condition.wounds.some(w=>w.part==='head'&&w.severity>=60)?'当前意识与身体状况不足':'';
export function capabilities(p){
 const burden=part=>p.condition.wounds.filter(w=>w.part===part).reduce((m,w)=>Math.max(m,w.severity),0);
 const missing=part=>p.condition.missing.includes(part);
 const unusable=part=>missing(part)||burden(part)>=30;
 const reason=part=>names[part]+(missing(part)?'缺失':'伤处尚未恢复');
 const mental=awarenessRestriction(p);
 const leg=['left_leg','right_leg'].find(unusable),arms=['left_arm','right_arm'].filter(unusable);
 const controlled=p.control?.holder?'当前受到拘束':'';
 const moving=mental||controlled||(leg?reason(leg):p.injury>60?'总伤势不适合移动':'');
 const hands=mental||(arms.length===2?'双臂无法持握':'');
 const labor=moving||hands||(arms.length?reason(arms[0]):burden('torso')>=40||burden('whole')>=40?'躯干或全身伤势不适合负重':'');
 const training=mental||controlled||(burden('torso')>=40||burden('whole')>=40?'躯干或全身伤势不适合运气':p.injury>40?'总伤势不适合修炼':'');
 if(p.species){const body=anatomy(p),beastMove=mental||controlled||(burden('torso')>=(body==='serpent'?30:60)||burden('whole')>=60?'种族身体受重创':body!=='serpent'&&leg?'步行肢体受损':'');
  const innate=beastMove||(body==='winged'&&arms.length?'翼部受损，无法驱动翅风':'');
  return {communicate:mental||'此魔兽不能用人语交流',move:beastMove,grip:mental,work:'魔兽没有人类职业',gather:'魔兽采用生境觅食',train:'天生能力不按人类功法修炼',learn:'种族天生能力',refine:'魔兽不能炼药',care:mental,breakthrough:'首批魔兽按种族阶位生成',attack:beastMove,technique:innate,retreat:beastMove};}
 return {communicate:mental,move:moving,grip:hands,work:labor,gather:labor,train:training,
  learn:mental||controlled,refine:hands||training,care:hands||mental||controlled,breakthrough:training||(p.injury>20?'总伤势不适合突破':''),
  attack:hands||moving,technique:training,retreat:moving};
}
export function conditionDetail(p){
 return {missing:[...p.condition.missing],wounds:p.condition.wounds.map(w=>({id:w.id,part:w.part,
  symptom:partName(p,w.part)+(w.kind==='loss'?'缺失后的创口':w.kind==='fracture'&&w.treatedAt>=0?'已处置的骨折':'疼痛与功能受限'),
  diagnosis:w.kind==='loss'?'loss':w.kind==='fracture'&&w.treatedAt<0?'unknown':w.kind,
  severity:w.severity,started:w.started,treatedAt:w.treatedAt})),
  capabilities:Object.entries(capabilities(p)).map(([kind,reason])=>({kind,available:!reason,reason}))};
}
export function conditionSigns(p){
 const signs=p.condition.missing.map(part=>partName(p,part)+'明显缺失');
 if(p.control?.holder)signs.push('行动受到看守限制');
 for(const wound of p.condition.wounds)if(wound.severity>=30&&!p.condition.missing.includes(wound.part))signs.push(partName(p,wound.part)+'活动明显受限');
 if(p.hp<=10&&p.alive)signs.push('难以主动回应');
 return [...new Set(signs)];
}
export function conditionAwareness(p){
 const detail=conditionDetail(p);
 return JSON.stringify({missing:detail.missing,wounds:detail.wounds.map(w=>({id:w.id,symptom:w.symptom,diagnosis:w.diagnosis,severity:w.severity,treatedAt:w.treatedAt})),
  limitations:[...new Set(detail.capabilities.filter(c=>!c.available).map(c=>c.reason))]});
}
