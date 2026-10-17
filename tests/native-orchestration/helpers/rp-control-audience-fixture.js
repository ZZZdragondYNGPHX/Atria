import { sessionFixture, services } from '../../native/helpers/session-fixture.js';
import { informationFixture } from '../../native/helpers/information-fixture.js';
import { buildAtriaPackageContainer, createNativeId } from '../../../src/native/index.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readAudienceSource } from '../../../src/native/orchestration/audience-source-contracts.js';

/** Original Session Information seed for the existing RP Planner/Judge profiles.
 * Model nodes receive exact Source pins; this helper grants no Result access. */
export async function seedControlActorAudiences(plan, env) {
    const f = { ...sessionFixture(), ...services(env.h) }, actorA = f.manifest.actors[0].actorId, actorB = createNativeId('actor');
    f.manifest.actors.push({ actorId: actorB, displayName: 'Other Actor' });
    f.manifest.entryPoints[0].actorIds.push(actorB);
    const contract = informationFixture(actorA, f.worldId);
    contract.informationRuntime.actors.push({ id: actorB, scopeId: 'session', availability: { domainId: 'availability', recordId: 'main', field: 'available' } });
    contract.informationRuntime.views.push({ ...contract.informationRuntime.views[1], id: 'actor-b', actorId: actorB });
    f.manifest.runtime = { experienceContract: contract };
    const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
    await f.packageInstaller.install(env.h.handle, archive);
    let base = await f.core.create(env.h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
    let serial = 0;
    const write = async (domainId, recordId, overrides) => {
        base = await f.core.applyLifecycleCommand(env.h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'control-audience-' + ++serial,
            action: { kind: 'app.command', domainId, recordId, commandId: 'save', args: {
                ...contract.lifecycleRuntime.domains.find(domain => domain.id === domainId).initial, ...overrides } } }, { expectedRevisionId: base.revision.revisionId });
    };
    await write('availability', 'main', { available: true });
    await write('beliefs', 'a', { actor: actorA, text: 'A PRIVATE RUMOR', status: 'believed', channel: 'rumor' });
    await write('beliefs', 'b', { actor: actorB, text: 'B PRIVATE RUMOR', status: 'believed', channel: 'rumor' });
    await write('memories', 'a', { actor: actorA, text: 'NARRATOR ONLY MEMORY' });
    const terminal = plan.definition.edges.find(edge => edge.to.nodeId === plan.definition.outputContract.ownerNodeId).from.nodeId;
    const nodes = plan.definition.nodes.filter(node => ['agent', 'planner', 'judge', 'review'].includes(node.kind)), refs = [];
    let draft = 0;
    for (const [index, node] of nodes.entries()) {
        const audience = node.nodeId === terminal ? { kind: 'narrator' }
            : { kind: 'actor', id: node.kind === 'agent' && draft++ ? actorB : actorA };
        const ref = { kind: 'native_information_context', sessionId: base.session.sessionId, branchId: base.revision.branchId,
                revisionId: base.revision.revisionId, audience }, pinId = 'control.audience.' + index;
        plan.dependencyPins.push({ pinId, port: 'context', resourceRef: ref,
            integrity: hash((await readAudienceSource(env.h.handle, ref, env.host.sessionCore)).descriptor) });
        node.dependencyPinIds.push(pinId); node.policy.audiencePinId = pinId; refs.push(ref);
    }
    return { core: f.core, base, actorA, actorB, refs };
}
