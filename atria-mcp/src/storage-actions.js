import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';
import { jsonTextFragment } from './json-fragment.js';

const target = z.strictObject({ type: z.string().regex(/^[a-z][a-z-]{0,63}$/), id: z.string().min(1).max(512),
    resourceType: z.string().regex(/^core\.[a-z-]+$/).optional(), revision: z.string().min(1).max(256).optional() });
const page = { outputOffset: z.number().int().nonnegative().default(0), outputLimit: z.number().int().min(100).max(64000).default(24000) };

export function registerStorageActions(registry, browser) {
    const call = (operation, body = {}, guards = {}) => requestAuthority(browser, 'POST', '/api/users/storage/center/' + operation, body, guards);
    const read = async (operation, body) => {
        const r = await call(operation, body);
        if (!r.ok || !r.serverBootId) throw Error('Storage Center authority unavailable: ' + r.status);
        return r;
    };
    const add = (suffix, risk, shape, handler, guard = null, effects = []) => registry.register({ version: 1, id: 'storage.' + suffix,
        domain: 'storage', title: 'Storage Center ' + suffix, risk, authority: 'Original ResourceCenterService / NativeRecoveryService', adapter: 'fixed-http', externalEffects: effects,
        guards: risk === 'READ' ? [] : ['owning-server-boot', 'exact-target-or-preview-task', 'original-dependency-and-running-resource-checks'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Fixed Center workflow; raw storage writes and deletes are unavailable' } },
    z.strictObject({ ...shape, ...page }), z.json(), async (i, c) => {
        const r = await handler(i, c), data = redact(r.data), serialized = JSON.stringify(data);
        return { ...r, data: i.outputOffset === 0 && serialized.length <= i.outputLimit ? data : jsonTextFragment(serialized, i.outputOffset, i.outputLimit),
            page: { offset: i.outputOffset, totalChars: serialized.length, contentHash: fingerprint(data), nextOffset: i.outputOffset + i.outputLimit < serialized.length ? i.outputOffset + i.outputLimit : null },
            lifecycle: 'Trash retains recovery for 30 days. Explicit purge may occur before expiry. Restore preserves identity and pauses external effects; Extensions remain disabled.',
            recovery: 'Inspect original task and object state. failed/stopped/paused-review require a new preview. Unknown execute is never automatically replayed.' };
    }, guard);
    add('snapshot', 'READ', {}, () => call('snapshot'));
    add('detail', 'READ', { target }, i => call('detail', { target: i.target }));
    add('tasks', 'READ', {}, () => call('tasks'));
    add('task', 'READ', { id: z.string().uuid() }, i => call('task', { id: i.id }));
    for (const action of ['trash', 'restore', 'purge', 'clean', 'repair', 'history']) {
        add(action + '.preview', 'MUTATE', { targets: z.array(target).min(1).max(100) }, (i, { before }) => call('preview', { action, targets: i.targets }, before),
            async i => {
                const boot = await browser.runtimeIdentity();
                if (!boot?.serverBootId || boot.mutationGuards !== 1) throw Error('Storage mutation guards unavailable');
                return { target: { storageAction: action, targets: i.targets }, serverBootId: boot.serverBootId,
                    preparation: 'Creates persistent preview task only; execute requires separate exact approval.' };
            }, ['persist-storage-preview-task', 'no-business-execute']);
        const risk = ['purge', 'clean', 'repair'].includes(action) ? 'DESTRUCTIVE' : 'MUTATE';
        add(action + '.execute', risk, { id: z.string().uuid(), expectedTaskFingerprint: z.string().regex(/^[a-f0-9]{64}$/) },
            async (i, c) => {
                await c.track({ productOperationId: i.id, productOperationKind: 'storage' });
                return call('execute', { id: i.id }, c.before);
            }, async i => {
                const r = await read('task', { id: i.id });
                if (r.data.action !== action || r.data.status !== 'preview' || r.data.stopRequested || fingerprint(r.data) !== i.expectedTaskFingerprint)
                    throw Error('Exact unexecuted Storage preview required; obtain a new preview after failed/stopped/paused-review.');
                return { target: { operationId: i.id, action }, serverBootId: r.serverBootId, taskFingerprint: i.expectedTaskFingerprint,
                    consequences: r.data.items.map(item => ({ target: item.target, version: item.version, status: item.status, reason: item.reason, consequences: item.consequences, resumePhase: item.resumePhase ?? null })) };
            }, action === 'purge' || action === 'clean' ? ['permanently-delete-only-originally-eligible-content', 'irreversible'] : action === 'repair'
                ? ['resume-original-paused-Project-or-backup-recovery', 'may-continue-permanent-purge'] : [action === 'trash' ? 'move-original-business-objects-to-recovery' : action === 'restore' ? 'restore-same-business-identity-with-external-effects-paused' : 'publish-validated-local-Git-history', 'retain-task-progress-and-partial-results']);
    }
    add('stop', 'INTERACT', { id: z.string().uuid() }, (i, { before }) => call('stop', { id: i.id }, before), async i => {
        const r = await read('task', { id: i.id });
        return { target: { operationId: i.id }, serverBootId: r.serverBootId, action: r.data.action };
    }, ['persist-stop-request', 'stop-at-object-boundary', 'does-not-undo-processed-objects']);
    return registry;
}
