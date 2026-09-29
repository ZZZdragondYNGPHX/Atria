import { bridgeFixture } from './frontend-bridge-fixture.js';
import { conversationFixture } from './frontend-conversation-fixture.js';
import { scriptFixture } from './frontend-script-fixture.js';
import { compileFrontend } from '../../../src/native/frontend/compiler.js';
import { EMPTY } from '../../../src/native/frontend/bridge.js';
import { assertNativeExperienceContract } from '../../../public/shared/native-experience-contract.js';

const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const text = { type: 'string', maxLength: 256 };
const empty = EMPTY;
const json = value => Buffer.from(JSON.stringify(value));
const aui = (template, contract = {}, style = '') => Buffer.from(`<template>${template}</template><contract>${JSON.stringify(contract)}</contract><style>${style}</style>`);
export const heavySections = ['Story', 'Phone', 'Church', 'Schedule', 'People', 'Relations'];
export const heavyDomains = {
    sms: { schema: object({ text }), initial: { text: '' } },
    social: { schema: object({ text }), initial: { text: '' } },
    mail: { schema: object({ text }), initial: { text: '' } },
    church: { schema: object({ supplies: { type: 'integer' } }), initial: { supplies: 12 } },
    schedule: { schema: object({ text, done: { type: 'boolean' } }), initial: { text: 'Morning service', done: false } },
    people: { schema: object({ text, affinity: { type: 'integer' } }), initial: { text: 'Keeper', affinity: 3 } },
};

// A single package/session exercises the composition of the previously separate
// v3 seams. Only typed Application commands seed or mutate its domain records.
export function heavyFixture(mode = 'full') {
    const fixture = bridgeFixture(mode);
    let contract = structuredClone(fixture.contract);
    contract.lifecycleRuntime.domains = Object.entries(heavyDomains).map(([id, spec]) => ({
        id, scopeId: 'session', schemaVersion: 1, recordSchema: spec.schema, initial: spec.initial,
        commands: [{ id: 'save', argsSchema: spec.schema, event: `${id}.saved`, assign: Object.fromEntries(Object.keys(spec.initial).map(key => [key, { formula: `args.${key}` }])) }],
        retention: { maxItems: 128, maxLogicalBytes: 65536, keepPinned: true, keepReferenced: true },
    }));
    contract = assertNativeExperienceContract(contract);
    const bindings = conversationFixture(mode).bindings.filter(binding => ['messages', 'generation', 'status', 'save', 'restore'].includes(binding.id));
    bindings.find(binding => binding.id === 'save').id = 'checkpoint';
    bindings.push(fixture.bindings.find(binding => binding.id === 'task'));
    for (const { id, recordSchema: schema } of contract.lifecycleRuntime.domains) {
        bindings.push({ id, kind: 'read', target: { domainId: id }, inputSchema: empty,
            outputSchema: object({ id: { type: 'string', maxLength: 64 }, value: schema }), collection: { pageSize: 8, orderBy: 'id' } });
        bindings.push({ id: `save${id}`, kind: 'action', target: { domainId: id, commandId: 'save', recordId: 'main' }, inputSchema: schema, outputSchema: empty });
    }
    const files = new Map([['logic.json', fixture.files.get('logic.json')], ['bridge.json', json({ version: 1, bindings })]]);
    const style = 'section{display:grid;gap:12px;padding:16px;min-width:0}button,input,textarea{font:inherit;min-height:44px;max-width:100%;box-sizing:border-box}button:focus-visible,textarea:focus-visible{outline:3px solid Highlight}article{padding:8px;border:1px solid #82939e;border-radius:8px}textarea{width:100%;min-height:80px}';
    const components = [{ id: 'Nav', source: 'Nav.aui' }], views = [];
    for (const section of heavySections) {
        components.push({ id: section, source: `${section}.aui` }, { id: `Page${section}`, source: `Page${section}.aui` });
        views.push({ id: section, root: `Page${section}`, surface: mode === 'component' ? 'sidebar.right' : 'app.root' });
        files.set(`Page${section}.aui`, aui(`<main node-id="page"><component node-id="nav" ref="Nav" /><component node-id="panel" ref="${section}" boundary="local" /></main>`, {}, 'main{font:16px system-ui;color:#243744;background:#f3f5f0;min-height:100%;overflow:auto}'));
    }
    files.set('Nav.aui', aui(`<nav node-id="nav" aria-label="District">${heavySections.map(id => `<button node-id="${id}" on:click="${id}">${id}</button>`).join('')}</nav>`, {
        interactions: Object.fromEntries(heavySections.map(id => [id, [{ kind: 'view.push', target: id }]])),
    }, 'nav{display:flex;flex-wrap:wrap;gap:8px;padding:12px;border-bottom:1px solid #82939e}button{min-height:44px;font:inherit}button:focus-visible{outline:3px solid Highlight}'));
    files.set('Story.aui', aui('<section node-id="story" read="messages"><h1 node-id="title">District story</h1><article node-id="message" each="bridge.messages.data" item-key="messageId"><div node-id="prose" bind:prose="item.content" /></article><button node-id="next" on:click="next">Next messages</button><output node-id="stream" read="generation" bind:text="bridge.generation.data.text" /><button node-id="checkpoint" on:click="checkpoint">Save checkpoint</button><output node-id="saved" bind:text="bridge.checkpoint.status" /><button node-id="task" on:click="task">AI summary</button><output node-id="result" bind:text="bridge.task.status" /><p node-id="summary" bind:text="bridge.task.data.text" /></section>', {
        uses: ['status', 'restore'], interactions: {
            next: [{ kind: 'read.page', target: 'messages', cursor: { get: 'bridge.messages.cursor' } }],
            checkpoint: [{ kind: 'action.invoke', target: 'checkpoint' }], task: [{ kind: 'operation.start', target: 'task' }],
        },
    }, style));
    files.set('Phone.aui', aui(`<section node-id="phone"><h1 node-id="title">Phone</h1><textarea node-id="draft" aria-label="Phone message" bind:value="draft.message" enterkeyhint="send" />${['sms', 'social', 'mail'].map(id => `<section node-id="${id}" read="${id}"><h2 node-id="heading-${id}">${id.toUpperCase()}</h2><article node-id="row-${id}" each="bridge.${id}.data" item-key="id"><p node-id="text-${id}" bind:text="item.value.text" /></article><button node-id="send-${id}" on:click="${id}">Send ${id}</button><output node-id="receipt-${id}" bind:text="bridge.save${id}.status" /></section>`).join('')}</section>`, {
        state: { draft: { schema: object({ message: text }), initial: { message: '' } } },
        interactions: Object.fromEntries(['sms', 'social', 'mail'].map(id => [id, [{ kind: 'action.invoke', target: `save${id}`, value: { object: { text: { get: 'draft.message' } } } }]])),
    }, style));
    files.set('Church.aui', aui('<section node-id="church" read="church"><h1 node-id="title">Church stores</h1><article node-id="stock" each="bridge.church.data" item-key="id"><output node-id="supplies" bind:text="item.value.supplies" /></article><button node-id="restock" on:click="restock">Restock to 24</button><output node-id="receipt" bind:text="bridge.savechurch.status" /></section>', { interactions: { restock: [{ kind: 'action.invoke', target: 'savechurch', value: { object: { supplies: 24 } } }] } }, style));
    files.set('Schedule.aui', aui('<section node-id="schedule" read="schedule"><h1 node-id="title">Schedule</h1><article node-id="event" each="bridge.schedule.data" item-key="id"><p node-id="name" bind:text="item.value.text" /><output node-id="done" bind:text="item.value.done" /></article><button node-id="complete" on:click="complete">Complete service</button><output node-id="receipt" bind:text="bridge.saveschedule.status" /></section>', { interactions: { complete: [{ kind: 'action.invoke', target: 'saveschedule', value: { object: { text: 'Morning service', done: true } } }] } }, style));
    files.set('People.aui', aui('<section node-id="people" read="people"><h1 node-id="title">People</h1><article node-id="person" each="bridge.people.data" item-key="id"><img node-id="portrait" media="portrait" alt="Resident portrait" width="64" height="64" /><p node-id="name" bind:text="item.value.text" /><output node-id="affinity" bind:text="item.value.affinity" /></article><button node-id="next" on:click="next">Next people</button><button node-id="befriend" on:click="befriend">Befriend keeper</button></section>', { interactions: { next: [{ kind: 'read.page', target: 'people', cursor: { get: 'bridge.people.cursor' } }], befriend: [{ kind: 'action.invoke', target: 'savepeople', value: { object: { text: 'Keeper', affinity: 4 } } }] } }, style));
    const script = scriptFixture(mode);
    files.set('Relations.aui', Buffer.from(script.files.get('frontend/Main.aui').toString()
        .replace('<contract>{', '<contract>{"uses":["people"],')
        .replace('"properties":{"count":', '"properties":{"residents":{"type":"integer"},"count":')
        .replace('"initial":{"count":0}', '"initial":{"residents":0,"count":0}')
        .replace('</section>', '<output node-id="linked" bind:text="component.residents" /></section>')));
    files.set('controller.ts', Buffer.from(script.files.get('frontend/controller.ts').toString()
        .replace('function draw', 'let residents = [];\nfunction draw')
        .replace('layout(6)', 'layout(residents.length)')
        .replace('\'Node \'+i', 'residents[i].value.text')
        .replace('init(ctx) { draw(ctx); }', 'async init(ctx) { const receipt = await ctx.bridge.page(\'people\',{}); if (!receipt.ok) throw new Error(\'people read failed\'); residents = receipt.data; ctx.set(\'component.residents\',residents.length); draw(ctx); }')
        .replace('i<6', 'i<residents.length')));
    files.set('vendor/layout.js', script.files.get('frontend/vendor/layout.js'));
    files.set('fallback.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA1sAAAAASUVORK5CYII=', 'base64'));
    files.set('media.json', json({ version: 1, required: false, entries: [{ mediaId: 'portrait', sources: [{ url: 'https://images.example/resident.png' }], mediaType: 'image/png', width: 64, height: 64, loading: 'lazy', cache: 'session', fallback: 'fallback' }] }));
    files.set('frontend.json', json({ format: 'atria-frontend-source', version: 3, primaryView: 'Story', views, components, bridge: 'bridge.json', media: 'media.json', assets: [{ id: 'fallback', source: 'fallback.png', mediaType: 'image/png' }] }));
    const compiled = compileFrontend({ source: 'frontend.json', files, mode, experienceContract: contract });
    fixture.manifest.name = 'Native v3 district acceptance';
    fixture.manifest.permissions = [{ permission: 'remote-media', required: false }];
    fixture.manifest.runtime = { game: { logic: 'logic.json' }, experienceContract: contract, experience: { mode, frontend: { kind: 'native', version: 3, entry: compiled.entry }, features: [{ id: 'frontend-script', version: 1, required: true }, { id: 'remote-media', version: 1, required: false }] } };
    return { ...fixture, contract, bindings, compiled, sourceFiles: files, files: new Map([...files, ...compiled.files]) };
}

export async function seedHeavySession(svc, h, fixture) {
    let base = await svc.core.create(h.handle, { packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId, entryPointId: fixture.entryPointId });
    for (const [domainId, spec] of Object.entries(heavyDomains)) {
        const rows = domainId === 'people' ? Array.from({ length: 25 }, (_, i) => [`resident-${String(i).padStart(2, '0')}`, { text: `Resident ${i}`, affinity: i }]) : [['main', spec.initial]];
        for (const [recordId, args] of rows) base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: `seed-${domainId}-${recordId}`, action: { kind: 'app.command', domainId, recordId, commandId: 'save', args } }, { expectedRevisionId: base.revision.revisionId });
    }
    base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Visit the district' }, { expectedRevisionId: base.revision.revisionId });
    return svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'assistant', content: '**Morning service**\n\n<img src=x onerror=alert(1)> remains literal.' }, { expectedRevisionId: base.revision.revisionId });
}
