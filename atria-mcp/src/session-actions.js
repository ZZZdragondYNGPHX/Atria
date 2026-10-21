import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
const revision = { sessionId: id, revisionId: id.optional() };
const query = z.strictObject({ kind: z.enum(['event', 'summary', 'fact', 'artifact', 'hook']).optional(),
    facet: z.enum(['year', 'actor', 'family', 'location', 'institution', 'case', 'claim', 'era', 'artifact']).optional(),
    value: z.union([z.string().max(256), z.number().int()]).optional(), id: z.string().max(128).optional(),
    limit: z.number().int().min(1).max(32).optional(), memory: z.boolean().optional(),
    key: z.string().min(1).max(256).optional(), tick: z.number().int().nonnegative().optional(), clockId: id.optional(),
    cursor: z.union([
        z.strictObject({ revisionId: id, signature: z.string().max(2000), offset: z.number().int().nonnegative() }),
        z.strictObject({ revisionId: id, signature: z.string().max(2000), factId: z.string().regex(/^history\.[1-9][0-9]*$/) }),
    ]).optional() });

export function registerSessionActions(registry, browser) {
    const request = (path, body, guards = {}) => requestAuthority(browser, 'POST', '/api/native/session/' + path, body, guards);
    const output = result => { const data = redact(result.data ?? null); return { ok: result.ok, status: result.status, serverBootId: result.serverBootId,
        data: JSON.stringify(data).length <= 48000 ? data : { omitted: 'Native result exceeds transport bound; narrow Chronicle page', contentHash: fingerprint(data) } }; };
    const addRead = (action, shape, path) => registry.register({ version: 1, id: action, domain: 'session', title: action, risk: 'READ',
        authority: 'Native immutable Session Revision / Chronicle / Commit Receipt', adapter: 'fixed-http', externalEffects: [], guards: [], approval: 'none',
        availability: { available: true, reason: 'Pure owner-bound exact Native observation' } }, z.strictObject(shape), z.json(), async input => output(await request(path, input)));
    addRead('session.chronicle.query', { ...revision, query: query.default({}) }, 'history/observe');
    addRead('session.chronicle.metrics', revision, 'history/metrics-observe');
    addRead('session.revision.get', { sessionId: id, revisionId: id }, 'revisions/observe');
    addRead('session.commit.receipt', { sessionId: id, commitId: z.string().min(1).max(160) }, 'commit-receipt');
    const anchor = z.strictObject({ sessionId: id, packageVersionId: id, branchId: id, revisionId: id, scopeEpochs: z.record(z.string(), z.number().int().nonnegative()) });
    addRead('session.cognition.catalog', revision, 'cognition/catalog');
    addRead('session.cognition.display', { ...revision, expectedAnchor: anchor.optional() }, 'cognition/display');
    addRead('session.cognition.inspect', { ...revision, viewId: id, expectedAnchor: anchor.optional() }, 'cognition/inspect');
    addRead('session.hypothetical.current', { sessionId: id, artifact: z.record(z.string(), z.json()) }, 'hypothetical/current');
    addRead('session.lifecycle.commands', { sessionId: id }, 'lifecycle/commands');
    const appAction = z.strictObject({ kind: z.literal('app.command'), domainId: id, recordId: id, commandId: id, args: z.json() });
    const snapshotGuard = async input => {
        const r = await request('observe', { sessionId: input.sessionId });
        if (!r.ok || !r.serverBootId || r.data.revision.revisionId !== (input.expectedRevisionId ?? input.revisionId)) throw Error('Session source revision conflict');
        return { target: { sessionId: input.sessionId }, serverBootId: r.serverBootId, revisionId: r.data.revision.revisionId, branchId: r.data.revision.branchId };
    };
    const add = (action, risk, shape, path, body, effects, guard = snapshotGuard) => registry.register({ version: 1, id: action, domain: 'session', title: action,
        risk, authority: 'Original Session Lifecycle / Information / private hypothetical candidate', adapter: 'fixed-http', externalEffects: effects,
        guards: ['exact-Session-revision-and-declared-command', 'original-publication-and-personal-memory-guards'], approval: 'trusted-approval-required',
        availability: { available: true, reason: 'No raw namespace or acquired Memory CRUD; run-mode direct commands remain denied' } },
    z.strictObject(shape).refine(i => JSON.stringify(i).length <= 65536, 'Session request exceeds native bound'), z.json(), async (i, { before }) => output(await request(path, body(i), before)), guard);
    add('session.hypothetical.prepare', 'INTERACT', { sessionId: id, revisionId: id,
        request: z.strictObject({ kind: z.enum(['transaction', 'clock.advance']), viewId: id, anchor, transactionId: id.optional(), input: z.json().optional(), commandId: id.optional(), ticks: z.number().int().positive().optional() }) },
    'hypothetical/prepare', i => i, ['bounded-local-declared-rules-and-QuickJS-computation', 'private-candidate-discarded', 'no-Provider-or-Session-publication']);
    add('session.lifecycle.preflight', 'INTERACT', { sessionId: id, expectedRevisionId: id, action: appAction }, 'lifecycle/preflight', i => i,
        ['bounded-local-declared-command-computation', 'no-Session-publication']);
    add('session.lifecycle.command', 'MUTATE', { sessionId: id, expectedRevisionId: id, invocationId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/), action: appAction },
        'command', i => ({ sessionId: i.sessionId, expectedRevisionId: i.expectedRevisionId, command: { type: 'lifecycle', invocationId: i.invocationId, action: i.action } }),
        ['publish-exact-declared-App-command-through-original-Lifecycle', 'original-declared-event-and-outbox-effects', 'preserve-acquired-content-and-protected-Memory-policy'],
        async i => {
            const frame = await snapshotGuard(i), r = await request('lifecycle/commands', { sessionId: i.sessionId });
            if (!r.ok || r.serverBootId !== frame.serverBootId || r.data.revisionId !== i.expectedRevisionId || !r.data.directAllowed
                || !r.data.commands.some(command => command.domainId === i.action.domainId && command.commandId === i.action.commandId && command.scopeActive)) throw Error('Declared direct App Command unavailable; use the original run Authority Action/Task');
            return { ...frame, command: i.action, commandCatalogueHash: fingerprint(r.data) };
        });
    registry.register({ version: 1, id: 'session.maintenance.collect', domain: 'session', title: 'Native Session retained-history maintenance', risk: 'DESTRUCTIVE',
        authority: 'Original Native Session maintenance scheduler, reachability proof, read leases and quarantine', adapter: 'fixed-http',
        externalEffects: ['delete-only-unreachable-quarantined-session-records', 'native-storage-checkpoint'],
        guards: ['current-server-boot', 'exact-session-head', 'native-run-lock-cas', 'native-reachability-and-read-lease-proof', 'one-use-destructive-approval'],
        approval: 'trusted-approval-required', availability: { available: true, reason: 'Fixed Native bounded maintenance slice; default quarantine and retention remain authoritative' } },
    z.strictObject({ sessionId: id, expectedRevisionId: id }), z.json(), async (input, { before }) => ({ ...output(await request('maintenance/checked', input, before)),
        receiptEvidence: { recovery: 'Read exact Session/Revision and maintenance status. Never automatically replay an unknown collection; referenced history is retained by Native authority.' } }),
    async input => {
        if ((await browser.runtimeIdentity())?.mutationGuards !== 1) throw new Error('Product mutation guards unavailable.');
        const result = await request('observe', { sessionId: input.sessionId });
        if (!result.ok || !result.serverBootId || result.data.revision?.revisionId !== input.expectedRevisionId) throw new Error('Native maintenance Session HEAD conflict.');
        return { target: { sessionId: input.sessionId }, serverBootId: result.serverBootId, expectedRevisionId: input.expectedRevisionId,
            branchId: result.data.revision.branchId, retention: 'Original SavePoint/Branch/HEAD reachability and active read leases; fixed 60s quarantine' };
    });
    return registry;
}
