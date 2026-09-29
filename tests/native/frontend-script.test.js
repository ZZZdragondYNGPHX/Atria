import { describe, test, expect, beforeAll, jest } from '@jest/globals';
import { getQuickJS } from 'quickjs-emscripten';
import { scriptFixture } from './helpers/frontend-script-fixture.js';
import { compileController, validateScriptArtifact } from '../../src/native/frontend/script-compiler.js';
import { createScriptVM } from '../../public/scripts/native/frontend/script-vm.js';
import { canvasBuffer } from '../../public/shared/native-frontend-script.js';
import { validateFrontendGraph } from '../../src/native/frontend/graph.js';
import { createScriptSupervisor } from '../../public/scripts/native/frontend/script.js';
import { createCanvasSurface } from '../../public/scripts/native/frontend/canvas.js';
import { readFileSync } from 'node:fs';

let engine;
beforeAll(async () => { engine = await getQuickJS(); });
const compile = code => compileController('test.ts', () => code);
const run = code => { const vm = createScriptVM(engine, compile(code)); try { return vm.run({ kind: 'invoke', method: 'init', snapshot: { state: {}, props: {}, env: {}, time: 1 } }); } finally { vm.dispose(); } };

describe('Script compiler and isolated VM', () => {
    test('TS and local vendor link to exact graph and source maps', () => {
        const build = scriptFixture().compile(); const graph = validateFrontendGraph({ ...build, mode: 'full' });
        const ref = graph.resources.find(ref => ref.kind === 'script'), artifact = JSON.parse(build.files.get(ref.path));
        expect(artifact.modules).toHaveLength(2); expect(artifact.modules[0].map.sources).toEqual(['frontend/controller.ts']);
        expect(graph.resources.find(ref => ref.id === 'component:Main').dependencies).toContain('script:Main');
        expect(build.consumed.has('frontend/vendor/layout.js')).toBe(true);
    });
    test('unmodified third-party pure JS droll algorithm bundles locally and runs in QuickJS', () => {
        const files = new Map([
            ['controller.ts', 'import * as dice from "./vendor/droll.js"; export default {init(ctx) {ctx.emit("formula",dice.parse("2d6+3"));}}'],
            ['vendor/droll.js', readFileSync(new URL('../../node_modules/droll/droll.js', import.meta.url), 'utf8')],
        ]);
        const artifact = compileController('controller.ts', file => files.get(file));
        const vm = createScriptVM(engine, artifact);
        try { expect(vm.run({ kind: 'invoke', method: 'init', snapshot: {} })[0].args[1]).toMatchObject({ numDice: 2, numSides: 6, modifier: 3, minResult: 5, maxResult: 15 }); } finally { vm.dispose(); }
    });
    test.each(['window.alert(1)', 'document.createElement("div")', 'fetch("/")', 'localStorage.getItem("x")', 'eval("1")', 'new Function("1")', 'import("./x.js")', 'import x from "node:fs"', 'import x from "https://x.test/x.js"', 'require("./x.js")', 'WebAssembly.compile(x)'])('rejects forbidden source %s', source => expect(() => compile(source)).toThrow());
    test('rehashing unsafe compiled code cannot bypass installed validation', () => {
        const value = compile('export default {}'); value.modules[0].code = 'fetch("/")'; expect(() => validateScriptArtifact(value)).toThrow();
        value.modules[0].code = 'require("./missing.js")'; expect(() => validateScriptArtifact(value)).toThrow();
    });
    test('global/property constructor escapes do not reach ambient capabilities', () => {
        const calls = run('export default {init(ctx) { const name = \'con\'+\'structor\'; const root = ({}); ctx.emit(\'probe\', [typeof root[name][name], typeof (async()=>{})[name], typeof (function*(){})[name]]); }};');
        expect(calls[0].args[1]).toEqual(['undefined', 'undefined', 'undefined']);
    });
    test('readonly nested props and scoped messages', () => {
        const vm = createScriptVM(engine, compile('export default {init(ctx) { try {ctx.props.nested.x = 2;} catch {} ctx.emit("value",ctx.props.nested.x); }}'));
        try { expect(vm.run({ kind: 'invoke', method: 'init', snapshot: { props: { nested: { x: 1 } } } })[0].args).toEqual(['value', 1]); } finally { vm.dispose(); }
    });
    test('infinite loops are interrupted', () => expect(() => run('export default {init() {while(true){}}}')).toThrow(/interrupted/));
    test('heap exhaustion is contained', () => expect(() => run('export default {init() {const a=[]; while(true) a.push(new Array(100000).fill(123));}}')).toThrow());
    test('message storm and payloads are bounded', () => {
        expect(() => run('export default {init(ctx) {for(let i=0;i<100;i++)ctx.emit("x",i);}}')).toThrow();
        expect(() => run('export default {init(ctx) {ctx.emit("x","a".repeat(200000));}}')).toThrow();
        expect(() => run('export default {init(ctx) {for(let i=0;i<33;i++)ctx.bridge.snapshot("data",{});}}')).toThrow(/outstanding/);
    });
    test('promise continuations resume only through structured settlement', () => {
        const vm = createScriptVM(engine, compile('export default {async init(ctx) {const value = await ctx.bridge.snapshot("data",{}); ctx.set("component.count",value);}}'));
        try {
            const [call] = vm.run({ kind: 'invoke', method: 'init', snapshot: {} }); expect(call.method).toBe('bridge');
            expect(vm.run({ kind: 'settle', id: call.id, ok: true, value: 4, snapshot: {} })[0]).toEqual({ method: 'state', args: ['component.count', 4] });
        } finally { vm.dispose(); }
    });
    test('Canvas validates all commands and image handles before presentation', () => {
        expect(canvasBuffer({ width: 360, height: 240, commands: [['fillStyle', '#123456'], ['fillRect', 0, 0, 20, 20]] }).commands).toHaveLength(2);
        for (const commands of [[['getImageData', 0, 0, 1, 1]], [['fillStyle', 'url(https://x.test)']], [['restore']], [['lineTo', Infinity, 0]], [['image', { url: 'x' }, 0, 0, 20, 20]]]) expect(() => canvasBuffer({ width: 10, height: 10, commands })).toThrow();
    });
});

describe('Host supervisor budgets and revocation', () => {
    const window = { setTimeout, clearTimeout };
    const scheduler = { frame: callback => { const timer = setTimeout(() => callback(1), 1); return () => clearTimeout(timer); } };
    function factory(onMessage) {
        const workers = [];
        return { workers, create() { const worker = { dead: false, terminate() { this.dead = true; }, postMessage(message) { onMessage(worker, message); } }; workers.push(worker); return worker; } };
    }
    const reply = (worker, message, calls = [], extra = {}) => queueMicrotask(() => worker.onmessage({ data: { sequence: message.sequence, calls, cpu: 1, ...extra } }));
    test('watchdog hard-terminates an unresponsive Worker and rehydrates without replaying writes', async () => {
        let count = 0;
        const workers = factory((worker, message) => {
            if (message.kind === 'invoke' && message.method === 'event') return;
            if (message.kind === 'invoke' && workers.workers.length > 1) reply(worker, message, [{ id: 1, method: 'bridge', args: ['invoke', 'save', {}] }]);
            else reply(worker, message);
        });
        const supervisor = createScriptSupervisor({ window, scheduler, workerFactory: () => workers.create() });
        const handle = await supervisor.attach({ artifact: compile('export default {}'), snapshot: () => ({ state: { count } }), capability: () => { count++; }, required: false });
        try {
            await handle.invoke('event'); await new Promise(resolve => setTimeout(resolve, 10));
            expect(workers.workers[0].dead).toBe(true); expect(workers.workers).toHaveLength(2); expect(handle.status).toBe('recovered'); expect(count).toBe(0);
        } finally { supervisor.dispose(); }
    });
    test('late async completion is discarded on disposal', async () => {
        let complete;
        const workers = factory((worker, message) => reply(worker, message, message.kind === 'invoke' ? [{ id: 1, method: 'bridge', args: ['snapshot', 'notes'] }] : []));
        const supervisor = createScriptSupervisor({ window, scheduler, workerFactory: () => workers.create() });
        const handle = await supervisor.attach({ artifact: compile('export default {}'), snapshot: () => ({}), capability: () => new Promise(resolve => { complete = resolve; }), required: false });
        handle.dispose(); complete({ ok: true }); await new Promise(resolve => setTimeout(resolve, 5));
        expect(workers.workers).toHaveLength(1); expect(workers.workers[0].dead).toBe(true); supervisor.dispose();
    });
    test('Operation concurrency counts unresolved starts and cannot create a parallel scheduler', async () => {
        const calls = [];
        const workers = factory((worker, message) => reply(worker, message, message.kind === 'invoke' ? Array.from({ length: 8 }, (_, i) => ({ id: i + 1, method: 'bridge', args: ['start', 'task', {}] })) : []));
        const supervisor = createScriptSupervisor({ window, scheduler, workerFactory: () => workers.create() });
        await supervisor.attach({ artifact: compile('export default {}'), snapshot: () => ({}), capability: (method, args) => { calls.push([method, args]); return new Promise(() => {}); }, required: false });
        try { expect(calls).toHaveLength(4); } finally { supervisor.dispose(); }
    });
    test('required repeated budget failures escalate, optional script falls back', async () => {
        for (const required of [false, true]) {
            const failure = jest.fn(), diagnostics = [];
            const workers = factory((worker, message) => reply(worker, message, [], message.kind === 'invoke' ? { error: { reasonCode: 'script_budget_exceeded' } } : {}));
            const supervisor = createScriptSupervisor({ window, scheduler, workerFactory: () => workers.create(), onDiagnostic: value => diagnostics.push(value) });
            const handle = await supervisor.attach({ artifact: compile('export default {}'), snapshot: () => ({}), capability: () => {}, required, failure });
            expect(handle.status).toBe('unavailable'); expect(workers.workers).toHaveLength(3); expect(workers.workers.every(worker => worker.dead)).toBe(true);
            expect(failure).toHaveBeenCalledTimes(required ? 1 : 0); expect(diagnostics).toHaveLength(3); supervisor.dispose();
        }
    });
    test('Canvas retains only latest batch and enforces Experience pixel allocation', () => {
        let frame; const draw = jest.fn();
        const node = { isConnected: true, getContext: () => ({ fillRect: draw }) }, budget = new Map();
        const surface = createCanvasSurface(node, { frame(callback) { frame = callback; return () => {}; } }, () => null, budget);
        surface.submit({ width: 10, height: 10, commands: [['fillRect', 0, 0, 1, 1]] });
        surface.submit({ width: 10, height: 10, commands: [['fillRect', 0, 0, 2, 2]] }); frame();
        expect(draw).toHaveBeenCalledTimes(1); expect(draw).toHaveBeenCalledWith(0, 0, 2, 2);
        budget.set({}, 8 * 1024 * 1024); expect(() => surface.submit({ width: 10, height: 10, commands: [] })).toThrow(/budget/);
        surface.dispose(); expect(budget.has(node)).toBe(false);
    });
});
