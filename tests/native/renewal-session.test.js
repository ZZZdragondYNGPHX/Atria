import { renewalPolicy } from './helpers/renewal-policy.js';
import { lifetimePolicyFixture } from './helpers/lifetime-policy.js';
import { describe, test, expect } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { closed } from './helpers/authority-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';

function fixture() {
    const f = authorityCandidateFixture();
    const schema = closed({ sequence: { type: 'integer', minimum: 0, maximum: 10000 }, calendar: closed({ year: { type: 'integer', minimum: 1, maximum: 1000 } }), era_id: { type: 'string', maxLength: 64 } });
    const initial = { sequence: 0, calendar: { year: 1 }, era_id: 'opening' };
    f.contract.lifecycleRuntime.domains.push({ id: 'chronology', scopeId: 'session', schemaVersion: 1, recordSchema: schema, initial,
        commands: [{ id: 'start', argsSchema: closed({}), event: 'chronology.start', assign: initial },
            { id: 'order', argsSchema: closed({}), event: 'chronology.order', assign: { sequence: { formula: 'world.sequence + 1' } } }],
        retention: { maxItems: 1, maxLogicalBytes: 65536, keepPinned: true, keepReferenced: true } });
    f.contract.lifecycleRuntime.automations.push({ id: 'chronology.start', scopeId: 'session', trigger: { kind: 'experience.ready' }, maxCatchUp: 1,
        action: { kind: 'app.command', domainId: 'chronology', commandId: 'start', recordId: 'main', args: {} } });
    f.contract.lifecycleRuntime.automations.push({ id: 'notes.start', scopeId: 'session', trigger: { kind: 'experience.ready' }, maxCatchUp: 1, action: { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'Initial' } } });
    f.contract.lifecycleRuntime.history = { schemaVersion: 1, clockId: 'world', chronologyDomain: 'chronology', meaningfulDomains: ['notes'],
        sources: [{ id: 'note', domainId: 'notes', recordId: 'main', path: ['text'], public: true, refs: ['case:note'], label: 'Recorded note' }],
        hot: 4, warm: 4, cold: 4, maxDurable: 1024, maxBytes: 1048576, checkpointTurns: 16 };
    f.contract.taskRuntime = { schemaVersion: 1, slots: [], tasks: [], turn: { policy: 'authority-first', stages: [] } };
    f.logic.transactions[0].effects = [
        { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: { formula: 'args.text' } } },
        { kind: 'app.command', domainId: 'chronology', commandId: 'order', recordId: 'main', args: {} },
        { kind: 'clock.advance', commandId: 'advance', ticks: 1 },
    ];
    f.contract.lifecycleRuntime.lifetimes=lifetimePolicyFixture(f.base.manifest.actors[0].actorId);
    f.contract.lifecycleRuntime.lifetimes.renewal=structuredClone(renewalPolicy);
    f.contract.lifecycleRuntime.advances[0].maxTicks=10000000;
    const tx=f.logic.transactions[0];
    tx.inputSchema.properties.minutes={type:'integer',minimum:0,maximum:10000000};tx.inputSchema.required.push('minutes');
    tx.inputSchema.properties.op={type:'string',maxLength:16,enum:['wait','conceive','die','open','act','compact','found','split','merge','dissolve']};tx.inputSchema.required.push('op');
    tx.effects[0].when='args.op != "compact"';
    tx.history=[{operation:'compact',when:'args.op == "compact"',input:{}}];
    tx.effects.at(-1).ticks={formula:'args.minutes'};tx.effects.at(-1).when='args.minutes > 0';
    tx.lifetimes=[{operation:'family.conceive',when:'args.op == "conceive"',input:{parentId:f.base.manifest.actors[0].actorId,otherParentId:'partner',name:'Child',consent:true}},
        {operation:'protagonist.die',when:'args.op == "die"',input:{sourceId:'partner'}}];
    tx.inputSchema.properties.otherId={type:'string',maxLength:128};tx.inputSchema.required.push('otherId');
    tx.inputSchema.properties.action={type:'string',maxLength:32};tx.inputSchema.required.push('action');
    tx.lifetimes.push({operation:'matter.open',when:'args.op == "open"',input:{grammarId:'document_fraud',hookId:''}},
        {operation:'matter.act',when:'args.op == "act"',input:{id:{formula:'args.text'},action:{formula:'args.action'},presentation:''}});
    tx.lifetimes.push({operation:'world.change',when:'args.op == "found" || args.op == "split" || args.op == "merge" || args.op == "dissolve"',input:{id:{formula:'args.action'},operation:{formula:'args.op'},otherId:{formula:'args.otherId'},sourceId:{formula:'args.text'},name:'Renewal Council'}});
    f.sync();
    return { f, ...buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() }) };
}


const envelope={schemaVersion:1,narrative:'The approved evidence transition is recorded.',outcomes:[],diagnostics:[]};
describe.each(CONTRACT_HARNESSES)('Native renewal publication - $name',({make})=>{
    test('actual content across checkpoint/import, institutional transitions, old saves and Retry',async()=>{
        const source=await make(),targets=[];try{
            const {f,archive}=fixture(),a=services(source);await a.packageInstaller.install(source.handle,archive);
            let s=await a.core.create(source.handle,{packageId:f.base.session.packageId,packageVersionId:f.base.session.packageVersionId,entryPointId:f.base.session.entryPointId});
            s=await a.core.applyLifecycleCommand(source.handle,s.session.sessionId,{type:'lifecycle',invocationId:'ready',action:{kind:'experience.ready'}},{expectedRevisionId:s.revision.revisionId});
            let seq=0,svc=a,handle=source.handle;
            const state=()=>s.states.atri_lifecycle.lifetimes.renewal;
            const act=async(op,text='',action='',otherId='')=>{
                s=await svc.core.appendTimeline(handle,s.session.sessionId,{role:'user',content:'Renewable evidence transition'});
                const p=await svc.core.prepareAuthorityTurn(handle,s,{transactionId:'note.update',input:{target:'main',text,amount:1,op,minutes:op==='compact'?0:1440,action,otherId}});
                s=await svc.core.finalizeTurn(handle,s.session.sessionId,{invocationId:'renew-'+ ++seq,authorityProof:p.proof,envelope},{expectedRevisionId:s.revision.revisionId});
            };
            const restore=async()=>{
                const oldPoint=await svc.saveSystem.manualSave(handle,s.session.sessionId);
                const before=structuredClone(s.states.atri_lifecycle),oldExport=await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,oldPoint.saveId);
                expect(oldExport.save.closure.revisions.length).toBeGreaterThan(1);
                await act('compact');
                expect(s.states.atri_lifecycle.history.turns).toBe(before.history.turns);
                const {work:beforeWork,...beforeLife}=before.lifetimes,{work:afterWork,...afterLife}=s.states.atri_lifecycle.lifetimes;
                expect(afterLife).toEqual(beforeLife);
                for(const key of ['facts','heads','anchors','artifacts','hooks','memory'])expect(s.states.atri_lifecycle.history[key]).toEqual(before.history[key]);
                const stillRetained=await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,oldPoint.saveId);
                expect(stillRetained.save.closure).toEqual(oldExport.save.closure);
                await expect(svc.core.retryReply(handle,s.session.sessionId,{messageId:s.timeline.at(-1).messageId,expectedRevisionId:s.revision.revisionId})).rejects.toThrow('archived');
                const save=await svc.saveSystem.manualSave(handle,s.session.sessionId),out=await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,save.saveId);
                expect(out.save.closure.revisions).toHaveLength(1);
                const target=await make();targets.push(target);const next=services(target);await next.packageInstaller.install(target.handle,archive);const restored=await next.saveSystem.importSave(target.handle,out.archive);
                expect(restored.states).toEqual(s.states);expect(restored.timeline).toEqual(s.timeline);s=restored;svc=next;handle=target.handle;
            };
            for(let i=0;i<4;i++){
                await act('open');const m=Object.values(state().active)[0];if(i===0)await restore();
                for(const action of m.path)await act('act',m.id,action);
                await act('act',m.id,i===0?'record':'settle');
            }
            expect(state().completed).toBe(4);expect(Object.keys(state().canonical)).toHaveLength(1);await restore();
            const cause=Object.keys(state().canonical)[0];
            await act('found',cause);const institution=state().last.id;await restore();
            await act('split',cause,institution);const successors=s.states.atri_lifecycle.lifetimes.institutions[institution].successors;await restore();
            await act('merge',cause,successors[0],successors[1]);const merged=s.states.atri_lifecycle.lifetimes.institutions[successors[0]].successors[0];await restore();
            await act('dissolve',cause,merged);await restore();
            expect(Object.values(s.states.atri_lifecycle.lifetimes.offices).filter(o=>o.institutionId===merged).every(o=>!o.holderId&&o.closed!==undefined)).toBe(true);
            const stable=structuredClone(s);await expect(svc.core.prepareAuthorityTurn(handle,s,{transactionId:'note.update',input:{target:'main',text:'renewal.missing',amount:1,op:'act',minutes:0,action:'record',otherId:''}})).rejects.toThrow();
            expect(await svc.core.load(handle,s.session.sessionId)).toEqual(stable);
            await act('open');const id=Object.keys(state().active)[0];
            const retried=await svc.core.retryReply(handle,s.session.sessionId,{messageId:s.timeline.at(-1).messageId,expectedRevisionId:s.revision.revisionId});
            expect(retried.states.atri_lifecycle.lifetimes.renewal.active[id]).toBeUndefined();
        }finally{await source.cleanup();for(const target of targets)await target.cleanup();}
    },120000);
});
