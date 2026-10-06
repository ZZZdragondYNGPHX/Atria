import { describe, test, expect } from '@jest/globals';
import { artifactFixture } from './helpers/task-artifact-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { createPackageContextDerivation } from '../../src/native/context-computation.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { validateExperienceResources } from '../../src/native/experience-validation.js';
import { prepareKnowledgeAdoption, adoptKnowledge } from '../../src/native/knowledge-authority.js';

function contextFixture() {
    const f = artifactFixture();
    const entry = f.base.manifest.knowledge[0].entries[0];
    const dependency = createNativeId('knowledgeEntry');
    Object.assign(entry, { lifecycle: { sticky: 2, cooldown: 1 }, relations: { requiredEntryIds: [dependency] } });
    f.base.manifest.knowledge[0].entries.push({ knowledgeEntryId: dependency, content: 'basis', metadata: {}, discovery: { keywords: ['absent'] } });
    f.base.manifest.knowledge[0].revision.entryIds.push(dependency);
    f.base.knowledge = { schemaVersion: 1, bindings: f.base.manifest.knowledgeBindings, snapshots: [] };
    f.contract.informationRuntime.views.push({ id: 'narrator.notes', audience: 'narrator', sources: ['public.notes'], exposure: ['context'], knowledge: true, memory: false, maxItems: 64, maxCharacters: 16384 });
    f.contract.capabilities.push({ id: 'context-derivation', version: 1, required: true });
    f.contract.contextRuntime = { schemaVersion: 1, derivations: [{ id: 'knowledge.dynamic', source: 'context/knowledge.ts', viewId: 'narrator.notes',
        target: { kind: 'knowledge', knowledgeEntryId: entry.knowledgeEntryId },
        artifacts: [{ id: 'npc', taskId: f.task.id, variantId: 'default', usageId: 'summary', selector: 'latest' }] },
    { id: 'scene', source: 'context/scene.ts', viewId: 'narrator.notes', target: { kind: 'context', priority: 1 }, artifacts: [] }] };
    f.installed.sourceFiles.set('context/knowledge.ts', Buffer.from('export default {derive({projection, artifacts}) {return {text:"D".repeat(1600),compact:"NPC wants "+artifacts.npc.quantity};}}'));
    f.installed.sourceFiles.set('context/scene.ts', Buffer.from('export default {derive({projection}) {return {text:"Scene: "+projection.items.map(item=>item.data.text).join(",")};}}'));
    f.sync(); return f;
}
const options = f => ({ modelContextLimit: 4096, responseReserve: 128, safetyMarginTokens: 8,
    countTokens: text => Math.max(1, text.length), laneCaps: { knowledge: 64, current_state_event: 1024 },
    deriveContext: createPackageContextDerivation(f.base, f.installed) });

describe('Native dynamic context and Knowledge main chain', () => {
    test('preview and send prepare identical authorized dynamic text, compact dependencies and no formal writes', async () => {
        const f = contextFixture(); const before = structuredClone(f.base);
        assertNativeExperienceContract(f.contract); validateExperienceResources(f.base.manifest, f.installed.sourceFiles, f.installed.assets);
        const preview = await compileNativeContextPlan(f.base, options(f));
        const actual = await compileNativeContextPlan(f.base, options(f)); expect(actual).toEqual(preview);
        const knowledge = preview.included.filter(item => item.lane === 'knowledge');
        expect(knowledge.map(item => item.content).sort()).toEqual(['NPC wants 2', 'basis']);
        expect(new Set(knowledge.map(item => item.atomicGroup)).size).toBe(1);
        expect(knowledge.every(item => item.metadata.variant === 'compact')).toBe(true);
        expect(preview.included.some(item => item.content.startsWith('Scene: public note'))).toBe(true);
        expect(JSON.stringify(preview.included)).not.toContain('PRIVATE SENTINEL');
        expect(preview.derivationEvidence).toHaveLength(2);
        expect(Object.keys(preview.knowledgeSelection.pendingState.effects)).toHaveLength(1);
        expect(f.base).toEqual(before);
    });
    test('expanded full and compact overflow reject the whole dependency group and do not create sticky state', async () => {
        const f = contextFixture(); const plan = await compileNativeContextPlan(f.base, { ...options(f), laneCaps: { knowledge: 4 } });
        expect(plan.included.filter(item => item.lane === 'knowledge')).toEqual([]);
        expect(plan.knowledgeSelection.rejected.some(item => item.reason === 'dependency_budget_overflow')).toBe(true);
        expect(plan.knowledgeSelection.pendingState.effects).toEqual({});
    });
    test('fixed dynamic eligibility participates in dependency qualification and priority is bounded', async () => {
        const f = contextFixture();
        f.installed.sourceFiles.set('context/knowledge.ts', Buffer.from('export default {derive() {return {text:"Hidden",eligible:false,priority:900};}}'));
        const plan = await compileNativeContextPlan(f.base, options(f));
        expect(plan.included.filter(item => item.lane === 'knowledge')).toEqual([]);
        expect(plan.knowledgeSelection.pendingState.effects).toEqual({});
        expect(plan.knowledgeSelection.rejected.some(item => item.reason === 'entry_disabled')).toBe(true);
        f.installed.sourceFiles.set('context/knowledge.ts', Buffer.from('export default {derive() {return {text:"Bad",priority:10001};}}'));
        await expect(compileNativeContextPlan(f.base, options(f))).rejects.toThrow('schema');
    });
    test('other audience cannot execute narrator derivation; missing host fails closed for its audience', async () => {
        const f = contextFixture(); const deriveContext = async () => { throw new Error('ungranted execution'); };
        const other = await compileNativeContextPlan(f.base, { ...options(f), target: 'actor', deriveContext });
        expect(other.derivationEvidence).toEqual([]);
        await expect(compileNativeContextPlan(f.base, { ...options(f), deriveContext: undefined })).rejects.toThrow('host unavailable');
    });
    test('edited formal artifact and wrong consumption purpose cannot supply a model context', async () => {
        const f = contextFixture(); f.record.payload.quantity = 3;
        await expect(compileNativeContextPlan(f.base, options(f))).rejects.toThrow('consumption denied');
        f.contract.contextRuntime.derivations[0].artifacts[0].usageId = 'trade';
        expect(() => assertNativeExperienceContract(f.contract)).toThrow('artifact grant');
    });
    test('Knowledge state needs a genuine matching adoption proof; planning alone stays inert', async () => {
        const f = contextFixture(), core = {};
        const plan = await compileNativeContextPlan(f.base, options(f));
        const selection = { revisionId: plan.revisionId, branchId: plan.branchId, targetKey: plan.knowledgeSelection.targetKey, pendingState: plan.knowledgeSelection.pendingState };
        const proof = prepareKnowledgeAdoption(core, 'owner', f.base, selection);
        const states = adoptKnowledge(core, 'owner', f.base, f.base.states, proof);
        expect(states.atri_knowledge_runtime.targets[selection.targetKey]).toEqual(selection.pendingState);
        expect(f.base.states).not.toHaveProperty('atri_knowledge_runtime');
        expect(() => adoptKnowledge(core, 'owner', f.base, f.base.states, {})).toThrow('proof required');
        expect(() => adoptKnowledge(core, 'other', f.base, f.base.states, proof)).toThrow('proof required');
        f.base.revision.revisionId = createNativeId('revision');
        expect(() => adoptKnowledge(core, 'owner', f.base, f.base.states, proof)).toThrow('proof required');
    });
});
