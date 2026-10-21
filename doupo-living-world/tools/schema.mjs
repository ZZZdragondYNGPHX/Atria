export const S=(maxLength=64,values)=>({type:'string',maxLength,...(values?{enum:values}:{})});
export const I=(minimum=0,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
export const B={type:'boolean'}, O=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const A=(items,maxItems=256)=>({type:'array',items,maxItems});
export const inventory=A(O({item:S(),qty:I(0,1000000)}),24),skills=A(O({id:S(),level:I(0,100)}),16);
export const person=O({actor:S(),sex:S(16,['male','female']),name:S(48),role:S(),home:S(),place:S(),x:I(0,19),y:I(0,13),born:I(-1000000000),alive:B,
 rank:I(1,39),xp:I(),hp:I(0,1000),qi:I(0,1000),injury:I(0,100),gold:I(0,1000000000),inventory,skills,
 fire:I(0,10),wood:I(0,10),soul:I(0,10),destination:S(),arriveAt:I(),plan:S(),next:I(),updated:I(),deathAt:I(),partner:S(),parentA:S(),parentB:S(),ward:S(),
 needItem:S(),needQty:I(0,100),preference:S(),chat:S(2048),decision:S(2048),choice:S(),visited:A(S(),128),lastSocial:I()});
export const info=O({actor:S(),target:S(),status:S(),channel:S(),kind:S(),text:S(2048),at:I(),source:S(128)});
export const world=O({created:B,origin:S(),background:S(),time:I(),serial:I(),producedGold:I(),consumedGold:I(),cap:I(24,128),
 appraisals:A(O({actor:S(),target:S(),dimension:S(),delta:I(-100,100),text:S(2048),eventId:S(),fingerprint:S()}),16),reservations:A(O({id:S(),a:S(),b:S(),due:I()}),16),families:A(O({id:S(),a:S(),b:S(),home:S(),gold:I(0,1000000000),food:I(),status:S(),children:A(S(),24)}),48),
 unique:A(O({id:S(),owner:S(),status:S()}),16),stocks:A(O({place:S(),item:S(),qty:I(),gold:I(0,1000000000),quote:I()}),64),
 promises:A(O({id:S(),giver:S(),receiver:S(),item:S(),qty:I(1,100),due:I(),status:S()}),64),
 op:O({kind:S(),target:S(),end:I(),detail:S(),stopped:B}),combat:O({enemy:S(),round:I(),guard:B}),
 agenda:O({actor:S(),record:S(),due:I()}),nextMarket:I(),nextImmigration:I(),known:A(S(),24),history:A(O({at:I(),kind:S(),refs:A(S(),8),text:S(256)}),128)});
export const visiblePerson=O({key:S(),actor:S(),sex:S(16,['male','female']),name:S(48),role:S(),place:S(),x:I(0,19),y:I(0,13),alive:B,activity:S(),contact:B,status:S(),needItem:S(),needQty:I(),reply:S(2048)});
export const view=O({created:B,time:I(),place:S(),x:I(0,19),y:I(0,13),name:S(48),rank:I(1,39),hp:I(0,1000),qi:I(0,1000),injury:I(0,100),gold:I(0,1000000000),alive:B,age:I(0,10000),inventory,skills,
 quotes:A(O({item:S(),qty:I(),price:I(),quote:I()}),16),people:A(visiblePerson,100),known:A(S(),24),clues:A(O({id:S(),kind:S(),text:S(2048),source:S(128),at:I()}),64),
 family:A(O({id:S(),a:S(),b:S(),home:S(),gold:I(),food:I(),status:S(),children:A(S(),24)}),4),
 promises:A(O({id:S(),giver:S(),receiver:S(),item:S(),qty:I(1,100),due:I(),status:S()}),32),
 opportunities:A(O({id:S(),state:S(),text:S(256)}),8),
 operation:O({kind:S(),target:S(),end:I(),detail:S(),stopped:B}),combat:O({enemy:S(),round:I(),guard:B}),
 result:O({code:S(),text:S(2048),spent:I(),at:I()}),actions:A(S(),64)});
export const step=O({kind:S(),target:S(),item:S(),qty:I(0,100),x:I(0,19),y:I(0,13),detail:S(128)});
export const action=O({kind:S(),target:S(),item:S(),qty:I(0,100),x:I(0,19),y:I(0,13),detail:S(128),text:S(2048),steps:A(step,4)});
