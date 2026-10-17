import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { validateOutputCapability } from './output-capability-authority.js';
import { PlanRepository, readPlanRevision } from './plan-repository.js';
import { hashNativeDocument } from '../repositories/common.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../model-prompt-runtime/persistence.js';
import { assertExactResourceRef } from '../model-prompt-runtime/contracts.js';
import { assertObject, assertDependencyPins } from '../../../public/shared/native-orchestration-contracts.js';
import { NotFoundError } from '../../storage/errors.js';
import { createBindingSourceAuthority } from './binding-source-authority.js';
import { validateModelCapability } from './model-capability-authority.js';
import { validateDelegationCapability } from './delegation-capability-authority.js';
import { readProjectToolDescriptor, projectToolCapability } from './project-tool-contracts.js';
import { validateGraphPatchCapability } from './graph-controller.js';
import { NativeRetrievalPersistence } from '../retrieval-persistence.js';
import { assertRetrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';
import { validateRetrievalCapability } from './retrieval-capability-authority.js';

/** Authoring uses existing Native resource readers; validation never sends. */
export function createOrchestrationAuthoringService(engine, sources = {}) {
    const lifecycle = engine.nativeHostLifecycle;
    if (!lifecycle) throw new TypeError('Orchestration requires original Storage Host ownership');
    const library = new VersionedJsonResourceHandler({ engine });
    const runtime = new NativeModelPromptPersistence({ engine });
    const retrieval = new NativeRetrievalPersistence({ engine });
    const authorizeBinding = createBindingSourceAuthority(sources);
    const readDependency = async ({ handle, tx, port, resourceRef: ref, runtimeRoute }) => {
        if (port === 'plan') return readPlanRevision(tx, handle, ref);
        if (port === 'context' && ref.scope === 'player' && Object.hasOwn(ref, 'retrievalProfileId')) {
            const normalized = assertRetrievalRef(ref);
            try { return await retrieval.getExact(handle, normalized); } catch (error) {
                if (error.code === 'native_retrieval_unavailable') throw new NotFoundError('orchestration_dependency');
                throw error;
            }
        }
        if (['context', 'model', 'narrative', 'evaluation'].includes(port) && ref.scope === 'library') {
            const normalized = assertExactResourceRef(ref);
            if (hashNativeDocument(normalized) !== hashNativeDocument(ref)) throw new TypeError('Unexpected fields in original resource reference');
            return (await library.getExact(handle, normalized)).snapshot;
        }
        if (port === 'model' && ref.scope === 'player') {
            assertObject(ref, ['scope', 'runtimeRouteId'], 'routeRef');
            return runtimeRoute?.runtimeRouteId === ref.runtimeRouteId ? runtimeRoute : runtime.getRuntimeRoute(handle, ref.runtimeRouteId);
        }
        if (port === 'tool' && ref.kind === 'project_agent_tool') return readProjectToolDescriptor(handle, ref, sources.projectAgent);
        throw Object.assign(new TypeError('Original dependency authority required'), { code: 'native_orchestration_dependency_authority_unavailable' });
    };
    const validateDependencies = async ({ handle, tx, dependencyPins, definition, runtimeRoute }, ancestry = [], completedReports = new Map()) => {
        const evidence = [], issues = [];
        const resolver = runtimeRoute && sources.modelResolver instanceof RouteResolver ? (() => {
            const original = sources.modelResolver, persistence = Object.create(original.persistence);
            persistence.getRuntimeRoute = (owner, id) => owner === handle && id === runtimeRoute.runtimeRouteId ? runtimeRoute : original.persistence.getRuntimeRoute(owner, id);
            return new RouteResolver({ persistence, library: original.library, providers: Object.fromEntries(original.providers),
                getScopedResource: original.getScopedResource, getSessionRoute: original.getSessionRoute, now: original.now });
        })() : sources.modelResolver;
        for (const capability of definition.capabilityCeiling) {
            if (capability === 'generation.send') {
                const result = await validateModelCapability({ handle, definition, dependencyPins, resolver });
                evidence.push(...result.evidence); issues.push(...result.issues);
                continue;
            }
            if (capability === 'chat.output') {
                const result = validateOutputCapability({ definition, rpControl: sources.rpControl, sessionCore: sources.sessionCore, engine });
                evidence.push(...result.evidence); issues.push(...result.issues);
                continue;
            }
            if (capability === 'memory.retrieve') {
                const result = await validateRetrievalCapability({ handle, definition, dependencyPins, retrieval });
                evidence.push(...result.evidence); issues.push(...result.issues);
                continue;
            }
            if (capability === 'graph.patch') {
                const result = validateGraphPatchCapability({ definition });
                evidence.push(...result.evidence); issues.push(...result.issues);
                continue;
            }
            if (capability === 'agent.delegate') {
                const result = await validateDelegationCapability({ handle, tx, definition, dependencyPins, validateChild: validateDependencies, ancestry, completedReports });
                evidence.push(...result.evidence); issues.push(...result.issues);
                continue;
            }
            if (['project.read', 'project.propose'].includes(capability)) {
                const nodes = definition.nodes.filter(node => node.capabilities.includes(capability));
                const valid = nodes.length > 0 && nodes.every(node => node.kind === 'agent' && node.dependencyPinIds.some(id =>
                    dependencyPins.some(pin => pin.pinId === id && pin.port === 'tool' && pin.resourceRef.kind === 'project_agent_tool'
                        && projectToolCapability(pin.resourceRef.name) === capability)));
                evidence.push({ capability, status: valid ? 'available' : 'invalid' });
                if (!valid) issues.push({ code: 'native_orchestration_project_tool_pin_required', severity: 'blocking', fieldPath: 'capabilityCeiling.' + capability });
                continue;
            }
            issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', fieldPath: 'capabilityCeiling.' + capability });
            evidence.push({ capability, status: 'unknown' });
        }
        for (const pin of dependencyPins) {
            try {
                let value;
                try { value = await readDependency({ handle, tx, ...pin, runtimeRoute }); } catch (error) {
                    if (error.code !== 'native_orchestration_dependency_authority_unavailable') throw error;
                    issues.push({ code: 'native_orchestration_dependency_authority_unavailable', severity: 'unknown', fieldPath: 'dependencyPins.' + pin.pinId });
                    evidence.push({ pinId: pin.pinId, status: 'unknown' });
                    continue;
                }
                const digest = value ? hashNativeDocument(value) : null;
                evidence.push({ pinId: pin.pinId, digest });
                if (digest !== pin.integrity) issues.push({ code: 'native_orchestration_dependency_stale', severity: 'blocking', fieldPath: 'dependencyPins.' + pin.pinId });
            } catch (error) {
                // Malformed/missing references cannot be published. Actual
                // storage/transport faults must retain their failure status.
                if (!(error instanceof TypeError) && error.name !== 'NotFoundError' && error.code !== 'native_orchestration_revision_mismatch') throw error;
                evidence.push({ pinId: pin.pinId, status: 'invalid' });
                issues.push({ code: 'native_orchestration_dependency_invalid', severity: 'blocking', fieldPath: 'dependencyPins.' + pin.pinId });
            }
        }
        return { status: issues.some(issue => issue.severity === 'blocking') ? 'invalid' : issues.length ? 'unknown' : 'valid', issues, dependencyDigest: hashNativeDocument(evidence) };
    };
    const plans = new PlanRepository({
        engine,
        assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
        authorize: async args => {
            const { handle, operation } = args;
            // Owner is supplied only by the authenticated HTTP adapter. Source
            // bindings are enabled by the P3 original domain authority adapter.
            if (typeof handle !== 'string' || !handle) throw new TypeError('Authenticated owner required');
            if (operation.startsWith('bindings.')) await authorizeBinding(args);
        },
        // Each public validation starts a fresh transaction-local closure.
        // Only recursive calls below explicitly share completed reports.
        validateDependencies: args => validateDependencies(args),
    });
    const dependencies = { inspect: async (handle, input) => {
        assertObject(input, ['pinId', 'port', 'resourceRef'], 'dependency inspection');
        assertDependencyPins([{ ...input, integrity: '0'.repeat(64) }]);
        return engine.withTransaction(handle, async tx => {
            const value = await readDependency({ handle, tx, ...input });
            if (!value) throw new NotFoundError('orchestration_dependency');
            // A pin hashes original data. It never grants execution or exposes
            // the original Model/Tool/Context document through this endpoint.
            return { ...input, integrity: hashNativeDocument(value) };
        });
    } };
    return { plans, dependencies, hostBootId: lifecycle.hostBootId };
}
