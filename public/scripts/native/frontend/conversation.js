import { projectConversation, projectSession, projectMessageBlocks } from '../../../shared/native-frontend-host.js';
import { bridgeFailure } from '../../../shared/native-frontend-bridge.js';

// Host adapter over the one existing Session runtime and generation entrypoint.
// No Timeline writes, alternate scheduler, or durable state lives here.
export function createHeadlessConversation({ runtime, composer, generate, stop, actions = {} }) {
    const current = () => typeof runtime === 'function' ? runtime() : runtime;
    const guard = revision => {
        const value = current();
        if (!value?.active || value.snapshot.revision.revisionId !== revision) throw bridgeFailure('bridge_revision_stale');
        return value;
    };
    return Object.freeze({
        messages: () => current()?.snapshot ? projectConversation(current().snapshot) : [],
        blocks: type => current()?.snapshot ? projectMessageBlocks(current().snapshot, type) : [],
        generation: () => ({ ...(current()?.generationProjection ?? { state: 'idle', text: '', error: '' }) }),
        async invoke(target, input, revision) {
            const value = guard(revision), key = target.service + '.' + target.method;
            const draft = () => { if (!composer) throw bridgeFailure('bridge_host_unavailable'); return composer; };
            if (key === 'host.conversation.generation') return this.generation();
            if (key === 'host.session.diagnostics') return { ...projectSession(value.snapshot), failed: Boolean(value.failed), historical: Boolean(value.history) };
            if (key === 'host.composer.get') return { text: draft().getDraft() };
            if (key === 'host.composer.set') { draft().setDraft(input.text); return {}; }
            if (key === 'host.composer.append') { draft().appendDraft(input.text); return {}; }
            if (key === 'host.composer.clear') { draft().clearDraft(); return {}; }
            if (key === 'host.composer.focus') { draft().focus(); return {}; }
            if (key === 'host.conversation.cancel') { if (!stop) throw bridgeFailure('bridge_host_unavailable'); stop(); return {}; }
            if (key === 'host.composer.submit') { if (value.failed || value.history) throw bridgeFailure('bridge_session_readonly'); value.assertWritable?.(); await draft().submit({ revision }); return {}; }
            if (key === 'host.conversation.regenerate') {
                if (value.failed || value.history) throw bridgeFailure('bridge_session_readonly'); value.assertWritable?.();
                if (value.snapshot.timeline.at(-1)?.messageId !== input.messageId || value.snapshot.timeline.at(-1)?.role !== 'assistant') throw bridgeFailure('bridge_target_invalid');
                if (!generate) throw bridgeFailure('bridge_host_unavailable');
                await generate('regenerate'); return {};
            }
            if (['host.session.reload', 'host.session.recover'].includes(key)) { await value.reload(); return {}; }
            if (key === 'host.session.exit') { if (!actions.exitExperience) throw bridgeFailure('bridge_host_unavailable'); await actions.exitExperience(); return {}; }
            if (key === 'host.session.restart') {
                // Restart is deliberately policy denied unless the Host supplies
                // an explicit confirmation/entry restart handler.
                if (!actions.restart) throw bridgeFailure('bridge_policy_denied');
                if (!await actions.confirmRestart?.()) throw bridgeFailure('bridge_policy_denied');
                guard(revision); await actions.restart({ revision }); return {};
            }
            throw bridgeFailure('bridge_method_denied');
        },
    });
}
