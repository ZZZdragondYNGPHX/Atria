import { fields, text } from './native-values.js';
import { contentSha256 } from './content-sha256.js';

export function assertTimelineParticipant(value) {
    fields(value, ['kind', 'subjectId', 'displayName', 'expressionActorId', 'authorityId'], 'Timeline Participant');
    if (value.kind !== 'speaker' || !/^sub_[a-f0-9]{32}$/.test(value.subjectId)
        || !/^at:[a-f0-9]{64}$/.test(value.authorityId) || !text(value.displayName, 256).trim()
        || value.expressionActorId !== undefined && !/^actor_[a-f0-9]{32}$/.test(value.expressionActorId)) throw new TypeError('Invalid committed Participant');
    return Object.freeze({ ...value });
}

/** A per-message public handle never discloses a canonical identity/alias map. */
export function publicParticipant(entry) {
    if (!entry.participant) return { participantId: '', displayName: '', kind: '' };
    const value = assertTimelineParticipant(entry.participant);
    return { participantId: 'participant.' + contentSha256(entry.messageId).slice(0, 32), displayName: value.displayName, kind: value.kind };
}
