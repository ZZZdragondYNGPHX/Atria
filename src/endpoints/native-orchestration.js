import express from 'express';
import { getStorageEngine } from '../storage/index.js';
import { createOrchestrationAuthoringService } from '../native/orchestration/authoring-service.js';
import { validationDigest } from '../native/orchestration/plan-repository.js';
import { assertObject } from '../../public/shared/native-orchestration-contracts.js';
import { getNativeSessionServices } from './native-session.js';
import { getNativeStudioServices } from './native-studio.js';
import { RpRunControl } from '../native/rp-run-control.js';
import { getNativeGenerationHost } from './native-generation.js';
import { RouteResolver } from '../native/model-prompt-runtime/route-resolver.js';
import { RunObservationService } from '../native/orchestration/run-observation-service.js';
import { getNativeReviewOrigin } from '../native/orchestration/review-origin.js';

const observationServices = new WeakMap();
const services = () => {
    const engine = getStorageEngine(), { core } = getNativeSessionServices(), { studio, agent } = getNativeStudioServices();
    const host = getNativeGenerationHost();
    const modelResolver = new RouteResolver({ persistence: host.persistence, library: host.library, providers: host.providers });
    const sources = { sessionCore: core, studio, projectAgent: agent, rpControl: new RpRunControl({ engine }), modelResolver };
    const review = getNativeReviewOrigin(engine);
    let observations = observationServices.get(engine);
    if (!observations || observations.hostBootId !== engine.nativeHostLifecycle.hostBootId) {
        observations = new RunObservationService({ engine, ...sources, review: review.authority }); observationServices.set(engine, observations);
    }
    return { ...createOrchestrationAuthoringService(engine, sources), observations, review };
};

/** Original app auth + CSRF middleware precedes this Native namespace. */
export function createNativeOrchestrationRouter(getServices = services) {
    const router = express.Router();
    router.use((request, response, next) => {
        response.set('Cache-Control', 'private, no-store');
        if (!request.user?.profile?.handle || request.user.profile.enabled === false) return response.sendStatus(401);
        next();
    });
    const route = (mutation, operation, serviceName = 'plans') => async (request, response) => {
        const controller = new AbortController(), disconnected = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', disconnected);
        try {
            const service = getServices(), input = request.body;
            assertObject(input, mutation ? ['schemaVersion', 'commandId', 'expectedHostBootId', 'body'] : ['schemaVersion', 'body'], 'request');
            if (input.schemaVersion !== 1) throw new TypeError('Unsupported orchestration schema version');
            if (mutation && (input.expectedHostBootId !== service.hostBootId || request.get('X-Atria-Host-Boot-Id') !== service.hostBootId)) {
                return response.status(409).json({ schemaVersion: 1, hostBootId: service.hostBootId, error: 'native_orchestration_host_changed' });
            }
            const outcome = await operation(service[serviceName], request.user.profile.handle, input, { signal: controller.signal, response });
            if (!controller.signal.aborted) response.json({ schemaVersion: 1, hostBootId: service.hostBootId, ...(mutation ? { commandId: input.commandId } : {}), outcome });
        } catch (error) {
            if (controller.signal.aborted) return;
            const status = error.code === 'storage_read_only' || error.code === 'native_orchestration_writer_unavailable' || error.code?.endsWith('_unavailable') ? 503
                : error.code === 'storage_commit_unknown' || error.name === 'ConflictError' ? 409
                    : error.name === 'NotFoundError' ? 404 : error instanceof TypeError ? 400 : 500;
            response.status(status).json({ schemaVersion: 1, error: error.code ?? (status === 400 ? 'native_orchestration_invalid_command' : 'native_orchestration_failed') });
        } finally { response.off('close', disconnected); }
    };
    router.post('/plans/list', route(false, (plans, handle, input) => {
        assertObject(input.body, ['cursor', 'limit'], 'list');
        return plans.list(handle, input.body);
    }));
    router.post('/plans/get', route(false, (plans, handle, input) => {
        assertObject(input.body, ['planId'], 'get');
        return plans.get(handle, input.body.planId);
    }));
    router.post('/plans/revisions', route(false, (plans, handle, input) => {
        assertObject(input.body, ['planId', 'cursor', 'limit'], 'revisions');
        return plans.listRevisions(handle, input.body.planId, input.body);
    }));
    router.post('/plans/validate', route(false, async (plans, handle, input, { response }) => {
        assertObject(input.body, ['planId', 'expectedDraftVersion', 'expectedDefinitionHash'], 'validate');
        const report = await plans.validate(handle, input.body);
        response.set('X-Atria-Validation-Digest', validationDigest(report)); return report;
    }));
    router.post('/plans/revision', route(false, (plans, handle, input) => {
        assertObject(input.body, ['planRef'], 'revision'); return plans.getRevision(handle, input.body.planRef);
    }));
    router.post('/dependencies/inspect', route(false, (dependencies, handle, input) => dependencies.inspect(handle, input.body), 'dependencies'));
    for (const method of ['create', 'save', 'publish']) router.post('/plans/' + method, route(true, (plans, handle, input) => plans[method](handle, input.commandId, input.body)));
    router.post('/bindings/get', route(false, (plans, handle, input) => {
        assertObject(input.body, ['sourceSelector'], 'getBinding');
        return plans.getBinding(handle, input.body.sourceSelector);
    }));
    router.post('/bindings/save', route(true, (plans, handle, input) => plans.saveBinding(handle, input.commandId, input.body)));
    for (const method of ['list', 'observe', 'details', 'diagnostics']) router.post('/runs/' + method,
        route(false, (observations, handle, input, options) => observations[method](handle, input.body, options), 'observations'));
    router.post('/runs/cancel', route(true, (observations, handle, input) => observations.cancel(handle, input.commandId, input.body), 'observations'));
    router.post('/approvals/launch', (request, response, next) => {
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) return response.sendStatus(503);
        next();
    }, route(true, (review, handle, input) => review.launch(handle, input.body), 'review'));
    // No generic method dispatch, direct GraphPatch/Effect endpoint or approve
    // route. Admission uses the original reviewed domain endpoints.
    return router;
}

export const router = createNativeOrchestrationRouter();
