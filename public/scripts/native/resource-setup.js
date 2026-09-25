import { nativeProductClient as client } from './product-client.js';
import { el, action, disclosure, feedback, libraryError } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

/** Explicit exact resource choices for future starts or a single Session revision. */
export async function mountResourceSetup({ document: doc, root, packageId, sessionId, entryPointId, onSaved, host }) {
    root.replaceChildren();
    const panel = el(doc, 'section', 'atri-library-section atri-resource-setup', undefined, root);
    el(doc, 'h3', '', tl(sessionId ? 'Session Worlds & Knowledge' : 'New session defaults'), panel);
    el(doc, 'p', '', tl(sessionId ? 'Unchanged World revisions keep their progress. Replaced Worlds start from their baseline. Timeline and previous revisions are kept.' : 'These choices apply to new sessions from this starting point. Existing sessions keep their own choices.'), panel);
    try {
        const setup = await client.getResourceSetup(packageId, { sessionId, entryPointId });
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const chosen = { worldRefs: [...setup.worldRefs], knowledgeRefs: [...setup.knowledgeRefs] };
        const fields = el(doc, 'div', 'atri-resource-setup-fields', undefined, panel);
        const primaryLabel = el(doc, 'label', 'atri-library-field', tl('Primary World'), panel);
        const primary = el(doc, 'select', '', undefined, primaryLabel); primary.setAttribute('aria-label', tl('Primary World'));
        const updatePrimary = () => {
            const previous = primary.value || setup.primaryWorldId;
            primary.replaceChildren();
            const none = el(doc, 'option', '', tl('None'), primary); none.value = '';
            for (const ref of chosen.worldRefs) {
                const option = el(doc, 'option', '', setup.worldOptions.find(item => same(item.ref, ref))?.name || ref.resourceId, primary); option.value = ref.resourceId;
            }
            primary.value = chosen.worldRefs.some(ref => ref.resourceId === previous) ? previous : chosen.worldRefs[0]?.resourceId || '';
        };
        for (const [title, options, key] of [['Worlds', setup.worldOptions, 'worldRefs'], ['Knowledge Bases', setup.knowledgeOptions, 'knowledgeRefs']]) {
            const group = el(doc, 'fieldset', 'atri-resource-choices', undefined, fields);
            el(doc, 'legend', '', tl(title), group);
            if (!options.length) el(doc, 'p', '', tl('No resources available. Create or copy a Library resource first.'), group);
            const groups = new Map();
            for (const option of options) {
                const id = option.ref.scope + ':' + (option.ref.resourceId || option.ref.bindingId);
                if (!groups.has(id)) groups.set(id, []);
                groups.get(id).push(option);
            }
            for (const versions of groups.values()) {
                const selected = versions.find(option => chosen[key].some(ref => same(ref, option.ref)));
                let option = selected || versions.find(item => item.current) || versions[0];
                const row = el(doc, 'div', 'atri-resource-choice', undefined, group);
                const label = el(doc, 'label', '', undefined, row);
                const checkbox = el(doc, 'input', '', undefined, label); checkbox.type = 'checkbox'; checkbox.checked = Boolean(selected);
                label.append(doc.createTextNode(option.name));
                el(doc, 'p', 'atri-library-meta', tl(option.origin), row);
                const revisionLabel = el(doc, 'label', 'atri-library-field', tl('Revision'), row); revisionLabel.hidden = versions.length === 1;
                const revision = el(doc, 'select', '', undefined, revisionLabel); revision.setAttribute('aria-label', tl('Revision') + ' · ' + option.name);
                revision.hidden = versions.length === 1; revision.disabled = !checkbox.checked;
                for (const [index, value] of versions.entries()) {
                    const item = el(doc, 'option', '', (value.current ? tl('Current revision') : tl('Historical revision')) + (value.createdAt ? ' · ' + new Date(value.createdAt).toLocaleString() : ' · ' + (value.ref.revision || '').slice(-8)), revision); item.value = String(index);
                }
                revision.value = String(versions.indexOf(option));
                const exact = disclosure(doc, row, 'Exact revision details', option.ref);
                const write = () => {
                    chosen[key] = chosen[key].filter(ref => !versions.some(item => same(ref, item.ref)));
                    option = versions[Number(revision.value)]; revision.disabled = !checkbox.checked;
                    if (checkbox.checked) chosen[key].push(option.ref);
                    exact.querySelector('pre').textContent = JSON.stringify(option.ref, null, 2);
                    updatePrimary();
                };
                checkbox.addEventListener('change', write); revision.addEventListener('change', write);
                if (option.ref.scope === 'library') action(doc, row, 'Open', () => key === 'worldRefs' ? host.openLibraryWorld(option.ref.resourceId) : host.openLibraryKnowledge(option.ref.resourceId));
            }
        }
        updatePrimary();
        const result = el(doc, 'div', '', undefined, panel);
        action(doc, panel, 'Save resource choices', async () => {
            result.replaceChildren();
            const { nativeSessionRuntime } = await import('./session-runtime.js');
            const active = sessionId && nativeSessionRuntime.snapshot?.session.sessionId === sessionId;
            if (active && (nativeSessionRuntime.generation || nativeSessionRuntime.host?.isGenerating?.())) throw new Error(tl('Stop generation before changing resource choices.'));
            await client.saveResourceSetup(packageId, { ...chosen, primaryWorldId: primary.value || null, packageVersionId: setup.packageVersionId, entryPointId: setup.entryPointId, expectedIntegrity: setup.expectedIntegrity, expectedRevisionId: setup.expectedRevisionId, ...(sessionId ? { sessionId } : {}) });
            if (active) await nativeSessionRuntime.reload();
            feedback(doc, result, tl('Resource choices saved.'));
            if (onSaved) await onSaved();
            else await mountResourceSetup({ document: doc, root, packageId, sessionId, entryPointId, onSaved, host });
        }, { primary: true });
    } catch (error) { feedback(doc, panel, libraryError(error), true); }
}
