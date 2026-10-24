// Rank is an ordinal, never a combat formula. One mapping serves all callers.
export const REALMS=['斗之气','斗者','斗师','大斗师','斗灵','斗王','斗皇','斗宗','斗尊'];
export function realm(rank){
 if(!Number.isInteger(rank)||rank<1||rank>81)throw Error('unsupported cultivation rank');
 const stage=Math.floor((rank-1)/9),star=(rank-1)%9+1;
 return {stage,star,name:REALMS[stage],label:REALMS[stage]+star+(stage?'星':'段'),formal:stage>=1,veil:stage>=2,armor:stage>=3,construct:stage>=4,flight:stage>=5,
  strength:Math.round(8*Math.pow(2.15,stage)+star*1.6),capacity:65+stage*35+star*5,speed:5+stage*4+Math.floor(star/3)};
}
export const growthNeed=p=>Math.round((90+p.rank*18)*Math.pow(1.6,realm(p.rank).stage));
export const canAdvance=p=>p.rank<36&&p.xp>=growthNeed(p)&&p.injury<=20&&p.qi>=40;
