import { runtimeRequest } from './runtime-client.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

const names = { 'rp.m1.information': 'Information and continuity', 'project.m1.related': 'Related task completion', 'rp.narrative': 'Narrative quality', 'project.agent': 'Agent task quality', 'rp.creative_refusal': 'Creative response' };

/** Optional profile availability; authoring and trial results are never scores. */
export function mountPromptQuality({ document: doc, parent, state = {}, request = runtimeRequest }) {
    const root = doc.createElement('details'); root.className = 'atri-prompt-preview'; root.open = Boolean(state.open);
    const el = (tag, text, parent = root) => { const node = doc.createElement(tag); if (text) node.textContent = text; parent.append(node); return node; };
    el('summary', tl('Optional quality feedback'));
    el('p', tl('Not evaluated. Saving, sharing and sample trials remain available.'));
    const status = el('p'); status.setAttribute('role', 'status');
    const list = el('div');
    const render = () => {
        list.replaceChildren();
        for (const profile of state.catalog?.profiles ?? []) {
            const row = el('article', undefined, list); el('h4', tl(names[profile.profileId] || profile.profileId), row);
            el('p', tl(profile.readiness?.status === 'ready' ? 'Evaluation sources available' : 'Reviewed source evidence is missing for this evaluation.'), row);
            const details = el('details', undefined, row); el('summary', tl('Dimensions and required sources'), details);
            el('pre', JSON.stringify({ profileId: profile.profileId, revision: profile.revision, dimensions: profile.dimensions,
                sourceRequirements: profile.sourceRequirements ?? [], readiness: profile.readiness }, null, 2), details);
        }
    };
    let loading = false;
    const refresh = el('button', tl('Refresh profiles')); refresh.type = 'button'; refresh.className = 'atri-library-button';
    const load = async () => {
        if (loading) return; loading = true; refresh.disabled = true;
        try { const catalog = await request('/quality-profiles'); state.catalog = catalog; if (root.isConnected) { status.textContent = ''; render(); } } catch (error) { if (root.isConnected) status.textContent = error.message; } finally { loading = false; refresh.disabled = false; }
    };
    refresh.addEventListener('click', load);
    root.addEventListener('toggle', () => { state.open = root.open; if (root.open && !state.catalog) void load(); });
    parent.append(root); if (state.catalog) render(); if (root.open && !state.catalog) void load();
    return root;
}
