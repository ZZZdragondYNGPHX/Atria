import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { USER_DIRECTORY_TEMPLATE } from '../constants.js';
import { FsEngine } from '../storage/engines/fs-engine.js';
import { AssetStore, PackageRepo, SessionRepo, SavePointRepo, KnowledgeRepo } from './repositories/index.js';
import { PackageInstaller, buildProjectPackage } from './package-composition.js';
import { SessionCore } from './session-core.js';
import { SharedAuthority } from './shared-authority.js';
import { fields, json } from '../../public/scripts/native/experience/ui/v2-values.js';

// A scenario runs the real installed Package and SessionCore in an ephemeral
// Host. It never imports a player's save, credentials, or external ledgers.
export function assertStudioScenario(raw = { schemaVersion: 1, steps: [] }) {
    try { return compileScenario(raw); } catch (error) { throw new TypeError(error.message); }
}
function compileScenario(raw) {
    raw = json(raw);
    fields(raw, ['schemaVersion', 'entryPointId', 'steps'], 'Studio scenario');
    if (raw.schemaVersion !== 1 || !Array.isArray(raw.steps) || raw.steps.length > 64) throw new TypeError('Scenario requires version 1 and at most 64 steps');
    const kinds = ['lifecycle', 'turn', 'task', 'proposal', 'continuity', 'realm', 'checkpoint', 'restore', 'shared.enable', 'shared.membership', 'shared.command', 'assert'];
    for (const step of raw.steps) {
        fields(step, ['kind', 'input', 'principal', 'expectError'], 'Scenario step');
        if (!kinds.includes(step.kind)) throw new TypeError('Unknown scenario step');
        if (step.principal !== undefined && (!step.kind.startsWith('shared.') || !/^[a-zA-Z0-9_-]{1,64}$/.test(step.principal))) throw new TypeError('Invalid fixture principal');
        if (step.expectError !== undefined && (typeof step.expectError !== 'string' || !step.expectError || step.expectError.length > 128)) throw new TypeError('Invalid expected error');
        if (step.kind === 'assert') {
            fields(step.input, ['path', 'equals'], 'Scenario assertion');
            if (typeof step.input.path !== 'string' || !/^(states|timeline|continuityViews|realmViews)(\.[a-zA-Z0-9_-]+)*$/.test(step.input.path)
                || step.input.path.split('.').some(key => ['__proto__', 'constructor', 'prototype'].includes(key)) || !Object.hasOwn(step.input, 'equals')) throw new TypeError('Invalid assertion path');
        }
    }
    return raw;
}

export async function runStudioArchiveScenario(archive, raw) {
    const scenario = assertStudioScenario(raw);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-scenario-'));
    const handle = 'studio';
    const directoriesByHandle = principal => {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(principal)) throw new TypeError('Invalid fixture principal');
        return Object.fromEntries(Object.entries(USER_DIRECTORY_TEMPLATE).map(([key, rel]) => [key, path.join(root, principal, rel)]));
    };
    const engine = new FsEngine({ directoriesByHandle });
    try {
        const assets = new AssetStore({ engine, directoriesByHandle });
        const packages = new PackageRepo({ engine });
        const installer = new PackageInstaller({ packageRepo: packages, assetStore: assets });
        const core = new SessionCore({ sessionRepo: new SessionRepo({ engine }), savePointRepo: new SavePointRepo({ engine }),
            packageInstaller: installer, knowledgeRepo: new KnowledgeRepo({ engine }) });
        const installed = await installer.install(handle, archive);
        const manifest = installed.manifest;
        let snapshot = await core.create(handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId,
            entryPointId: scenario.entryPointId ?? manifest.entryPoints[0].entryPointId });
        const sessionId = snapshot.session.sessionId;
        const shared = new SharedAuthority(core);
        const checkpoints = new Map(); const steps = [];
        for (const [index, step] of scenario.steps.entries()) {
            const anchor = { expectedRevisionId: snapshot.revision.revisionId };
            const invocationId = 'scenario-' + index;
            let failure = null;
            try {
                if (step.kind === 'assert') {
                    const actual = step.input.path.split('.').reduce((value, key) => value != null && Object.hasOwn(value, key) ? value[key] : undefined, snapshot);
                    if (!isDeepStrictEqual(actual, step.input.equals)) throw new TypeError('Scenario assertion mismatch at ' + step.input.path);
                } else if (step.kind === 'lifecycle') snapshot = await core.applyLifecycleCommand(handle, sessionId, { type: 'lifecycle', invocationId, action: step.input }, anchor);
                else if (step.kind === 'continuity') snapshot = await core.applyContinuityCommand(handle, sessionId, { type: 'continuity', invocationId, action: step.input }, anchor);
                else if (step.kind === 'realm') snapshot = await core.applyRealmCommand(handle, sessionId, { type: 'continuity', invocationId, action: step.input }, anchor);
                else if (step.kind === 'turn') snapshot = await core.finalizeTurn(handle, sessionId, { envelope: step.input, invocationId }, anchor);
                else if (step.kind === 'task') {
                    fields(step.input, ['taskId', 'variantId', 'payload', 'invocationId'], 'Recorded Task result');
                    let taskInvocation = step.input.invocationId ?? invocationId;
                    if (taskInvocation === '$pending') {
                        const pending = (snapshot.states.atri_lifecycle?.outbox ?? []).filter(item => item.status === 'pending' && item.taskId === step.input.taskId && item.variantId === step.input.variantId);
                        if (pending.length !== 1) throw new TypeError('Unique pending Task required');
                        taskInvocation = pending[0].invocationId;
                    }
                    snapshot = await core.recordTaskResult(handle, sessionId, { ...step.input, invocationId: taskInvocation }, anchor);
                } else if (step.kind === 'proposal') snapshot = await core.resolveTaskProposal(handle, sessionId, step.input, anchor);
                else if (step.kind === 'checkpoint') {
                    if (typeof step.input !== 'string' || checkpoints.has(step.input)) throw new TypeError('Unique checkpoint name required');
                    checkpoints.set(step.input, await core.createSavePoint(handle, sessionId));
                } else if (step.kind === 'restore') {
                    const point = checkpoints.get(step.input);
                    if (!point) throw new TypeError('Unknown checkpoint');
                    snapshot = await core.restoreSavePoint(handle, sessionId, point.saveId, anchor);
                } else if (step.kind === 'shared.enable') await shared.enable(handle, sessionId, anchor.expectedRevisionId);
                else if (step.kind.startsWith('shared.')) {
                    const principal = step.principal ?? handle;
                    const current = await shared.snapshot(handle, sessionId, principal);
                    const action = { ...step.input, expectedAccessRevisionId: current.accessRevisionId,
                        ...(step.kind === 'shared.command' ? { expectedRevisionId: snapshot.revision.revisionId, invocationId } : {}) };
                    if (action.turnId === '$current') action.turnId = current.turn?.id;
                    if (step.kind === 'shared.membership') await shared.membership(handle, sessionId, principal, action);
                    else await shared.command(handle, sessionId, principal, action);
                }
            } catch (error) { failure = error; }
            snapshot = await core.load(handle, sessionId);
            const passed = step.expectError ? Boolean(failure && (failure.code === step.expectError || failure.message.includes(step.expectError))) : !failure;
            steps.push({ index, kind: step.kind, passed, ...(failure ? { diagnostic: failure.message } : {}) });
            if (!passed) break;
        }
        return { schemaVersion: 1, status: steps.every(step => step.passed) ? 'passed' : 'failed',
            packageId: manifest.packageId, packageVersionId: manifest.packageVersionId,
            modelMode: 'recorded-or-mock', providerCalls: 0, persisted: false, steps,
            evidence: { timelineEntries: snapshot.timeline.length, logicalTime: snapshot.states.atri_lifecycle?.logicalTime ?? null } };
    } finally {
        await engine.close();
        // root is created above and never supplied by the request.
        await fs.rm(root, { recursive: true, force: true });
    }
}

export async function runStudioScenario({ handle, projectId, options, projectStore, worldRepo, knowledgeRepo, assetStore, versionedJsonResources }) {
    const scenario = assertStudioScenario(options.scenario);
    const built = await buildProjectPackage({ handle, projectId, projectStore, worldRepo, knowledgeRepo, assetStore, versionedJsonResources });
    return runStudioArchiveScenario(built.archive, scenario);
}
