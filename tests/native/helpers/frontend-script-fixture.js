import { compileFrontend } from '../../../src/native/frontend/compiler.js';

export function scriptFixture(mode = 'full', code = null) {
    const files = new Map(Object.entries({
        'frontend/index.json': JSON.stringify({ format: 'atria-frontend-source', version: 3, primaryView: 'Main', views: [{ id: 'Main', root: 'Main', surface: mode === 'component' ? 'chat.footer' : 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] }),
        'frontend/Main.aui': `<contract>${JSON.stringify({ controller: { source: 'controller.ts', required: true }, nodeRefs: ['map', 'animate', 'crash'], state: { component: { schema: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'], additionalProperties: false }, initial: { count: 0 } } } })}</contract>
<template><section node-id="root"><h1 node-id="heading">Sandbox relationship map</h1><canvas node-id="map" width="360" height="240" aria-label="Relationship map"></canvas><button node-id="animate">Animate</button><button node-id="crash">Runaway</button><output node-id="count" bind:text="component.count"></output></section></template>
<style>section { padding:16px; color:#243744; background:#f3f5f0; } canvas { width:100%; max-width:360px; border:1px solid #728a8a; } button { min-height:44px; margin:8px; }</style>`,
        'frontend/vendor/layout.js': 'export function layout(n) { return Array.from({length:n}, (_,i) => ({x:180+100*Math.cos(i*2*Math.PI/n), y:120+80*Math.sin(i*2*Math.PI/n)})); }',
        'frontend/controller.ts': code ?? `import { layout } from './vendor/layout.js';
function draw(ctx, phase: number = 0) {
 const points = layout(6), commands: any[] = [['fillStyle','#edf3e8'],['fillRect',0,0,360,240],['strokeStyle','#718b8b'],['beginPath']];
 for (const point of points) commands.push(['moveTo',180,120],['lineTo',point.x,point.y]);
 commands.push(['stroke'],['fillStyle','#356d83']);
 for (let i=0;i<points.length;i++) { const p=points[i]; commands.push(['beginPath'],['arc',p.x,p.y,10+(i===phase?4:0),0,Math.PI*2,false],['fill'],['fillText','Node '+i,p.x-20,p.y+26]); }
 ctx.canvas('map',{width:360,height:240,commands});
}
export default { init(ctx) { draw(ctx); }, async event(ctx,event) {
 if (event.type !== 'click') return;
 if (event.node === 'crash') { while(true) {} }
 if (event.node === 'animate') { ctx.set('component.count',ctx.state.count+1); for(let i=0;i<6;i++) { await ctx.scheduler.timer(20); await ctx.scheduler.frame(); draw(ctx,i); } }
} };`,
    }).map(([path, value]) => [path, Buffer.from(value)]));
    return { files, compile: () => compileFrontend({ source: 'frontend/index.json', files, mode }) };
}
