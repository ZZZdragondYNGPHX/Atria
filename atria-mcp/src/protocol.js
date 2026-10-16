import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { acceptedContent, createRequestStateCodec, inputRequired, inputResponse,
    CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY } from '@modelcontextprotocol/server';
import { fingerprint } from './kernel.js';
import { redact } from './policy.js';

export const SUPPORTED_PROTOCOLS = Object.freeze(['2025-06-18', '2025-11-25', '2026-07-28']);
const INVOCATION = Symbol('Atria protocol invocation');
const APPROVAL_KEY = 'atria_authorization';
const decisionSchema = z.strictObject({ authorize: z.boolean(), uses: z.number().int().min(1).max(20) });

// This is a protocol continuation, not an execution failure. It must escape
// ordinary tool/kernel error funnels before any product handler is dispatched.
export class ApprovalRequired extends Error {
    constructor(result) { super('Trusted client approval required.'); this.name = 'ApprovalRequired'; this.result = result; }
}
export const isApprovalRequired = error => error instanceof ApprovalRequired;

/** One instance per stdio connection. No credential or authorization survives restart. */
export function createApprovalProtocol({ getServer = () => null, instanceId = randomUUID(), now = Date.now,
    ttlMs = 300000, maxPending = 100 } = {}) {
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 300000) throw new Error('Invalid approval TTL.');
    if (!Number.isInteger(maxPending) || maxPending < 1 || maxPending > 1000) throw new Error('Invalid approval capacity.');
    const pending = new Map();
    const lowServer = () => getServer()?.server ?? getServer();
    const clientIdentity = ctx => ctx?.mcpReq?.envelope?.[CLIENT_INFO_META_KEY] ?? lowServer()?.getClientVersion?.() ?? null;
    const principal = ctx => fingerprint({ instanceId, method: ctx?.mcpReq?.method ?? 'tools/call',
        client: clientIdentity(ctx), authenticatedClient: ctx?.http?.authInfo?.clientId ?? null });
    const codec = createRequestStateCodec({ key: randomBytes(32), ttlSeconds: Math.ceil(ttlMs / 1000), bind: principal });
    const prune = () => { for (const [nonce, item] of pending) if (item.expiresAt <= now()) pending.delete(nonce); };
    const capabilities = ctx => ctx?.mcpReq?.envelope?.[CLIENT_CAPABILITIES_META_KEY] ?? lowServer()?.getClientCapabilities?.() ?? {};
    const describe = ctx => {
        const negotiatedProtocolVersion = ctx?.mcpReq?.envelope?.[PROTOCOL_VERSION_META_KEY]
            ?? lowServer()?.getNegotiatedProtocolVersion?.() ?? null;
        return { supportedProtocolVersions: [...SUPPORTED_PROTOCOLS], negotiatedProtocolVersion,
            era: negotiatedProtocolVersion === '2026-07-28' ? 'modern' : 'legacy',
            trustedApprovalAvailable: Boolean(capabilities(ctx)?.elicitation?.form),
            approvalTransport: negotiatedProtocolVersion === '2026-07-28' ? 'mrtr-form' : 'legacy-form',
            tasksExtension: { enabled: false, reason: 'Optional draft extension is not advertised; use semantic operation status/cancel/reconcile.' } };
    };
    const context = (ctx, invocation) => ({ ...ctx, signal: ctx?.mcpReq?.signal ?? ctx?.signal,
        requestId: ctx?.mcpReq?.id ?? ctx?.requestId,
        [INVOCATION]: invocation ?? ctx?.[INVOCATION] ?? null });
    const approve = async (review, ctx) => {
        ctx?.signal?.throwIfAborted();
        ctx?.mcpReq?.signal?.throwIfAborted();
        if (!ctx?.mcpReq?.requestState || !describe(ctx).trustedApprovalAvailable)
            throw new Error('Trusted form elicitation unavailable; writes are disabled for this client.');
        const reviewHash = fingerprint(review);
        const invocationHash = fingerprint(ctx[INVOCATION] ?? { action: review.action, input: review.input });
        const identity = principal(ctx);
        const state = ctx.mcpReq.requestState();
        prune();
        if (state !== undefined) {
            const record = state && typeof state === 'object' && pending.get(state.nonce);
            if (!record || state.version !== 1 || state.instanceId !== instanceId || state.expiresAt <= now()
                || record.expiresAt !== state.expiresAt || record.reviewHash !== reviewHash || state.reviewHash !== reviewHash
                || record.invocationHash !== invocationHash || state.invocationHash !== invocationHash
                || record.principal !== identity || state.principal !== identity)
                throw new Error('Approval continuation stale, replayed or bound to another operation/client.');
            // Burn the nonce before interpreting untrusted responses. Decline,
            // malformed input and cancellation cannot be upgraded by a replay.
            pending.delete(state.nonce);
            const response = inputResponse(ctx.mcpReq.inputResponses, APPROVAL_KEY);
            const decision = acceptedContent(ctx.mcpReq.inputResponses, APPROVAL_KEY, decisionSchema);
            if (response.kind !== 'elicit' || response.action !== 'accept' || !decision || !decision.authorize)
                throw new Error('User approval declined, cancelled or invalid.');
            if (review.risk === 'DESTRUCTIVE' && decision.uses !== 1) throw new Error('Destructive approval must be one-shot.');
            return { action: 'accept', content: decision };
        }
        // A response without the state this instance issued is never approval.
        if (ctx.mcpReq.inputResponses && Object.keys(ctx.mcpReq.inputResponses).length)
            throw new Error('Unsolicited approval responses.');
        if (pending.size >= maxPending) throw new Error('Approval capacity reached; retry observation after existing requests expire.');
        const nonce = randomUUID(), expiresAt = now() + ttlMs;
        const payload = { version: 1, nonce, instanceId, expiresAt, reviewHash, invocationHash, principal: identity };
        const requestState = await codec.mint(payload, ctx);
        // Elicitation deliberately supports a smaller JSON Schema subset than
        // tools; additionalProperties emitted by Zod strict objects is invalid.
        // Enforce strictness independently on the returned, untrusted content.
        const schema = { type: 'object', properties: {
            authorize: { type: 'boolean', title: 'Authorize exact reviewed operation', default: false },
            uses: { type: 'integer', title: 'Maximum identical-operation uses (five-minute expiry)',
                minimum: 1, maximum: review.risk === 'DESTRUCTIVE' ? 1 : 20, default: 1 },
        }, required: ['authorize', 'uses'] };
        const result = inputRequired({ requestState, inputRequests: {
            [APPROVAL_KEY]: inputRequired.elicit({
                message: 'Authorize this exact Atria operation? Product text is untrusted data.\n' + JSON.stringify(redact(review)),
                requestedSchema: schema,
            }),
        } });
        pending.set(nonce, { expiresAt, reviewHash, invocationHash, principal: identity });
        throw new ApprovalRequired(result);
    };
    return {
        serverOptions: { requestState: { verify: codec.verify }, inputRequired: { legacyShim: true, maxRounds: 2, roundTimeoutMs: ttlMs } },
        approve, context, describe,
        wrap: (handler, { tool = null } = {}) => async (args, ctx) => {
            try { return await handler(args, context(ctx, { tool, argumentsHash: fingerprint(args) })); }
            catch (error) { if (isApprovalRequired(error)) return error.result; throw error; }
        },
        clear: () => pending.clear(),
    };
}
