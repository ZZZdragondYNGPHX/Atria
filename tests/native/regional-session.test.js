import { regionalPolicy } from './helpers/regional-policy.js';
import { regionalCommand } from '../../public/shared/native-regional-contract.js';
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
    f.contract.lifecycleRuntime.lifetimes.regional = structuredClone(regionalPolicy);
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
describe.each(CONTRACT_HARNESSES)('Native regional publication — $name', ({ make })=>{
    test('regional departure/arrival/Era restoration, old SavePoints and Retry',async()=>{
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
                expect(e()).toEqual(before.lifetimes.enterprise);expect(life().regional).toEqual(before.lifetimes.regional);
                for(const key of ['facts','heads','anchors','artifacts','hooks','memory'])expect(s.states.atri_lifecycle.history[key]).toEqual(before.history[key]);
                expect((await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,oldPoint.saveId)).save.closure).toEqual(oldExport.save.closure);
                await expect(svc.core.retryReply(handle,s.session.sessionId,{ messageId:s.timeline.at(-1).messageId,expectedRevisionId:s.revision.revisionId })).rejects.toThrow('archived');
                const point = await svc.saveSystem.manualSave(handle,s.session.sessionId),out = await svc.saveSystem.exportSnapshot(handle,s.session.sessionId,point.saveId);expect(out.save.closure.revisions).toHaveLength(1);
                const target = await make();targets.push(target);const next = services(target);await next.packageInstaller.install(target.handle,archive);
                const restored = await next.saveSystem.importSave(target.handle,out.archive);expect(restored.states).toEqual(s.states);expect(restored.timeline).toEqual(s.timeline);s = restored;svc = next;handle = target.handle;
            };
            const change = async(verb,input)=>{const c = regionalCommand(verb,input);await act(c.operation,c.input);};
            await act('longevity.bind',{ routeId:'covenant' });
            await change('travel',{ regionId:'northreach',mode:'coach' });await restore();
            await act(null,{},life().regional.journey.arrives - s.states.atri_lifecycle.clocks.world);await restore();
            expect(life().regional.currentRegionId).toBe('northreach');
            await act(null,{},anniversary(0,40) - s.states.atri_lifecycle.clocks.world);await restore();
            expect(new Set(Object.values(life().regional.events).filter(e=>e.kind === 'era').map(e=>e.detail.next)).size).toBe(2);
            await change('travel',{ regionId:'eastbank',mode:'motor' });await restore();
            await act(null,{},life().regional.journey.arrives - s.states.atri_lifecycle.clocks.world);await restore();
            expect(life().regional.currentRegionId).toBe('eastbank');expect(life().regional.regions.eastbank.materializedAt).toBe(0);
            const stable = structuredClone(s);const bad = regionalCommand('travel',{ regionId:'northreach',mode:'teleport' });
            await expect(svc.core.prepareAuthorityTurn(handle,s,request(bad.operation,bad.input))).rejects.toThrow();expect(await svc.core.load(handle,s.session.sessionId)).toEqual(stable);
            await change('travel',{ regionId:'northreach',mode:'motor' });
            const retried = await svc.core.retryReply(handle,s.session.sessionId,{ messageId:s.timeline.at(-1).messageId,expectedRevisionId:s.revision.revisionId });
            expect(retried.states.atri_lifecycle.lifetimes.regional.journey).toBeNull();
        } finally {await source.cleanup();for(const target of targets)await target.cleanup();}
    },180000);
});
