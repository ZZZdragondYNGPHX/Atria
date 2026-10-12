import { createNativeId } from '../../../src/native/index.js';
import { sessionFixture, installFixture } from './session-fixture.js';
import { informationFixture } from './information-fixture.js';
import { lifecycleFixture } from './lifecycle-fixture.js';

export async function installCognitionFixture(h, mode = 'separate') {
    const fixture = sessionFixture(), actorId = fixture.manifest.actors[0].actorId;
    const otherActorId = createNativeId('actor');
    fixture.manifest.actors[0].displayName = '阿岚';
    fixture.manifest.actors.push({ actorId: otherActorId, displayName: '沈墨' });
    fixture.manifest.entryPoints[0].actorIds.push(otherActorId);
    fixture.manifest.worlds[0].revision.baseline.secret = '寄信者真实身份是沈墨，只有旁白获准知晓。';
    const contract = informationFixture(actorId, fixture.worldId), info = contract.informationRuntime;
    info.graphs = [];
    info.sources.find(source => source.id === 'world').fields = [['secret']];
    info.sources.push({ id: 'public-world', kind: 'world', semantic: 'truth', scopeId: 'session', worldId: fixture.worldId, fields: [['hp']] });
    const pov = info.views.find(view => view.id === 'pov');
    pov.sources = mode === 'limited' ? ['beliefs', 'memories'] : ['world', 'beliefs', 'memories'];
    if (mode !== 'limited') delete pov.actorId;
    const disclosure = info.views.find(view => view.id === 'player');
    disclosure.actorId = actorId;
    disclosure.sources = ['public-world', 'beliefs', ...(mode === 'custom' ? ['world'] : [])];
    info.views.find(view => view.id === 'actor').sources = ['beliefs', 'memories'];
    info.actors.push({ id: otherActorId, scopeId: 'session' });
    info.views.push({ ...info.views.find(view => view.id === 'actor'), id: 'other-actor', actorId: otherActorId });
    info.narration = { mode, contextViewId: 'pov', disclosureViewId: 'player' };
    contract.taskRuntime = lifecycleFixture().taskRuntime;
    contract.taskRuntime.tasks[0].context = ['input', 'projection'];
    info.views.push({ ...info.views.find(view => view.id === 'actor'), id: 'cognition-task', audience: 'task', taskId: 'summarize' });
    const variant = contract.taskRuntime.tasks[0].variants[0];
    fixture.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: variant.prompt.revision,
            displayName: 'Cognition fixture', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: variant.generation.revision,
            displayName: 'Cognition fixture', output: { maxTokens: 128 } } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId } }));
    fixture.manifest.runtime = { experienceContract: contract };
    const installed = await installFixture(h, fixture);
    let snapshot = await installed.core.create(h.handle, installed.start), serial = 0;
    const write = async (domainId, recordId, value) => {
        snapshot = await installed.core.applyLifecycleCommand(h.handle, snapshot.session.sessionId, { type: 'lifecycle', invocationId: 'seed-' + ++serial,
            action: { kind: 'app.command', domainId, recordId, commandId: 'save',
                args: { ...contract.lifecycleRuntime.domains.find(domain => domain.id === domainId).initial, ...value } } },
        { expectedRevisionId: snapshot.revision.revisionId });
        return snapshot;
    };
    await write('availability', 'main', { available: true });
    await write('beliefs', 'alan-rumor', { text: '阿岚听说寄信者是林舟，但这只是传闻。', status: 'suspected', channel: 'rumor' });
    await write('beliefs', 'other-private', { actor: otherActorId, text: '沈墨怀疑有人跟踪自己。', status: 'believed', channel: 'inference' });
    await write('memories', 'exposure', { text: '阿岚只收到一封未署名信，没有得知寄信者的真实身份。' });
    return { ...installed, actorId, otherActorId, snapshot, write, current: () => snapshot };
}
