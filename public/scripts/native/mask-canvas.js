import { translateShellText } from '../atria-shell/localization.js';
import { replayMask, maskPixelFromScreen } from '../../shared/native-mask.js';
import { el, iconButton, segmented, field, input, action } from './illustration-kit.js';
const node = (doc, parent, tag, text, className = '') => { const item = el(doc, tag, { className, text }); parent?.append(item); return item; };

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
    const root = node(doc, parent, 'section', undefined, 'atri-ill-mask'), controls = node(doc, root, 'div', undefined, 'atri-ill-row atri-ill-mask-tools');
    let tool = 'brush', radius = 16, scale = 1, offsetX = 0, offsetY = 0, gesture = null, frame = null;
    const pointers = new Map();
    controls.append(segmented(doc, translateShellText('Mask tool'), tool, [['brush', translateShellText('Brush')], ['erase', translateShellText('Erase')], ['rect', translateShellText('Rectangle')], ['pan', translateShellText('Pan')]], value => { tool = value; }));
    const radiusInput = el(doc, 'input', { attrs: { type: 'range', min: '2', max: '160', 'aria-label': translateShellText('Brush size') } }); radiusInput.value = String(radius);
    radiusInput.addEventListener('input', () => { radius = Number(radiusInput.value); });
    controls.append(el(doc, 'label', { className: 'atri-ill-row atri-ill-muted' }, [el(doc, 'span', { text: translateShellText('Size') }), radiusInput]));
    const viewport = node(doc, root, 'div', undefined, 'atri-mask-viewport'); viewport.tabIndex = 0; viewport.setAttribute('aria-label', translateShellText('Paint over the area to change. Ctrl+Z undoes, Ctrl+Shift+Z redoes.'));
    Object.assign(viewport.style, { position: 'relative', overflow: 'hidden', height: 'min(55dvh, 420px)', touchAction: 'none', background: 'var(--atri-surface-2)' });
    const plane = node(doc, viewport, 'div'); Object.assign(plane.style, { position: 'absolute', transformOrigin: '0 0', width: model.width + 'px', height: model.height + 'px' });
    const image = node(doc, plane, 'img'); image.src = baseUrl; image.alt = translateShellText('Original image for local editing'); image.width = model.width; image.height = model.height; image.draggable = false;
    Object.assign(image.style, { width: model.width + 'px', height: model.height + 'px', maxWidth: 'none' });
    const canvas = node(doc, plane, 'canvas'); canvas.width = model.width; canvas.height = model.height; Object.assign(canvas.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    const context = canvas.getContext('2d'), applyView = () => plane.style.transform = 'translate(' + offsetX + 'px,' + offsetY + 'px) scale(' + scale + ')';
    // Fit and centre the image. While the reader has not panned or zoomed, a resize
    // (e.g. the panel widening for retouching) fits it again.
    let fitted = null;
    const resetView = () => {
        scale = Math.min(viewport.clientWidth / model.width || 1, viewport.clientHeight / model.height || 1);
        offsetX = (viewport.clientWidth - model.width * scale) / 2; offsetY = (viewport.clientHeight - model.height * scale) / 2;
        fitted = { scale, offsetX, offsetY }; applyView();
    };
    const resizing = new doc.defaultView.ResizeObserver(() => { if (fitted && fitted.scale === scale && fitted.offsetX === offsetX && fitted.offsetY === offsetY) resetView(); });
    resizing.observe(viewport);
    const paint = () => {
        if (!context) return;
        const pixels = model.pixels(), overlay = context.createImageData(model.width, model.height);
        for (let i = 0; i < pixels.length; i++) { overlay.data[i * 4] = 92; overlay.data[i * 4 + 1] = 155; overlay.data[i * 4 + 2] = 255; overlay.data[i * 4 + 3] = Math.round(pixels[i] * .55); }
        context.putImageData(overlay, 0, 0);
    };
    const update = () => { paint(); changed(); };
    controls.append(el(doc, 'span', { className: 'atri-ill-spacer' }), iconButton(doc, translateShellText('Undo'), 'undo', () => { model.undo(); update(); }), iconButton(doc, translateShellText('Redo'), 'restore', () => { model.redo(); update(); }),
        iconButton(doc, translateShellText('Clear mask'), 'trash', () => { model.add({ kind: 'fill', value: 0 }); update(); }), iconButton(doc, translateShellText('Fit to window'), 'expand', () => resetView()));
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
    const keyboard = node(doc, root, 'details', undefined, 'atri-ill-details'); node(doc, keyboard, 'summary', translateShellText('Rectangle coordinates in pixels'));
    const keyboardFields = node(doc, keyboard, 'div', undefined, 'atri-ill-row');
    const rectangle = { x: 0, y: 0, width: Math.min(64, model.width), height: Math.min(64, model.height) };
    const coordinateLabels = { x: 'X coordinate', y: 'Y coordinate', width: 'Rectangle width', height: 'Rectangle height' };
    for (const key of Object.keys(rectangle)) keyboardFields.append(field(doc, translateShellText(coordinateLabels[key]), input(doc, String(rectangle[key]), text => { rectangle[key] = Number(text); }, { type: 'number' })));
    keyboardFields.append(action(doc, translateShellText('Add rectangle'), () => { model.add({ kind: 'rect', ...rectangle, value: 255 }); update(); }, { size: 'sm' }));
    frame = doc.defaultView.requestAnimationFrame(() => { resetView(); paint(); });
    return { paint, dispose: () => { doc.defaultView.cancelAnimationFrame(frame); resizing.disconnect(); root.remove(); } };
}
