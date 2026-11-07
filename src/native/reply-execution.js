import { AsyncLocalStorage } from 'node:async_hooks';

// Carry the reply identity through memory, tools and queued model work. It is
// not an allowance: RunControl checks it against its durable current reply.
export const replyExecution = new AsyncLocalStorage();

export function assertReplyExecution(control, handle, sessionId) {
    const scope = replyExecution.getStore();
    if (!scope || scope.handle !== handle || scope.sessionId !== sessionId) return;
    const op = Object.values(control?.operations ?? {}).find(op => op.lane === 'turn' && op.anchor.revisionId === scope.revisionId);
    if ((control?.replyExecution?.generationId ?? op?.generationId ?? null) !== scope.generationId) {
        throw Object.assign(new Error('A newer reply has started'), { code: 'native_generation_superseded' });
    }
}

export function replyExecutionMiddleware(getRuns) {
    return async (req, res, next) => {
        const source = req.body?.computeContext ?? req.body;
        const handle = req.user?.profile?.handle;
        if (!handle || !source?.sessionId || !source.revisionId || ['/play/begin', '/play/budget'].includes(req.path)) return next();
        try {
            const control = await getRuns().observe(handle, source.sessionId);
            const op = Object.values(control?.operations ?? {}).find(op => op.lane === 'turn' && op.anchor.revisionId === source.revisionId);
            const generationId = source.generationId === undefined ? control?.replyExecution?.generationId ?? op?.generationId ?? null : source.generationId;
            delete source.generationId;
            const scope = { handle, sessionId: source.sessionId, revisionId: source.revisionId, generationId };
            return replyExecution.run(scope, () => {
                assertReplyExecution(control, handle, source.sessionId);
                next();
            });
        } catch (error) {
            res.status(409).json({ error: error.code || 'native_generation_begin_failed' });
        }
    };
}
