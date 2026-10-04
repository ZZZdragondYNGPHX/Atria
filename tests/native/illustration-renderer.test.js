/** @jest-environment jsdom */
import { createNativeId } from '../../src/native/identity.js';
import { compileSafeProse, renderSafeProse, canonicalProseSelection } from '../../public/shared/native-safe-prose.js';
import { renderNarrativeIllustrations } from '../../public/scripts/native/illustration-renderer.js';
import { illustrationContentHash } from '../../src/native/session-illustrations.js';

function fixture(content = '**Alice** at the window.\n\nBob waits.') {
    const entry = { messageId: createNativeId('message'), activeVariantId: createNativeId('variant'), content };
    const root = document.createElement('div'); renderSafeProse(root, content);
    const state = { schemaVersion: 1, annotations: [], images: [] };
    const add = (start, end) => {
        const annotationId = createNativeId('annotation'), imageVersionId = createNativeId('imageVersion');
        state.annotations.push({ annotationId, anchor: { messageId: entry.messageId, variantId: entry.activeVariantId,
            revisionId: createNativeId('revision'), contentHash: illustrationContentHash(content), start, end, quote: content.slice(start, end) }, selectedImageVersionId: imageVersionId, createdAt: 1 });
        state.images.push({ imageVersionId, annotationId, assetId: createNativeId('asset'), width: 512, height: 768, alt: 'A scene', prompt: '', negativePrompt: '', parameters: {}, createdAt: 1 });
    };
    return { root, entry, state, add };
}

test('selection maps visible formatted text and cross-paragraph ranges back to canonical text', () => {
    const { root, entry } = fixture();
    const range = document.createRange();
    range.setStart(root.querySelector('strong').firstChild, 1);
    range.setEnd(root.querySelectorAll('p')[1].firstChild, 3);
    const selected = canonicalProseSelection(root, range);
    expect(selected.start).toBe(3);
    expect(selected.quote).toBe(entry.content.slice(3, entry.content.indexOf('Bob') + 3));
    const outside = document.createElement('div'); outside.textContent = 'outside'; range.setEnd(outside.firstChild, 1);
    expect(canonicalProseSelection(root, range)).toBeNull();
    expect(compileSafeProse(entry.content).children).toHaveLength(3);
});

test('selected illustrations appear after their ending paragraph in source order and keep prose nodes', () => {
    const { root, entry, state, add } = fixture();
    add(2, entry.content.length); // Cross-paragraph mark ends at Bob.
    add(2, 7); add(9, 11);
    const paragraphs = [...root.querySelectorAll('p')];
    const selectedText = paragraphs[0].querySelector('strong').firstChild;
    const range = document.createRange(); range.selectNodeContents(selectedText);
    renderNarrativeIllustrations(root, entry, state);
    expect(root.querySelectorAll('figure')).toHaveLength(3);
    expect(paragraphs[0].nextSibling.dataset.atriaIllustration).toBe(state.annotations[1].annotationId);
    expect(paragraphs[0].nextSibling.nextSibling.dataset.atriaIllustration).toBe(state.annotations[2].annotationId);
    expect(paragraphs[1].nextSibling.dataset.atriaIllustration).toBe(state.annotations[0].annotationId);
    const figure = paragraphs[0].nextSibling, img = figure.querySelector('img');
    expect(img.getAttribute('src')).toMatch(/^\/api\/native\/session\/asset\/asset_/);
    expect(img.alt).toBe('A scene'); expect(img.width).toBe(512); expect(img.height).toBe(768); expect(img.loading).toBe('lazy');
    renderNarrativeIllustrations(root, entry, state);
    expect(paragraphs[0].nextSibling).toBe(figure);
    expect(root.querySelector('strong').firstChild).toBe(selectedText);
    expect(range.toString()).toBe('Alice');
    renderNarrativeIllustrations(root, { ...entry, activeVariantId: createNativeId('variant') }, state);
    expect(root.querySelector('figure')).toBeNull();
});

test('list-item illustrations retain valid list structure; changing version updates only the image', () => {
    const { root, entry, state, add } = fixture('- Alice\n- Bob'); add(2, 7);
    renderNarrativeIllustrations(root, entry, state);
    const item = root.querySelector('li'), leaf = item.firstChild, figure = item.querySelector('figure');
    expect(root.querySelector('ul > figure')).toBeNull(); expect(figure).not.toBeNull();
    const replacement = { ...state.images[0], imageVersionId: createNativeId('imageVersion'), assetId: createNativeId('asset'), alt: 'Another scene' };
    state.images.push(replacement); state.annotations[0].selectedImageVersionId = replacement.imageVersionId;
    renderNarrativeIllustrations(root, entry, state);
    expect(item.firstChild).toBe(leaf); expect(item.querySelector('figure')).toBe(figure); expect(figure.querySelector('img').alt).toBe('Another scene');
    state.annotations[0].deletedAt = 2; state.annotations[0].selectedImageVersionId = null;
    renderNarrativeIllustrations(root, entry, state); expect(root.querySelector('figure')).toBeNull();
});
