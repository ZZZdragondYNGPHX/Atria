import assert from 'node:assert/strict';

export async function typedSmoke({ load, h, svc, host, binding, session, setNarratorFailure }) {
    const { FrontendBridgeService } = await load('src/native/frontend/host-bridge.js');
    const bridge = new FrontendBridgeService();
    const services = {...svc, generationHost:host, taskBindings:async()=>({narrative:binding,structured:binding})};
    let base=await svc.core.create(h.handle,{packageId:session.session.packageId,packageVersionId:session.session.packageVersionId,entryPointId:session.session.entryPointId});
    base=await svc.core.applyLifecycleCommand(h.handle,base.session.sessionId,{type:'lifecycle',invocationId:'typed-ready',action:{kind:'experience.ready'}},{expectedRevisionId:base.revision.revisionId});
    const installed=await svc.core._openPackage(h.handle,base.session.packageId,base.session.packageVersionId,base.session.entryPointId);
    const logic=JSON.parse(installed.sourceFiles.get('runtime/logic.json'));
    const opened=await bridge.open(services,h.handle,base.session.sessionId);
    const original=svc.core.prepareAuthorityTurn;
    let captured, lastReceipt;
    const originalCommit=svc.core._sessions.commitSnapshot;
    let commits=0;
    svc.core._sessions.commitSnapshot=async function(...args){commits++;return originalCommit.apply(this,args);};
    svc.core.prepareAuthorityTurn=async function(handle,snapshot,selection,...rest){
        const result=await original.call(this,handle,snapshot,selection,...rest);
        const same=await original.call(this,handle,snapshot,structuredClone(selection),...rest);
        assert.deepEqual(result.prepared.receipt,same.prepared.receipt);
        captured=selection; lastReceipt=result.prepared.receipt;
        return result;
    };
    try {
        let count=0;
        for(const tx of logic.transactions.filter(t=>t.id.startsWith('interaction.')).sort((a,b)=>(a.verb==='interview'?-1:0)-(b.verb==='interview'?-1:0))){
            const input=Object.fromEntries(Object.entries(tx.inputSchema.properties).map(([k,s])=>[k,s.enum?.[0]??(s.type==='integer'?10:'Typed unverified hypothesis.')]));
            const request={epoch:opened.epoch,revision:base.revision.revisionId,componentId:'Main',bindingId:tx.verb,method:'action.invoke',input,idempotencyKey:'typed-'+tx.verb};
            const beforeCommits=commits;
            const beforeEvidence=structuredClone(base.states.atri_lifecycle.domains.evidence);
            let failedReceipt;
            if(count===0){
                setNarratorFailure(true);
                assert.equal((await bridge.request(services,h.handle,request)).ok,false);
                assert.equal(commits,beforeCommits);
                const unchanged=await svc.core.load(h.handle,base.session.sessionId);
                assert.deepEqual(unchanged.states,base.states);
                assert.deepEqual(unchanged.timeline,base.timeline);
                assert.equal(unchanged.revision.revisionId,base.revision.revisionId);
                failedReceipt=lastReceipt; assert(failedReceipt);
                setNarratorFailure(false);
            }
            const reply=await bridge.request(services,h.handle,request);
            assert.equal(reply.ok,true,JSON.stringify(reply));
            assert.equal(commits,beforeCommits+1);
            if(failedReceipt)assert.deepEqual(lastReceipt,failedReceipt);
            assert.deepEqual(captured,{transactionId:tx.id,input});
            base=await svc.core.load(h.handle,base.session.sessionId);
            assert.equal(base.states.atri_action_receipts.receipts.length,++count);
            assert.equal(base.states.atri_action_receipts.receipts.at(-1).actionId,tx.id);
            if(tx.verb.startsWith("create_"))assert.deepEqual(base.states.atri_lifecycle.domains.evidence,beforeEvidence);
            const revision=base.revision.revisionId;
            assert.equal((await bridge.request(services,h.handle,request)).ok,true);
            assert.equal((await svc.core.load(h.handle,base.session.sessionId)).revision.revisionId,revision);
            assert.equal(commits,beforeCommits+1);
            assert(!JSON.stringify(reply).includes('P1_PRIVATE_CANON_SENTINEL'));
        }
        const value=(id,record='fixture')=>base.states.atri_lifecycle.domains[id].records.find(r=>r.id===record)?.value;
        assert.equal(value('evidence').known,true);
        assert.equal(value('beliefs','theory').kind,'hypothesis');
        assert.equal(value('beliefs','theory').status,'suspected');
        assert.equal(value('player_matters','lead').status,'open');
        assert(value('memories').text.includes('asked'));
    } finally {svc.core.prepareAuthorityTurn=original;svc.core._sessions.commitSnapshot=originalCommit;setNarratorFailure(false);bridge.dispose();}
}
