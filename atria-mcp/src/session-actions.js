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
    cursor: z.strictObject({ revisionId: id, signature: z.string().max(2000), offset: z.number().int().nonnegative() }).optional() });

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
