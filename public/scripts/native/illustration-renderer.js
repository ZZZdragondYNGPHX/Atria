import { assertIllustrationState, illustrationAnchorMatches } from '../../shared/native-illustration-contract.js';
import { nativeAssetUrl } from './session-projection.js';
import { proseAnchorPoint, canonicalProseRanges } from '../../shared/native-safe-prose.js';

// Pointing at or focusing an image emphasises the passage it illustrates.
const passages = new WeakMap();
function bindPassage(root, figure, anchor) {
    passages.set(figure, { root, start: anchor.start, end: anchor.end });
    if (figure.dataset.atriaPassageBound) return;
    figure.dataset.atriaPassageBound = 'true';
    const doc = root.ownerDocument, win = doc.defaultView;
    const show = on => {
        if (!win.CSS?.highlights || !win.Highlight) return;
        const passage = passages.get(figure);
        if (on && passage) win.CSS.highlights.set('atri-illustration-active', new win.Highlight(...canonicalProseRanges(passage.root, passage.start, passage.end)));
        else win.CSS.highlights.delete('atri-illustration-active');
    };
    for (const type of ['pointerenter', 'focusin']) figure.addEventListener(type, () => show(true));
    for (const type of ['pointerleave', 'focusout']) figure.addEventListener(type, () => show(false));
}

export function renderNarrativeIllustrations(root, entry, state) {
    const existing = new Map([...root.querySelectorAll('[data-atria-illustration]')].map(node => [node.dataset.atriaIllustration, node]));
    const normalized = state ? assertIllustrationState(state) : { annotations: [], images: [] };
    const images = new Map(normalized.images.map(item => [item.imageVersionId, item]));
    const annotations = normalized.annotations.filter(item => item.deletedAt === undefined && item.anchor.messageId === entry.messageId
        && item.anchor.variantId === entry.activeVariantId && illustrationAnchorMatches(item.anchor, entry.content) && item.selectedImageVersionId)
        .sort((a, b) => a.anchor.end - b.anchor.end || a.anchor.start - b.anchor.start || a.createdAt - b.createdAt || a.annotationId.localeCompare(b.annotationId));
    const blocks = [...root.querySelectorAll('p,li,blockquote,pre,h1,h2,h3,h4,h5,h6')].filter(node => node.dataset.atriaProseEnd !== undefined);
    const tails = new Map();
    for (const annotation of annotations) {
        const image = images.get(annotation.selectedImageVersionId);
        if (!image) continue;
        const block = blocks.filter(node => Number(node.dataset.atriaProseStart) < annotation.anchor.end && Number(node.dataset.atriaProseEnd) >= annotation.anchor.end)
            .sort((a, b) => (Number(a.dataset.atriaProseEnd) - Number(a.dataset.atriaProseStart)) - (Number(b.dataset.atriaProseEnd) - Number(b.dataset.atriaProseStart)))[0];
        if (!block) continue;
        let figure = existing.get(annotation.annotationId);
        existing.delete(annotation.annotationId);
        if (!figure) {
            figure = root.ownerDocument.createElement('figure');
            figure.className = 'atria-narrative-illustration';
            figure.dataset.atriaIllustration = annotation.annotationId;
            const img = root.ownerDocument.createElement('img');
            img.loading = 'lazy'; img.decoding = 'async'; figure.append(img);
        }
        if (figure.dataset.imageVersionId !== image.imageVersionId) {
            const img = figure.querySelector('img');
            img.alt = image.alt || annotation.anchor.quote;
            img.width = image.width; img.height = image.height;
            img.src = nativeAssetUrl(image.assetId);
            figure.dataset.imageVersionId = image.imageVersionId;
        }
        // Move with text: the image follows the sentence its passage ends in; several images in one
        // paragraph stay in text order. At the block's end it follows the block (inside list items).
        const anchor = proseAnchorPoint(root, block, annotation.anchor.end);
        figure.dataset.atriaPlacement = anchor ? 'inline' : 'after';
        const tail = anchor ? (tails.get(anchor) ?? anchor) : block.tagName === 'LI'
            ? tails.get(block) ?? [...block.childNodes].filter(node => node.nodeType !== 1 || !node.dataset.atriaIllustration).at(-1)
            : tails.get(block) ?? block;
        if (tail?.nextSibling !== figure) { if (tail) tail.after(figure); else block.append(figure); }
        tails.set(anchor ?? block, figure);
        bindPassage(root, figure, annotation.anchor);
    }
    for (const figure of existing.values()) figure.remove();
}
