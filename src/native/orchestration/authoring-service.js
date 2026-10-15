import { PlanRepository } from './plan-repository.js';
import { hashNativeDocument } from '../repositories/common.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../model-prompt-runtime/persistence.js';
import { assertExactResourceRef } from '../model-prompt-runtime/contracts.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';

/** Authoring uses existing Native resource readers; validation never sends. */
export function createOrchestrationAuthoringService(engine) {
    const lifecycle = engine.nativeHostLifecycle;
    if (!lifecycle) throw new TypeError('Orchestration requires original Storage Host ownership');
    const library = new VersionedJsonResourceHandler({ engine });
    const runtime = new NativeModelPromptPersistence({ engine });
    const plans = new PlanRepository({
        engine,
        assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
        authorize: async ({ handle, operation }) => {
            // Owner is supplied only by the authenticated HTTP adapter. Source
            // bindings are enabled by the P3 original domain authority adapter.
            if (typeof handle !== 'string' || !handle) throw new TypeError('Authenticated owner required');
            if (operation.startsWith('bindings.')) throw Object.assign(new Error('Original source authority is not connected'), { code: 'native_orchestration_source_unavailable' });
        },
        validateDependencies: async ({ handle, dependencyPins, definition }) => {
            const evidence = [], issues = [];
            for (const capability of definition.capabilityCeiling) {
                issues.push({ code: 'native_orchestration_capability_authority_unavailable', severity: 'unknown', fieldPath: 'capabilityCeiling.' + capability });
                evidence.push({ capability, status: 'unknown' });
            }
            for (const pin of dependencyPins) {
                const ref = pin.resourceRef;
                try {
                    let value;
                    if (['context', 'model', 'narrative', 'evaluation'].includes(pin.port) && ref.scope === 'library') {
                        const normalized = assertExactResourceRef(ref);
                        if (hashNativeDocument(normalized) !== hashNativeDocument(ref)) throw new TypeError('Unexpected fields in original resource reference');
                        value = (await library.getExact(handle, normalized)).snapshot;
                    } else if (pin.port === 'model' && ref.scope === 'player') {
                        assertObject(ref, ['scope', 'runtimeRouteId'], 'routeRef');
                        value = await runtime.getRuntimeRoute(handle, ref.runtimeRouteId);
                    } else {
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
                    if (!(error instanceof TypeError) && error.name !== 'NotFoundError') throw error;
                    evidence.push({ pinId: pin.pinId, status: 'invalid' });
                    issues.push({ code: 'native_orchestration_dependency_invalid', severity: 'blocking', fieldPath: 'dependencyPins.' + pin.pinId });
                }
            }
            return { status: issues.some(issue => issue.severity === 'blocking') ? 'invalid' : issues.length ? 'unknown' : 'valid', issues, dependencyDigest: hashNativeDocument(evidence) };
        },
    });
    return { plans, hostBootId: lifecycle.hostBootId };
}
