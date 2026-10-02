import assert from 'node:assert/strict';
export async function enterpriseChecks(h){
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
    const {enterpriseCommand}=await h.load('public/shared/native-enterprise-contract.js');
    const op=(operation,input)=>{const c=enterpriseCommand(operation,input);return act({minutes:0,lifetime:{operation:c.operation,[c.operation.replaceAll('.','_')]:c.input}});};
    const wait=until=>act({minutes:until-clock()});
    const restore=async label=>{
        // Measure/export a portable checkpoint, not the retained pre-checkpoint
        // revision window. This is the existing Phase 2 Authority operation.
        const before=structuredClone(s.states.atri_lifecycle);
        await act({minutes:0,history:{operation:'compact',compact:{}}});
        const after=s.states.atri_lifecycle;
        assert.equal(after.history.turns,before.history.turns,'compaction is not a content turn');
        assert.equal(after.history.checkpoint,after.history.transactions);
        assert.deepEqual(after.clocks,before.clocks,'compaction does not advance time');
        const {work:beforeWork,...beforeLife}=before.lifetimes,{work:afterWork,...afterLife}=after.lifetimes;
        assert.deepEqual(afterLife,beforeLife,'compaction preserves all people, matters and geography; work telemetry is recomputed');
        for(const key of ['facts','heads','anchors','artifacts','hooks','memory'])assert.deepEqual(after.history[key],before.history[key],'compaction preserves durable '+key);
        const point=await svc.saveSystem.manualSave(handle,s.session.sessionId),exported=await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,point.saveId);
        assert.equal(exported.save.closure.revisions.length,1,'single-branch checkpoint export must not retain the raw revision window');
        const target=await(restores.length%2?h.makeTempFsEngine():makeTempSqliteEngineHarness()),next=h.services(target);
        await next.packageInstaller.install(target.handle,h.archive,{grantedPermissions:['generation']});const r=await next.saveSystem.importSave(target.handle,exported.archive);
        assert.deepEqual(r.states,s.states,label+' all authoritative state');assert.deepEqual(r.timeline,s.timeline);assert.equal(r.session.sessionId,s.session.sessionId);
        if(owned)await owned.cleanup();owned=target;svc=next;handle=target.handle;s=r;restores.push({label,bytes:exported.archive.length,saveJsonBytes:Buffer.byteLength(JSON.stringify(exported.save)),revisions:exported.save.closure.revisions.length});
    };

    const e=()=>life().enterprise, r=()=>life().renewal, history=()=>s.states.atri_lifecycle.history;
    const {enterpriseView}=await h.load('public/shared/native-enterprise-runtime.js');
    const caseFile=async()=>{await op('matter.open',{grammarId:'document_fraud',hookId:''});const m=Object.values(r().active)[0];for(const action of m.path)await op('matter.act',{id:m.id,action,presentation:''});await op('matter.act',{id:m.id,action:'record',presentation:''});return m.id;};
    let artifactId,sourceId,assetId,contractId,institutionId,originalIdentity,childId,root;
    const metrics=[];
    try {
        await op('longevity.bind',{routeId:'route.witness_covenant'});
        await op('family.conceive',{parentId:hero,otherParentId:'entity.anchor',name:'Mara',consent:true});
        sourceId=await caseFile();
        const fact=Object.values(history().facts).find(f=>f.public&&f.value?.id===sourceId&&f.value?.closed!==undefined);assert(fact);
        await act({minutes:0,history:{operation:'artifact.create',artifact_create:{kind:'contract',title:'Foundry title evidence',content:'The original resolved claim establishes the title acquisition source.',sourceId:fact.id,parentId:''}}});
        artifactId=Object.keys(history().artifacts).at(-1);
        await act({minutes:0,history:{operation:'memory.mark',memory_mark:{id:artifactId,marked:true,journaled:true}}});
        await op('progress.learn',{domain:'commerce',sourceId});
        await op('career.take',{roleId:'merchant',institutionId:'',sourceId});
        await op('asset.acquire',{placeId:'river_foundry',sourceId});assetId=Object.keys(e().assets)[0];
        await op('asset.manage',{id:assetId,action:'capitalize',amount:300,otherId:'',sourceId});await restore('property acquisition');
        const delegation={domain:'business',targetId:assetId,agentId:'entity.clerk',officeId:'',institutionId:'',objective:'Maintain safe premises and grow conservatively without occult or church contracts.',maxSpend:100,risk:0,prohibited:{debt:true,occult:true,church:true,force:true},lossThreshold:100,reportYears:5,escalateOccult:true};
        await op('delegate.create',delegation);contractId=Object.keys(e().contracts)[0];const start=clock();
        await wait(anniversary(start,20));assert.equal(e().contracts[contractId].reviews,4);assert.equal(e().contracts[contractId].status,'active');
        assert(Object.values(e().movements).some(x=>x.kind==='earned_trade'));assert(life().work.events<32);
        await restore('twenty-year delegated operation');metrics.push({years:20,activeBytes:Buffer.byteLength(JSON.stringify(s.states)),projectionBytes:Buffer.byteLength(JSON.stringify(enterpriseView(s)))});
        childId=Object.values(life().kinship).find(x=>x.parents.includes(hero)).childId;
        originalIdentity=life().continuity.publicIdentityId;
        await op('identity.change',{mode:'replace',name:'A later civil identity',method:'legitimate',sourceId});
        assert.equal(e().assets[assetId].status,'stranded');assert.equal(e().contracts[contractId].status,'escalated');assert.equal(e().identities[originalIdentity].status,'retired');
        await restore('public identity transition');
        const before=structuredClone(s),cmd=enterpriseCommand('asset.manage',{id:assetId,action:'withdraw',amount:1,otherId:'',sourceId});
        await assert.rejects(()=>svc.core.prepareAuthorityTurn(handle,s,{transactionId:'opening.wait',input:{minutes:0,lifetime:{operation:cmd.operation,[cmd.operation.replaceAll('.','_')]:cmd.input}}}));assert.deepEqual(await svc.core.load(handle,s.session.sessionId),before);
        await op('asset.manage',{id:'treasury',action:'regularize',amount:0,otherId:'',sourceId});await op('asset.manage',{id:assetId,action:'regularize',amount:0,otherId:'',sourceId});
        await op('career.take',{roleId:'merchant',institutionId:'',sourceId});await op('delegate.review',{id:contractId,action:'revoke'});await restore('bank and property regularization');
        await op('world.change',{id:'',operation:'found',otherId:'',sourceId,name:'Eastbank Civic Trust'});institutionId=r().last.id;
        await op('career.take',{roleId:'administrator',institutionId,sourceId});await op('organization.charter',{institutionId,agenda:'service',sourceId});
        root=e().nodes[e().organizations[institutionId].rootId];const leader=life().offices[root.officeId].holderId;
        const interest=e().agents[leader].interest,agenda=interest==='service'?'profit':'service';await op('organization.policy',{institutionId,agenda});
        await op('organization.department',{institutionId,parentId:root.id,leaderId:'entity.anchor',name:'Property operations',workforce:400});
        assert.equal(enterpriseView(s).organizations.find(x=>x.id===institutionId).workforce,401);
        await op('delegate.create',{...delegation,agentId:'',officeId:root.officeId,institutionId});
        await wait(anniversary(clock(),15));assert.equal(e().organizations[institutionId].agenda,interest);assert(e().organizations[institutionId].autonomy>=2);
        await op('organization.policy',{institutionId,agenda});assert.equal(e().organizations[institutionId].agenda,interest);
        assert(Object.values(e().events).some(x=>x.kind==='founder_order_refused'));await restore('autonomous institutional resistance');
        await op('asset.manage',{id:assetId,action:'bequeath',otherId:childId,amount:0,sourceId});await op('protagonist.die',{sourceId:'entity.anchor'});
        assert.equal(e().assets[assetId].ownerId,childId);await restore('inheritance during protagonist absence');
        await wait(life().continuity.returnAt);assert.equal(e().assets[assetId].ownerId,childId);await restore('reconstruction preserves inherited title');
        await wait(anniversary(start,50));await restore('fifty-year property and institutional history');
        assert.equal(e().assets[assetId].ownerId,childId);assert.equal(history().memory[artifactId].marked,true);
        const retrieved=queryHistory(s,{id:artifactId,limit:1});assert(JSON.stringify(retrieved).includes('Foundry title evidence'));
        metrics.push({years:50,activeBytes:Buffer.byteLength(JSON.stringify(s.states)),projectionBytes:Buffer.byteLength(JSON.stringify(enterpriseView(s)))});
        assert(metrics.every(x=>x.projectionBytes<12000));
        return {phase:'Phase 5 — focused progression/wealth/delegation/organization candidate',scope:'Not Gate A, B or C; no multi-region/Era/macro or final UI',years:50,transactions:serial,meaningfulTurns:history().turns,delegatedYears:20,routineReports:4,restores,metrics,identity:{initial:originalIdentity,current:life().continuity.publicIdentityId},asset:{id:assetId,owner:e().assets[assetId].ownerId,titleEventId:e().assets[assetId].titleEventId},organization:{id:institutionId,agenda:e().organizations[institutionId].agenda,autonomy:e().organizations[institutionId].autonomy},markedArtifact:artifactId,maximumWork:Object.fromEntries(['readGrants','appCommands','effects','lifetimeEvents'].map(k=>[k,Math.max(0,...work.map(w=>w[k]??0))]))};
    } finally {if(owned)await owned.cleanup();}
}
