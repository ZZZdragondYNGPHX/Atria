import assert from 'node:assert/strict';

export async function interactionCheck({ load, svc, h, session, sourceFiles }) {
    const logic = JSON.parse(sourceFiles.get('runtime/logic.json'));
    const { compileFormula, evaluateFormulaAst } = await load('public/scripts/native/experience/logic/formula.js');
    const evaluate = (formula, context) => evaluateFormulaAst(compileFormula(formula, {roots:['args','reads','resolution'], strings:true}), context);
    const transactions = logic.transactions.filter(t => t.id.startsWith('interaction.'));
    assert.equal(transactions.length, 9);
    const inputs = Object.fromEntries(transactions.map(t => [t.id, Object.fromEntries(Object.entries(t.inputSchema.properties).map(([key,s]) => [key, s.enum?.[0] ?? (s.type === 'integer' ? 10 : 'A deliberately unverified player interpretation.')]))]));
    const { resolverRequest } = await load('src/native/authority-turn.js');
    const request=resolverRequest(logic.transactions, {}, 'Synthetic declared action.');
    for (const tx of transactions) {
        const tool=request.tools.find(t=>t.function.parameters.properties.objective?.enum?.[0]===tx.inputSchema.properties.objective.enum[0]);
        assert.deepEqual(request.select({toolCalls:[{name:tool.function.name,args:inputs[tx.id]}]}),{transactionId:tx.id,input:inputs[tx.id]});
        const before = structuredClone(session);
        const selection = {transactionId:tx.id, input:inputs[tx.id]};
        const result = await svc.core.prepareAuthorityTurn(h.handle, session, selection);
        assert(result.prepared.receipt);
        assert.deepEqual(session, before);
        assert(!JSON.stringify(result.prepared.receipt).includes('P1_PRIVATE_CANON_SENTINEL'));
        assert.deepEqual((await svc.core.prepareAuthorityTurn(h.handle, session, selection)).prepared.receipt, result.prepared.receipt);
        await assert.rejects(svc.core.prepareAuthorityTurn(h.handle, session, {...selection,input:{...selection.input,target:'undeclared'}}));
        await assert.rejects(svc.core.prepareAuthorityTurn(h.handle, session, {...selection,input:{...selection.input,outcome:'clean'}}));
        if (tx.resolution.kind !== 'bounded_fortune') continue;
        for (const trained of [false,true]) for (const opposed of [false,true]) for (let position=1;position<=5;position++) for (const prepared of [0,1]) {
            const rows=[];
            for (let roll=1;roll<=3;roll++) {
                const context={args:selection.input,reads:{relationship:{trust:0},evidence:session.states.atri_lifecycle.domains.evidence.records[0].value,frame:{trained,permission:true,opposed,position,prepared}},resolution:{roll}};
                context.resolution.outcome=tx.resolution.cases.find(c=>evaluate(c.when,context))?.outcome ?? tx.resolution.fallback;
                const template=x=>x&&typeof x==='object'?(x.formula?evaluate(x.formula,context):Object.fromEntries(Object.entries(x).map(([k,v])=>[k,template(v)]))):x;
                rows.push({outcome:context.resolution.outcome,effects:tx.effects.filter(e=>!e.when||evaluate(e.when,context)).map(template),result:template(tx.receipt.projection)});
            }
            if (!trained || !opposed) {assert.deepEqual(rows[0],rows[1]);assert.deepEqual(rows[1],rows[2]);assert.equal(rows[0].outcome,trained?'automatic':'impossible');}
            else {const band=Math.max(1,position-prepared);const expected=[['costly','clean','clean'],['complicated','costly','clean'],['complicated','costly','clean'],['denied','complicated','costly'],['denied','denied','complicated']][band-1];assert.deepEqual(rows.map(r=>r.outcome),expected);}
        }
    }
    const { prepareAuthorityTransaction } = await load('src/native/authority-transaction.js');
    const installed=await svc.core._openPackage(h.handle,session.session.packageId,session.session.packageVersionId,session.session.entryPointId);
    for(const tx of transactions.filter(t=>t.resolution.kind==='bounded_fortune')) for(const automatic of [false,true]) {
        const base=structuredClone(session);
        Object.assign(base.states.atri_lifecycle.domains.entities.records[0].value,{trained:automatic,opposed:false});
        const before=structuredClone(base);
        let first;
        for(let ordinal=0;ordinal<8;ordinal++) {
            const p=await prepareAuthorityTransaction(base,installed,{transactionId:tx.id,input:inputs[tx.id],ordinal,
                anchor:{sessionId:base.session.sessionId,packageVersionId:base.session.packageVersionId,branchId:base.revision.branchId,revisionId:base.revision.revisionId},playerMessageId:base.timeline.at(-1).messageId});
            const semantic={domains:p.candidate.states.atri_lifecycle.domains,clocks:p.candidate.states.atri_lifecycle.clocks,result:p.receipt.result};
            if(first)assert.deepEqual(semantic,first);else first=semantic;
            assert.equal(p.receipt.result.outcome,automatic?'automatic':'impossible');
            assert(!JSON.stringify(p.receipt.result).includes('roll'));
            assert.deepEqual(base,before);
        }
    }
    for(const tx of transactions.filter(t=>t.resolution.kind==='bounded_fortune')) for(let position=1;position<=5;position++) for(let ordinal=0;ordinal<3;ordinal++) {
        const base=structuredClone(session);
        Object.assign(base.states.atri_lifecycle.domains.entities.records[0].value,{trained:true,permission:true,opposed:true,position,prepared:0});
        const p=await prepareAuthorityTransaction(base,installed,{transactionId:tx.id,input:inputs[tx.id],ordinal,
            anchor:{sessionId:base.session.sessionId,packageVersionId:base.session.packageVersionId,branchId:base.revision.branchId,revisionId:base.revision.revisionId},playerMessageId:base.timeline.at(-1).messageId});
        assert([['clean','costly'],['clean','costly','complicated'],['clean','costly','complicated'],['costly','complicated','denied'],['complicated','denied']][position-1].includes(p.receipt.result.outcome));
        assert(p.work.effects<=32 && p.work.appCommands<=24 && p.work.readGrants<=16);
    }
    assert.deepEqual((await svc.core.load(h.handle,session.session.sessionId)).states,session.states);
    return 'P2 nine real transaction preparations / same-anchor retry / closed inputs; 80 actual non-Uncertain + 75 Uncertain preparations across ordinals/bands; exhaustive 600 eligibility-risk-Fortune cases, non-Uncertain effects and safe-result invariance';
}
