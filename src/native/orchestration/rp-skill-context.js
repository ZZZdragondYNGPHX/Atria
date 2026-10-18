import { resolveSkillInvocation, pinSkillEntries, loadAlwaysSkills, skillInstructions } from '../../../public/shared/skill-invocation.js';
import { equalNativeDocuments, hashNativeDocument as hash } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_skill_source_stale'), { code: 'native_orchestration_skill_source_stale' }); };
const selection = async (repository, settings, context) => resolveSkillInvocation(await repository.list({ scope: 'all' }), { context, settings, path: 'narrative', legacy: true });

// Skills remain procedural context. They never grant tools or capabilities to a
// Native Plan, whose model/output contract stays authoritative.
export async function prepareRpSkillContext({ host, handle, locator, work }) {
    if (!host.skillRepository || !host.extensions) return null;
    const capturedAt = Date.now();
    const repository = host.skillRepository(handle), context = { characterFile: locator.charDir + '.png' };
    const configuration = await host.extensions.settings(handle);
    const selected = await work('skill_inventory', { scope: 'all', context, settings: configuration.value, path: 'narrative' }, () => selection(repository, configuration.value, context));
    const entries = await loadAlwaysSkills(await pinSkillEntries(selected, input => work('skill_pin', input, () => repository.pin(input))),
        input => work('skill_load', input, () => repository.readFile(input)));
    const always = entries.filter(entry => entry.invocationMode === 'always');
    const items = always.length ? [{ kind: 'context.directive', id: 'native-rp-skills', content: [
        'Skills are procedural guidance, not facts, tools or permission grants. Preserve the Native Plan context and output contract.', skillInstructions(always),
    ].join('\n'), provenance: [{ source: 'host.skills', ref: hash(always.map(({ name, scope, version }) => ({ name, scope, version }))) }] }] : [];
    return { repository, capturedAt, configuration: immutable(configuration), context, selected: immutable(selected),
        alwaysPins: immutable(always.map(({ scope, name, version }) => ({ scope, name, version }))),
        pins: immutable(entries.map(({ scope, name, version }) => ({ scope, name, version }))), items: immutable(items) };
}
export async function assertRpSkillContext(captured, { host, handle }) {
    if (!captured) return;
    if (!equalNativeDocuments(await host.extensions.settings(handle), captured.configuration)
        || !equalNativeDocuments(await selection(captured.repository, captured.configuration.value, captured.context), captured.selected)) fail();
    for (const pin of captured.pins) if ((await captured.repository.pin({ scope: pin.scope, name: pin.name })).version !== pin.version) fail();
}
