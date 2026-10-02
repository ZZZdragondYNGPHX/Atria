import assert from 'node:assert/strict';
export async function lifetimeChecks(h){
    const {anniversary,lifetimeView,people}=await h.load('public/shared/native-lifetime-runtime.js');
    const {validateLifetimes}=await h.load('src/native/lifetime-authority.js');
    const {validateHistory}=await h.load('src/native/history-authority.js');
    const {queryHistory}=await h.load('public/shared/native-history-runtime.js');
    const {makeTempSqliteEngineHarness}=await h.load('tests/storage/harness/contract-harness.js');
    await h.fresh();await h.create();let s=h.session(),svc=h.svc,handle=h.fsHandle,owned=null,serial=0;const restores=[],work=[];
    const life=()=>s.states.atri_lifecycle.lifetimes,hero=h.manifest.actors[0].actorId,clock=()=>s.states.atri_lifecycle.clocks.world;
    const act=async input=>{
        s=await svc.core.appendTimeline(handle,s.session.sessionId,{role:'user',content:'Resolve a declared human lifetime transition.'});
        const p=await svc.core.prepareAuthorityTurn(handle,s,{transactionId:'opening.wait',input});assert.equal(p.prepared.receipt.result.outcome,'automatic');work.push(p.prepared.work);
        const request={invocationId:'lifetime-check-'+ ++serial,authorityProof:p.proof,envelope:{schemaVersion:1,narrative:'The authorized lifetime transition is recorded.',outcomes:[],diagnostics:[]}};
        s=await svc.core.finalizeTurn(handle,s.session.sessionId,request,{expectedRevisionId:s.revision.revisionId});validateLifetimes(s,{complete:true});validateHistory(s);
    };
    const op=(operation,input)=>act({minutes:0,lifetime:{operation,[operation.replaceAll('.','_')]:input}});
    const wait=until=>act({minutes:until-clock()});
    const restore=async label=>{
        const point=await svc.saveSystem.manualSave(handle,s.session.sessionId),exported=await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,point.saveId);
        const target=await(restores.length%2?h.makeTempFsEngine():makeTempSqliteEngineHarness()),next=h.services(target);
        await next.packageInstaller.install(target.handle,h.archive,{grantedPermissions:['generation']});const r=await next.saveSystem.importSave(target.handle,exported.archive);
        assert.deepEqual(r.states,s.states,label+' all authoritative state');assert.deepEqual(r.timeline,s.timeline);assert.equal(r.session.sessionId,s.session.sessionId);
        if(owned)await owned.cleanup();owned=target;svc=next;handle=target.handle;s=r;restores.push({label,bytes:exported.archive.length});
    };
    try{
        assert(people(life())['entity.anchor'].identity.birthTick<0);assert.equal(people(life())['entity.elias_rook'].status.kind,'dead');
        await op('longevity.bind',{routeId:'route.witness_covenant'});
        await op('longevity.offer',{id:'entity.anchor',routeId:'route.witness_covenant',consent:false});assert.equal(people(life())['entity.anchor'].route.id,'');
        await op('bond.form',{firstId:hero,secondId:'entity.anchor',kind:'marriage',visibility:'public',consent:true});
        const bond=Object.values(life().bonds)[0].id;await op('bond.change',{id:bond,state:'separated',consent:false});await op('bond.change',{id:bond,state:'active',consent:true});
        await op('family.conceive',{parentId:hero,otherParentId:'entity.anchor',name:'Mara',consent:true});
        let pregnancy=Object.values(life().pregnancies)[0];await restore('before-birth');await wait(pregnancy.due);await restore('after-birth');
        const first=Object.values(life().pregnancies)[0].childId,birth=people(life())[first].identity.birthTick;
        await op('family.adopt',{parentId:'entity.clerk',otherParentId:'',childId:first,visibility:'secret',consent:true});
        await op('legacy.pledge',{ownerId:'entity.anchor',heirId:first,kind:'favor',sourceId:hero});
        const fact=Object.values(s.states.atri_lifecycle.history.facts).find(f=>f.key==='protagonist.identity');
        await act({minutes:0,history:{operation:'artifact.create',artifact_create:{kind:'heirloom',title:'Opening signet',content:'Family evidence',sourceId:fact.id,parentId:''}}});
        const artifact=Object.values(s.states.atri_lifecycle.history.artifacts)[0].id;
        await op('legacy.pledge',{ownerId:hero,heirId:first,kind:'artifact',sourceId:artifact});
        await wait(anniversary(0,9)-180*1440);await restore('before-death-and-succession');
        await op('protagonist.die',{sourceId:'entity.anchor'});assert.equal(lifetimeView(s,hero).status,'absent');await restore('after-death-before-return');
        const returnAt=life().continuity.returnAt;await wait(returnAt);await restore('after-return-and-succession');
        assert.equal(life().continuity.returns,1);assert(life().continuity.claimBurden>0&&life().continuity.scars>0);
        assert.equal(life().offices['office.registrar'].holderId,'entity.clerk');assert.equal(life().archive['entity.registrar'].status.kind,'retired');
        assert.equal(s.states.atri_lifecycle.history.artifacts[artifact].holderId,first);
        await wait(anniversary(birth,20));assert.equal(lifetimeView(s,first).stage,'adult');
        await op('family.conceive',{parentId:first,otherParentId:'',name:'Ilan',consent:true});pregnancy=Object.values(life().pregnancies).find(p=>p.status==='pending');
        await restore('before-second-generation');await wait(pregnancy.due);await restore('after-second-generation');
        const grandchild=Object.values(life().pregnancies).find(p=>p.parents.includes(first)).childId;
        await op('person.enter',{name:'Nora Flint',birthTick:anniversary(clock(),-25),cause:'recruitment',sourceId:'office.registrar',institutionId:'civil_verifier'});
        const entered=Object.values(life().people).find(p=>p.identity.name==='Nora Flint');assert(entered.identity.birthTick<entered.identity.introducedTick);
        await op('person.promote',{id:entered.id,sourceId:hero});await op('person.promote',{id:entered.id,sourceId:'office.registrar'});assert.equal(life().people[entered.id].tier,'A');
        await op('person.exit',{id:entered.id,reason:'missing',sourceId:hero});await op('person.return',{id:entered.id,sourceId:hero});
        await op('person.career',{id:entered.id,occupation:'Archive keeper',institutionId:'civil_verifier',sourceId:'office.registrar'});
        await op('person.health',{id:entered.id,impairment:'Old hand injury',sourceId:hero});
        await wait(anniversary(0,65));assert.equal(life().bonds[bond].state,'widowed');
        assert(Object.values(life().legacies).some(l=>l.ownerId==='entity.anchor'&&l.status==='inherited'));
        await op('bond.form',{firstId:hero,secondId:entered.id,kind:'partnership',visibility:'secret',consent:true});
        await restore('after-widowhood-and-new-partnership');
        await wait(anniversary(0,90));assert.equal(life().archive[first].status.kind,'dead');assert(people(life())[grandchild]);
        assert.equal(lifetimeView(s,hero).chronologicalAge,118);assert(lifetimeView(s,hero).apparentAge<50);assert.equal(lifetimeView(s,hero).publicIdentityAge,90);
        const kin=Object.values(life().kinship).find(k=>k.childId===first&&k.kind==='biological');
        assert(queryHistory(s,{facet:'family',value:first}).items.some(i=>i.value?.id===kin.id));
        assert(Object.values(life().terms).length>=4);assert(life().work.events<100);await restore('ninety-year-history');
        await act({minutes:1});
        const stable=structuredClone(s);
        await assert.rejects(svc.core.prepareAuthorityTurn(handle,s,{transactionId:'opening.wait',input:{minutes:0,lifetime:{operation:'person.return',person_return:{id:first,sourceId:hero}}}}));
        assert.deepEqual(await svc.core.load(handle,s.session.sessionId),stable,'invalid dead return is atomic');
        return {phase:'Phase 3 — Human Lifetime / Family / Institution Lifecycle',committedTransitions:serial,years:90,people:Object.keys(people(life())).length,kinshipEdges:Object.keys(life().kinship).length,officeTerms:Object.keys(life().terms).length,restores,intervalWork:life().work,
            continuity:life().continuity,historyFacts:Object.keys(s.states.atri_lifecycle.history.facts).length,maximumWork:{readGrants:Math.max(...work.map(w=>w.readGrants)),appCommands:Math.max(...work.map(w=>w.appCommands)),effects:Math.max(...work.map(w=>w.effects))},gate:'Phase 3 deterministic lifetime evidence, not Gate A/B/C or final Century Retrieval'};
    }finally{if(owned)await owned.cleanup();}
}
