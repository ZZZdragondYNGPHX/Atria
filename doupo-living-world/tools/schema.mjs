export const S=(maxLength=64,values)=>({type:'string',maxLength,...(values?{enum:values}:{})});
export const I=(minimum=0,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
export const B={type:'boolean'}, O=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const A=(items,maxItems=256)=>({type:'array',items,maxItems});
export const inventory=A(O({item:S(),qty:I(0,1000000)}),24),skills=A(O({id:S(),level:I(0,100)}),16);
const part=S(16,['head','torso','left_arm','right_arm','left_leg','right_leg','whole']);
export const condition=O({missing:A(part,4),wounds:A(O({id:S(),part,kind:S(16,['trauma','fracture','loss']),severity:I(1,100),started:I(),updated:I(),treatedAt:I(-1),source:S(128),cause:S(256)}),8)});
export const conditionView=O({missing:A(part,4),wounds:A(O({id:S(),part,symptom:S(128),diagnosis:S(16,['unknown','trauma','fracture','loss']),severity:I(1,100),started:I(),treatedAt:I(-1)}),8),capabilities:A(O({kind:S(),available:B,reason:S(128)}),16)});
export const activity=O({kind:S(),target:S(),item:S(),started:I(),due:I(),progress:I(),pausedAt:I(),source:S(128)});
export const control=O({holder:S(),since:I(),until:I(),source:S(128)});
export const gear=A(O({id:S(),type:S(),slot:S(),equipped:B,durability:I(0,100),charges:I(0,100)}),4);
export const social=A(O({a:S(),b:S(),kind:S(),place:S(),at:I(),source:S(128),confidence:S(16,['known','reported','doubted','refuted'])}),16);
export const goal=A(O({id:S(),kind:S(),target:S(),priority:I(0,100),status:S(),source:S(128)}),6);
export const motive=A(O({target:S(),kind:S(),intensity:I(0,100),at:I(),source:S(128)}),6);
export const interaction=O({kind:S(),target:S(),place:S(),at:I(),source:S(128),relation:S()});
const causalOutcome=O({person:S(),alive:B,place:S(),x:I(0,19),y:I(0,13),rank:I(1,39),skills,hp:I(0,1000),qi:I(0,1000),injury:I(0,100),condition,gear,inventory,control});
causalOutcome.required=['person'];
export const cause=O({key:S(),mode:S(16,['delta']),kind:S(),at:I(),updated:I(),source:S(128),participants:A(S(),6),before:A(causalOutcome,6),after:A(causalOutcome,6),facts:A(O({kind:S(),at:I(),refs:A(S(),8),text:S(512)}),16),playerKnown:B,publicDetails:A(S(256),32)});
export const causeReference=A(O({id:S(),at:I(),summary:S(256)}),16);
export const person=O({actor:S(),sex:S(16,['male','female']),name:S(48),role:S(),home:S(),place:S(),x:I(0,19),y:I(0,13),born:I(-1000000000),alive:B,
 rank:I(1,39),xp:I(),hp:I(0,1000),qi:I(0,1000),injury:I(0,100),appearance:S(),generation:O({template:S(),origin:S(256),source:S(),version:I(1)}),study:O({cultivation:S(),combat:S(),xpCarry:I(0,99),qiCarry:I(0,99)}),condition,gear,control,activity,suspended:activity,speechReady:B,displayed:S(),displayedAt:I(),interaction,health:S(4096),traits:O({ambition:I(0,100),care:I(0,100),caution:I(0,100)}),goals:goal,motives:motive,social,gold:I(0,1000000000),inventory,skills,
 fire:I(0,10),wood:I(0,10),soul:I(0,10),destination:S(),arriveAt:I(),plan:S(),next:I(),updated:I(),deathAt:I(),partner:S(),parentA:S(),parentB:S(),ward:S(),
 needitem:S(),needqty:I(0,100),preference:S(),chat:S(2048),decision:S(2048),choice:S(),visited:A(S(),128),lastSocial:I(),lastMedicine:I(-1000000000)});
export const info=O({actor:S(),target:S(),status:S(),channel:S(),kind:S(),text:S(2048),at:I(),source:S(128)});
export const step=O({kind:S(),target:S(),item:S(),qty:I(0,100),x:I(0,19),y:I(0,13),detail:S(128)});
export const stepResult=O({kind:S(),code:S(),text:S(2048),spent:I(),accepted:B});
export const result=O({code:S(),text:S(2048),spent:I(),at:I(),partial:B,steps:A(stepResult,4)});
export const message=O({id:S(),sender:S(),receiver:S(),kind:S(),target:S(),place:S(),origin:S(),aboutPlace:S(),relation:S(),text:S(512),source:S(128),evidence:S(),receipt:S(),created:I(),due:I(),status:S()});
export const messageView=O({id:S(),sender:S(),receiver:S(),kind:S(),status:S(),at:I(),summary:S(128),event:S()});
export const conflict=O({id:S(),a:S(),b:S(),place:S(),started:I(),next:I(),round:I(),status:S(),cause:S(128)});
export const shipment=O({id:S(),carrier:S(),from:S(),to:S(),item:S(),qty:I(),due:I(),status:S(),source:S(128)});
export const organization=O({id:S(),place:S(),leader:S(),members:A(S(),8),gold:I(),herbs:I(),output:I(),updated:I(),status:S()});
export const world=O({created:B,origin:S(),background:S(),time:I(),serial:I(),producedGold:I(),consumedGold:I(),cap:I(24,128),relationKeys:A(S(),256),
 peopleKeys0:A(S(),33),peopleKeys1:A(S(),32),peopleKeys2:A(S(),32),mindKeys:A(S(),8),
 knownCauses:causeReference,
 releases:A(S(),96),
 ecology:A(O({place:S(),herbs:I(),capacity:I(),updated:I()}),4),messages:A(message,16),conflicts:A(conflict,4),shipments:A(shipment,8),organizations:A(organization,4),
 poolSeed:S(),poolRecent:A(S(128),64),initialResidents:I(0,4),focus:S(),peopleFilter:S(16,['nearby','known']),peoplePage:I(0,100),cluesPage:I(0,100),plan:A(step,4),planText:S(2048),planResults:A(stepResult,4),companions:A(S(),4),
 appraisals:A(O({actor:S(),target:S(),dimension:S(),delta:I(-100,100),text:S(2048),eventId:S(),fingerprint:S()}),16),reservations:A(O({id:S(),a:S(),b:S(),due:I()}),16),families:A(O({id:S(),a:S(),b:S(),home:S(),gold:I(0,1000000000),food:I(),status:S(),children:A(S(),24)}),48),
 unique:A(O({id:S(),owner:S(),status:S()}),16),stocks:A(O({place:S(),item:S(),qty:I(),gold:I(0,1000000000),quote:I()}),64),
 promises:A(O({id:S(),giver:S(),receiver:S(),item:S(),qty:I(1,100),due:I(),status:S()}),64),
 op:O({kind:S(),target:S(),end:I(),detail:S(),stopped:B}),combat:O({enemy:S(),round:I(),guard:B}),
 agenda:O({actor:S(),record:S(),due:I()}),nextMarket:I(),nextImmigration:I(),known:A(S(),24),history:A(O({at:I(),kind:S(),refs:A(S(),8),text:S(256)}),128)});
export const appearance=O({profile:S(),period:S(),ready:B,portraitAsset:S(),chibiAsset:S()});
export const visiblePerson=O({key:S(),actor:S(),sex:S(16,['male','female']),name:S(48),role:S(),place:S(),x:I(0,19),y:I(0,13),alive:B,activity:S(),contact:B,status:S(),needItem:S(),needQty:I(),reply:S(512),signs:A(S(128),12),observedAt:I(),carrying:S(),appearance});
export const view=O({created:B,time:I(),place:S(),placeName:S(128),x:I(0,19),y:I(0,13),name:S(48),sex:S(16,['male','female']),rank:I(1,39),hp:I(0,1000),qi:I(0,1000),injury:I(0,100),gold:I(0,1000000000),alive:B,age:I(0,10000),inventory,skills,
 appearance,focus:S(),peopleFilter:S(16,['nearby','known']),nearbyTotal:I(),knownPeopleTotal:I(),markerTotal:I(),markersTruncated:B,markers:A(O({key:S(),name:S(48),x:I(0,19),y:I(0,13),reason:S(),appearance}),12),
 arts:A(O({id:S(),name:S(),type:S(),tier:S(),attribute:S(),item:S(),known:B,level:I(0,100),active:B,eligible:B,xpRate:I(),qiRate:I(),qiCost:I(),power:I(),arms:I(0,2),source:S()}),16),
 condition:conditionView,gear,control,social,goals:goal,messages:A(messageView,8),workshops:A(O({id:S(),place:S(),status:S(),output:I()}),4),events:causeReference,
 quotes:A(O({item:S(),qty:I(),price:I(),quote:I()}),16),people:A(visiblePerson,12),peoplePage:I(0,100),peoplePages:I(1,100),peopleTotal:I(),known:A(S(),24),cluesPage:I(0,100),cluesPages:I(1,100),clues:A(O({id:S(),kind:S(),text:S(2048),source:S(128),at:I()}),64),
 family:A(O({id:S(),a:S(),b:S(),home:S(),gold:I(),food:I(),status:S(),children:A(S(),24)}),4),
 promises:A(O({id:S(),giver:S(),receiver:S(),item:S(),qty:I(1,100),due:I(),status:S()}),32),
 opportunities:A(O({id:S(),state:S(),text:S(256)}),8),
 operation:O({kind:S(),target:S(),end:I(),detail:S(),stopped:B}),combat:O({enemy:S(),round:I(),guard:B}),
 result,actions:A(S(),64)});
export const action=O({kind:S(),target:S(),item:S(),qty:I(0,100),x:I(0,19),y:I(0,13),detail:S(128),text:S(2048),steps:A(step,4)});
