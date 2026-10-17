// SVG graph presentation. It only reflects the caller's model: Plan Draft
// geometry while authoring, or the Host Run projection while observing.
// Every pointer action has a keyboard or list equivalent elsewhere.
import { formatShellText as fmt, translateShellText as tl } from '../../atria-shell/localization.js';
import { createAtriaIconButton } from '../../atria-shell/components.js';

const SVG = 'http://www.w3.org/2000/svg';
export const NODE_W = 188, NODE_H = 62;
const KIND_GLYPHS = { agent: 'A', planner: 'P', judge: 'J', review: 'R', router: '⑂', effect: 'E', fanout: '⇉', join: '⋈', wait: '⏸', approval: '✓', output: '◎' };
export const KIND_LABELS = Object.freeze({ agent: 'Agent', planner: 'Planner', judge: 'Judge', review: 'Reviewer', router: 'Router', effect: 'Effect',
    fanout: 'Fan-out', join: 'Join', wait: 'Wait', approval: 'Approval gate', output: 'Output' });

const svg = (doc, tag, attrs = {}) => {
    const node = doc.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    return node;
};
const clip = (text, max) => text.length > max ? text.slice(0, max - 1) + '…' : text;

export class GraphView {
    #doc; #options; #model = { nodes: [], edges: [], positions: {} }; #selection = null; #view = { x: 0, y: 0, k: 1 };
    #nodeEls = new Map(); #drag = null; #reduced = false;

    constructor(doc, { editable = false, ariaLabel = '', onSelect = () => {}, onMove = () => {}, onConnect = () => {}, onDelete = () => {}, onActivate = () => {} } = {}) {
        this.#doc = doc;
        this.#options = { editable, onSelect, onMove, onConnect, onDelete, onActivate };
        this.element = doc.createElement('div');
        this.element.className = 'atria-orch-graph';
        this.element.dataset.editable = String(editable);
        this.svg = svg(doc, 'svg', { class: 'atria-orch-graph__svg', role: 'group', 'aria-label': ariaLabel || tl('Graph') });
        const defs = svg(doc, 'defs');
        for (const [id, cls] of [['atria-orch-arrow', 'atria-orch-graph__arrow'], ['atria-orch-arrow-sel', 'atria-orch-graph__arrow is-selected']]) {
            const marker = svg(doc, 'marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
            marker.append(svg(doc, 'path', { d: 'M0 0 L10 5 L0 10 z', class: cls }));
            defs.append(marker);
        }
        this.stage = svg(doc, 'g', { class: 'atria-orch-graph__stage' });
        this.edgeLayer = svg(doc, 'g', { class: 'atria-orch-graph__edges' });
        this.nodeLayer = svg(doc, 'g', { class: 'atria-orch-graph__nodes' });
        this.ghost = svg(doc, 'path', { class: 'atria-orch-graph__ghost', hidden: '' });
        this.stage.append(this.edgeLayer, this.ghost, this.nodeLayer);
        this.svg.append(defs, this.stage);
        const tools = doc.createElement('div');
        tools.className = 'atria-orch-graph__tools';
        tools.append(
            createAtriaIconButton(doc, { label: tl('Zoom in'), icon: 'plus', onClick: () => this.zoomBy(1.2) }),
            createAtriaIconButton(doc, { label: tl('Zoom out'), icon: 'minus', onClick: () => this.zoomBy(1 / 1.2) }),
            createAtriaIconButton(doc, { label: tl('Fit graph to view'), icon: 'expand', onClick: () => this.fit() }),
        );
        this.element.append(this.svg, tools);
        this.#reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        this.#bindPan();
        // Fit on size changes until the person pans or zooms themselves.
        this.autoFit = true;
        this.resize = new doc.defaultView.ResizeObserver(() => { if (this.autoFit) this.fit(); });
        this.resize.observe(this.svg);
    }

    get selection() { return this.#selection; }

    render(model) {
        this.#model = model;
        const doc = this.#doc;
        // Re-rendering replaces nodes; keep keyboard focus on the same item.
        const focused = this.element.contains(doc.activeElement) ? doc.activeElement.closest?.('[data-node-id], [data-edge-id]') : null;
        const refocus = focused ? (focused.dataset.nodeId ? '[data-node-id="' + focused.dataset.nodeId + '"]' : '[data-edge-id="' + focused.dataset.edgeId + '"]') : null;
        this.edgeLayer.replaceChildren();
        this.nodeLayer.replaceChildren();
        this.#nodeEls.clear();
        const at = id => model.positions[id] ?? { x: 0, y: 0 };
        for (const edge of model.edges) {
            const from = at(edge.from), to = at(edge.to);
            const selected = this.#selection?.type === 'edge' && this.#selection.id === edge.id;
            const group = svg(doc, 'g', { class: 'atria-orch-graph__edge', 'data-edge-id': edge.id, 'data-loop': edge.loopBack ? 'true' : null,
                'data-mismatch': edge.mismatch ? 'true' : null, 'data-tone': edge.tone ?? null, 'data-selected': selected ? 'true' : null,
                role: 'button', tabindex: -1, 'aria-label': edge.ariaLabel ?? tl('Edge') });
            const sx = from.x + NODE_W, sy = from.y + NODE_H / 2, tx = to.x, ty = to.y + NODE_H / 2;
            let d;
            if (edge.loopBack) {
                const top = Math.min(from.y, to.y) - 56;
                d = `M${from.x + NODE_W / 2} ${from.y} C ${from.x + NODE_W / 2} ${top}, ${to.x + NODE_W / 2} ${top}, ${to.x + NODE_W / 2} ${to.y}`;
            } else {
                const bend = Math.max(48, Math.abs(tx - sx) / 2);
                d = `M${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`;
            }
            group.append(svg(doc, 'path', { d, class: 'atria-orch-graph__edge-hit' }), svg(doc, 'path', { d, class: 'atria-orch-graph__edge-line', 'marker-end': `url(#${selected ? 'atria-orch-arrow-sel' : 'atria-orch-arrow'})` }));
            const badge = edge.loopBack ? fmt('↺ ≤${0}', [edge.maxVisits]) : edge.condition && edge.condition !== 'always' ? tl(edge.condition === 'success' ? 'on success' : 'on failure') : '';
            if (badge) {
                const mx = edge.loopBack ? (from.x + to.x) / 2 + NODE_W / 2 : (sx + tx) / 2, my = edge.loopBack ? Math.min(from.y, to.y) - 44 : (sy + ty) / 2 - 8;
                const label = svg(doc, 'text', { x: mx, y: my, class: 'atria-orch-graph__edge-label', 'text-anchor': 'middle' });
                label.textContent = badge;
                group.append(label);
            }
            group.addEventListener('click', event => { event.stopPropagation(); this.select({ type: 'edge', id: edge.id }, { notify: true }); });
            group.addEventListener('keydown', event => this.#edgeKey(event, edge));
            this.edgeLayer.append(group);
        }
        model.nodes.forEach((node, index) => {
            const { x, y } = at(node.id);
            const selected = this.#selection?.type === 'node' && this.#selection.id === node.id;
            const group = svg(doc, 'g', { class: 'atria-orch-graph__node', transform: `translate(${x} ${y})`, 'data-node-id': node.id, 'data-kind': node.kind,
                'data-tone': node.tone ?? null, 'data-shape': node.shape ?? null, 'data-issue': node.issue ? 'true' : null, 'data-selected': selected ? 'true' : null,
                role: 'button', tabindex: (this.#selection ? selected : index === 0) ? 0 : -1, 'aria-pressed': String(selected), 'aria-label': node.ariaLabel ?? node.label });
            group.append(svg(doc, 'rect', { width: NODE_W, height: NODE_H, rx: 10, class: 'atria-orch-graph__card' }));
            group.append(svg(doc, 'rect', { x: 10, y: 14, width: 26, height: 26, rx: 7, class: 'atria-orch-graph__glyph-box' }));
            const glyph = svg(doc, 'text', { x: 23, y: 32, 'text-anchor': 'middle', class: 'atria-orch-graph__glyph' });
            glyph.textContent = KIND_GLYPHS[node.kind] ?? '•';
            const title = svg(doc, 'text', { x: 46, y: 27, class: 'atria-orch-graph__title' });
            title.textContent = clip(node.label || tl(KIND_LABELS[node.kind] ?? node.kind), 19);
            const sub = svg(doc, 'text', { x: 46, y: 45, class: 'atria-orch-graph__sub' });
            sub.textContent = clip(node.sub ?? tl(KIND_LABELS[node.kind] ?? node.kind), 24);
            group.append(glyph, title, sub);
            if (node.entry) group.append(svg(doc, 'path', { d: 'M-9 25 L-1 31 L-9 37 z', class: 'atria-orch-graph__entry' }));
            if (node.issue) {
                const mark = svg(doc, 'circle', { cx: NODE_W - 4, cy: 4, r: 7, class: 'atria-orch-graph__issue' });
                const bang = svg(doc, 'text', { x: NODE_W - 4, y: 8, 'text-anchor': 'middle', class: 'atria-orch-graph__issue-text' });
                bang.textContent = '!';
                group.append(mark, bang);
            }
            if (this.#options.editable && node.kind !== 'output') {
                const handle = svg(doc, 'circle', { cx: NODE_W, cy: NODE_H / 2, r: 8, class: 'atria-orch-graph__handle', 'aria-hidden': 'true' });
                handle.addEventListener('pointerdown', event => this.#startConnect(event, node.id));
                group.append(handle);
            }
            group.addEventListener('pointerdown', event => this.#startDrag(event, node.id));
            group.addEventListener('click', event => { event.stopPropagation(); if (this.#drag?.moved) return; this.select({ type: 'node', id: node.id }, { notify: true }); });
            group.addEventListener('dblclick', () => this.#options.onActivate({ type: 'node', id: node.id }));
            group.addEventListener('keydown', event => this.#nodeKey(event, node));
            this.nodeLayer.append(group);
            this.#nodeEls.set(node.id, group);
        });
        this.#applyView();
        if (refocus) this.nodeLayer.parentNode.querySelector(refocus)?.focus({ preventScroll: true });
    }

    select(selection, { notify = false, focus = false } = {}) {
        this.#selection = selection;
        for (const [id, el] of this.#nodeEls) {
            const on = selection?.type === 'node' && selection.id === id;
            el.toggleAttribute('data-selected', on);
            el.setAttribute('aria-pressed', String(on));
            el.setAttribute('tabindex', on || (!selection || selection.type !== 'node') && el === this.nodeLayer.firstChild ? '0' : '-1');
        }
        for (const el of this.edgeLayer.children) {
            const on = selection?.type === 'edge' && selection.id === el.dataset.edgeId;
            el.toggleAttribute('data-selected', on);
            el.querySelector('.atria-orch-graph__edge-line')?.setAttribute('marker-end', `url(#${on ? 'atria-orch-arrow-sel' : 'atria-orch-arrow'})`);
        }
        if (selection?.type === 'node' && focus) this.#nodeEls.get(selection.id)?.focus();
        if (selection?.type === 'node') this.reveal(selection.id);
        if (notify) this.#options.onSelect(selection);
    }

    reveal(nodeId) {
        const at = this.#model.positions[nodeId];
        const box = this.svg.getBoundingClientRect();
        if (!at || !box.width) return;
        const sx = at.x * this.#view.k + this.#view.x, sy = at.y * this.#view.k + this.#view.y;
        if (sx < 0 || sy < 0 || sx + NODE_W * this.#view.k > box.width || sy + NODE_H * this.#view.k > box.height) {
            this.#view.x = box.width / 2 - (at.x + NODE_W / 2) * this.#view.k;
            this.#view.y = box.height / 2 - (at.y + NODE_H / 2) * this.#view.k;
            this.#applyView();
        }
    }

    fit() {
        const box = this.svg.getBoundingClientRect(), points = this.#model.nodes.map(node => this.#model.positions[node.id]).filter(Boolean);
        if (!box.width || !points.length) return;
        const minX = Math.min(...points.map(p => p.x)) - 40, minY = Math.min(...points.map(p => p.y)) - 80;
        const maxX = Math.max(...points.map(p => p.x)) + NODE_W + 40, maxY = Math.max(...points.map(p => p.y)) + NODE_H + 40;
        const k = Math.max(.35, Math.min(1.25, Math.min(box.width / (maxX - minX), box.height / (maxY - minY))));
        this.#view = { k, x: (box.width - (maxX - minX) * k) / 2 - minX * k, y: (box.height - (maxY - minY) * k) / 2 - minY * k };
        this.#applyView();
    }

    zoomBy(factor, center = null) {
        this.autoFit = false;
        const box = this.svg.getBoundingClientRect();
        const cx = center?.x ?? box.width / 2, cy = center?.y ?? box.height / 2;
        const k = Math.max(.3, Math.min(2.5, this.#view.k * factor));
        this.#view.x = cx - (cx - this.#view.x) * (k / this.#view.k);
        this.#view.y = cy - (cy - this.#view.y) * (k / this.#view.k);
        this.#view.k = k;
        this.#applyView();
    }

    #applyView() {
        this.stage.setAttribute('transform', `translate(${this.#view.x} ${this.#view.y}) scale(${this.#view.k})`);
    }

    #toGraph(event) {
        const box = this.svg.getBoundingClientRect();
        return { x: (event.clientX - box.left - this.#view.x) / this.#view.k, y: (event.clientY - box.top - this.#view.y) / this.#view.k };
    }

    #bindPan() {
        let pan = null;
        this.svg.addEventListener('pointerdown', event => {
            if (event.target !== this.svg || event.button > 0) return;
            pan = { id: event.pointerId, x: event.clientX, y: event.clientY, vx: this.#view.x, vy: this.#view.y, moved: false };
            this.svg.setPointerCapture(event.pointerId);
        });
        this.svg.addEventListener('pointermove', event => {
            if (!pan || pan.id !== event.pointerId) return;
            const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
            if (Math.hypot(dx, dy) > 3) pan.moved = true;
            if (pan.moved) this.autoFit = false;
            this.#view.x = pan.vx + dx; this.#view.y = pan.vy + dy; this.#applyView();
        });
        const end = event => {
            if (!pan || pan.id !== event.pointerId) return;
            if (!pan.moved && event.type === 'pointerup') this.select(null, { notify: true });
            pan = null;
        };
        this.svg.addEventListener('pointerup', end);
        this.svg.addEventListener('pointercancel', end);
        this.svg.addEventListener('wheel', event => {
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                const box = this.svg.getBoundingClientRect();
                this.zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1, { x: event.clientX - box.left, y: event.clientY - box.top });
            } else { this.autoFit = false; this.#view.x -= event.deltaX; this.#view.y -= event.deltaY; this.#applyView(); }
        }, { passive: false });
    }

    #startDrag(event, nodeId) {
        if (event.button > 0 || event.target.classList.contains('atria-orch-graph__handle')) return;
        const start = this.#model.positions[nodeId] ?? { x: 0, y: 0 }, origin = this.#toGraph(event);
        this.#drag = { nodeId, pointerId: event.pointerId, start, origin, moved: false };
        const el = this.#nodeEls.get(nodeId);
        if (!this.#options.editable) return;
        el.setPointerCapture?.(event.pointerId);
        const move = moveEvent => {
            if (moveEvent.pointerId !== this.#drag?.pointerId) return;
            const point = this.#toGraph(moveEvent), dx = point.x - origin.x, dy = point.y - origin.y;
            if (!this.#drag.moved && Math.hypot(dx, dy) < 4) return;
            this.#drag.moved = true;
            this.#drag.to = { x: start.x + dx, y: start.y + dy };
            el.setAttribute('transform', `translate(${this.#drag.to.x} ${this.#drag.to.y})`);
        };
        const finish = endEvent => {
            el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', finish); el.removeEventListener('pointercancel', finish);
            const drag = this.#drag;
            if (drag?.moved && endEvent.type === 'pointerup') this.#options.onMove(nodeId, drag.to);
            else if (drag?.moved) el.setAttribute('transform', `translate(${start.x} ${start.y})`);
            // Keep `moved` visible to the click that follows this pointerup.
            setTimeout(() => { if (this.#drag === drag) this.#drag = null; }, 0);
        };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', finish); el.addEventListener('pointercancel', finish);
    }

    #startConnect(event, fromId) {
        event.stopPropagation();
        event.preventDefault();
        const handle = event.target, from = this.#model.positions[fromId];
        handle.setPointerCapture?.(event.pointerId);
        this.ghost.removeAttribute('hidden');
        const sx = from.x + NODE_W, sy = from.y + NODE_H / 2;
        const move = moveEvent => {
            const p = this.#toGraph(moveEvent);
            this.ghost.setAttribute('d', `M${sx} ${sy} C ${sx + 60} ${sy}, ${p.x - 60} ${p.y}, ${p.x} ${p.y}`);
        };
        const finish = endEvent => {
            handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', finish); handle.removeEventListener('pointercancel', finish);
            this.ghost.setAttribute('hidden', '');
            if (endEvent.type !== 'pointerup') return;
            const p = this.#toGraph(endEvent);
            const target = this.#model.nodes.find(node => {
                const at = this.#model.positions[node.id];
                return at && node.id !== fromId && p.x >= at.x && p.x <= at.x + NODE_W && p.y >= at.y && p.y <= at.y + NODE_H;
            });
            if (target) this.#options.onConnect(fromId, target.id);
        };
        handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
    }

    #nearest(nodeId, direction) {
        const here = this.#model.positions[nodeId];
        let best = null, score = Infinity;
        for (const node of this.#model.nodes) {
            if (node.id === nodeId) continue;
            const at = this.#model.positions[node.id], dx = at.x - here.x, dy = at.y - here.y;
            const forward = { ArrowRight: dx, ArrowLeft: -dx, ArrowDown: dy, ArrowUp: -dy }[direction];
            const across = direction === 'ArrowRight' || direction === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
            if (forward <= 0) continue;
            const value = forward + across * 2;
            if (value < score) { score = value; best = node.id; }
        }
        return best;
    }

    #nodeKey(event, node) {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            if (this.#options.editable && event.altKey) {
                const at = this.#model.positions[node.id], step = event.shiftKey ? 40 : 10;
                const next = { x: at.x + ({ ArrowLeft: -step, ArrowRight: step }[event.key] ?? 0), y: at.y + ({ ArrowUp: -step, ArrowDown: step }[event.key] ?? 0) };
                this.#options.onMove(node.id, next);
                return;
            }
            const target = this.#nearest(node.id, event.key);
            if (target) this.select({ type: 'node', id: target }, { notify: true, focus: true });
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.select({ type: 'node', id: node.id }, { notify: true });
            this.#options.onActivate({ type: 'node', id: node.id });
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && this.#options.editable) {
            event.preventDefault();
            this.#options.onDelete({ type: 'node', id: node.id });
        }
    }

    #edgeKey(event, edge) {
        if (event.isComposing) return;
        if ((event.key === 'Delete' || event.key === 'Backspace') && this.#options.editable) { event.preventDefault(); this.#options.onDelete({ type: 'edge', id: edge.id }); }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.select({ type: 'edge', id: edge.id }, { notify: true }); this.#options.onActivate({ type: 'edge', id: edge.id }); }
    }

    get reducedMotion() { return this.#reduced; }

    dispose() { this.resize.disconnect(); }
}
