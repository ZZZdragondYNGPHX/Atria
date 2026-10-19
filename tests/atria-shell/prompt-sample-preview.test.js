/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountPromptEditor, newPromptResource, resourceRef } from '../../public/scripts/native/prompt-authoring.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent === text);
const field = label => document.querySelector(`[aria-label="${label}"]`);
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
async function fixture(type = 'core.prompt-module', configure = () => {}) {
    const resource = newPromptResource(type); configure(resource); const ref = resourceRef(type, resource, { scope: 'library' });
    const baseline = { ...resource, revision: 'earlier' }; const earlier = { ...ref, revision: 'earlier' };
    const route = { runtimeRouteId: 'route-sample', scope: 'player', role: 'role.narrator', displayName: 'My model',
        promptProgramRef: { scope: 'library', resourceType: 'core.prompt-program', resourceId: 'route-default', revision: 'r1' },
        modelProfileRef: { modelProfileId: 'model-sample' } };
    const payloads = [];
    globalThis.fetch = jest.fn(async (url, options) => {
        if (url.endsWith('/configuration')) return { ok: true, json: async () => ({ routes: [route], models: [{ modelProfileId: 'model-sample', limits: { contextTokens: 4000 } }] }) };
        if (url.endsWith('/resources')) return { ok: true, json: async () => [{ ref, resource, fingerprint: 'a'.repeat(64) }, { ref: earlier, resource: baseline, fingerprint: 'b'.repeat(64) }] };
        payloads.push({ url, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ trial: { status: 'completed' }, response: { text: 'A paid sample result' }, routing: { compute: { attempts: [{ status: 'settled' }] } } }) };
    });
    mountPromptEditor({ document, parent: document.body, entry: { ref, resource }, entries: [], onBack: jest.fn(), onSave: jest.fn() });
    const details = document.querySelector('.atri-prompt-preview'); details.open = true; details.dispatchEvent(new Event('toggle')); await flush(); await flush();
    return { resource, ref, earlier, route, payloads };
}
test('a module sample compares an exact prior revision with the edited unsaved body and never saves', async () => {
    const f = await fixture(); field('Prompt body').value = 'Private new text'; field('Prompt body').dispatchEvent(new Event('input', { bubbles: true }));
    field('Sample input').value = 'Sample user input'; field('Baseline revision').value = JSON.stringify(f.earlier);
    button('Preview sample').click(); await flush();
    const { url, body } = f.payloads[0]; expect(url).toMatch('/preview/draft'); expect(body.request.sample.input).toBe('Sample user input');
    expect(body.drafts[0]).toMatchObject({ expectedFingerprint: 'a'.repeat(64), resource: { body: 'Private new text' } });
    expect(body.baselineDrafts[0].resource.stages[0].moduleRefs).toEqual([f.earlier]);
    expect(body.candidateRefs.promptProgramRef).not.toEqual(body.baselineRefs.promptProgramRef);
    expect(f.payloads).toHaveLength(1);
});
test('trial uses the current draft and preserves its result when the author switches editor views', async () => {
    const f = await fixture('core.prompt-program'); let resolve;
    globalThis.fetch.mockImplementationOnce((_url, options) => { f.payloads.push({ body: JSON.parse(options.body) }); return new Promise(done => { resolve = done; }); });
    field('Sample input').value = 'Keep this sample'; field('Sample input').dispatchEvent(new Event('input', { bubbles: true }));
    button('Try sample (uses model)').click(); await flush();
    expect(f.payloads[0].body).toMatchObject({ send: true, limits: { maxRequests: 1, maxTokens: 4000 } });
    button('Advanced editor').click(); await flush(); await flush();
    expect(field('Sample input').value).toBe('Keep this sample'); expect(button('Try sample (uses model)').disabled).toBe(true);
    resolve({ ok: true, json: async () => ({ trial: { status: 'completed' }, response: { text: 'Sample kept across view switch' }, routing: {} }) });
    await flush(); await flush(); expect(document.body.textContent).toContain('Sample kept across view switch');
    expect(button('Try sample (uses model)').disabled).toBe(false);
});
test('changing text during a preview cannot display an obsolete compilation as current', async () => {
    await fixture(); let resolve;
    globalThis.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    button('Preview sample').click(); await flush();
    field('Prompt body').value = 'Newer text'; field('Prompt body').dispatchEvent(new Event('input', { bubbles: true }));
    resolve({ ok: true, json: async () => ({ trial: { status: 'completed' }, response: { text: 'Obsolete preview' } }) });
    await flush(); expect(document.body.textContent).toContain('The draft changed.'); expect(document.body.textContent).not.toContain('Obsolete preview');
});


test('standalone Module sample parameters use ordinary Program declarations and exact entry configuration', async () => {
    const f = await fixture('core.prompt-module', resource => { resource.parameters = { tone: { type: 'string', default: 'quiet' } }; resource.body = 'Tone: {{module.tone}}'; });
    field('Sample parameters (JSON)').value = '{"tone":"bright"}'; button('Preview sample').click(); await flush();
    const wrapper = f.payloads[0].body.drafts[1].resource;
    expect(wrapper.parameters).toMatchObject({ tone: { type: 'string', default: 'quiet' } });
    expect(wrapper.derive).toEqual([{ op: 'configure', stageId: 'stage.main', entryId: f.ref.resourceId, config: { tone: 'bright' } }]);
    expect(f.payloads[0].body.request.prompt.parameters).toEqual({ tone: 'bright' });
});
