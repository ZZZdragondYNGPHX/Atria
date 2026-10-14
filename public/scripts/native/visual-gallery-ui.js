import { formatAtriaDate } from '../atria-shell/components.js';
import { translateShellText, formatShellText } from '../atria-shell/localization.js';
import { illustrationNode as node, illustrationButton as button, illustrationSelect as select, illustrationField as field } from './illustration-ui.js';
import { mountMediaStudio } from './media-studio-ui.js';
import { nativeAssetUrl } from './session-projection.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export async function mountVisualGallery({ document: doc, parent, sdk, report, onJob }) {
    const root = node(doc, parent, 'section'); node(doc, root, 'h3', translateShellText('Current branch gallery'));
    const status = node(doc, root, 'p', translateShellText('Loading images…')); status.setAttribute('role', 'status');
    const controls = node(doc, root, 'div', undefined, 'atri-illustration-actions'), list = node(doc, root, 'div'); list.className = 'atri-visual-gallery';
    let offset = 0, nextOffset = null, editor = null, disposed = false;
    const render = async () => {
        const page = await sdk.illustrations.visual('gallery', 'query', { offset, limit: 12 }); if (disposed) return;
        nextOffset = page.nextOffset; list.replaceChildren(); status.textContent = page.total ? formatShellText('${0} versions. Results enter history first. Choose “Use this version” to change the display.', [page.total]) : translateShellText('This branch has no images yet.');
        for (const item of page.items) {
            const card = node(doc, list, 'article'), image = node(doc, card, 'img'); image.alt = item.alt; image.loading = 'lazy'; image.decoding = 'async'; image.width = 320; image.height = Math.max(1, Math.round(320 * item.height / item.width));
            image.src = '/api/native/generation/visual/gallery/thumbnail?' + new URLSearchParams({ sessionId: sdk.context.sessionId, branchId: sdk.context.branchId, imageVersionId: item.imageVersionId });
            node(doc, card, 'p', item.operation + (item.selected ? translateShellText(' · displayed') : '') + ' · ' + formatAtriaDate(item.createdAt));
            button(doc, card, translateShellText('Use this version'), async () => { try { await sdk.illustrations.visual('gallery', 'select', { imageVersionId: item.imageVersionId, expectedHead: page.head }); await render(); } catch (error) { report(error); } });
            button(doc, card, translateShellText('Open Media Studio'), async () => {
                try { if (editor && editor.root.dataset.atriaDraftDirty === 'true') { await editor.save(); if (editor.root.dataset.atriaDraftDirty === 'true') return; } editor?.dispose(); editor = await mountMediaStudio({ document: doc, parent: root, sdk, imageVersionId: item.imageVersionId, report, onJob }); } catch (error) { report(error); }
            });
            button(doc, card, translateShellText('Compare original'), () => { const full = node(doc, card, 'img'); full.src = nativeAssetUrl(item.assetId); full.alt = item.alt; full.loading = 'lazy'; full.style.maxWidth = '100%'; });
            button(doc, card, translateShellText('Hide from gallery'), async () => { try { await sdk.illustrations.visual('gallery', 'mark', { imageVersionId: item.imageVersionId, action: 'hide', expectedRevision: item.metadataRevision }); await render(); } catch (error) { report(error); } });
            const reference = node(doc, card, 'details'); node(doc, reference, 'summary', translateShellText('Use as a reference image'));
            let purpose = 'style', identity = '', standard = false;
            select(doc, reference, translateShellText('Reference purpose'), purpose, [['identity', translateShellText('Identity')], ['outfit', translateShellText('Outfit')], ['style', translateShellText('Style')], ['structure', translateShellText('Composition and structure')], ['vibe', translateShellText('Mood, if supported by target')]], value => purpose = value);
            select(doc, reference, translateShellText('Reference character'), identity, [['', translateShellText('Style or structure, without a character')], ...(item.identities ?? []).map(i => [i.id, i.name])], value => identity = value); field(doc, reference, translateShellText('Use as the stable identity reference'), standard, value => standard = value, { type: 'checkbox' });
            button(doc, reference, translateShellText('Confirm reference image'), async () => { try { await sdk.illustrations.visual('reference', 'promote', { imageVersionId: item.imageVersionId, purpose, identity, standard, allowedBranches: [sdk.context.branchId], externalConnectionIds: [] }); status.textContent = translateShellText('Reference image bound to this branch. It does not become a story fact.'); } catch (error) { report(error); } });
        }
        previous.disabled = offset === 0; more.disabled = nextOffset === null;
    };
    const previous = button(doc, controls, translateShellText('Previous page'), async () => { offset = Math.max(0, offset - 12); try { await render(); } catch (error) { report(error); } });
    const more = button(doc, controls, translateShellText('Next page'), async () => { if (nextOffset !== null) offset = nextOffset; try { await render(); } catch (error) { report(error); } });
    try { await render(); } catch (error) { status.textContent = tl('Could not load the image gallery.'); report(error); }
    return { root, refresh: render, dispose: () => { disposed = true; editor?.dispose(); root.remove(); } };
}
