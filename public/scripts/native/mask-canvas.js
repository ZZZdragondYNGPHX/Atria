import { translateShellText } from '../atria-shell/localization.js';
import { replayMask, maskPixelFromScreen } from '../../shared/native-mask.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { illustrationNode as node, illustrationButton as button, illustrationField as field, illustrationSelect as select } from './illustration-ui.js';

export class MaskCommandModel {
    constructor({ width, height, checkpoint, commands = [], cursor = commands.length }) { Object.assign(this, { width, height, checkpoint: new Uint8Array(checkpoint), commands: structuredClone(commands), cursor }); }
    pixels() { return replayMask(this.checkpoint, this.commands, this.cursor, this.width, this.height); }
    add(command) { this.commands = [...this.commands.slice(0, this.cursor), structuredClone(command)]; this.cursor++; }
    undo() { this.cursor = Math.max(0, this.cursor - 1); }
    redo() { this.cursor = Math.min(this.commands.length, this.cursor + 1); }
    compact(count = 50) {
        if (this.cursor < count) return null;
        const checkpoint = replayMask(this.checkpoint, this.commands, count, this.width, this.height);
        return { checkpoint, commands: this.commands.slice(count), cursor: this.cursor - count };
    }
}
export function mountMaskCanvas({ document: doc, parent, baseUrl, model, changed }) {
    const root = node(doc, parent, 'section'), controls = node(doc, root, 'div', undefined, 'atri-illustration-actions');
    let tool = 'brush', radius = 16, scale = 1, offsetX = 0, offsetY = 0, gesture = null, frame = null;
    const pointers = new Map();
    select(doc, controls, translateShellText('Mask tool'), tool, [['brush', translateShellText('Brush')], ['erase', translateShellText('Erase')], ['rect', translateShellText('Rectangle')], ['pan', translateShellText('Pan')]], value => tool = value);
    const radiusInput = field(doc, controls, translateShellText('Brush radius in original pixels'), radius, value => radius = Math.max(1, Math.min(256, Number(value))), { type: 'number' }); radiusInput.min = '1'; radiusInput.max = '256';
    const viewport = node(doc, root, 'div', undefined, 'atri-mask-viewport'); viewport.tabIndex = 0; viewport.setAttribute('aria-label', tl('Mask editor. Use the rectangle controls below or keyboard undo.'));
    Object.assign(viewport.style, { position: 'relative', overflow: 'hidden', height: 'min(55dvh, 420px)', touchAction: 'none', background: 'var(--atri-surface-2)' });
    const plane = node(doc, viewport, 'div'); Object.assign(plane.style, { position: 'absolute', transformOrigin: '0 0', width: model.width + 'px', height: model.height + 'px' });
    const image = node(doc, plane, 'img'); image.src = baseUrl; image.alt = translateShellText('Original image for local editing'); image.width = model.width; image.height = model.height; image.draggable = false;
    Object.assign(image.style, { width: model.width + 'px', height: model.height + 'px', maxWidth: 'none' });
    const canvas = node(doc, plane, 'canvas'); canvas.width = model.width; canvas.height = model.height; Object.assign(canvas.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    const context = canvas.getContext('2d'), applyView = () => plane.style.transform = 'translate(' + offsetX + 'px,' + offsetY + 'px) scale(' + scale + ')';
    const resetView = () => { scale = Math.min(viewport.clientWidth / model.width || 1, viewport.clientHeight / model.height || 1); offsetX = offsetY = 0; applyView(); };
    const paint = () => {
        if (!context) return;
        const pixels = model.pixels(), overlay = context.createImageData(model.width, model.height);
        for (let i = 0; i < pixels.length; i++) { overlay.data[i * 4] = 92; overlay.data[i * 4 + 1] = 155; overlay.data[i * 4 + 2] = 255; overlay.data[i * 4 + 3] = Math.round(pixels[i] * .55); }
        context.putImageData(overlay, 0, 0);
    };
    const update = () => { paint(); changed(); };
    button(doc, controls, translateShellText('Undo'), () => { model.undo(); update(); }); button(doc, controls, translateShellText('Redo'), () => { model.redo(); update(); });
    button(doc, controls, translateShellText('Clear mask'), () => { model.add({ kind: 'fill', value: 0 }); update(); }); button(doc, controls, translateShellText('Fit to window'), resetView);
    const point = event => maskPixelFromScreen(event.clientX, event.clientY, viewport.getBoundingClientRect(), { scale, offsetX, offsetY }, model.width, model.height);
    const midpoint = () => { const [a, b] = [...pointers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }; };
    const down = event => {
        if (event.button !== 0 && event.pointerType !== 'touch') return;
        event.preventDefault(); viewport.setPointerCapture?.(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 2) { paint(); gesture = { kind: 'pinch', ...midpoint(), scale, offsetX, offsetY }; return; }
        if (pointers.size > 2) return;
        gesture = tool === 'pan' ? { kind: 'pan', x: event.clientX, y: event.clientY, offsetX, offsetY } : { kind: tool, points: [point(event)] };
    };
    const move = event => {
        if (!pointers.has(event.pointerId) || !gesture) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); event.preventDefault();
        if (gesture.kind === 'pinch' && pointers.size === 2) {
            const next = midpoint(), rect = viewport.getBoundingClientRect(); scale = Math.max(.1, Math.min(8, gesture.scale * next.distance / gesture.distance));
            offsetX = next.x - rect.left - (gesture.x - rect.left - gesture.offsetX) * scale / gesture.scale;
            offsetY = next.y - rect.top - (gesture.y - rect.top - gesture.offsetY) * scale / gesture.scale; applyView();
        } else if (gesture.kind === 'pan') { offsetX = gesture.offsetX + event.clientX - gesture.x; offsetY = gesture.offsetY + event.clientY - gesture.y; applyView(); } else if (gesture.points && gesture.points.length < 2048) {
            const next = point(event), previous = gesture.points.at(-1); gesture.points.push(next);
            if (context && gesture.kind !== 'rect') {
                context.save(); context.globalCompositeOperation = gesture.kind === 'erase' ? 'destination-out' : 'source-over';
                context.strokeStyle = 'rgba(92,155,255,.55)'; context.lineWidth = radius * 2; context.lineCap = 'round';
                context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(next.x, next.y); context.stroke(); context.restore();
            }
        }
    };
    const up = event => {
        if (!pointers.has(event.pointerId)) return; pointers.delete(event.pointerId);
        if (gesture?.points && gesture.kind !== 'pan') {
            const points = gesture.points, first = points[0], last = points.at(-1);
            model.add(gesture.kind === 'rect' ? { kind: 'rect', value: 255, x: Math.min(first.x, last.x), y: Math.min(first.y, last.y), width: Math.abs(last.x - first.x) + 1, height: Math.abs(last.y - first.y) + 1 }
                : { kind: 'stroke', value: gesture.kind === 'erase' ? 0 : 255, radius, points }); update();
        }
        gesture = null; viewport.releasePointerCapture?.(event.pointerId);
    };
    viewport.addEventListener('pointerdown', down); viewport.addEventListener('pointermove', move); viewport.addEventListener('pointerup', up);
    viewport.addEventListener('pointercancel', event => { pointers.delete(event.pointerId); gesture = null; });
    viewport.addEventListener('keydown', event => { if (!event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? model.redo() : model.undo(); update(); } });
    viewport.addEventListener('wheel', event => { if (!event.ctrlKey) return; event.preventDefault(); scale = Math.max(.1, Math.min(8, scale * Math.exp(-event.deltaY / 500))); applyView(); }, { passive: false });
    const keyboard = node(doc, root, 'details'); node(doc, keyboard, 'summary', translateShellText('Rectangle coordinates in pixels'));
    const rectangle = { x: 0, y: 0, width: Math.min(64, model.width), height: Math.min(64, model.height) };
    const coordinateLabels = { x: 'X coordinate', y: 'Y coordinate', width: 'Rectangle width', height: 'Rectangle height' };
    for (const key of Object.keys(rectangle)) field(doc, keyboard, translateShellText(coordinateLabels[key]), rectangle[key], text => rectangle[key] = Number(text), { type: 'number' });
    button(doc, keyboard, translateShellText('Add rectangle'), () => { model.add({ kind: 'rect', ...rectangle, value: 255 }); update(); });
    frame = doc.defaultView.requestAnimationFrame(() => { resetView(); paint(); });
    return { paint, dispose: () => { doc.defaultView.cancelAnimationFrame(frame); root.remove(); } };
}
