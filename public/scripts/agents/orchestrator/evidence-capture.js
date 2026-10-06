import { createEvidenceTrace } from '../../../shared/agent-evidence-trace.js';
import { sourceMessageId, sourceContent } from '../memory/source-provenance.js';

/** Freeze the target before the first async IO. Never resolve a later active chat. */
export function createRpEvidenceCapture(context, rootRunId, post = async (action, value) => {
    const response = await fetch('/api/native/generation/evidence/' + action, {
        method: 'POST', headers: { ...context.getRequestHeaders?.(), 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    if (!response.ok) throw new Error('Evidence transport failed');
    return response.json();
}) {
    const messages = context.chat || [];
    const floor = messages.findLastIndex(message => message.is_user && sourceMessageId(message));
    const sessionId = messages[floor]?.atri_native?.sessionId;
    const scope = sessionId ? { domain: 'rp_session', sessionId } : {
        domain: 'rp_chat', charDir: context.groupId ? '' : String(context.characters?.[context.characterId]?.avatar || '').replace(/\.png$/, ''),
        name: String(context.chatId || context.getCurrentChatId?.() || ''), isGroup: Boolean(context.groupId), groupId: String(context.groupId || ''),
    };
    const selectors = floor < 0 ? [] : [{ kind: 'message', messageId: sourceMessageId(messages[floor]), ...(sessionId ? {} : { floor }) }];
    const trace = createEvidenceTrace();
    let sequence = 0, receipt = null, failure = false, status = 'capturing', output = null, outputValue = null;
    let count = 0, outputReady = false;
    let queue = Promise.resolve().then(() => post('begin', { scope, rootRunId, selectors })).then(value => { receipt = value; }).catch(() => { failure = true; });
    const view = () => ({ status: failure ? 'failed' : receipt ? status : 'pending', evidenceId: receipt?.evidenceId ?? null,
        missing: trace.snapshot().missing, usage: null, outputBound: Boolean(output) });
    const capture = {
        append(event) {
            trace.append(event);
            if (++count % 16 === 0) void capture.flush(status);
        },
        bindMessage(message, floor) {
            if (scope.domain !== 'rp_chat' || !sourceMessageId(message) || message.is_user) return;
            outputValue = { selector: { kind: 'message', messageId: sourceMessageId(message), floor },
                anchor: { variantId: message.swipe_id ?? 0 }, value: { sourceContent: sourceContent(message) } };
            if (outputReady) void capture.flush(status, true);
        },
        snapshot: () => trace.snapshot(),
        view,
        async flushOutput() { outputReady = true; return capture.flush(status, true); },
        async flush(terminal = 'capturing', includeOutput = false) {
            status = terminal;
            const pendingSequence = ++sequence, snapshot = trace.snapshot(), bound = includeOutput && outputValue && structuredClone(outputValue);
            queue = queue.then(async () => {
                if (failure || !receipt) return;
                try {
                    let target = null;
                    if (bound) {
                        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(bound.value)));
                        target = { selector: bound.selector, anchor: bound.anchor,
                            contentHash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') };
                    }
                    const result = await post('update', { evidenceId: receipt.evidenceId, sequence: pendingSequence, status: terminal, trace: snapshot, output: target });
                    output = result.outputBound;
                } catch { failure = true; }
            });
            await queue;
            return view();
        },
    };
    return capture;
}
