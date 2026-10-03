// Package policy only. Native Authority owns resolution and SaveSystem state.
export function compileLifetimes(opening,manifest,operations,anniversary){
    const protagonistId=manifest.actors[0].actorId;
    const person=(id,name,age,tier,institutionId='',occupation='',sourceRecordId='')=>({id,name,birthTick:anniversary(0,-age),tier,institutionId,occupation,sourceRecordId});
    opening.lifecycle.lifetimes={schemaVersion:1,clockId:'world',chronologyDomain:'chronology',protagonistId,publicIdentityId:'public_identity.initial',
        actorSource:{domainId:'entities',identityField:'persistent_id',nameField:'name',aliveField:'alive',introducedPath:['provenance','stamp','tick']},seed:1703,adultAge:18,retirementAge:65,mortalityAge:78,gestationTicks:280*1440,maxPeople:256,maxEvents:512,maxBytes:1048576,initialPopulation:10000,
        people:[person(protagonistId,'Independent Civil Verifier',28,'A'),person('entity.anchor','Personal Anchor',28,'A','','','anchor'),
            person('entity.elias_rook','Elias Rook',43,'B','','','elias_rook'),person('entity.ada_rook','Ada Rook',38,'B','','','ada_rook'),
            person('entity.registrar','Miriam Vale',56,'A','civil_verifier','Senior registrar'),person('entity.clerk','Jonas Reed',31,'B','civil_verifier','Deputy registrar')],
        offices:[{id:'office.registrar',institutionId:'civil_verifier',title:'Civil register keeper',holderId:'entity.registrar',rule:'nomination'}],
        routes:[{id:'route.witness_covenant',label:'Witness Covenant: an enduring identity lien, paid in Claim burden and documentary exposure',agingDivisor:8,returnTicks:365*1440,claimCost:3,exposureCost:2},
            {id:'route.reconstructed_vessel',label:'Reconstructed Vessel: mortal embodiment restored through an enduring Claim',agingDivisor:1,returnTicks:90*1440,claimCost:5,exposureCost:1}]};
    const wait=opening.logic.transactions.find(t=>t.id==='opening.wait');
    const entries=Object.entries(operations);
    wait.inputSchema.properties.lifetime={type:'object',properties:{operation:{type:'string',maxLength:32,enum:entries.map(([op])=>op)},
        ...Object.fromEntries(entries.map(([op,schema])=>[op.replaceAll('.','_'),schema]))},required:['operation'],additionalProperties:false};
    const balanced=parts=>parts.length===1?parts[0]:'('+balanced(parts.slice(0,Math.ceil(parts.length/2)))+' || '+balanced(parts.slice(Math.ceil(parts.length/2)))+')';
    const has=balanced(entries.map(([op])=>'args.lifetime.operation == '+JSON.stringify(op)));
    const template=(schema,path)=>schema.type==='object'?Object.fromEntries(Object.entries(schema.properties).map(([k,v])=>[k,template(v,path+'.'+k)])):{formula:path};
    wait.resolution.cases[0].when=wait.resolution.cases[0].when.replace('args.minutes == 0','args.minutes == 0 && !('+has+')');
    wait.lifetimes=entries.map(([op,schema])=>({operation:op,when:'resolution.outcome != "impossible" && args.lifetime.operation == '+JSON.stringify(op),
        input:Object.fromEntries(Object.keys(schema.properties).map(k=>[k,template(schema.properties[k],'args.lifetime.'+op.replaceAll('.','_')+'.'+k)]))}));
    wait.intent.description+=' Optional lifetime operations govern consent-based family transitions, causal actors, offices and costly occult continuity.';
    // Ordinary creation establishes the same public credential used by later
    // identity rotation, rather than leaving its authored placeholder visible.
    opening.logic.transactions.find(t=>t.id==='opening.identity').lifetimes=[{operation:'identity.change',when:'resolution.outcome != "impossible"',input:{mode:'retain',name:{formula:'args.name'},method:'legitimate',sourceId:'public_identity.initial'}}];
    opening.logic.transactions.find(t=>t.id==='opening.day').receipt.projection.notice='Resolve the Native interval, retained obligations and relevant human lifetime milestones; no renewable or macro simulation.';
    return opening;
}
