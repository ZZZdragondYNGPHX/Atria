export function combatSchemas({S,I,B,O,A}){
 const request=O({round:I(),actor:S(),kind:S(),item:S(),target:S(),reply:S()});
 const offer=O({actor:S(),to:S(),gold:I(),status:S()});
 const log=O({round:I(),actor:S(),target:S(),code:S(),text:S(256)});
 const participant=O({id:S(),side:S(),joined:I(),status:S(),actions:I(),harmFrom:A(S(),8),guard:I(),shield:I(),reaction:S(),cover:S(),evade:I(),flight:B,
  statuses:A(O({kind:S(),until:I()}),8),resistUntil:I()});
 const decision=O({actor:S(),kind:S(),target:S(),item:S(),x:I(0,19),y:I(0,13),move:B});
 const state=O({id:S(),enemy:S(),round:I(),guard:B,phase:S(),place:S(),reason:S(),objective:S(),protected:S(),started:I(),seed:S(),cursor:I(),clock:I(),
  participants:A(participant,97),queue:A(decision,97),requests:A(request,8),log:A(log,24),result:S(),winner:S(),offers:A(offer,97),loot:A(S(),97)});
 const view=O({id:S(),enemy:S(),round:I(),guard:B,phase:S(),objective:S(),result:S(),winner:S(),page:I(),pages:I(1),total:I(),
  participants:A(O({id:S(),name:S(48),side:S(),status:S(),x:I(0,19),y:I(0,13),signs:S(),shielded:B,controlled:B,species:S()}),8),
  log:A(log,8),requests:A(request,8),offers:A(offer,8),
  techniques:A(O({id:S(),name:S(),kind:S(),qiCost:I(),range:I(),radius:I(),reason:S(128)}),64)});
 return {state,view};
}
