import { describe, expect, test } from '@jest/globals';
import { createNativeId } from '../../src/native/identity.js';
import { assertPromptModule, assertPromptProgram } from '../../src/native/model-prompt-runtime/contracts.js';
import { PromptCompiler } from '../../src/native/model-prompt-runtime/prompt-compiler.js';
import { freezePackagePromptPrograms } from '../../src/native/model-prompt-runtime/package-freeze.js';
import { forkPromptClosure, exactKey } from '../../public/scripts/native/prompt-authoring.js';

const owner = { scope: 'package', packageId: createNativeId('package'), packageVersionId: createNativeId('packageVersion') };
const ref = resource => ({ ...owner, resourceType: resource.promptProgramId ? 'core.prompt-program' : 'core.prompt-module', resourceId: resource.promptProgramId || resource.promptModuleId, revision: resource.revision });
const entry = resource => ({ resourceType: ref(resource).resourceType, ref: ref(resource), resource, origin: owner });
const module = (body, extra = {}) => assertPromptModule({ schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: 'r1', displayName: 'Module', stages: ['stage.main'], target: 'system.foundation', body, ...extra });
const program = (modules, extra = {}) => assertPromptProgram({ schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: 'r1', displayName: 'Program', stages: [{ stageId: 'stage.main', moduleRefs: modules.map(ref) }], ...extra });
const compile = (resources, promptProgramRef) => new PromptCompiler().compile({ request: { requestId: 'p6' }, resolved: { resources, route: { promptProgramRef } }, contextPlan: {
    schemaVersion: 1, requestId: 'p6', source: { kind: 'studio', projectId: createNativeId('project'), revision: 'r1' }, items: [], budget: { maxTokens: 1000, reservedOutputTokens: 100 },
} }).promptIr;

describe('P6 exact fork and Package freeze', () => {
    test('NPC-001 inherited labels, finite choices and defaults survive Package flatten and Library fork', () => {
        const parameters = { mode: { type: 'string', label: 'Style', description: 'Choose one style', default: 'calm', options: [{ value: 'calm', label: 'Calm' }, { value: 'fast', label: 'Fast' }] } };
        const m = module('{{param.mode}}'); const parent = program([m], { parameters }); const child = program([], { parentRef: ref(parent) });
        const frozen = freezePackagePromptPrograms([m, parent, child].map(entry), owner).map(item => ({ ...item, ref: ref(item.resource) }));
        const leaf = frozen.find(item => item.resource.promptProgramId === child.promptProgramId);
        expect(leaf.resource.parameters.mode).toMatchObject(parameters.mode);
        expect(compile(frozen, leaf.ref).compilation.parameters).toEqual({ mode: 'calm' });
        const forked = forkPromptClosure(frozen, leaf);
        expect(forked.entries.at(-1).resource.parameters.mode).toMatchObject(parameters.mode);
    });
    test('flattened configure/replace/disable/add has identical compiled content, no parent lookup and no mutation', () => {
        const a = module('base'), b = module('disabled'), replacement = module('replacement {{module.tone}}', { parameters: { tone: { type: 'string', default: 'calm' } } });
        const added = module('added'); const parent = program([a, b]);
        const child = program([], { parentRef: ref(parent), derive: [{ op: 'replace', moduleId: a.promptModuleId, replacementRef: ref(replacement) }, { op: 'disable', moduleId: b.promptModuleId }, { op: 'add', moduleId: added.promptModuleId, replacementRef: ref(added) }] });
        const leaf = program([], { parentRef: ref(child), derive: [{ op: 'configure', moduleId: a.promptModuleId, config: { tone: 'warm' } }] });
        const entries = [a, b, replacement, added, parent, child, leaf].map(entry); const before = JSON.stringify(entries);
        const original = compile(entries, ref(leaf)); const frozen = freezePackagePromptPrograms(entries, owner).map(item => ({ ...item, ref: ref(item.resource) }));
        const result = compile(frozen, ref(leaf));
        expect(result.directives).toEqual(original.directives); expect(result.directives).toContain('replacement warm'); expect(result.directives).not.toContain('disabled');
        expect(frozen.filter(item => item.resourceType === 'core.prompt-program').every(item => !item.resource.parentRef && !item.resource.derive.length)).toBe(true);
        expect(JSON.stringify(entries)).toBe(before); expect(freezePackagePromptPrograms(entries, owner)).toEqual(freezePackagePromptPrograms(entries, owner));
        // Only the leaf and its direct module refs are needed after installation; no Library/ancestor authority remains.
        const frozenLeaf = frozen.find(item => item.resource.promptProgramId === leaf.promptProgramId);
        const refs = frozenLeaf.resource.stages.flatMap(stage => stage.moduleRefs).map(exactKey);
        expect(compile([frozenLeaf, ...frozen.filter(item => refs.includes(exactKey(item.ref)))], ref(leaf)).directives).toEqual(original.directives);
    });
    test('ordinary Programs retain pinned module revisions', () => {
        const m = module('original'), p = program([m]); const entries = [m, p].map(entry);
        expect(freezePackagePromptPrograms(entries, owner).find(item => item.resourceType === 'core.prompt-program').resource).toEqual(p);
    });
    test.each([false, true])('Package fork derive=%s stays independent with identical output and provenance', derive => {
        const a = module('first'), b = module('second'); const parent = program([a, b]);
        const entries = [a, b, parent].map(entry); const before = JSON.stringify(entries);
        const plan = forkPromptClosure(entries, entry(parent), { derive });
        expect(plan.entries.every(item => item.ref.scope === 'library')).toBe(true);
        expect(compile(plan.entries, plan.ref).directives).toEqual(compile(entries, ref(parent)).directives);
        expect(plan.entries.at(-1).resource.provenance.length).toBeGreaterThan(0); expect(JSON.stringify(entries)).toBe(before);
    });
    test('several exact module revisions share one fork identity, including configure targets', () => {
        const a = module('old'), b = module('new', { promptModuleId: a.promptModuleId, revision: 'r2', stages: ['stage.other'], parameters: { tone: { type: 'string', default: 'calm' } } });
        const p = program([a], { stages: [{ stageId: 'stage.main', moduleRefs: [ref(a)] }, { stageId: 'stage.other', moduleRefs: [ref(b)] }], derive: [{ op: 'configure', moduleId: a.promptModuleId, config: {} }] });
        const plan = forkPromptClosure([a, b, p].map(entry), entry(p));
        const modules = plan.entries.filter(item => item.ref.resourceType === 'core.prompt-module');
        expect(new Set(modules.map(item => item.ref.resourceId)).size).toBe(1); expect(new Set(modules.map(item => item.ref.revision)).size).toBe(2);
        expect(plan.entries.at(-1).resource.derive[0].moduleId).toBe(modules[0].ref.resourceId);
    });
    test('Library dependencies stay exact and missing Package closure fails closed', () => {
        const m = module('body'), p = program([m]);
        expect(() => forkPromptClosure([entry(p)], entry(p))).toThrow('Missing exact dependency');
        const lib = { ...entry(p), ref: { ...ref(p), scope: 'library' }, resource: { ...p, stages: [{ stageId: 'stage.main', moduleRefs: [{ scope: 'library', resourceType: 'core.prompt-module', resourceId: m.promptModuleId, revision: m.revision }] }] } };
        const plan = forkPromptClosure([lib], lib); expect(plan.entries).toHaveLength(1); expect(plan.entries[0].resource.stages).toEqual(lib.resource.stages);
    });
});

test('freezing an ancestor template does not require bindings supplied only by a descendant', () => {
    const m = module('{{module.tone}}', { parameters: { tone: { type: 'string', required: true } } });
    const base = program([m]); const middle = program([], { parentRef: ref(base) });
    const leaf = program([], { parentRef: ref(middle), derive: [{ op: 'configure', moduleId: m.promptModuleId, config: { tone: 'complete' } }] });
    const frozen = freezePackagePromptPrograms([m, base, middle, leaf].map(entry), owner).map(item => ({ ...item, ref: ref(item.resource) }));
    expect(compile(frozen, ref(leaf)).directives).toEqual(['complete']);
    expect(() => compile(frozen, ref(middle))).toThrow('parameter_required');
});

test('Used By isolates Package, Project and Library owners even for identical IDs/revisions', async () => {
    const { AssetStore, KnowledgeRepo, NativeLibraryService, PackageRepo, ProjectStore, ResourceGraph, VersionedJsonResourceHandler, WorldRepo, createCoreResourceRegistry } = await import('../../src/native/index.js');
    const { makeTempFsEngine } = await import('../storage/harness/fs-harness.js');
    const { installFixture, sessionFixture } = await import('./helpers/session-fixture.js');
    const h = await makeTempFsEngine();
    try {
        const m = module('package body'), p = program([m]); const fixture = sessionFixture();
        fixture.manifest.packageId = owner.packageId; fixture.manifest.packageVersionId = owner.packageVersionId;
        fixture.manifest.resources = [m, p].map(resource => ({ resourceType: ref(resource).resourceType, resource, origin: owner }));
        await installFixture(h, fixture);
        const versionedJsonResources = new VersionedJsonResourceHandler({ engine: h.engine });
        await versionedJsonResources.commit(h.handle, 'core.prompt-module', m);
        await versionedJsonResources.commit(h.handle, 'core.prompt-program', { ...p, displayName: 'Library Program', stages: [{ stageId: 'stage.main', moduleRefs: [{ scope: 'library', resourceType: 'core.prompt-module', resourceId: m.promptModuleId, revision: m.revision }] }] });
        const repos = { packageRepo: new PackageRepo({ engine: h.engine }), projectStore: new ProjectStore({ directoriesByHandle: () => h.dirs }), worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }), assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), versionedJsonResources };
        const graph = new ResourceGraph({ ...repos, registry: createCoreResourceRegistry(), libraryService: new NativeLibraryService(repos) });
        const packaged = await graph.references(h.handle, ref(m), { reverse: true });
        expect(packaged.some(item => item.node.displayName === 'Program')).toBe(true);
        expect(packaged.some(item => item.node.displayName === 'Library Program')).toBe(false);
        const library = await graph.references(h.handle, { scope: 'library', resourceType: 'core.prompt-module', resourceId: m.promptModuleId, revision: m.revision }, { reverse: true });
        expect(library.map(item => item.node.displayName)).toEqual(['Library Program']);
        expect(await graph.references(h.handle, { ...ref(m), scope: 'project', projectId: createNativeId('project') }, { reverse: true })).toEqual([]);
    } finally { await h.cleanup(); }
});
