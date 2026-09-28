import { compileFrontend } from '../../../src/native/frontend/compiler.js';

export const objectSchema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export function presentationFixture(mode = 'full', font = null) {
    const rows = Array.from({ length: 1000 }, (_, index) => ({ id: 'row' + index, label: 'Item ' + index }));
    const contract = { state: {
        ui: { schema: objectSchema({ count: { type: 'integer' }, title: { type: 'string', maxLength: 100 }, rows: { type: 'array', maxItems: 10000, items: objectSchema({ id: { type: 'string', maxLength: 32 }, label: { type: 'string', maxLength: 80 } }) } }), initial: { count: 0, title: 'Harbor workshop', rows } },
        view: { schema: objectSchema({ visits: { type: 'integer' } }), initial: { visits: 0 } },
        draft: { schema: objectSchema({ note: { type: 'string', maxLength: 100 } }), initial: { note: '' } },
        prefs: { schema: objectSchema({ compact: { type: 'boolean' } }), initial: { compact: false } },
    }, interactions: {
        increment: [{ kind: 'set', target: 'ui.count', value: { op: 'add', args: [{ get: 'ui.count' }, 1] } }],
        receive: [{ kind: 'set', target: 'ui.count', value: { get: 'event.value' } }],
        dialog: [{ kind: 'overlay.open', target: 'dialog' }], next: [{ kind: 'view.push', target: 'other' }],
        submit: [{ kind: 'set', target: 'view.visits', value: 1 }], compact: [{ kind: 'toggle', target: 'prefs.compact' }],
    }, nodeRefs: ['title', 'increment'], dynamicStyles: { opacity: { property: '--level', type: 'opacity' } } };
    const component = { props: { count: { schema: { type: 'integer' } } }, emits: { increase: { type: 'integer' } }, slots: ['default'],
        state: { component: { schema: objectSchema({ clicks: { type: 'integer' } }), initial: { clicks: 0 } } },
        interactions: { increase: [{ kind: 'set', target: 'component.clicks', value: { op: 'add', args: [{ get: 'component.clicks' }, 1] } }, { kind: 'emit', target: 'increase', value: { op: 'add', args: [{ get: 'props.count' }, 1] } }] } };
    const aui = (template, contract = {}, style = '') => `<template>${template}</template><contract>${JSON.stringify(contract)}</contract><style>${style}</style>`;
    const index = { format: 'atria-frontend-source', version: 3, primaryView: 'main',
        views: ['main', 'other', 'dialog'].map((id, i) => ({ id, root: ['Main', 'Other', 'Dialog'][i], surface: mode === 'component' ? 'sidebar.right' : 'app.root' })),
        components: ['Main', 'Counter', 'Other', 'Dialog'].map(id => ({ id, source: id + '.aui' })),
        styles: [{ id: 'theme', source: 'theme.css' }], assets: font ? [{ id: 'bodyFont', source: 'font.woff2', mediaType: 'font/woff2' }] : [],
    };
    const files = new Map([
        ['frontend/index.json', Buffer.from(JSON.stringify(index))],
        ['frontend/Main.aui', Buffer.from(aui('<main node-id="root"><span node-id="fixed" class="fixed">Contained fixed layer</span><header node-id="header"><p node-id="eyebrow">ATRIA / NATIVE FRONTEND</p><h1 node-id="title" bind:text="ui.title" /></header><section node-id="controls"><button node-id="increment" on:click="increment">Increment</button><output node-id="count" bind:text="ui.count" /><button node-id="dialog" on:click="dialog">Open overlay</button><button node-id="next" on:click="next">Next view</button><button node-id="compact" on:click="compact">Toggle preference</button></section><component node-id="counterA" ref="Counter" prop:count="ui.count" on:increase="receive"><span node-id="slotA">First instance</span></component><component node-id="counterB" ref="Counter" prop:count="ui.count" on:increase="receive"><span node-id="slotB">Second instance</span></component><form node-id="form" on:submit="submit"><label node-id="label" for="note">Draft note</label><input node-id="note" id="note" bind:value="draft.note" required="true" /><button node-id="submit" type="submit">Save draft locally</button></form><p node-id="device" bind:text="env.device" /><div node-id="rows" each="ui.rows" item-key="id" window-size="6" row-height="32"><span node-id="rowLabel" bind:text="item.label" /></div></main>', contract, 'main{padding:24px;display:grid;gap:16px;box-sizing:border-box}h1{font-size:clamp(24px,4vw,40px);margin:0}section{display:flex;flex-wrap:wrap;gap:8px}.fixed{position:fixed;right:4px;bottom:4px;z-index:2147483647;font-size:10px;pointer-events:none}form{display:grid;gap:8px}button{cursor:pointer} @media(max-width:600px){main{padding:16px}}'))],
        ['frontend/Counter.aui', Buffer.from(aui('<section node-id="counter"><slot node-id="label" /><button node-id="increase" on:click="increase">Component increment</button><span node-id="localCount" bind:text="component.clicks" /></section>', component, 'section{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #49626e;border-radius:8px}'))],
        ['frontend/Other.aui', Buffer.from(aui('<section node-id="other"><h2 node-id="heading">Other view</h2><button node-id="back" on:click="back">Back</button></section>', { interactions: { back: [{ kind: 'view.back' }] } }))],
        ['frontend/Dialog.aui', Buffer.from(aui('<section node-id="dialog"><h2 node-id="heading">Local overlay</h2><input node-id="first" aria-label="Overlay input" /><button node-id="close" on:click="close">Close overlay</button></section>', { interactions: { close: [{ kind: 'overlay.close' }] } }, 'section{padding:24px;display:grid;gap:16px}'))],
        ['frontend/theme.css', Buffer.from((font ? '@font-face{font-family:Harbor;src:url(resource:bodyFont);font-display:swap}' : '') + '@layer theme{:host{font:16px/1.5 ' + (font ? 'Harbor' : 'system-ui') + ';color:#e5eff2;background:#142c35}button,input{font:inherit;border-radius:6px;padding:6px 10px;border:1px solid #69828c;background:#234550;color:inherit}button:focus-visible,input:focus-visible{outline:3px solid #eac78a}button:hover{background:#365f69}}')],
    ]);
    if (font) files.set('frontend/font.woff2', font);
    return { files, contract, index, compile: () => compileFrontend({ source: 'frontend/index.json', files, mode }) };
}
