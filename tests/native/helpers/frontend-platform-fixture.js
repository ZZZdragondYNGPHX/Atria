import { compileFrontend } from '../../../src/native/frontend/compiler.js';
import { objectSchema } from './frontend-presentation-fixture.js';

export const portrait = { mediaId: 'portrait', sources: [{ url: 'https://images.example/portrait.png' }], mediaType: 'image/png', width: 128, height: 128, loading: 'lazy', cache: 'session', fallback: 'fallback' };
export const localization = { version: 1, defaultLocale: 'en', catalogs: {
    en: { direction: 'ltr', messages: { greeting: ['Hello ', { arg: 'name', format: 'text' }], count: { arg: 'count', format: 'plural', cases: { one: 'One item', other: [{ arg: 'count', format: 'number' }, ' items'] } } } },
    ar: { direction: 'rtl', messages: { greeting: ['مرحبا ', { arg: 'name', format: 'text' }] } },
} };
export function platformFixture(mode = 'full') {
    const index = { format: 'atria-frontend-source', version: 3, primaryView: 'main', views: [{ id: 'main', root: 'Main', surface: mode === 'component' ? 'sidebar.right' : 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }, { id: 'Child', source: 'Child.aui' }],
        assets: [{ id: 'fallback', source: 'fallback.png', mediaType: 'image/png' }, { id: 'audio', source: 'audio.wav', mediaType: 'audio/wav' }, { id: 'video', source: 'video.webm', mediaType: 'video/webm' }], media: 'media.json', localization: 'locales.json' };
    const contract = { state: { draft: { schema: objectSchema({ text: { type: 'string', maxLength: 1024 } }), initial: { text: '' } }, ui: { schema: objectSchema({ count: { type: 'integer' }, name: { type: 'string', maxLength: 64 } }), initial: { count: 0, name: 'Atria' } } }, interactions: {
        increment: [{ kind: 'set', target: 'ui.count', value: { op: 'add', args: [{ get: 'ui.count' }, 1] } }], arabic: [{ kind: 'locale.set', value: 'ar' }], english: [{ kind: 'locale.set', value: 'en' }], announce: [{ kind: 'announce', value: 'Saved locally' }],
    } };
    const files = new Map([
        ['frontend/index.json', JSON.stringify(index)],
        ['frontend/media.json', JSON.stringify({ version: 1, required: false, entries: [portrait] })], ['frontend/locales.json', JSON.stringify(localization)],
        ['frontend/Main.aui', `<template><main node-id="root"><h1 node-id="heading" message="greeting" arg:name="ui.name" /><img node-id="portrait" media="portrait" alt="Character portrait" width="128" height="128" /><audio node-id="audio" asset="audio" /><video node-id="video" asset="video" /><component node-id="child" ref="Child" boundary="local" /><p node-id="count" message="count" arg:count="ui.count" /><textarea node-id="input" bind:value="draft.text" aria-label="Message" inputmode="text" enterkeyhint="send" /><button node-id="increment" on:click="increment">Increment</button><button node-id="arabic" on:click="arabic">Arabic</button><button node-id="english" on:click="english">English</button><button node-id="announce" on:click="announce">Announce</button></main></template><contract>${JSON.stringify(contract)}</contract><style>main{display:grid;gap:12px;padding:16px;font:16px system-ui;background:Canvas;color:CanvasText}textarea{min-height:60px}button{min-height:44px}button:focus-visible,textarea:focus-visible{outline:3px solid Highlight}video{width:180px;height:80px}</style>`],
        ['frontend/Child.aui', '<template><p node-id="childText">Child ready</p></template>'],
    ].map(([path, content]) => [path, Buffer.from(content)]));
    files.set('frontend/fallback.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA1sAAAAASUVORK5CYII=', 'base64'));
    const wav = Buffer.alloc(46); wav.write('RIFF'); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2, 40);
    files.set('frontend/audio.wav', wav); files.set('frontend/video.webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    return { files, compile: () => compileFrontend({ source: 'frontend/index.json', files, mode }), index, contract };
}
