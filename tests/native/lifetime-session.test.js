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
    f.contract.lifecycleRuntime.advances[0].maxTicks=10000000;
    const tx=f.logic.transactions[0];
    tx.inputSchema.properties.minutes={type:'integer',minimum:0,maximum:10000000};tx.inputSchema.required.push('minutes');
    tx.inputSchema.properties.op={type:'string',maxLength:16,enum:['wait','conceive','die']};tx.inputSchema.required.push('op');
    tx.effects.at(-1).ticks={formula:'args.minutes'};tx.effects.at(-1).when='args.minutes > 0';
    tx.lifetimes=[{operation:'family.conceive',when:'args.op == "conceive"',input:{parentId:f.base.manifest.actors[0].actorId,otherParentId:'partner',name:'Child',consent:true}},
        {operation:'protagonist.die',when:'args.op == "die"',input:{sourceId:'partner'}}];
    f.sync();
    return { f, ...buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() }) };
}

const envelope={schemaVersion:1,narrative:'The lifetime transition is recorded.',outcomes:[],diagnostics:[]};
describe.each(CONTRACT_HARNESSES)('Native lifetime publication and restore - $name',({make})=>{
    test('real authority birth, death, return, checkpoint, imports and Retry',async()=>{
        const source=await make(),targets=[];try{
            const {f,archive}=fixture(),a=services(source);await a.packageInstaller.install(source.handle,archive);
            let s=await a.core.create(source.handle,{packageId:f.base.session.packageId,packageVersionId:f.base.session.packageVersionId,entryPointId:f.base.session.entryPointId});
            s=await a.core.applyLifecycleCommand(source.handle,s.session.sessionId,{type:'lifecycle',invocationId:'ready',action:{kind:'experience.ready'}},{expectedRevisionId:s.revision.revisionId});
            let seq=0,svc=a,handle=source.handle;
            const act=async(op,minutes=0)=>{
                s=await svc.core.appendTimeline(handle,s.session.sessionId,{role:'user',content:'Lifetime transition'});
                const p=await svc.core.prepareAuthorityTurn(handle,s,{transactionId:'note.update',input:{target:'main',text:'Transition '+ ++seq,amount:1,op,minutes}});
                s=await svc.core.finalizeTurn(handle,s.session.sessionId,{invocationId:'life-'+seq,authorityProof:p.proof,envelope},{expectedRevisionId:s.revision.revisionId});
            };
            const restore=async()=>{
                const save=await svc.saveSystem.manualSave(handle,s.session.sessionId),out=await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,save.saveId);
                const target=await make();targets.push(target);const next=services(target),nextHandle=target.handle;await next.packageInstaller.install(nextHandle,archive);const restored=await next.saveSystem.importSave(nextHandle,out.archive);
                expect(restored.states).toEqual(s.states);expect(restored.timeline).toEqual(s.timeline);s=restored;svc=next;handle=nextHandle;
            };
            await act('conceive');await restore();await act('wait',403200);await restore();
            expect(Object.values(s.states.atri_lifecycle.lifetimes.kinship)).toHaveLength(1);
            await act('die');await restore();const death=s.states.atri_lifecycle.lifetimes.continuity;
            expect(death.scars).toBe(1);await act('wait',525600);expect(s.states.atri_lifecycle.lifetimes.continuity.returns).toBe(1);await restore();
            while(seq<16)await act('wait',1);expect(s.timeline).toHaveLength(1);await restore();
            await act('wait',1);const retried=await svc.core.retryReply(handle,s.session.sessionId,{messageId:s.timeline.at(-1).messageId,expectedRevisionId:s.revision.revisionId});
            expect(retried.states.atri_lifecycle.lifetimes.continuity).toEqual(s.states.atri_lifecycle.lifetimes.continuity);
            expect(retried.states.atri_lifecycle.clocks.world).toBe(s.states.atri_lifecycle.clocks.world-1);
        }finally{await source.cleanup();for(const target of targets)await target.cleanup();}
    },120000);
});
