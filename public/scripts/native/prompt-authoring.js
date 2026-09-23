import { createStudioNativeId } from './studio-authoring.js';
import { runtimeRequest } from './runtime-client.js';
import { nativeStudioClient } from './studio-client.js';

export const PROMPT_TYPES = Object.freeze({
    'core.prompt-program': ['Prompt Programs', 'promptProgramId', 'pprog'],
    'core.prompt-module': ['Prompt Modules', 'promptModuleId', 'pmod'],
    'core.generation-profile': ['Generation Profiles', 'generationProfileId', 'genprof'],
});
const clone = value => JSON.parse(JSON.stringify(value));
export const exactKey = ref => JSON.stringify(ref, Object.keys(ref).sort());
export function newPromptResource(type) {
    const [, id, prefix] = PROMPT_TYPES[type];
    return { schemaVersion: 1, [id]: createStudioNativeId(prefix), revision: createStudioNativeId('rev'), displayName: 'Untitled',
        ...(type === 'core.prompt-module' ? { target: 'system.foundation', stages: ['stage.main'], body: '' } : {}),
        ...(type === 'core.prompt-program' ? { stages: [{ stageId: 'stage.main', moduleRefs: [] }], responseDirective: {} } : {}),
        ...(type === 'core.generation-profile' ? { output: { maxTokens: 512 } } : {}),
    };
}
export function resourceRef(type, resource, scope) {
    return { resourceType: type, resourceId: resource[PROMPT_TYPES[type][1]], revision: resource.revision, ...scope };
}
function element(doc, tag, text, parent) {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    parent?.append(node);
    return node;
}
function action(doc, parent, label, handler) {
    const button = element(doc, 'button', label, parent); button.type = 'button'; button.className = 'atria-studio-action';
    button.addEventListener('click', handler); return button;
}
function input(doc, parent, label, value, multiline = false) {
    const wrapper = element(doc, 'label', label, parent);
    const node = element(doc, multiline ? 'textarea' : 'input', undefined, wrapper);
    node.setAttribute('aria-label', label); if (!multiline) node.type = 'text'; node.value = value ?? ''; return node;
}
function select(doc, parent, label, options, value = '') {
    const wrapper = element(doc, 'label', label, parent); const node = element(doc, 'select', undefined, wrapper);
    node.setAttribute('aria-label', label);
    for (const [key, name] of options) { const option = element(doc, 'option', name, node); option.value = key; }
    node.value = value; return node;
}
function error(doc, parent, value) { const node = element(doc, 'p', value?.message || String(value), parent); node.setAttribute('role', 'alert'); node.tabIndex = -1; node.focus(); }

// Copies the exact dependency closure. Package originals never receive writes.
export function forkPromptClosure(entries, selected, { derive = false, scope = { scope: 'library' } } = {}) {
    const output = []; const cache = new Map(); const active = new Set();
    // One new identity per logical resource, even when several exact revisions are copied.
    // Sorted module identities retain the compiler's ID tie-break order after a fork.
    const logicalKey = ref => exactKey({ ...ref, revision: '' });
    const identities = new Map();
    const modules = [...new Map(entries.filter(item => item.ref.resourceType === 'core.prompt-module' && item.ref.scope !== 'library')
        .map(item => [logicalKey(item.ref), item.ref])).entries()].sort((a, b) => a[1].resourceId.localeCompare(b[1].resourceId));
    const ids = modules.map(() => createStudioNativeId('pmod')).sort();
    modules.forEach(([key], index) => identities.set(key, ids[index]));
    const visit = entry => {
        const key = exactKey(entry.ref);
        if (active.has(key)) throw new Error('Prompt dependency cycle');
        if (cache.has(key)) return cache.get(key);
        active.add(key);
        const type = entry.ref.resourceType; const [, id, prefix] = PROMPT_TYPES[type];
        const resource = clone(entry.resource);
        if (!identities.has(logicalKey(entry.ref))) identities.set(logicalKey(entry.ref), createStudioNativeId(prefix));
        resource[id] = identities.get(logicalKey(entry.ref)); resource.revision = createStudioNativeId('rev');
        resource.provenance = [...(resource.provenance || []), { source: 'atria.fork', ref: key }];
        const mapped = resourceRef(type, resource, scope); cache.set(key, mapped);
        const dependency = ref => {
            if (ref.scope === 'library') return clone(ref);
            const found = entries.find(item => exactKey(item.ref) === exactKey(ref));
            if (!found) throw new Error('Missing exact dependency: ' + ref.resourceId + '@' + ref.revision);
            return visit(found);
        };
        if (type === 'core.prompt-program') {
            if (resource.parentRef) resource.parentRef = dependency(resource.parentRef);
            resource.stages.forEach(stage => { stage.moduleRefs = stage.moduleRefs.map(dependency); });
            (resource.derive || []).forEach(op => {
                const previous = op.replacementRef;
                if (previous) op.replacementRef = dependency(previous);
                const original = entries.find(item => item.ref.resourceType === 'core.prompt-module' && item.ref.resourceId === op.moduleId && cache.has(exactKey(item.ref)) && item.ref.scope === entry.ref.scope
                    && (entry.ref.scope !== 'package' || item.ref.packageVersionId === entry.ref.packageVersionId)
                    && (entry.ref.scope !== 'project' || item.ref.projectId === entry.ref.projectId));
                if (original) op.moduleId = dependency(original.ref).resourceId;
            });
        }
        output.push({ ref: mapped, resource }); active.delete(key); return mapped;
    };
    let ref;
    if (derive && selected.ref.resourceType === 'core.prompt-program') {
        const parent = selected.ref.scope === 'library' ? selected.ref : visit(selected);
        const resource = newPromptResource('core.prompt-program'); resource.displayName = selected.resource.displayName + ' Derivative';
        resource.parentRef = parent;
        // A neutral ordered stage preserves inherited stages without redeclaring their conditions.
        resource.stages = [{ stageId: 'stage.derived_' + createStudioNativeId('step').slice(5), moduleRefs: [] }];
        resource.provenance = [{ source: 'atria.derive', ref: exactKey(selected.ref) }];
        ref = resourceRef('core.prompt-program', resource, scope); output.push({ ref, resource });
    } else { ref = visit(selected); output.at(-1).resource.displayName += ' Fork'; }
    return { entries: output, ref };
}

export function mountPromptEditor({ document: doc, parent, entry, entries, onSave, onBack }) {
    let draft = clone(entry.resource); let advanced = false; let submitted = false;
    const root = element(doc, 'section', undefined, parent); root.className = 'atri-prompt-editor';
    root.dataset.atriPromptEditor = 'true';
    function render() {
        root.replaceChildren();
        const title = element(doc, 'h3', draft.displayName, root); title.tabIndex = -1;
        element(doc, 'p', 'New exact revision · existing references stay pinned. Review changes before committing in Studio.', root);
        const toolbar = element(doc, 'div', undefined, root); toolbar.className = 'atri-prompt-actions';
        action(doc, toolbar, 'Back to resources', onBack);
        const status = element(doc, 'div', undefined, root);
        let read;
        action(doc, toolbar, advanced ? 'Simple editor' : 'Advanced editor', () => {
            try { draft = read(); advanced = !advanced; render(); } catch (e) { status.replaceChildren(); error(doc, status, e); }
        });
        if (advanced) {
            const json = input(doc, root, 'Resource JSON — conditions, parameters, provenance', JSON.stringify(draft, null, 2), true);
            json.className = 'atri-prompt-json'; read = () => JSON.parse(json.value);
        } else {
            const name = input(doc, root, 'Display name', draft.displayName);
            const revision = input(doc, root, 'Exact revision', draft.revision);
            const fields = element(doc, 'div', undefined, root);
            let specific = () => ({});
            if (entry.ref.resourceType === 'core.prompt-module') {
                const target = select(doc, fields, 'Semantic target', ['system.foundation', 'system.character', 'system.world', 'system.style', 'system.response', 'context.before_history', 'context.after_history', 'context.before_input', 'context.after_input', 'response.prefill', 'response.post_history', 'agent.task', 'agent.evidence', 'agent.constraints'].map(v => [v, v]), draft.target);
                const stages = input(doc, fields, 'Stages (comma separated)', draft.stages.join(', '));
                const body = input(doc, fields, 'Prompt body', draft.body, true);
                const priority = input(doc, fields, 'Priority', draft.priority || 0); priority.type = 'number';
                specific = () => ({ target: target.value, stages: stages.value.split(',').map(v => v.trim()).filter(Boolean), body: body.value, priority: Number(priority.value) });
            } else if (entry.ref.resourceType === 'core.prompt-program') {
                const stages = clone(draft.stages); const tree = element(doc, 'section', undefined, fields); tree.className = 'atri-prompt-stages';
                element(doc, 'h4', 'Stage / module tree', tree);
                const renderStages = () => {
                    tree.querySelectorAll('fieldset').forEach(node => node.remove());
                    stages.forEach((stage, index) => {
                        const row = element(doc, 'fieldset', undefined, tree); element(doc, 'legend', `Stage ${index + 1}`, row);
                        const id = input(doc, row, 'Stage ID ' + (index + 1), stage.stageId); id.addEventListener('input', () => { stage.stageId = id.value; });
                        for (const ref of stage.moduleRefs) {
                            const line = element(doc, 'div', undefined, row); const module = entries.find(item => exactKey(item.ref) === exactKey(ref));
                            element(doc, 'span', (module?.resource.displayName || ref.resourceId) + ' · ' + ref.revision + ' · ' + ref.scope, line);
                            action(doc, line, 'Remove module', () => { stage.moduleRefs = stage.moduleRefs.filter(v => v !== ref); renderStages(); });
                        }
                        const choices = entries.filter(item => item.ref.resourceType === 'core.prompt-module' && (entry.ref.scope !== 'library' || item.ref.scope === 'library') && item.ref.scope !== 'package');
                        const picker = select(doc, row, 'Module for stage ' + (index + 1), [['', 'Choose exact module…'], ...choices.map(item => [exactKey(item.ref), item.resource.displayName + ' · ' + item.ref.revision + ' · ' + item.ref.scope])]);
                        action(doc, row, 'Add module', () => { if (picker.value && !stage.moduleRefs.some(v => exactKey(v) === picker.value)) stage.moduleRefs.push(JSON.parse(picker.value)); renderStages(); });
                        action(doc, row, 'Move stage up', () => { if (index) { [stages[index - 1], stages[index]] = [stages[index], stages[index - 1]]; renderStages(); } });
                        action(doc, row, 'Remove stage', () => { if (stages.length > 1) { stages.splice(index, 1); renderStages(); } });
                    });
                };
                action(doc, fields, 'Add stage', () => { let index = stages.length + 1; while (stages.some(stage => stage.stageId === 'stage.step' + index)) index++; stages.push({ stageId: 'stage.step' + index, moduleRefs: [] }); renderStages(); }); renderStages();
                const directive = input(doc, fields, 'Response Directive', draft.responseDirective?.body || '', true);
                specific = () => ({ stages, responseDirective: { ...draft.responseDirective, body: directive.value } });
            } else {
                const max = input(doc, fields, 'Maximum output tokens', draft.output?.maxTokens || 512); max.type = 'number';
                const temperature = input(doc, fields, 'Temperature', draft.sampling?.temperature ?? ''); temperature.type = 'number'; temperature.step = 'any';
                specific = () => { const sampling = { ...draft.sampling }; delete sampling.temperature; return { output: { ...draft.output, maxTokens: Number(max.value) }, sampling: { ...sampling, ...(temperature.value === '' ? {} : { temperature: Number(temperature.value) }) } }; };
            }
            read = () => ({ ...draft, displayName: name.value, revision: revision.value, ...specific() });
            const provenance = element(doc, 'details', undefined, root); element(doc, 'summary', 'Conditions / parameters / provenance', provenance);
            element(doc, 'pre', JSON.stringify({ condition: draft.condition, parameters: draft.parameters, parentRef: draft.parentRef, derive: draft.derive, provenance: draft.provenance }, null, 2), provenance);
        }
        const save = action(doc, root, 'Review / save revision', async () => {
            if (save.disabled) return; save.disabled = true; status.replaceChildren();
            try { const value = read(); await onSave(value); element(doc, 'p', 'Revision submitted. Studio changes require human Review / Apply.', status); submitted = true; } catch (e) { error(doc, status, e); } finally { save.disabled = submitted; }
        });
        save.disabled = submitted;
        title.focus();
    }
    render(); return root;
}

export function mountPromptLibrary({ document: doc, body, route, host }) {
    let disposed = false; let sequence = 0;
    const type = { 'prompt-programs': 'core.prompt-program', 'prompt-modules': 'core.prompt-module', 'generation-profiles': 'core.generation-profile' }[route.child?.id] || 'core.prompt-program';
    async function render() {
        const token = ++sequence; body.replaceChildren(); element(doc, 'p', 'Loading exact resources…', body);
        try {
            const entries = await runtimeRequest('/resources'); if (disposed || token !== sequence) return;
            body.replaceChildren(); const root = element(doc, 'section', undefined, body); root.className = 'atri-prompt-library'; root.dataset.atriPromptLibrary = type;
            element(doc, 'h2', PROMPT_TYPES[type][0], root);
            element(doc, 'p', 'Exact revisions from Library, Projects and installed Packages. Package originals are read-only.', root);
            const editor = (entry, fresh = false) => {
                root.replaceChildren(); const next = clone(entry);
                if (!fresh) next.resource.revision = createStudioNativeId('rev');
                mountPromptEditor({ document: doc, parent: root, entry: next, entries, onBack: render, onSave: async resource => {
                    await runtimeRequest('/resources', { method: 'POST', body: { resourceType: type, resource } });
                    root.replaceChildren(); element(doc, 'p', 'Saved immutable Library revision.', root); action(doc, root, 'Reload resources', render);
                } });
            };
            action(doc, root, 'New resource', () => { const resource = newPromptResource(type); editor({ resource, ref: resourceRef(type, resource, { scope: 'library' }) }, true); });
            const filter = input(doc, root, 'Filter resources', ''); const list = element(doc, 'div', undefined, root);
            const renderList = () => {
                list.replaceChildren(); const matching = entries.filter(item => item.ref.resourceType === type && (item.resource.displayName + item.ref.resourceId).toLowerCase().includes(filter.value.toLowerCase()));
                if (!matching.length) element(doc, 'p', 'No resources yet. Create one or open Build to author project assets.', list);
                for (const entry of matching) {
                    const row = element(doc, 'article', undefined, list); row.className = 'atri-prompt-resource';
                    element(doc, 'h3', entry.resource.displayName, row);
                    element(doc, 'p', entry.ref.scope + ' · ' + entry.ref.revision + (entry.ref.scope === 'package' ? ' · Read-only original' : ''), row);
                    const details = element(doc, 'details', undefined, row); element(doc, 'summary', 'Origin / Derived From / exact content', details);
                    element(doc, 'pre', JSON.stringify({ origin: entry.ref, derivedFrom: entry.resource.parentRef || entry.resource.provenance || [], resource: entry.resource }, null, 2), details);
                    action(doc, row, 'Used By', async () => {
                        try {
                            const refs = await nativeStudioClient.getResourceReferences(entry.ref, { reverse: true });
                            const result = element(doc, 'p', refs.length ? refs.map(v => v.node?.displayName || v.edge.from).join(', ') : 'No references in the Resource Graph.', row); result.setAttribute('role', 'status');
                        } catch (e) { error(doc, row, e); }
                    });
                    if (entry.ref.scope === 'library') action(doc, row, 'New revision', () => editor(entry));
                    if (entry.ref.scope === 'project') action(doc, row, 'Open in Build', () => host.openBuild(entry.ref.projectId));
                    for (const derive of type === 'core.prompt-program' ? [false, true] : [false]) {
                        const fork = action(doc, row, derive ? 'Derive to Library' : 'Fork to Library', async () => {
                            fork.disabled = true;
                            try {
                                const plan = forkPromptClosure(entries, entry, { derive });
                                for (const item of plan.entries) await runtimeRequest('/resources', { method: 'POST', body: { resourceType: item.ref.resourceType, resource: item.resource } });
                                row.replaceChildren(); element(doc, 'p', 'Created independent Library resource.', row); action(doc, row, 'Reload resources', render);
                            } catch (e) { error(doc, row, e); fork.disabled = false; }
                        });
                    }
                }
            }; filter.addEventListener('input', renderList); renderList();
        } catch (e) { if (!disposed && token === sequence) { body.replaceChildren(); error(doc, body, e); action(doc, body, 'Retry resources', render); } }
    }
    void render(); return { dispose() { disposed = true; sequence++; } };
}

export async function mountStudioPromptTools({ document: doc, body, state, stageProject, runtimeDesign = false }) {
    element(doc, 'h3', runtimeDesign ? 'Runtime Design' : 'Prompt Authoring', body);
    element(doc, 'p', 'Project edits enter an A1 ChangeSet. Review and Apply Changes to commit; exact references never follow latest.', body);
    const loading = element(doc, 'p', 'Loading exact resources…', body);
    try {
        const all = await runtimeRequest('/resources'); if (!body.isConnected) return; loading.remove();
        const entries = all.filter(item => item.ref.scope !== 'project' || item.ref.projectId === state.projectId);
        const status = element(doc, 'div', undefined, body);
        const stage = async (resources, label) => {
            const source = clone(state.source); source.resources ||= [];
            for (const item of resources) {
                if (source.resources.some(old => old.resourceType === item.ref.resourceType && old.resource[PROMPT_TYPES[item.ref.resourceType][1]] === item.ref.resourceId && old.resource.revision === item.ref.revision)) throw new Error('Use a new exact revision; the existing revision stays pinned.');
                source.resources.push({ resourceType: item.ref.resourceType, resource: item.resource });
            }
            if (!await stageProject(source, label)) throw new Error('ChangeSet could not be prepared. Check Problems / Changes; edits remain here.');
        };
        if (runtimeDesign) {
            const intent = clone(state.source.package.runtime?.modelPrompt || { schemaVersion: 1, roles: [] });
            const json = input(doc, body, 'Runtime requirements JSON', JSON.stringify(intent, null, 2), true);
            element(doc, 'p', 'Only author requirements and recommended exact Prompt / Generation references are packaged. Connections, Models and Secrets belong to the player.', body);
            const role = input(doc, body, 'Runtime role', 'role.narrator');
            const required = input(doc, body, 'Required capabilities (comma separated)', '');
            const choices = type => [['', 'No recommendation'], ...entries.filter(item => item.ref.resourceType === type && item.ref.scope !== 'package').map(item => [exactKey(item.ref), item.resource.displayName + ' · ' + item.ref.revision + ' · ' + item.ref.scope])];
            const prompt = select(doc, body, 'Recommended Prompt', choices('core.prompt-program'));
            const generation = select(doc, body, 'Recommended Generation', choices('core.generation-profile'));
            const loadRole = () => {
                try {
                    const current = JSON.parse(json.value).roles.find(item => item.role === role.value);
                    required.value = (current?.requiredCapabilities || []).join(', ');
                    prompt.value = current?.promptProgramRef ? exactKey(current.promptProgramRef) : '';
                    generation.value = current?.generationProfileRef ? exactKey(current.generationProfileRef) : '';
                } catch (e) { error(doc, status, e); }
            };
            role.addEventListener('change', loadRole); loadRole();
            action(doc, body, 'Set role recommendation', () => {
                try {
                    const value = JSON.parse(json.value); const previous = value.roles.find(item => item.role === role.value); value.roles = value.roles.filter(item => item.role !== role.value);
                    value.roles.push({ role: role.value, requiredCapabilities: required.value.split(',').map(v => v.trim()).filter(Boolean), optionalCapabilities: previous?.optionalCapabilities || [],
                        ...(prompt.value ? { promptProgramRef: JSON.parse(prompt.value) } : {}), ...(generation.value ? { generationProfileRef: JSON.parse(generation.value) } : {}) });
                    json.value = JSON.stringify(value, null, 2);
                } catch (e) { error(doc, status, e); }
            });
            action(doc, body, 'Review runtime requirements', async () => {
                try {
                    const source = clone(state.source); source.package.runtime ||= {}; source.package.runtime.modelPrompt = JSON.parse(json.value);
                    if (!await stageProject(source, 'Update runtime requirements and recommendations')) throw new Error('ChangeSet could not be prepared. Check Problems / Changes.');
                } catch (e) { error(doc, status, e); }
            });
            action(doc, body, 'Inspect exact build closure', async () => {
                try {
                    const result = await nativeStudioClient.resolveResourceClosure(state.projectId);
                    element(doc, 'pre', JSON.stringify(result.closure.resources, null, 2), status);
                } catch (e) { error(doc, status, e); }
            });
        } else {
            const type = select(doc, body, 'Resource kind', Object.entries(PROMPT_TYPES).map(([key, value]) => [key, value[0]]), 'core.prompt-program');
            const workspace = element(doc, 'section', undefined, body); workspace.className = 'atri-prompt-workspace';
            const edit = (entry, fresh = false) => {
                workspace.replaceChildren(); const next = clone(entry);
                if (!fresh) next.resource.revision = createStudioNativeId('rev');
                mountPromptEditor({ document: doc, parent: workspace, entry: next, entries, onBack: () => workspace.replaceChildren(), onSave: resource => stage([
                    { resource, ref: resourceRef(next.ref.resourceType, resource, { scope: 'project', projectId: state.projectId }) },
                ], 'Author ' + resource.displayName) });
            };
            action(doc, body, 'New project resource', () => { const resource = newPromptResource(type.value); edit({ resource, ref: resourceRef(type.value, resource, { scope: 'project', projectId: state.projectId }) }, true); });
            const list = element(doc, 'div', undefined, body);
            const renderList = () => {
                list.replaceChildren(); const matching = entries.filter(item => item.ref.resourceType === type.value);
                if (!matching.length) element(doc, 'p', 'No resources of this kind yet.', list);
                for (const entry of matching) {
                    const row = element(doc, 'article', undefined, list); row.className = 'atri-prompt-resource';
                    element(doc, 'h4', entry.resource.displayName, row); element(doc, 'p', entry.ref.scope + ' · ' + entry.ref.revision + (entry.ref.scope === 'package' ? ' · Read-only original — Fork to author' : ''), row);
                    if (entry.ref.scope === 'project') action(doc, row, 'Edit project resource', () => edit(entry));
                    else if (entry.ref.scope === 'library') action(doc, row, 'Review Attach exact', async () => {
                        try {
                            const source = clone(state.source); source.dependencies ||= {}; source.dependencies.resources ||= [];
                            if (!source.dependencies.resources.some(ref => exactKey(ref) === exactKey(entry.ref))) source.dependencies.resources.push(entry.ref);
                            if (!await stageProject(source, 'Attach ' + entry.resource.displayName + '@' + entry.ref.revision)) throw new Error('ChangeSet could not be prepared. Check Problems / Changes.');
                        } catch (e) { error(doc, status, e); }
                    });
                    for (const derive of entry.ref.resourceType === 'core.prompt-program' ? [false, true] : [false]) action(doc, row, derive ? 'Review Derive' : 'Review Fork', async () => {
                        try {
                            const plan = forkPromptClosure(entries, entry, { derive, scope: { scope: 'project', projectId: state.projectId } });
                            await stage(plan.entries, (derive ? 'Derive ' : 'Fork ') + entry.resource.displayName);
                        } catch (e) { error(doc, status, e); }
                    });
                    const details = element(doc, 'details', undefined, row); element(doc, 'summary', 'Inspector — origin / derived from / provenance', details);
                    element(doc, 'pre', JSON.stringify({ origin: entry.ref, derivedFrom: entry.resource.parentRef, provenance: entry.resource.provenance, conditions: entry.resource.condition, parameters: entry.resource.parameters }, null, 2), details);
                    action(doc, details, 'Used By', async () => { try { element(doc, 'pre', JSON.stringify(await nativeStudioClient.getResourceReferences(entry.ref, { reverse: true }), null, 2), details); } catch (e) { error(doc, status, e); } });
                }
            }; type.addEventListener('change', renderList); renderList();
        }
        const preview = element(doc, 'details', undefined, body); element(doc, 'summary', 'Compile preview — committed exact resources', preview);
        element(doc, 'p', 'Apply your reviewed changes first. Preview uses this committed Project revision and sends no model request.', preview);
        const config = await runtimeRequest(); if (!body.isConnected) return;
        const routes = select(doc, preview, 'Preview route', [['', 'Choose player route…'], ...config.routes.map(item => [item.runtimeRouteId, item.displayName])]);
        const prompt = select(doc, preview, 'Preview Prompt exact revision', [['', 'Use route Prompt'], ...entries.filter(item => item.ref.resourceType === 'core.prompt-program' && item.ref.scope !== 'package').map(item => [exactKey(item.ref), item.resource.displayName + ' · ' + item.ref.revision + ' · ' + item.ref.scope])]);
        const result = element(doc, 'div', undefined, preview);
        const compile = action(doc, preview, 'Compile committed Prompt', async () => {
            compile.disabled = true; result.replaceChildren();
            try {
                const route = config.routes.find(item => item.runtimeRouteId === routes.value); if (!route) throw new Error('Choose a configured route.');
                const output = await runtimeRequest('/preview', { method: 'POST', body: { requestId: createStudioNativeId('preview'), role: route.role.slice(5), projectId: state.projectId, revision: state.revision.revision,
                    routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, ...(prompt.value ? { previewRefs: { promptProgramRef: JSON.parse(prompt.value) } } : {}) } });
                element(doc, 'p', 'Compiled — no request sent', result); element(doc, 'pre', JSON.stringify(output, null, 2), result);
            } catch (e) { error(doc, result, e); } finally { compile.disabled = false; }
        });
    } catch (e) { loading.remove(); error(doc, body, e); action(doc, body, 'Retry resources', () => { body.replaceChildren(); void mountStudioPromptTools({ document: doc, body, state, stageProject, runtimeDesign }); }); }
}
