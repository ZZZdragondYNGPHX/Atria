import { ConflictError } from '../../storage/errors.js';
import { fields, assertJsonDeclaration } from '../../../public/shared/native-values.js';
import { resolveSkillInvocation, boundedSkillReadOptions } from '../../../public/shared/skill-invocation.js';
import { NativeGenerationHost, selectNativeRuntimeRoute } from '../adapters/generation-host.js';
import { McpService } from '../mcp-service.js';
import { A2aService } from '../a2a-service.js';
import { canonicalCredentialTarget } from '../model-prompt-runtime/credential-targets.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { BudgetPort } from './budget-port.js';
import { SourcePort } from './source-port.js';

export const nativeToolFailure = () => { throw new ConflictError('native_orchestration_native_tool_unavailable'); };
export const nativeToolCapability = protocol => ({ mcp: 'mcp.read', a2a: 'a2a.read', skill: 'skill.read' })[protocol];
const operations = { mcp: ['tool', 'resource'], a2a: ['send'], skill: ['read', 'files'] };
const equal = (a, b) => hash(a) === hash(b);

/** Original Session display/Route or installed Skill authority; no discovery,
 * Secret resolution, pin write, Effect, grant or remote request occurs here. */
export async function captureNativeTool(handle, raw, host) {
    const ref = assertJsonDeclaration(raw, 'Native Tool pin', 8192);
    fields(ref, ['kind', 'source', 'protocol', 'operation', 'input'], 'Native Tool pin');
    if (!(host instanceof NativeGenerationHost) || ref.kind !== 'native_session_tool' || !operations[ref.protocol]?.includes(ref.operation)
        || !host.persistence?._engine || host.sessionCore?._sessions?._engine !== host.persistence._engine) nativeToolFailure();
    fields(ref.source, ['domain', 'sessionId', 'branchId', 'revisionId'], 'Native Tool source');
    if (ref.source.domain !== 'native_session') nativeToolFailure();
    const budget = new BudgetPort({ sessionCore: host.sessionCore }), source = new SourcePort({ sessionCore: host.sessionCore, budgetPort: budget });
    const { sourceBinding } = await source.capture(handle, ref.source);
    let route, policy, connection, captured = null, skill = null, scope;
    if (ref.protocol !== 'skill') {
        const allowed = ['sessionId', 'revisionId', 'viewId', 'itemId', 'routeRef', ...ref.protocol === 'mcp' ? ['toolName', 'resourceUri'] : ['skillId']];
        fields(ref.input, allowed, 'Native external Tool input');
        if (ref.input.sessionId !== ref.source.sessionId || ref.input.revisionId !== ref.source.revisionId
            || ref.protocol === 'mcp' && (ref.operation === 'tool' ? !ref.input.toolName || ref.input.resourceUri !== undefined : !ref.input.resourceUri || ref.input.toolName !== undefined)) nativeToolFailure();
        const service = ref.protocol === 'mcp' ? new McpService({ host }) : new A2aService({ host });
        captured = await service.publicWork.capture(handle, ref.input, { readOnly: true });
        if (captured.fallback || captured.base.revision.branchId !== ref.source.branchId) nativeToolFailure();
        ({ route, policy, connection } = captured);
        scope = { sourceFingerprint: captured.fingerprint, policy, connection: canonicalCredentialTarget(connection) };
    } else {
        const allowed = ref.operation === 'read' ? ['scope', 'name', 'version', 'path', 'offset', 'limit'] : ['scope', 'name', 'version'];
        fields(ref.input, allowed, 'Native Skill input');
        if (typeof ref.input.version !== 'string' || !/^[a-f0-9]{64}$/.test(ref.input.version)
            || typeof host.skillRepository !== 'function' || !host.extensions?.settings) nativeToolFailure();
        if (ref.operation === 'read') boundedSkillReadOptions(ref.input);
        const snapshot = await host.sessionCore.observe(handle, ref.source.sessionId), repository = host.skillRepository(handle);
        const settings = (await host.extensions.settings(handle)).value;
        const context = { packageId: snapshot.session.packageId, packageVersionId: snapshot.session.packageVersionId,
            skillIds: snapshot.manifest.skills?.map(item => typeof item === 'string' ? item : item.skillId ?? item.id) };
        const selected = resolveSkillInvocation(await repository.list({ scope: 'all' }), { context, settings, path: 'narrative' });
        const entry = selected.find(item => item.name === ref.input.name && equal(item.scope, ref.input.scope));
        if (!entry || entry.installedHash !== ref.input.version) nativeToolFailure();
        route = selectNativeRuntimeRoute(await host.persistence.listRuntimeRoutes(handle), 'role.narrator');
        // Verify that the exact original version already exists. Authoring is
        // never allowed to create a pin/version or enable a Skill.
        const value = ref.operation === 'read' ? await repository.readFile(ref.input)
            : (await repository.listFiles(ref.input)).map(file => ({ path: file.path, size: file.buffer.length, isBinary: file.isBinary }));
        skill = { repository, settings };
        scope = { entry, settingsDigest: hash(settings), valueHash: hash(value) };
    }
    const limits = route.executionPolicy?.computeBudget;
    if (!limits?.localWork) nativeToolFailure();
    const endpointBindingDigest = connection ? hash(canonicalCredentialTarget(connection)) : hash({ protocol: 'skill', scope: ref.input.scope, name: ref.input.name, version: ref.input.version });
    const descriptor = { schemaVersion: 1, kind: 'native_session_tool', protocol: ref.protocol, operation: ref.operation,
        capability: nativeToolCapability(ref.protocol), risk: ref.protocol === 'skill' ? 'R0' : 'R1', requiresApproval: false,
        sourceRequest: ref.source, sourceBindingDigest: sourceBinding.bindingDigest, inputHash: hash(ref.input), scopeDigest: hash(scope),
        runtimeRouteId: route.runtimeRouteId, routeIntegrity: hash(route), ...(connection ? { connectionProfileId: connection.connectionProfileId } : {}), endpointBindingDigest,
        egressDigest: hash(connection ? { kind: 'original_player_display_item', sourceFingerprint: captured.fingerprint,
            endpointBindingDigest, protocol: ref.protocol, operation: ref.operation } : { kind: 'local_selected_skill', endpointBindingDigest }), limits };
    return { ref, descriptor, captured, skill, sourceBinding };
}

export async function readNativeToolDescriptor(handle, ref, host) {
    return (await captureNativeTool(handle, ref, host)).descriptor;
}

export function validateNativeToolCapability({ definition, dependencyPins, capability, host }) {
    const nodes = definition.nodes.filter(node => node.capabilities.includes(capability));
    const valid = host instanceof NativeGenerationHost && nodes.length > 0 && nodes.every(node => node.kind === 'effect'
        && node.dependencyPinIds.includes(node.policy.actionPinId) && dependencyPins.some(pin => pin.pinId === node.policy.actionPinId
            && pin.port === 'tool' && pin.resourceRef.kind === 'native_session_tool' && nativeToolCapability(pin.resourceRef.protocol) === capability));
    return { evidence: [{ capability, status: valid ? 'available' : 'invalid' }], issues: valid ? [] : [{
        code: 'native_orchestration_native_tool_pin_required', severity: 'blocking', fieldPath: 'capabilityCeiling.' + capability }] };
}

/** Frozen decision derived only from an owned published pin and original Route. */
export function nativeToolDecision({ ownerRef, planRef, sourceBinding, nodeId, pin, descriptor }) {
    return { actionRef: { protocol: descriptor.protocol, operation: descriptor.operation },
        targetRef: descriptor.protocol === 'skill' ? { scope: pin.resourceRef.input.scope, name: pin.resourceRef.input.name, version: pin.resourceRef.input.version }
            : { connectionProfileId: descriptor.connectionProfileId },
        inputRef: { kind: 'native_session_tool', pinId: pin.pinId, descriptorIntegrity: pin.integrity, descriptor, input: pin.resourceRef.input },
        inputHash: descriptor.inputHash, capability: descriptor.capability, risk: descriptor.risk, requiresApproval: false,
        grantDigest: hash({ principal: 'original_native_session_tool', ownerRef, planRef, sourceBindingDigest: sourceBinding.bindingDigest,
            nodeId, pinId: pin.pinId, descriptorIntegrity: pin.integrity }),
        endpointBindingDigest: descriptor.endpointBindingDigest, egressDigest: descriptor.egressDigest, budgetEnvelopeDigest: hash(descriptor.limits),
        dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: descriptor.protocol === 'skill' ? 'domain_status' : 'remote_status' } };
}
