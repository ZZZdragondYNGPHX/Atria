import { canvasBuffer } from '../../../shared/native-frontend-script.js';

// Retain one validated buffer per Canvas. Coalesce updates with the same Host
// Frame Scheduler used by declarative presentation; never expose the context.
export function createCanvasSurface(node, scheduler, imageFor, budget = new Map(), onError = () => {}) {
    let retained = null, cancel = null, dead = false;
    function draw() {
        cancel = null; if (dead || !retained || !node.isConnected) return;
        node.width = retained.width; node.height = retained.height;
        const context = node.getContext('2d'); if (!context) { onError(new Error('canvas_unavailable')); return; }
        try {
            for (const [op, ...args] of retained.commands) {
                if (['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha'].includes(op)) context[op] = args[0];
                else if (op === 'image') { const image = imageFor(args[0]); if (!image) continue; context.drawImage(image, ...args.slice(1)); } else context[op](...args);
            }
        } catch (error) { onError(error); }
    }
    return { submit(value) {
        if (dead) throw new Error('canvas_revoked'); const next = canvasBuffer(value);
        const pixels = next.width * next.height, total = [...budget.values()].reduce((a, b) => a + b, 0) - (budget.get(node) ?? 0) + pixels;
        if ((!budget.has(node) && budget.size >= 16) || total > 8 * 1024 * 1024) throw new Error('canvas_experience_budget');
        for (const [op, handle] of next.commands) if (op === 'image' && !imageFor(handle)) throw new Error('media_handle_revoked');
        budget.set(node, pixels); retained = next; cancel ??= scheduler.frame(draw);
    },
    dispose() { dead = true; cancel?.(); retained = null; budget.delete(node); node.width = 0; node.height = 0; } };
}
