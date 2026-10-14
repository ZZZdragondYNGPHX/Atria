import { informationContext } from '../../public/shared/native-information-runtime.js';
import { visualObject, visualError, visualFingerprint, visualText } from '../../public/shared/native-visual-contract.js';
import { resolveVisualSource } from './visual-source.js';
import { VisualStore } from './visual-store.js';
import { createNativeId } from './identity.js';

export function visualDisclosure(view) {
    const info = informationContext(view, { kind: 'narrator' }, undefined, { includeRollups: false });
    return info ? { defined: true, items: info.disclosure?.items ?? [] } : { defined: false, items: [] };
}
export function assertVisualDisclosure(view, source) {
    const disclosure = visualDisclosure(view);
    if (disclosure.defined && !disclosure.items.some(item => item.recordId === source.anchor.messageId && item.variantId === source.anchor.variantId)) visualError('disclosure_denied');
    return disclosure;
}
// State is a source-bound projection, never an independently writable World.
export class VisualContinuity {
    constructor({ host }) { this.host = host; this.store = new VisualStore({ engine: host.persistence._engine }); }
    async project(handle, source, draft) {
        const { view, entry } = await resolveVisualSource(this.host.sessionCore, handle, source);
        const disclosure = assertVisualDisclosure(view, source), conflicts = [], participants = [];
        const changes = await this.store.list(handle, 'state-change');
        for (const item of draft.characters) {
            const character = item.character;
            const actor = character.storyActorId && view.manifest.actors.find(a => a.actorId === character.storyActorId);
            if (character.storyActorId && (!actor || !view.entryPoint.actorIds.includes(actor.actorId))) visualError('actor_unavailable');
            const identity = actor ? { actorId: actor.actorId } : { provisionalId: source.sessionId + ':' + character.id };
            const facts = {};
            // Final revision state cannot be back-projected onto an earlier
            // span of a multi-moment message. Read only independently displayed
            // fields, and only at the final committed moment.
            if (source.timeKind === 'present' && source.anchor.end === entry.content.length && view.timeline.at(-1)?.messageId === entry.messageId) {
                for (const record of disclosure.items.filter(r => r.semantic === 'truth')) {
                    if (actor && (record.data.actorId === actor.actorId || record.actorId === actor.actorId)) for (const field of ['clothing', 'injury', 'equipment', 'hairstyle']) {
                        if (typeof record.data[field] === 'string') facts[field] = { value: record.data[field], evidence: record.id, kind: 'displayed_world' };
                    }
                }
            }
            for (const change of changes.filter(c => c.sessionId === source.sessionId && c.identity === (actor?.actorId ?? identity.provisionalId) && c.timeKind === source.timeKind && c.status === 'accepted')) {
                try {
                    await resolveVisualSource(this.host.sessionCore, handle, { ...change.source, branchId: source.branchId });
                    const position = view.timeline.findIndex(e => e.messageId === change.source.anchor.messageId && e.activeVariantId === change.source.anchor.variantId);
                    const selectedPosition = view.timeline.findIndex(e => e.messageId === entry.messageId);
                    if (position < 0 || position > selectedPosition || position === selectedPosition && change.end > source.anchor.end || !change.persistent && (position !== selectedPosition || change.end < source.anchor.start)) continue;
                    const prior = facts[change.field];
                    if (prior?.kind === 'displayed_world' && prior.value !== change.value) { conflicts.push({ identity, field: change.field, formal: prior.value, narrative: change.value, source: change.source }); continue; }
                    facts[change.field] = { value: change.value, kind: 'anchored_narrative', evidence: change.changeId };
                } catch { /* Unreachable sibling/withdrawn source is never used. */ }
            }
            const clothing = facts.clothing?.value ?? item.clothing;
            if (facts.clothing && item.clothing && item.clothing !== facts.clothing.value) conflicts.push({ identity, field: 'clothing', formal: facts.clothing.value, authored: item.clothing });
            participants.push({ ...identity, identity: character.fixedPrompt, state: [clothing, item.dynamicPrompt, ...Object.entries(facts).filter(([field]) => field !== 'clothing').map(([, fact]) => fact.value)].filter(Boolean).join(', '),
                evidence: { source, actorDefinition: actor ? { packageVersionId: view.session.packageVersionId, actorId: actor.actorId } : null, facts, authoredVisualPreference: true } });
        }
        return { source, participants, conflicts, disclosure: { defined: disclosure.defined, itemIds: disclosure.items.map(item => item.id) }, fingerprint: visualFingerprint({ source, participants, conflicts }) };
    }
    async propose(handle, input, { verified = false } = {}) {
        visualObject(input, ['source', 'identity', 'field', 'value', 'start', 'end', 'quote', 'confidence', 'persistent']);
        const { view, entry } = await resolveVisualSource(this.host.sessionCore, handle, input.source); assertVisualDisclosure(view, input.source);
        if (!['clothing', 'injury', 'equipment', 'hairstyle', 'expression', 'pose'].includes(input.field) || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1
            || !Number.isInteger(input.start) || !Number.isInteger(input.end) || input.start < 0 || input.end <= input.start || input.end > input.source.anchor.end
            || entry.content.slice(input.start, input.end) !== input.quote || typeof input.persistent !== 'boolean') visualError('state_evidence_invalid');
        visualText(input.value, 4096); visualText(input.quote, 4096);
        if (!view.manifest.actors.some(a => a.actorId === input.identity) && !input.identity.startsWith(input.source.sessionId + ':')) visualError('identity_invalid');
        const changeId = createNativeId('visualIntent'), value = { ...input, changeId, sourceHash: visualFingerprint(input.source), sessionId: input.source.sessionId, timeKind: input.source.timeKind,
            status: verified && input.confidence >= 0.95 ? 'accepted' : 'awaiting_review' };
        return this.store.write(handle, 'state-change', changeId, value, null);
    }
    async references(handle, source, identity, purposes) {
        const { view } = await resolveVisualSource(this.host.sessionCore, handle, source); assertVisualDisclosure(view, source);
        const refs = await this.store.list(handle, 'reference'), selected = [], excluded = [];
        for (const ref of refs) {
            let reason = null;
            if (ref.revoked || ref.sessionId !== source.sessionId || ref.identity !== identity || !purposes.includes(ref.purpose)) reason = 'scope_or_purpose';
            else if (ref.source.branchId !== source.branchId && !(ref.standard && ref.purpose === 'identity' && ref.allowedBranches.includes(source.branchId))) reason = 'branch';
            else {
                try { await resolveVisualSource(this.host.sessionCore, handle, { ...ref.source, branchId: source.branchId }); } catch { reason = 'unreachable'; }
            }
            (reason ? excluded : selected).push(reason ? { referenceId: ref.referenceId, reason } : ref);
        }
        return { selected, excluded };
    }
}
