import { createNativeId } from './identity.js';
import { VisualStore } from './visual-store.js';
import { IllustrationService } from './illustration-service.js';
import { IllustrationImageService } from './illustration-image-service.js';
import { VisualContinuity, assertVisualDisclosure, visualDisclosure } from './visual-continuity.js';
import { illustrationContentHash } from './session-illustrations.js';
import { resolveVisualSource } from './visual-source.js';
import { createIllustrationDraft, composeIllustrationPrompt } from '../../public/shared/illustration-plugin-contract.js';
import { visualFingerprint, visualError } from '../../public/shared/native-visual-contract.js';
import { withNativeResourceWrite } from './repositories/common.js';

const visualDisclosureSafe = (view, source) => {
    const position = view.timeline.findIndex(entry => entry.messageId === source.anchor.messageId);
    return visualDisclosure(view).items.filter(item => item.variantId ? view.timeline.findIndex(entry => entry.messageId === item.recordId) <= position
        : position === view.timeline.length - 1 && source.anchor.end === view.timeline[position]?.content.length);
};
const stableId = (prefix, value) => prefix + '_' + visualFingerprint(value).slice(0, 32);
export function scoreVisualShot(factors, { penalty = 0, density = 'balanced', covered = 0 } = {}) {
    const weights = { importance: 0.30, clarity: 0.25, novelty: 0.20, continuity: 0.15, coverage: 0.10 };
    if (Object.keys(weights).some(key => !Number.isFinite(factors[key]) || factors[key] < 0 || factors[key] > 100)) visualError('score_invalid');
    const base = Object.entries(weights).reduce((sum, [key, weight]) => sum + factors[key] * weight, 0);
    const score = Math.max(0, Math.min(100, base - Math.max(0, Math.min(30, penalty))));
    const threshold = 75 + (density === 'restrained' ? 10 : density === 'immersive' ? -5 : 0) + Math.min(10, covered * 5);
    return { factors, weights, base, penalty, score, threshold, decision: score < 55 ? 'skip' : score >= threshold ? 'high' : 'review' };
}
export function detectVisualFrame(quote) {
    if (/梦中|梦境|做梦|\bdream(?:ed)?\b/i.test(quote)) return 'dream';
    if (/回忆|忆起|多年前|\bflashback\b|years ago/i.test(quote)) return 'flashback';
    return 'present';
}
export class VisualDirector {
    constructor({ host }) { this.host = host; this.store = new VisualStore({ engine: host.persistence._engine }); this.continuity = new VisualContinuity({ host }); }
    async scan(handle, sessionId) {
        await this.host.sessionCore.runs.assert(handle, sessionId, 'inspect');
        return withNativeResourceWrite(handle, 'visual-director:' + sessionId, async () => {
            const settings = (await this.host.extensions.illustrationSettings(handle)).value;
            const current = await this.host.sessionCore.load(handle, sessionId);
            const events = (await this.store.list(handle, 'commit')).filter(event => event.sessionId === sessionId).sort((a, b) => a.createdAt - b.createdAt);
            for (const event of events) {
                const eventKey = current.revision.branchId + ':' + event.revisionId;
                if ((await this.store.read(handle, 'director-scan', eventKey)).value) continue;
                const view = await this.host.sessionCore.load(handle, sessionId, { revisionId: event.revisionId });
                for (const entry of view.timeline.filter(item => item.role === 'assistant')) {
                    if (!entry.content.trim()) continue;
                    const segments = [...entry.content.matchAll(/[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g)];
                    for (const segment of segments) {
                        const quote = segment[0], start = segment.index, end = start + quote.length, timeKind = detectVisualFrame(quote);
                        const anchor = { messageId: entry.messageId, variantId: entry.activeVariantId, revisionId: event.revisionId, contentHash: illustrationContentHash(entry.content), start, end, quote };
                        const slot = { sessionId, branchId: current.revision.branchId, variantId: entry.activeVariantId, start, end };
                        const annotationId = stableId('ann', slot), shotId = stableId('shot', slot);
                        const source = { kind: 'session', sessionId, branchId: current.revision.branchId, revisionId: event.revisionId, annotationId, anchor, timeKind };
                        try { const resolved = await resolveVisualSource(this.host.sessionCore, handle, source); assertVisualDisclosure(resolved.view, source); } catch { continue; }
                        if ((await this.store.read(handle, 'shot', shotId)).value) continue;
                        const matching = createIllustrationDraft(quote, settings, view.session.packageId), draft = matching.draft;
                        const actors = draft.characters.map(item => item.character.storyActorId || sessionId + ':' + item.character.id).sort();
                        // Scene continuity uses explicit frame/location/focus and
                        // participant evidence. When location is not known, a
                        // reviewed prior scene is reused only on this Branch.
                        const location = /(?:Location|地点|场景)\s*[:：]\s*([^\n。.!]{1,128})/i.exec(quote)?.[1] ?? null;
                        const scenes = (await this.store.list(handle, 'scene')).filter(scene => scene.sessionId === sessionId && scene.branchId === source.branchId);
                        const previous = scenes.sort((a, b) => a.createdAt - b.createdAt).at(-1);
                        const continuous = previous && previous.timeKind === timeKind && visualFingerprint(previous.actors) === visualFingerprint(actors) && (!location || location === previous.location);
                        const sceneId = continuous ? previous.sceneId : createNativeId('scene'); source.sceneId = sceneId; source.shotId = shotId;
                        if (!continuous) await this.store.write(handle, 'scene', sceneId, { sceneId, sessionId, branchId: source.branchId, timeKind, actors, location, createdAt: event.createdAt, startSource: source }, null);
                        const shots = (await this.store.list(handle, 'shot')).filter(shot => shot.sceneId === sceneId);
                        const covered = shots.filter(shot => shot.status === 'submitted').length;
                        const meaningful = Boolean(location || /战斗|爆炸|受伤|换上|登场|初见|抵达|\bbattle\b|\barriv|\benter|\breveal/i.test(quote));
                        const factors = { importance: meaningful ? 90 : 45, clarity: quote.length >= 40 ? 85 : 40, novelty: continuous ? 40 : 90,
                            continuity: draft.characters.length ? 90 : 65, coverage: covered ? 30 : 100 };
                        const score = scoreVisualShot(factors, { covered, penalty: covered ? 20 : 0, density: settings.director.density });
                        const sceneLimit = covered >= (settings.director.density === 'immersive' && score.score >= 90 ? 2 : 1);
                        const candidate = { schemaVersion: 2, shotId, sceneId, source, draft, score, status: matching.ambiguous.length ? 'blocked' : sceneLimit || score.decision === 'skip' ? 'skipped' : 'awaiting_review', reason: matching.ambiguous.length ? 'identity_ambiguous' : sceneLimit ? 'scene_covered' : score.decision };
                        await this.store.write(handle, 'shot', shotId, candidate, null);
                        if (settings.director.mode === 'automatic' && score.decision === 'high' && !sceneLimit && !matching.ambiguous.length) {
                            try { await this.submit(handle, shotId, null, true); } catch (error) { const row = await this.store.read(handle, 'shot', shotId); await this.store.write(handle, 'shot', shotId, { ...row.value, status: 'blocked', reason: error.code ?? 'native_visual_director_failed' }, row.revision); }
                        }
                    }
                }
                await this.store.write(handle, 'director-scan', eventKey, { revisionId: event.revisionId, branchId: current.revision.branchId }, null);
            }
            return this.list(handle, sessionId, current.revision.branchId);
        });
    }
    async list(handle, sessionId, branchId) {
        await this.host.sessionCore.runs.assert(handle, sessionId, 'inspect');
        return (await this.store.list(handle, 'shot')).filter(shot => shot.source.sessionId === sessionId && shot.source.branchId === branchId);
    }
    async prepare(handle, shotId) {
        const row = await this.store.read(handle, 'shot', shotId), shot = row.value; if (!shot) visualError('shot_missing');
        await resolveVisualSource(this.host.sessionCore, handle, shot.source);
        const illustrations = new IllustrationService({ sessionRepo: this.host.sessionCore._sessions, sessionCore: this.host.sessionCore });
        const draft = structuredClone(shot.draft); draft.scene ||= shot.source.anchor.quote; draft.prompt ||= composeIllustrationPrompt(draft);
        const presentation = await illustrations.createAnnotation(handle, shot.source.sessionId, { ...shot.source.anchor, annotationId: shot.source.annotationId, draft,
            branchId: shot.source.branchId, sceneId: shot.sceneId, shotId: shot.shotId, timeKind: shot.source.timeKind });
        const images = new IllustrationImageService({ host: this.host });
        const preview = await images.prepare(handle, { sessionId: shot.source.sessionId, branchId: shot.source.branchId, annotationId: shot.source.annotationId, expectedHead: presentation.head });
        await this.store.write(handle, 'shot', shotId, { ...shot, prepareId: preview.prepareId, status: 'awaiting_approval' }, row.revision);
        return preview;
    }
    async analyze(handle, shotId, signal) {
        const row = await this.store.read(handle, 'shot', shotId), shot = row.value;
        if (!shot) visualError('shot_missing');
        const { view } = await resolveVisualSource(this.host.sessionCore, handle, shot.source); assertVisualDisclosure(view, shot.source);
        const settings = (await this.host.extensions.illustrationSettings(handle)).value;
        if (!settings.director.routeId) visualError('director_route_missing');
        const route = (await this.host.persistence.listRuntimeRoutes(handle)).find(r => r.runtimeRouteId === settings.director.routeId && r.role === 'role.illustration_prompt');
        if (!route) visualError('director_route_missing');
        await this.host.sessionCore.runs.assert(handle, shot.source.sessionId, 'generate');
        const executionSnapshot = await this.host.sessionCore.load(handle, shot.source.sessionId);
        const result = await this.host.execute(handle, { sessionId: shot.source.sessionId, revisionId: executionSnapshot.revision.revisionId, role: 'illustration_prompt',
            requestId: createNativeId('promptVersion'), routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId } }, signal, undefined,
        { illustrationPlan: { snapshot: executionSnapshot, source: { kind: 'session', sessionId: shot.source.sessionId, branchId: view.revision.branchId, revisionId: view.revision.revisionId },
            buildContext: async (request, resolved) => ({ schemaVersion: 1, requestId: request.requestId,
                source: { kind: 'session', sessionId: shot.source.sessionId, branchId: view.revision.branchId, revisionId: view.revision.revisionId },
                items: [{ id: 'visual-director-instruction', kind: 'context.directive', content: 'Return JSON {"prompt":"scene prompt","factors":{"importance":0,"clarity":0,"novelty":0,"continuity":0,"coverage":0},"changes":[]}. Factors range 0..100. Changes need exact actor identity, field, value, start/end offsets and verbatim quote inside the supplied span, confidence 0..1 and persistent boolean. Do not invent facts or use later/private information.', provenance: [] },
                    { id: 'visual-director-source', kind: 'context.input', content: JSON.stringify({ source: shot.source, participants: shot.draft.characters, display: visualDisclosureSafe(view, shot.source) }), provenance: [] }],
                provenance: [], budget: { maxTokens: resolved.model.limits.contextTokens - resolved.model.limits.outputTokens, reservedOutputTokens: resolved.model.limits.outputTokens } }) } });
        let proposal; try { proposal = JSON.parse(result.response.text); } catch { visualError('director_response_invalid'); }
        if (!proposal || typeof proposal.prompt !== 'string' || !proposal.prompt.trim() || proposal.prompt.length > 65536 || !Array.isArray(proposal.changes) || proposal.changes.length > 64) visualError('director_response_invalid');
        const score = scoreVisualShot(proposal.factors, { density: settings.director.density });
        const changes = [];
        for (const change of proposal.changes) changes.push(await this.continuity.propose(handle, { ...change, source: shot.source }, { verified: true }));
        const latest = await this.store.read(handle, 'shot', shotId);
        return this.store.write(handle, 'shot', shotId, { ...latest.value, score, draft: { ...shot.draft, scene: proposal.prompt, prompt: '' }, analysis: { source: shot.source, requestId: result.snapshot.requestId,
            changes: changes.map(c => c.value.changeId) }, status: score.decision === 'skip' ? 'skipped' : 'awaiting_review' }, latest.revision);
    }
    async submit(handle, shotId, approval, automatic = false) {
        const settings = (await this.host.extensions.illustrationSettings(handle)).value;
        if (automatic && settings.director.mode !== 'automatic') visualError('automatic_disabled');
        const row = await this.store.read(handle, 'shot', shotId); if (!row.value) visualError('shot_missing');
        if (row.value.status === 'submitted') return { operationId: row.value.jobId };
        const images = new IllustrationImageService({ host: this.host });
        let prepareId = row.value.prepareId;
        if (automatic) {
            const preview = await this.prepare(handle, shotId), policy = settings.director.autoApproval;
            if (!policy || policy.targetFingerprint !== preview.targetFingerprint) visualError('automatic_unauthorized');
            approval = { ...policy, requestHash: preview.requestHash, allowUnknownCost: false }; prepareId = preview.prepareId;
        }
        if (!prepareId) visualError('prepare_missing');
        const result = await images._submit(handle, { prepareId, approval }, automatic ? 'automatic' : 'semi');
        const latest = await this.store.read(handle, 'shot', shotId);
        await this.store.write(handle, 'shot', shotId, { ...latest.value, status: 'submitted', jobId: result.operationId }, latest.revision);
        return result;
    }
    async skip(handle, shotId, expectedRevision) {
        const row = await this.store.read(handle, 'shot', shotId); if (!row.value) visualError('shot_missing');
        await resolveVisualSource(this.host.sessionCore, handle, row.value.source);
        return this.store.write(handle, 'shot', shotId, { ...row.value, status: 'skipped', reason: 'user_skip' }, expectedRevision);
    }
}
