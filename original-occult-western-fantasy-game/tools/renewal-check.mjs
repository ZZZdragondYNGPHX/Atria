import assert from 'node:assert/strict';
import { renewalProfile } from './renewal-profile.mjs';
export async function renewalChecks(h){
    const started = performance.now();
    const regional = process.argv.includes('--regional-only');
    const profile = renewalProfile({ regional, full: process.argv.includes('--regional-full'), override: process.env.ATRIA_RENEWAL_TURNS });
    const { turns, years, fast } = profile;
    const {anniversary,lifetimeView,people}=await h.load('public/shared/native-lifetime-runtime.js');
    const {validateLifetimes}=await h.load('src/native/lifetime-authority.js');
    const {validateHistory}=await h.load('src/native/history-authority.js');
    const {semanticDistance}=await h.load('public/shared/native-renewal-contract.js');
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
    const {regionalCommand}=await h.load('public/shared/native-regional-contract.js');
    const op=(operation,input)=>{const c=enterpriseCommand(operation,input);return act({minutes:0,lifetime:{operation:c.operation,[c.operation.replaceAll('.','_')]:c.input}});};
    const region=(verb,input)=>{const c=regionalCommand(verb,input);return op(c.operation,c.input);};
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
    const r=()=>life().renewal,history=()=>s.states.atri_lifecycle.history;
    const {renewalView}=await h.load('public/shared/native-renewal-runtime.js');
    const structures=[],samples=[],reused=[];let maximumProjectionBytes=0;
    let meaningful=0;
    const turn=async(operation,input)=>{
        const before=JSON.stringify({active:r().active,places:r().places,canonical:r().canonical});
        const target=Math.floor((meaningful+1)*anniversary(0,years)/turns);
        await act({minutes:Math.max(0,target-clock()),lifetime:{operation,[operation.replaceAll('.','_')]:input}});
        assert.notEqual(JSON.stringify({active:r().active,places:r().places,canonical:r().canonical}),before,'not a prose/no-op/sequence-only turn');meaningful++;
    };
    try {
        await op('longevity.bind',{routeId:'route.witness_covenant'});
        await op('family.conceive',{parentId:hero,otherParentId:'entity.anchor',name:'Mara',consent:true});
        const fact=Object.values(history().facts).find(f=>f.key==='protagonist.identity');
        await act({minutes:0,history:{operation:'artifact.create',artifact_create:{kind:'letter',title:'Opening family testimony',content:'An attributed opening record, not proof of all assertions.',sourceId:fact.id,parentId:''}}});
        const artifact=Object.values(history().artifacts)[0].id;
        await act({minutes:0,history:{operation:'memory.mark',memory_mark:{id:artifact,marked:true,journaled:true}}});
        let pendingHook='',secondGeneration=false,organization='';
        const organizations={},regionalTrips=[],regionalEras=new Set(); let assetId='',departed=false,returned=false,coast=false;
        const travel=async id=>{const from=life().regional.currentRegionId;await region('travel',{regionId:id,mode:'coach'});await restore('departure-'+id);await wait(life().regional.journey.arrives);await restore('arrival-'+id);regionalTrips.push({from,to:id,tick:clock()});};
        if(regional){
            await op('matter.open',{grammarId:'document_fraud',hookId:''});const m=Object.values(r().active)[0];
            for(const action of m.path)await op('matter.act',{id:m.id,action,presentation:''});await op('matter.act',{id:m.id,action:'record',presentation:''});
            await op('career.take',{roleId:'merchant',institutionId:'',sourceId:m.id});await op('asset.acquire',{placeId:'river_foundry',sourceId:m.id});assetId=Object.keys(life().enterprise.assets)[0];
            await op('asset.manage',{id:assetId,action:'capitalize',amount:300,otherId:'',sourceId:m.id});
            await op('delegate.create',{domain:'business',targetId:assetId,agentId:'entity.clerk',officeId:'',institutionId:'',objective:'Maintain the original foundry during prolonged regional absence.',maxSpend:200,risk:0,prohibited:{debt:true,occult:true,church:true,force:true},lossThreshold:200,reportYears:5,escalateOccult:true});
        }
        let familySource='';
        while(meaningful<turns){
            const first=Object.values(life().kinship).find(k=>k.parents.includes(hero))?.childId;
            if(first && !secondGeneration && lifetimeView(s,first).chronologicalAge>=20){
                await op('family.conceive',{parentId:first,otherParentId:'',name:'Ilan',consent:true});secondGeneration=true;
            }
            const active=Object.values(r().active)[0];
            if(!active){
                if(regional){
                    for(const x of Object.values(life().regional.regions))regionalEras.add(x.eraId);
                    if(!departed && clock()>=anniversary(0,10)){await travel('northreach');departed=true;await region('fidelity',{regionId:'eastbank',tier:'active'});}
                    if(departed && !returned && clock()>=anniversary(0,40)){await travel('eastbank');returned=true;assert(life().regional.regions.eastbank.reviews>=8);assert.equal(life().enterprise.assets[assetId].ownerId,hero);}
                    if(returned && !coast && clock()>=anniversary(0,45)){await travel('salt_coast');coast=true;}
                    organization=organizations[life().regional.currentRegionId]??'';
                }
                if(r().completed && r().completed%(profile.hookEvery ?? (clock()>=anniversary(0,25)?20:100))===0){
                    const cause=Object.values(r().canonical).filter(m=>m.outcome).at(-1);
                    assert(cause,'world renewal has a resolved canonical cause');
                    const sourceId=cause.id;
                    if(r().completed%profile.worldEvery===0){
                    const district=regional?Object.values(r().places).find(p=>p.kind==='district'&&p.regionId===life().regional.currentRegionId).id:'eastbank';
                    await op('world.change',{id:district,operation:'expand',otherId:'',sourceId,name:''});
                    if(!organization){await op('world.change',{id:'',operation:'found',otherId:'',sourceId,name:'Civic Witness Association'});organization=r().last.id;}
                    else if(life().institutions[organization].status!=='dissolved'){await op('world.change',{id:organization,operation:'split',otherId:'',sourceId,name:'Successor Witness Circle'});organization=life().institutions[organization].successors[0];}
                    if(regional)organizations[life().regional.currentRegionId]=organization;
                    }
                    const caseFact=Object.values(history().facts).find(f=>f.value?.id===cause.id&&f.key.startsWith('renewal.'));
                    await act({minutes:0,history:{operation:'artifact.create',artifact_create:{kind:'case_file',title:'Record of a settled local matter',content:'An attributed case disposition survives for later verification.',sourceId:caseFact.id,parentId:''}}});
                    familySource=(fast ? r().completed>=12 : r().completed===800)?artifact:Object.values(history().artifacts).at(-1).id;
                    await act({minutes:0,history:{operation:'hook.create',hook_create:{title:'Re-examine the earlier disposition',sourceId:familySource}}});
                    pendingHook=Object.values(history().hooks).at(-1).id;
                    await wait(clock()+91*1440);
                }
                await turn('matter.open',{grammarId:pendingHook?'cold_case':'',hookId:pendingHook});
                const m=Object.values(r().active)[0];maximumProjectionBytes=Math.max(maximumProjectionBytes,Buffer.byteLength(JSON.stringify(renewalView(s))));structures.push({completed:r().completed,structure:m.structure,tick:m.opened,familyId:m.familyId,institutionId:m.institutionId});
                if(pendingHook){assert.equal(m.sourceId,familySource);assert.equal(m.artifactId,familySource);reused.push({id:m.id,hookId:m.hookId,sourceId:m.sourceId,tick:m.opened});pendingHook='';}
            }else{
                const action=active.path[active.stage] ?? (r().completed%50===0?'record':'settle');
                await turn('matter.act',{id:active.id,action,presentation:''});
            }
            maximumProjectionBytes=Math.max(maximumProjectionBytes,Buffer.byteLength(JSON.stringify(renewalView(s))));
            if(meaningful%100===0)console.log('renewal progress',meaningful);
            if(meaningful%profile.checkpointEvery===0 || meaningful===turns){
                await restore('renewal-'+meaningful);
                samples.push({turns:meaningful,tick:clock(),activeBytes:Buffer.byteLength(JSON.stringify(s.states)),historyBytes:Buffer.byteLength(JSON.stringify(history())),maximumProjectionBytes,completed:r().completed});
                console.log('renewal checkpoint',JSON.stringify({...samples.at(-1),portableSave:restores.at(-1)}));
            }
        }
        assert(clock()>=anniversary(0,years));assert.equal(meaningful,turns);
        for(let i=0;i<structures.length;i++)for(let j=Math.max(0,i-64);j<i;j++){
            const distance=semanticDistance(structures[i].structure,structures[j].structure);
            assert(distance>0);if(structures[i].tick-structures[j].tick<90*1440)assert(distance>=3);
        }
        const summarize=items=>({matters:items.length,semanticStructures:new Set(items.map(x=>JSON.stringify(x.structure))).size,familyBound:items.filter(x=>x.familyId).length,institutions:new Set(items.map(x=>x.institutionId)).size,paths:items.reduce((out,x)=>(out[x.structure.path]=(out[x.structure.path]??0)+1,out),{})});
        const semanticAudit={early:summarize(structures.filter(x=>x.tick<anniversary(0,25))),late:summarize(structures.filter(x=>x.tick>=anniversary(0,25)))};
        if(turns>=5000){assert(reused.length>=5);assert(structures.filter(x=>x.tick>=anniversary(0,40)).length>100);}
        if(turns>=5000 || fast)assert(Object.values(life().kinship).length>=2);
        if(fast){
            assert(reused.length>=3,'focused run exercises repeated historical hooks');
            assert(reused.some(x=>x.sourceId===artifact && x.tick>=anniversary(0,25)),'opening evidence is reused decades later');
            assert(semanticAudit.early.matters>=3 && semanticAudit.late.matters>=3,'semantic audit spans early and late eras');
            assert.equal(samples.length,4,'four measured content checkpoints');
            assert.equal(restores.length,10,'three journeys and four content checkpoints use actual imports');
            assert(Object.values(life().institutions).some(x=>x.predecessors?.length),'institution succession retains lineage');
        }
        assert(queryHistory(s,{facet:'artifact',value:artifact}).items.length>0);assert(history().memory[artifact].marked);
        assert(Object.values(history().hooks).filter(x=>x.status==='resolved').length>=reused.length-1);
        if(regional){assert(departed&&returned&&coast);assert(regionalEras.size>=3);assert(regionalTrips.find(t=>t.to==='eastbank').tick-regionalTrips[0].tick>=anniversary(0,29));assert(Object.values(life().enterprise.contracts)[0].reviews>0);}
        return {phase:regional?(fast?'Phase 6 focused regional acceptance':turns>=5000?'Phase 6 multi-region 5k/50-year optional soak':'Phase 6 regional smoke (not a gate)'):turns>=5000?'Phase 4 Gate B candidate':'Phase 4 renewal smoke (not a gate)',...(regional?{regionalTrips,eras:[...regionalEras],regionalEvents:Object.keys(life().regional.events).length,remoteAssetId:assetId,remoteReviews:Object.values(life().enterprise.contracts)[0].reviews,maximumWork:Object.fromEntries(['readGrants','appCommands','effects','lifetimeEvents'].map(k=>[k,Math.max(0,...work.map(w=>w[k]??0))]))}:{} ),profile:profile.profile,elapsedMs:Math.round(performance.now()-started),meaningfulContentTurns:meaningful,years,kinshipEdges:Object.keys(life().kinship).length,institutions:Object.keys(life().institutions).length,completed:r().completed,structures:structures.length,semanticStructures:new Set(structures.map(x=>JSON.stringify(x.structure))).size,familyBoundMatters:structures.filter(x=>x.familyId).length,semanticAudit,reused,restores,samples,
            caveat:'Focused regional acceptance is not Gate B, high-turn growth proof or Gate C. Content turns exclude setup, compaction and prose. Snapshot sizes exclude accumulated explicit backup containers.'};
    }finally{if(owned)await owned.cleanup();}
}
