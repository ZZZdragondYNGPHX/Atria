import { expect, test } from '@jest/globals';
import { createNativeId } from '../../src/native/identity.js';
import { assertPromptProgram } from '../../src/native/model-prompt-runtime/contracts.js';
import { PromptCompiler, flattenPromptProgram } from '../../src/native/model-prompt-runtime/prompt-compiler.js';
import { renderPromptMessages } from '../../src/native/model-prompt-runtime/prompt-renderers.js';
import { collectVersionedModelPromptResourceRefs, mapVersionedModelPromptResourceRefs } from '../../src/native/model-prompt-runtime/resources.js';
import { freezePackagePromptPrograms } from '../../src/native/model-prompt-runtime/package-freeze.js';
import { PROMPT_TEMPLATES, newPromptPreset } from '../../public/scripts/native/prompt-templates.js';
import { PromptPresetStore } from '../../src/native/model-prompt-runtime/presets.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

const ref = resource => ({ scope: 'library', resourceType: resource.promptProgramId ? 'core.prompt-program' : 'core.prompt-module',
    resourceId: resource.promptProgramId ?? resource.promptModuleId, revision: resource.revision });
const module = (body, extra = {}) => ({ schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: 'r1', displayName: body,
    target: 'context.before_history', stages: ['stage.main'], body, ...extra });
const entry = (id, resource) => ({ entryId: id, kind: 'module', moduleRef: ref(resource) });
const anchor = (id, extra = {}) => ({ entryId: id, kind: 'anchor', target: 'context.before_history', accepts: ['context.fact'], ...extra });
const program = (entries, extra = {}) => ({ schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: 'r1', displayName: 'Ordered program',
    stages: [{ stageId: 'stage.main', entries }], ...extra });
function fixture(root, resources, items = []) {
    return { request: { requestId: 'ordered-request' }, resolved: { route: { promptProgramRef: ref(root) },
        resources: [root, ...resources].map(resource => ({ ref: ref(resource), resource })) },
    contextPlan: { schemaVersion: 1, requestId: 'ordered-request', source: { kind: 'studio', projectId: createNativeId('project'), revision: 'r1' },
        items, provenance: [], budget: { maxTokens: 8000, reservedOutputTokens: 100 } } };
}
const fact = (id, content = 'Selected fact') => ({ kind: 'context.fact', id, content, provenance: [{ source: 'native.context', ref: id }] });
const compile = value => new PromptCompiler().compile(value).promptIr;

test('Module and Anchor share author order; selected facts are emitted once at their declared position', () => {
    const a = module('First', { priority: -999, expression: { layer: 'actor', actorId: 'actor.one' } });
    const b = module('Last', { priority: 999, expression: { layer: 'global' } });
    const root = program([entry('entry.first', a), anchor('anchor.facts'), entry('entry.last', b)]);
    const value = fixture(root, [a, b], [fact('fact.one'), fact('fact.two', 'Another fact')]);
    const ir = compile(value);
    expect(ir.semanticBlocks.map(block => block.message.content)).toEqual(['First', 'Selected fact', 'Another fact', 'Last']);
    expect(ir.semanticBlocks.filter(block => block.kind === 'evidence').every(block => block.message.role === 'user')).toBe(true);
    expect(renderPromptMessages(ir).filter(message => message.content === 'Selected fact')).toHaveLength(1);
    expect(ir.compilation.modules.find(item => item.entryId === 'anchor.facts').contributions.map(item => item.id)).toEqual(['fact.one', 'fact.two']);
});

test('same resource can appear twice and derive changes exactly one entry while retaining its position', () => {
    const shared = module('Shared'); const replacement = module('Replacement'); const added = module('Inserted');
    const parent = program([entry('entry.first', shared), anchor('anchor.facts'), entry('entry.last', shared)]);
    const child = program([], { parentRef: ref(parent), derive: [
        { op: 'replace', stageId: 'stage.main', entryId: 'entry.last', replacementRef: ref(replacement) },
        { op: 'add', stageId: 'stage.main', entryId: 'entry.inserted', entry: entry('entry.inserted', added), position: { before: 'entry.last' } },
    ] });
    const value = fixture(child, [parent, shared, replacement, added], [fact('fact.one')]);
    expect(compile(value).semanticBlocks.map(block => block.message.content)).toEqual(['Shared', 'Selected fact', 'Inserted', 'Replacement']);
    expect(flattenPromptProgram(value.resolved).stages[0].entries.map(item => item.id)).toEqual(['entry.first', 'anchor.facts', 'entry.inserted', 'entry.last']);
    child.derive[1].position = { before: 'entry.missing' };
    expect(() => compile(value)).toThrow('derive_position_missing');
    child.derive[1].position = { before: 'entry.last' }; added.target = 'system.foundation';
    expect(() => compile(value)).toThrow('derive_position_target');
});

test('conditions retain automatic consumption when an anchor is inactive; required anchors report their identity', () => {
    const root = program([anchor('anchor.required', { required: true, condition: { op: 'eq', path: 'param.enabled', value: true } })],
        { parameters: { enabled: { type: 'boolean', default: false } } });
    const value = fixture(root, [], [fact('fact.one')]);
    expect(compile(value).semanticBlocks.map(block => block.message.content)).toEqual(['Selected fact']);
    value.request.prompt = { parameters: { enabled: true } }; value.contextPlan.items = [];
    expect(() => compile(value)).toThrow('anchor_required:stage.main:anchor.required');
});

test('history and input anchors retain original message roles and remove automatic duplicates', () => {
    const root = program([anchor('anchor.history', { accepts: ['context.history', 'context.input'] })]);
    const value = fixture(root, [], [{ kind: 'context.history', content: { role: 'assistant', content: 'Earlier answer' } },
        { kind: 'context.input', content: 'New input' }]);
    const ir = compile(value);
    expect(renderPromptMessages(ir)).toEqual([{ role: 'assistant', content: 'Earlier answer' }, { role: 'user', content: 'New input' }]);
    expect(ir.history).toEqual([]); expect(ir.input).toBe('');
});

test('exact ref mapping and Package freeze preserve entry identities, anchors and effective order', () => {
    const a = module('Before'); const b = module('After');
    const parent = program([entry('entry.before', a), anchor('anchor.facts')]);
    const root = program([], { parentRef: ref(parent), derive: [
        { op: 'add', stageId: 'stage.main', entryId: 'entry.after', entry: entry('entry.after', b), position: { edge: 'end' } },
    ] });
    expect(collectVersionedModelPromptResourceRefs('core.prompt-program', root)).toEqual([ref(parent), ref(b)]);
    const owner = { scope: 'package', packageId: createNativeId('package'), packageVersionId: createNativeId('packageVersion') };
    const resources = [root, parent, a, b].map(resource => ({ resourceType: ref(resource).resourceType,
        resource: mapVersionedModelPromptResourceRefs(ref(resource).resourceType, resource, original => ({ ...original, ...owner })), origin: owner }));
    const frozen = freezePackagePromptPrograms(resources, owner);
    const output = frozen.find(item => item.resource.promptProgramId === root.promptProgramId).resource;
    expect(output.parentRef).toBeNull(); expect(output.derive).toEqual([]);
    expect(output.stages[0].entries.map(item => item.entryId)).toEqual(['entry.before', 'anchor.facts', 'entry.after']);
    const value = fixture(root, [parent, a, b], [fact('fact.one')]);
    const packageValue = { ...value, resolved: { route: { promptProgramRef: { ...ref(output), ...owner } },
        resources: frozen.map(item => ({ ref: { ...ref(item.resource), ...owner }, resource: item.resource })) } };
    expect(renderPromptMessages(compile(packageValue))).toEqual(renderPromptMessages(compile(value)));
});

test('stage cannot persist two order sources or duplicate entry identities', () => {
    const root = program([anchor('anchor.one')]);
    root.stages[0].moduleRefs = [];
    expect(() => assertPromptProgram(root)).toThrow('never both');
    delete root.stages[0].moduleRefs; root.stages[0].entries.push(anchor('anchor.one'));
    expect(() => assertPromptProgram(root)).toThrow('unique');
});

test.each(PROMPT_TEMPLATES)('%s template saves as an editable exact closure and compiles its declared sample positions', async template => {
    const h = await makeTempFsEngine();
    try {
        const store = new PromptPresetStore({ engine: h.engine }); const source = newPromptPreset(template);
        const saved = await store.save(h.handle, source); const preset = await store.get(h.handle, saved.presetId);
        const root = preset.entries.find(item => item.resource.promptProgramId === saved.presetId).resource;
        const resources = preset.entries.filter(item => item.resource !== root).map(item => item.resource);
        const value = fixture(root, resources, [fact('fact.sample'), { kind: 'context.history', content: { role: 'assistant', content: 'Earlier sample' } },
            { kind: 'context.input', content: 'Sample input' }]);
        value.resolved.resources = preset.entries.map(item => ({ ref: preset.refs.find(ref => ref.resourceId === (item.resource.promptProgramId ?? item.resource.promptModuleId ?? item.resource.generationProfileId)), resource: item.resource }));
        const messages = renderPromptMessages(compile(value));
        expect(messages.filter(message => message.content === 'Sample input')).toHaveLength(1);
        expect(messages.filter(message => message.content === 'Selected fact')).toHaveLength(1);
        expect(source.entries[0].resource.promptProgramId).not.toBe(saved.presetId);
        expect(preset.entries.every(item => item.resource.provenance?.some(origin => origin.source === 'atria.template') || template === 'blank')).toBe(true);
    } finally { await h.cleanup(); }
});
