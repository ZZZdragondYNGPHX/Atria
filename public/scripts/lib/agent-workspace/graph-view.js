/** Bounded, dependency-free graph preview. Execution remains entirely in Engine. */
export function renderGraph(parent, graph, selectNode) {
    const ns = 'http://www.w3.org/2000/svg';
    const nodes = graph.nodes.slice(0, 80), ids = new Set(nodes.map(node => node.nodeId));
    const edges = graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)).slice(0, 240);
    const columns = new Map(nodes.map(node => [node.nodeId, 0]));
    // Bounded edges represent retries, not another layout column.
    for (let pass = 0; pass < nodes.length; pass++) {
        let changed = false;
        for (const edge of edges.filter(edge => !edge.maxVisits)) {
            const value = Math.min(nodes.length, columns.get(edge.from) + 1);
            if (columns.get(edge.to) < value) { columns.set(edge.to, value); changed = true; }
        }
        if (!changed) break;
    }
    const rows = new Map(), positions = new Map();
    for (const node of nodes) {
        const column = columns.get(node.nodeId), row = rows.get(column) || 0;
        rows.set(column, row + 1); positions.set(node.nodeId, { x: column * 230 + 12, y: row * 90 + 12 });
    }
    const width = (Math.max(0, ...columns.values()) + 1) * 230, height = Math.max(1, ...rows.values()) * 90;
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Agent graph; selectable nodes are also listed below');
    svg.style.width = '100%'; svg.style.minHeight = '180px';
    const markerId = `arrow-${crypto.randomUUID()}`;
    const defs = document.createElementNS(ns, 'defs'), marker = document.createElementNS(ns, 'marker'), arrow = document.createElementNS(ns, 'path');
    marker.id = markerId; marker.setAttribute('viewBox', '0 0 10 10'); marker.setAttribute('refX', '9'); marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6'); marker.setAttribute('orient', 'auto-start-reverse');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); arrow.setAttribute('fill', '#89b9e0'); marker.append(arrow); defs.append(marker); svg.append(defs);
    for (const edge of edges) {
        const from = positions.get(edge.from), to = positions.get(edge.to), path = document.createElementNS(ns, 'path');
        path.setAttribute('d', `M ${from.x + 200} ${from.y + 30} L ${to.x} ${to.y + 30}`);
        path.setAttribute('stroke', '#89b9e0'); path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', `url(#${markerId})`);
        if (edge.maxVisits) path.setAttribute('stroke-dasharray', '5 4');
        const title = document.createElementNS(ns, 'title'); title.textContent = `${edge.from} → ${edge.to} (${edge.condition || 'always'})`; path.append(title); svg.append(path);
    }
    for (const node of nodes) {
        const group = document.createElementNS(ns, 'g'), position = positions.get(node.nodeId);
        group.setAttribute('transform', `translate(${position.x},${position.y})`); group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button');
        group.setAttribute('aria-label', `${node.nodeId} ${node.kind} ${node.status || ''}`);
        const select = () => selectNode?.(node.nodeId);
        group.addEventListener('click', select); group.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select(); } });
        const rect = document.createElementNS(ns, 'rect'); rect.setAttribute('width', '200'); rect.setAttribute('height', '60'); rect.setAttribute('rx', '8');
        rect.setAttribute('fill', node.status === 'running' ? '#264c69' : '#202937'); rect.setAttribute('stroke', node.status === 'completed' ? '#6cd4a4' : '#89b9e0'); group.append(rect);
        for (const [index, text] of [node.nodeId, `${node.kind} · ${node.status || 'definition'}`].entries()) {
            const label = document.createElementNS(ns, 'text'); label.setAttribute('x', '10'); label.setAttribute('y', String(24 + index * 20)); label.setAttribute('fill', '#edf5fc'); label.setAttribute('font-size', '12'); label.textContent = text.length > 26 ? `${text.slice(0, 25)}…` : text; group.append(label);
        }
        svg.append(group);
    }
    parent.append(svg);
    if (graph.nodes.length > nodes.length) { const note = document.createElement('p'); note.textContent = `Preview shows ${nodes.length} of ${graph.nodes.length} nodes.`; parent.append(note); }
    return svg;
}
