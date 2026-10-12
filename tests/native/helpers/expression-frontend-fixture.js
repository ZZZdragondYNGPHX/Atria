import { sessionFixture, installFixture } from './session-fixture.js';
import { informationFixture } from './information-fixture.js';
import { compileFrontend } from '../../../src/native/frontend/compiler.js';
import { fixedHostTarget } from '../../../public/shared/native-frontend-host.js';
import { createNativeId } from '../../../src/native/identity.js';

export const expressionPortraits = Object.fromEntries(['inform', 'reassure'].map((intent, index) => [intent,
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="24" fill="${index ? '#dae8df' : '#dce5ed'}"/><path d="M43 240 Q48 165 120 166 Q192 165 197 240" fill="#344e61"/><ellipse cx="120" cy="105" rx="62" ry="76" fill="#e8c6a4"/><path d="M57 105 Q45 23 119 21 Q193 22 183 108 L163 61 Q118 89 73 63Z" fill="#27363e"/><path d="M81 103 Q91 96 102 103 M138 103 Q149 96 159 103" fill="none" stroke="#29343c" stroke-width="5" stroke-linecap="round"/><path d="${index ? 'M91 140 Q120 164 149 140' : 'M99 145 Q120 148 141 145'}" fill="none" stroke="#825545" stroke-width="5" stroke-linecap="round"/></svg>`]));

export async function expressionFrontendFixture(h, portraits, { mode = 'full', intent = 'inform', broken = false, configured = true, otherActor = false } = {}) {
    const fixture = sessionFixture(), actorId = fixture.manifest.actors[0].actorId, otherActorId = createNativeId('actor');
    fixture.manifest.actors.push({ actorId: otherActorId, displayName: '沈墨' });
    fixture.manifest.entryPoints[0].actorIds.push(otherActorId);
    fixture.manifest.actors[0].displayName = '阿岚';
    const contract = informationFixture(actorId, fixture.worldId), info = contract.informationRuntime;
    info.graphs = [];
    info.actors.push({ id: otherActorId, scopeId: 'session' });
    const expressionActorId = otherActor ? otherActorId : actorId;
    Object.assign(info.views.find(view => view.id === 'pov'), { actorId: expressionActorId, sources: ['beliefs'] });
    Object.assign(info.views.find(view => view.id === 'player'), { actorId: expressionActorId, sources: ['beliefs'] });
    info.narration = { mode: 'limited', contextViewId: 'pov', disclosureViewId: 'player',
        ...(configured ? { expression: { actorId: expressionActorId, intent, sourceIds: ['beliefs'] } } : {}) };
    contract.lifecycleRuntime.domains.find(domain => domain.id === 'beliefs').commands.push({ id: 'revoke',
        argsSchema: { type: 'object', properties: {}, additionalProperties: false }, event: 'belief.revoked', assign: { actor: otherActorId }, terminal: true });
    const target = { service: 'host.expression', method: 'status' }, schema = fixedHostTarget(target);
    const binding = { id: 'expression', kind: 'read', target, inputSchema: schema.inputSchema, outputSchema: schema.outputSchema };
    const index = { format: 'atria-frontend-source', version: 3, primaryView: 'main', bridge: 'bridge.json',
        views: [{ id: 'main', root: 'Main', surface: mode === 'component' ? 'sidebar.right' : 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }],
        assets: ['inform', 'reassure'].map(id => ({ id, source: id + '.png', mediaType: 'image/png' })) };
    const files = new Map([
        ['frontend/index.json', Buffer.from(JSON.stringify(index))], ['frontend/bridge.json', Buffer.from(JSON.stringify({ version: 1, bindings: [binding] }))],
        ['frontend/Main.aui', Buffer.from(`<template><main node-id="root"><h1 node-id="heading">阿岚 · 车站</h1><p node-id="prose">阿岚说：“我只知道信没有署名。寄信者是谁，我仍不能确定。”</p><p node-id="fallback" role="status">图片仅是公开表达建议；图片不可用时，以文字回应为准。</p><output node-id="status" hidden="true" read="expression" bind:text="bridge.expression.data.status" aria-label="表达投影状态" /><div node-id="ready" bind:class="bridge.expression.data.status"><div node-id="actor" bind:class="bridge.expression.data.actorId"><div node-id="intent" bind:class="bridge.expression.data.intent"><img node-id="inform" class="portrait inform" asset="inform" alt="阿岚的告知表达建议，不代表真实心理或已执行动作" width="240" height="240" /><img node-id="reassure" class="portrait reassure" asset="reassure" alt="阿岚的安抚表达建议，不代表真实心理或已执行动作" width="240" height="240" /></div></div></div><button node-id="continue" on:click="continue">继续阅读文字</button><output node-id="reading" bind:text="ui.reading" /></main></template><contract>${JSON.stringify({ state: { ui: { schema: { type: 'object', properties: { reading: { type: 'string', maxLength: 64 } }, required: ['reading'], additionalProperties: false }, initial: { reading: '' } } }, interactions: { continue: [{ kind: 'set', target: 'ui.reading', value: '文字回应始终可用。' }] } })}</contract><style>:host{font:16px/1.6 system-ui;color:#243744;background:#f3f5f0}main{display:grid;gap:12px;padding:24px;box-sizing:border-box;max-width:720px;margin:auto}h1,p{margin:0}h1{font-size:24px}img{max-width:100%;height:auto}.portrait{display:none;aspect-ratio:1;object-fit:contain}.portrait[data-media-status="unavailable"]{visibility:hidden}.ready .${actorId} .inform .portrait.inform,.ready .${actorId} .reassure .portrait.reassure{display:block}button{font:inherit;min-height:44px;padding:8px 16px;border:1px solid #49626e;border-radius:6px;color:inherit;background:#e3e9ed}button:focus-visible{outline:3px solid #234550;outline-offset:3px}output{min-height:24px}@media(max-width:600px){main{padding:16px}}</style>`) ],
        ['frontend/inform.png', broken ? Buffer.from('intentionally invalid exact image bytes') : portraits.inform],
        ['frontend/reassure.png', portraits.reassure],
    ]);
    const compiled = compileFrontend({ source: 'frontend/index.json', files, mode, experienceContract: contract });
    fixture.sourceFiles = new Map([...files, ...compiled.files]);
    fixture.manifest.runtime = { experienceContract: contract, experience: { mode, frontend: { kind: 'native', version: 3, entry: compiled.entry } } };
    const installed = await installFixture(h, fixture);
    let base = await installed.core.create(h.handle, installed.start);
    const command = async action => {
        base = await installed.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 's29-' + base.revision.revisionId, action }, { expectedRevisionId: base.revision.revisionId });
        return base;
    };
    for (const [domainId, recordId, value] of [['availability', 'main', {}], ['beliefs', 'public', { actor: expressionActorId, text: '阿岚只知道信没有署名，寄信人尚不确定。', status: 'suspected', channel: 'rumor' }]]) {
        await command({ kind: 'app.command', domainId, recordId, commandId: 'save', args: { ...contract.lifecycleRuntime.domains.find(domain => domain.id === domainId).initial, ...value } });
    }
    return { ...installed, actorId, compiled, files: fixture.sourceFiles, base, command, current: () => base,
        undefinedAssetRejected() {
            const invalid = new Map(files);
            invalid.set('frontend/Main.aui', Buffer.from(files.get('frontend/Main.aui').toString().replace('asset="inform"', 'asset="undefined"')));
            try { compileFrontend({ source: 'frontend/index.json', files: invalid, mode, experienceContract: contract }); return false; } catch { return true; }
        } };
}
