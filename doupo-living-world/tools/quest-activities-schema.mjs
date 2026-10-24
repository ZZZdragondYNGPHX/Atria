// Factory avoids a circular import with the central schema authority.
export function questActivitiesSchemas(S,I,B,O,A){
 const history=O({id:S(),type:S(),status:S(),at:I(),score:I(-100,10000),text:S(512)});
 const certificate=O({holder:S(),kind:S(),issuer:S(),at:I(),evidence:S(),version:I(1)});
 const instance=O({id:S(),type:S(),version:I(1),host:S(),place:S(),participant:S(),status:S(),stage:I(0,4),role:S(),item:S(),quantity:I(0,10),seller:S(),stock:B,price:I(),bidder:S(),escrow:I(),round:I(),budget:I(),principal:S(),funds:I(),score:I(-100,10000),material:I(),spent:I(),quality:I(),mode:S(),reason:S(512),at:I(),due:I(),steps:A(S(),8),workUntil:I(),source:S(),destination:S(),cargo:B});
 const option=O({label:S(128),detail:S(),item:S(),qty:I(),text:S(128)});
 const visible=O({id:S(),type:S(),title:S(),place:S(),host:S(),status:S(),stage:I(0,4),role:S(),item:S(),quantity:I(0,10),price:I(),bidder:S(),round:I(),score:I(-100,10000),material:I(),spent:I(),summary:S(768),at:I(),due:I(),workUntil:I(),destination:S(),budget:I(),principal:S(),options:A(option,10),combatDependency:S(128)});
 return {state:O({serial:I(),instances:A(instance,8),history:A(history,24),certificates:A(certificate,4)}),view:O({openings:A(option,4),certificates:A(certificate,4),history:A(history,6),instances:A(visible,8)})};
}
