import { enterprisePolicy } from './helpers/enterprise-policy.js';
import { LIFETIME_OPERATIONS } from '../../public/shared/native-lifetime-contract.js';
import { enterpriseCommand } from '../../public/shared/native-enterprise-contract.js';
import { anniversary } from '../../public/shared/native-lifetime-runtime.js';
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
        hot: 4, warm: 4, cold: 4, maxDurable: 4096, maxBytes: 2097152, checkpointTurns: 16 };
    f.contract.taskRuntime = { schemaVersion: 1, slots: [], tasks: [], turn: { policy: 'authority-first', stages: [] } };
    f.logic.transactions[0].effects = [
        { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: { formula: 'args.text' } } },
        { kind: 'app.command', domainId: 'chronology', commandId: 'order', recordId: 'main', args: {} },
        { kind: 'clock.advance', commandId: 'advance', ticks: 1 },
    ];
    f.contract.lifecycleRuntime.lifetimes = lifetimePolicyFixture(f.base.manifest.actors[0].actorId);
    f.contract.lifecycleRuntime.lifetimes.renewal = structuredClone(renewalPolicy);
    f.contract.lifecycleRuntime.lifetimes.enterprise = structuredClone(enterprisePolicy);
    f.contract.lifecycleRuntime.advances[0].maxTicks = Number.MAX_SAFE_INTEGER;
    const tx = f.logic.transactions[0];
    tx.inputSchema.properties.minutes = { type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER };tx.inputSchema.required.push('minutes');
    tx.inputSchema.properties.compact = { type:'boolean' };tx.inputSchema.required.push('compact');
    tx.effects[0].when = '!args.compact';
    tx.history = [{ operation:'compact',when:'args.compact',input:{} }];
    tx.effects.at(-1).ticks = { formula:'args.minutes' };tx.effects.at(-1).when = 'args.minutes > 0';
    const entries = Object.entries(LIFETIME_OPERATIONS);
    tx.inputSchema.properties.lifetime = { type:'object',properties:{ operation:{ type:'string',maxLength:32,enum:entries.map(([k])=>k) },...Object.fromEntries(entries.map(([k,v])=>[k.replaceAll('.','_'),v])) },required:['operation'],additionalProperties:false };
    const template = (schema,path)=>schema.type === 'object' ? Object.fromEntries(Object.entries(schema.properties).map(([k,v])=>[k,template(v,path + '.' + k)])) : { formula:path };
    tx.lifetimes = entries.map(([op,schema])=>({ operation:op,when:'args.lifetime.operation == ' + JSON.stringify(op),input:template(schema,'args.lifetime.' + op.replaceAll('.','_')) }));
    f.sync();
    return { f, ...buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() }) };
}

const envelope = { schemaVersion:1,narrative:'The approved enterprise transition is recorded.',outcomes:[],diagnostics:[] };
describe.each(CONTRACT_HARNESSES)('Native enterprise publication — $name', ({ make })=>{
    test('identity/property/organization restoration, old SavePoints, checkpoint and Retry',async()=>{
        const source = await make(),targets = [];
        try {
            const { f,archive } = fixture(); const a = services(source); await a.packageInstaller.install(source.handle,archive);
            let s = await a.core.create(source.handle,{ packageId:f.base.session.packageId,packageVersionId:f.base.session.packageVersionId,entryPointId:f.base.session.entryPointId });
            s = await a.core.applyLifecycleCommand(source.handle,s.session.sessionId,{ type:'lifecycle',invocationId:'ready',action:{ kind:'experience.ready' } },{ expectedRevisionId:s.revision.revisionId });
            let seq = 0,svc = a,handle = source.handle;
            const life = ()=>s.states.atri_lifecycle.lifetimes,e = ()=>life().enterprise;
            const request = (operation,input = {},minutes = 0)=>{const command = operation ? enterpriseCommand(operation,input) : null;return { transactionId:'note.update',input:{ target:'main',text:'Enterprise operation',amount:1,minutes,compact:operation === 'compact',...(command && operation !== 'compact' ? { lifetime:{ operation:command.operation,[command.operation.replaceAll('.','_')]:command.input } } : {}) } };};
            const act = async(operation,input = {},minutes = 0)=>{
                s = await svc.core.appendTimeline(handle,s.session.sessionId,{ role:'user',content:'Declared enterprise transition' });
                const p = await svc.core.prepareAuthorityTurn(handle,s,request(operation,input,minutes));
                s = await svc.core.finalizeTurn(handle,s.session.sessionId,{ invocationId:'enterprise-' + ++seq,authorityProof:p.proof,envelope },{ expectedRevisionId:s.revision.revisionId });
            };
            const restore = async()=>{
                const oldPoint = await svc.saveSystem.manualSave(handle,s.session.sessionId),oldExport = await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,oldPoint.saveId);
                const before = structuredClone(s.states.atri_lifecycle); await act('compact');
                expect(s.states.atri_lifecycle.history.turns).toBe(before.history.turns);
                expect(e()).toEqual(before.lifetimes.enterprise);
                for(const key of ['facts','heads','anchors','artifacts','hooks','memory'])expect(s.states.atri_lifecycle.history[key]).toEqual(before.history[key]);
                expect((await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,oldPoint.saveId)).save.closure).toEqual(oldExport.save.closure);
                await expect(svc.core.retryReply(handle,s.session.sessionId,{ messageId:s.timeline.at(-1).messageId,expectedRevisionId:s.revision.revisionId })).rejects.toThrow('archived');
                const point = await svc.saveSystem.manualSave(handle,s.session.sessionId),out = await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,point.saveId);expect(out.save.closure.revisions).toHaveLength(1);
                const target = await make();targets.push(target);const next = services(target);await next.packageInstaller.install(target.handle,archive);
                const restored = await next.saveSystem.importSave(target.handle,out.archive);expect(restored.states).toEqual(s.states);expect(restored.timeline).toEqual(s.timeline);s = restored;svc = next;handle = target.handle;
            };
            await act('matter.open',{ grammarId:'document_fraud',hookId:'' });const m = Object.values(life().renewal.active)[0];
            for(const action of m.path)await act('matter.act',{ id:m.id,action,presentation:'' });await act('matter.act',{ id:m.id,action:'record',presentation:'' });const sourceId = m.id;
            await act('longevity.bind',{ routeId:'covenant' });await act('career.take',{ roleId:'merchant',institutionId:'',sourceId });
            await act('asset.acquire',{ placeId:'river_foundry',sourceId });const assetId = Object.keys(e().assets)[0];
            await act('asset.manage',{ id:assetId,action:'capitalize',amount:300,otherId:'',sourceId });await restore();
            await act('delegate.create',{ domain:'business',targetId:assetId,agentId:'deputy',officeId:'',institutionId:'',objective:'Maintain safe premises and conservative long-term business.',maxSpend:100,risk:0,prohibited:{ debt:true,occult:true,church:true,force:true },lossThreshold:100,reportYears:5,escalateOccult:true });
            await act(null,{},anniversary(0,20));expect(Object.values(e().contracts)[0].reviews).toBe(4);await restore();
            await act('identity.change',{ mode:'replace',name:'Later identity',method:'legitimate',sourceId });expect(e().assets[assetId].status).toBe('stranded');await restore();
            const stable = structuredClone(s);await expect(svc.core.prepareAuthorityTurn(handle,s,request('asset.manage',{ id:assetId,action:'withdraw',amount:1,otherId:'',sourceId }))).rejects.toThrow();expect(await svc.core.load(handle,s.session.sessionId)).toEqual(stable);
            await act('asset.manage',{ id:'treasury',action:'regularize',amount:0,otherId:'',sourceId });await act('asset.manage',{ id:assetId,action:'regularize',amount:0,otherId:'',sourceId });await restore();
            await act('asset.manage',{ id:assetId,action:'bequeath',otherId:'partner',amount:0,sourceId });await act('protagonist.die',{ sourceId:'partner' });expect(e().assets[assetId].ownerId).toBe('partner');await restore();
            await act(null,{},life().continuity.returnAt - s.states.atri_lifecycle.clocks.world);await restore();
            await act('identity.change',{ mode:'retain',name:'Recorded later identity',method:'legitimate',sourceId });
            const retried = await svc.core.retryReply(handle,s.session.sessionId,{ messageId:s.timeline.at(-1).messageId,expectedRevisionId:s.revision.revisionId });
            expect(retried.states.atri_lifecycle.lifetimes.enterprise.identities[life().continuity.publicIdentityId].name).toBe('Later identity');
        } finally {await source.cleanup();for(const target of targets)await target.cleanup();}
    },180000);
});
