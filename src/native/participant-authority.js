import { assertTimelineParticipant } from '../../public/shared/native-participant.js';
import { SUBJECT_NAMESPACE } from '../../public/shared/native-subject-contract.js';
import { text } from '../../public/shared/native-values.js';
import { actorAvailability } from '../../public/shared/native-information-runtime.js';

const speechDrafts = new WeakSet();
export function prepareSpeechDraft(candidate, { subjectId, displayName, content }, authorityId) {
    const subject = candidate.states[SUBJECT_NAMESPACE]?.subjects.find(subject => subject.subjectId === subjectId && subject.kind === 'person');
    if (!subject || !text(content, 2048).trim()) throw new TypeError('Speech requires an admitted person and nonempty text');
    if (subject.perspective && !actorAvailability(candidate, subjectId).available) throw new TypeError('Speaker scope is unavailable');
    const participant = assertTimelineParticipant({ kind: 'speaker', subjectId, displayName, authorityId,
        ...(subject.actorId ? { expressionActorId: subject.actorId } : {}) });
    const draft = { role: 'assistant', content, participant }; speechDrafts.add(draft); return draft;
}
export function assertSpeechDraft(draft) {
    if (draft.participant && !speechDrafts.has(draft)) throw new TypeError('Participant speech requires its original Authority publication');
}
export function validateParticipants(snapshot) {
    for (const entry of snapshot.timeline) if (entry.participant) {
        const participant = assertTimelineParticipant(entry.participant);
        if (entry.role !== 'assistant' || !snapshot.states[SUBJECT_NAMESPACE]?.subjects.some(subject => subject.subjectId === participant.subjectId && subject.kind === 'person')
            || participant.expressionActorId && !snapshot.manifest.actors.some(actor => actor.actorId === participant.expressionActorId)) throw new TypeError('Participant source unavailable in selected Revision');
    }
}
