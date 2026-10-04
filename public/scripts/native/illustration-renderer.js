import { assertIllustrationState, illustrationAnchorMatches } from '../../shared/native-illustration-contract.js';
import { nativeAssetUrl } from './session-projection.js';

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
        if (block.tagName === 'LI') {
            const tail = tails.get(block) ?? [...block.childNodes].filter(node => node.nodeType !== 1 || !node.dataset.atriaIllustration).at(-1);
            if (tail?.nextSibling !== figure) { if (tail) tail.after(figure); else block.append(figure); }
            tails.set(block, figure);
        } else {
            const tail = tails.get(block) ?? block;
            if (tail.nextSibling !== figure) tail.after(figure);
            tails.set(block, figure);
        }
    }
    for (const figure of existing.values()) figure.remove();
}
