import { nativeProductClient as client } from './product-client.js';
import { createStudioNativeId } from './studio-authoring.js';
import { el, action, disclosure, field, feedback } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

const countText = count => `${count} ${tl(count === 1 ? 'Knowledge entry' : 'Knowledge entries')}`;

export function mountEmbeddedKnowledgePromotion({ document: doc, root, detail, binding, host }) {
    const snapshot = detail.snapshot.knowledge?.snapshots?.find(item => item.kind === 'session'
        && item.snapshot.knowledgeBase.knowledgeBaseId === binding.source.knowledgeBaseId
        && item.snapshot.revision.knowledgeRevisionId === binding.source.knowledgeRevisionId)?.snapshot;
    const row = el(doc, 'section', 'atria-native-play-drawer__row', undefined, root); row.dataset.atriaEmbeddedKnowledge = binding.knowledgeBindingId;
    const content = el(doc, 'div', 'atri-knowledge-fields', undefined, row);
    const name = snapshot?.knowledgeBase.displayName || binding.metadata?.displayName || tl('Session Knowledge');
    el(doc, 'h4', '', name, content);
    el(doc, 'p', 'atri-library-meta', tl('From this session') + ' · ' + (detail.snapshot.session.displayTitle || tl('Current story')), content);
    el(doc, 'p', '', countText(snapshot?.entries.length || 0), content);
    for (const entry of snapshot?.entries.slice(0, 3) || []) {
        if (entry.metadata?.title) el(doc, 'strong', '', entry.metadata.title, content);
        el(doc, 'p', '', entry.content.slice(0, 240) + (entry.content.length > 240 ? '…' : ''), content);
    }
    disclosure(doc, content, 'Exact source details', { sessionId: detail.snapshot.session.sessionId, revisionId: detail.snapshot.revision.revisionId, binding });
    const form = el(doc, 'div', 'atri-knowledge-fields', undefined, content); form.hidden = true;
    const targetBindingId = createStudioNativeId('kbind');
    const open = action(doc, content, 'Save to my Library', async () => {
        let destination = null;
        try { destination = await client.getKnowledge(binding.source.knowledgeBaseId); } catch (error) { if (error.status !== 404) throw error; }
        form.replaceChildren(); form.hidden = false; open.hidden = true;
        el(doc, 'h4', '', tl('Library destination'), form);
        el(doc, 'p', '', tl(destination ? 'Add this exact Knowledge revision to the existing Library resource.' : 'Create a Knowledge Base in your Library from this content.'), form);
        const title = field(doc, form, 'Knowledge Base name', destination?.knowledgeBase.displayName || name); title.required = true; title.readOnly = Boolean(destination);
        el(doc, 'p', '', tl('Your session remains unchanged. A reusable Library binding will be created.'), form);
        if (destination) el(doc, 'p', 'atri-library-meta', tl(destination.revisions.some(item => item.knowledgeRevisionId === binding.source.knowledgeRevisionId) ? 'This exact revision is already in Library; its current head stays unchanged.' : 'Saving adds this revision and makes it the Library current revision.'), form);
        const review = el(doc, 'div', '', undefined, form);
        action(doc, form, 'Cancel', () => { form.hidden = true; open.hidden = false; open.focus(); });
        const reviewButton = action(doc, form, 'Review promotion', () => {
            if (!title.value.trim()) { title.reportValidity(); return; }
            const displayName = title.value.trim(); review.replaceChildren();
            title.disabled = true;
            reviewButton.hidden = true;
            el(doc, 'h4', '', displayName, review);
            el(doc, 'p', '', countText(snapshot.entries.length) + ' · ' + tl('Library'), review);
            disclosure(doc, review, 'Exact destination details', { knowledgeBaseId: binding.source.knowledgeBaseId, knowledgeRevisionId: binding.source.knowledgeRevisionId });
            action(doc, review, 'Back to naming', () => { review.replaceChildren(); title.disabled = false; reviewButton.hidden = false; title.focus(); });
            action(doc, review, 'Confirm save to Library', async () => {
                form.inert = true;
                try {
                    const saved = await client.promoteKnowledge(detail.snapshot.session.sessionId, {
                        revisionId: detail.snapshot.revision.revisionId, knowledgeBindingId: binding.knowledgeBindingId, displayName,
                        expectedLibraryRevisionId: destination?.knowledgeBase.currentRevisionId ?? null, targetBindingId,
                    });
                    form.replaceChildren(); feedback(doc, form, tl('Saved to Library'));
                    action(doc, form, 'Open in Library', () => host?.openLibraryKnowledge(saved.knowledgeBase.knowledgeBaseId, saved.knowledgeBase.displayName));
                } finally { form.inert = false; }
            }, { primary: true });
        });
        title.focus();
    }, { disabled: !snapshot });
    if (!snapshot) feedback(doc, content, tl('This exact session Knowledge snapshot is unavailable.'), true);
    return row;
}
