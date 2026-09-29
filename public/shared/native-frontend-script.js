import { fields, identifier, resourcePath } from './native-frontend-contract.js';

export const SCRIPT_LIMITS = Object.freeze({ heap: 8 * 1024 * 1024, stack: 256 * 1024, cpuMs: 40, wallMs: 1000,
    experienceCpuMs: 2000, windowMs: 10000, modules: 64, moduleBytes: 512 * 1024, messageBytes: 128 * 1024,
    queue: 64, outstanding: 32, operations: 4, controllers: 16, commands: 2048, restarts: 2 });

export function scriptMessage(value) {
    const text = JSON.stringify(value);
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > SCRIPT_LIMITS.messageBytes) throw new TypeError('script_message_budget');
    return JSON.parse(text);
}

export function assertController(value) {
    fields(value, ['source', 'required']); resourcePath(value.source);
    if (!/\.(?:js|ts)$/.test(value.source) || typeof value.required !== 'boolean') throw new TypeError('Invalid Controller declaration');
    return value;
}

export function assertScriptArtifact(value) {
    fields(value, ['format', 'version', 'entry', 'modules']);
    if (value.format !== 'atria-script' || value.version !== 1 || !Array.isArray(value.modules) || !value.modules.length || value.modules.length > SCRIPT_LIMITS.modules) throw new TypeError('Invalid Script artifact');
    const ids = new Set(); let bytes = 0;
    for (const module of value.modules) {
        fields(module, ['id', 'code', 'imports', 'map', 'sourceHash']); resourcePath(module.id);
        if (ids.has(module.id) || typeof module.code !== 'string' || !/^[a-f0-9]{64}$/.test(module.sourceHash)) throw new TypeError('Invalid Script module');
        ids.add(module.id); bytes += new TextEncoder().encode(module.code).length;
        if (bytes > SCRIPT_LIMITS.moduleBytes) throw new TypeError('script_module_budget');
        fields(module.imports, Object.keys(module.imports));
        for (const [name, target] of Object.entries(module.imports)) {
            if (!name.startsWith('./') && !name.startsWith('../')) throw new TypeError('Only package-local imports');
            resourcePath(target);
        }
        fields(module.map, ['version', 'file', 'sources', 'names', 'mappings']);
        if (module.map.version !== 3 || !Array.isArray(module.map.sources) || module.map.sources.length !== 1 || module.map.sources[0] !== module.id
            || !Array.isArray(module.map.names) || module.map.names.length > 10000 || module.map.names.some(name => typeof name !== 'string' || name.length > 256)
            || typeof module.map.mappings !== 'string' || module.map.mappings.length > SCRIPT_LIMITS.moduleBytes) throw new TypeError('Invalid Script source map');
    }
    if (!ids.has(value.entry)) throw new TypeError('Missing Controller entry');
    for (const module of value.modules) for (const target of Object.values(module.imports)) if (!ids.has(target)) throw new TypeError('Open Script module graph');
    return value;
}

export function canvasBuffer(value) {
    fields(value, ['width', 'height', 'commands']);
    if (![value.width, value.height].every(n => Number.isInteger(n) && n > 0 && n <= 2048)
        || !Array.isArray(value.commands) || value.commands.length > SCRIPT_LIMITS.commands) throw new TypeError('canvas_budget');
    const arities = { clearRect: 4, fillRect: 4, strokeRect: 4, beginPath: 0, closePath: 0, moveTo: 2, lineTo: 2, arc: 6,
        bezierCurveTo: 6, quadraticCurveTo: 4, fill: 0, stroke: 0, save: 0, restore: 0, translate: 2, scale: 2, rotate: 1, setTransform: 6 };
    let depth = 0;
    for (const command of value.commands) {
        if (!Array.isArray(command)) throw new TypeError('canvas_command');
        const [op, ...args] = command;
        if (Object.hasOwn(arities, op)) {
            if (args.length !== arities[op] || args.some((n, i) => op === 'arc' && i === 5 ? typeof n !== 'boolean' : !Number.isFinite(n) || Math.abs(n) > 1e6)) throw new TypeError('canvas_arguments');
            if (op === 'arc' && args[2] < 0) throw new TypeError('canvas_radius');
        } else if (['fillStyle', 'strokeStyle'].includes(op)) {
            if (args.length !== 1 || typeof args[0] !== 'string' || !/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/.test(args[0])) throw new TypeError('canvas_color');
        } else if (op === 'lineWidth' || op === 'globalAlpha') {
            if (args.length !== 1 || !Number.isFinite(args[0]) || args[0] < 0 || args[0] > (op === 'globalAlpha' ? 1 : 128)) throw new TypeError('canvas_style');
        } else if (op === 'fillText') {
            if (args.length !== 3 || typeof args[0] !== 'string' || args[0].length > 256 || !args.slice(1).every(n => Number.isFinite(n) && Math.abs(n) <= 1e6)) throw new TypeError('canvas_text');
        } else if (op === 'image') {
            if (args.length !== 5 || typeof args[0] !== 'string' || args[0].length > 96 || !args.slice(1).every(n => Number.isFinite(n) && Math.abs(n) <= 4096)) throw new TypeError('canvas_image');
        } else throw new TypeError('canvas_command_denied');
        if (op === 'save' && ++depth > 32) throw new TypeError('canvas_stack');
        if (op === 'restore' && --depth < 0) throw new TypeError('canvas_stack');
    }
    if (depth) throw new TypeError('canvas_stack');
    return scriptMessage(value);
}

export function scriptMethod(name) { identifier(name); if (!['init', 'event', 'update'].includes(name)) throw new TypeError('script_handler_denied'); return name; }
