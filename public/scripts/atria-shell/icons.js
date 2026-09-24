/**
 * Atria line icons.
 *
 * One 24px grid, 1.75px round strokes. Icons are decorative: callers always
 * pair them with visible text or an accessible name on the control. Built with
 * createElementNS so no markup strings are parsed.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Each entry is a list of primitive descriptors: [tag, attributes].
// `fill: true` marks a filled glyph element (no stroke).
const ICONS = Object.freeze({
    play: [
        ['circle', { cx: 12, cy: 12, r: 8.75 }],
        ['path', { d: 'M10.1 8.6 15.6 12l-5.5 3.4Z', fill: true }],
    ],
    library: [
        ['rect', { x: 3.75, y: 4, width: 4, height: 16, rx: 1.1 }],
        ['rect', { x: 9.75, y: 4, width: 4, height: 16, rx: 1.1 }],
        ['path', { d: 'M15.6 5.7 18.6 5l3.1 13.6-3 .7Z' }],
    ],
    build: [
        ['path', { d: 'M12.15 4.78 19.22 11.86 16.68 14.4 9.61 7.32Z' }],
        ['path', { d: 'M12.2 11.8 4.8 19.2' }],
    ],
    agents: [
        ['path', { d: 'M11 3.5c.55 4 2.3 5.75 6.3 6.3-4 .55-5.75 2.3-6.3 6.3-.55-4-2.3-5.75-6.3-6.3 4-.55 5.75-2.3 6.3-6.3Z' }],
        ['path', { d: 'M18 14.75c.2 1.5.9 2.2 2.4 2.4-1.5.2-2.2.9-2.4 2.4-.2-1.5-.9-2.2-2.4-2.4 1.5-.2 2.2-.9 2.4-2.4Z' }],
    ],
    runtime: [
        ['rect', { x: 6, y: 6, width: 12, height: 12, rx: 2.2 }],
        ['rect', { x: 9.5, y: 9.5, width: 5, height: 5, rx: 1 }],
        ['path', { d: 'M9.5 3.25V6M14.5 3.25V6M9.5 18v2.75M14.5 18v2.75M3.25 9.5H6M3.25 14.5H6M18 9.5h2.75M18 14.5h2.75' }],
    ],
    search: [
        ['circle', { cx: 10.75, cy: 10.75, r: 6.25 }],
        ['path', { d: 'm15.5 15.5 4.75 4.75' }],
    ],
    settings: [
        ['path', { d: 'M4 7h8.5M16.5 7H20M4 12h2.5M10.5 12H20M4 17h10.5M18.5 17H20' }],
        ['circle', { cx: 14.5, cy: 7, r: 2 }],
        ['circle', { cx: 8.5, cy: 12, r: 2 }],
        ['circle', { cx: 16.5, cy: 17, r: 2 }],
    ],
    plugins: [
        ['path', { d: 'M5 7a2 2 0 0 1 2-2h2.5a2.25 2.25 0 1 1 4.5 0H17a2 2 0 0 1 2 2v2.5a2.25 2.25 0 1 1 0 4.5V17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z' }],
    ],
    diagnostics: [
        ['path', { d: 'M3 12.5h3.6l2.1-5.2 3.4 10.4 2.6-7.4 1.6 2.2H21' }],
    ],
    account: [
        ['circle', { cx: 12, cy: 12, r: 8.75 }],
        ['circle', { cx: 12, cy: 10, r: 3 }],
        ['path', { d: 'M6.6 18.1c1.3-1.9 3.2-2.85 5.4-2.85s4.1.95 5.4 2.85' }],
    ],
    'chevron-left': [['path', { d: 'M14.5 5.5 8 12l6.5 6.5' }]],
    'chevron-right': [['path', { d: 'M9.5 5.5 16 12l-6.5 6.5' }]],
    'chevron-down': [['path', { d: 'M5.5 9.25 12 15.75l6.5-6.5' }]],
    'chevron-up': [['path', { d: 'M5.5 14.75 12 8.25l6.5 6.5' }]],
    close: [['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }]],
    plus: [['path', { d: 'M12 5v14M5 12h14' }]],
    inspector: [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.75 }],
        ['path', { d: 'M14.75 4.5v15' }],
    ],
    sidebar: [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.75 }],
        ['path', { d: 'M9.25 4.5v15' }],
    ],
    more: [
        ['circle', { cx: 6, cy: 12, r: 1.35, fill: true }],
        ['circle', { cx: 12, cy: 12, r: 1.35, fill: true }],
        ['circle', { cx: 18, cy: 12, r: 1.35, fill: true }],
    ],
    send: [['path', { d: 'M12 19V5.5M6.5 11 12 5.5 17.5 11' }]],
    stop: [['rect', { x: 7.5, y: 7.5, width: 9, height: 9, rx: 1.8, fill: true }]],
    retry: [
        ['path', { d: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3' }],
        ['path', { d: 'M19.6 4.4v4.1h-4.1' }],
    ],
    reenter: [
        ['path', { d: 'M9 13.5 4.5 9 9 4.5' }],
        ['path', { d: 'M4.75 9H14.5a5 5 0 0 1 0 10H11' }],
    ],
    timeline: [
        ['circle', { cx: 12, cy: 12, r: 8.5 }],
        ['path', { d: 'M12 7.5V12l3 2' }],
    ],
    bookmark: [['path', { d: 'M7 4h10a1 1 0 0 1 1 1v15l-6-3.9L6 20V5a1 1 0 0 1 1-1Z' }]],
    bolt: [['path', { d: 'M13.2 3 5.5 13.4h5.8L10.6 21l7.9-10.5h-5.9Z' }]],
    folder: [['path', { d: 'M3.5 7.25a2 2 0 0 1 2-2h3.7l2 2.1h7.3a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z' }]],
    document: [
        ['path', { d: 'M7 3.5h6.75L18.5 8.25V19A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z' }],
        ['path', { d: 'M13.5 3.75V8.5h4.75M8.75 12.5h6.5M8.75 16h4.5' }],
    ],
    import: [['path', { d: 'M12 4v10.5M7.75 10.25 12 14.5l4.25-4.25M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3' }]],
    export: [['path', { d: 'M12 14.5V4M7.75 8.25 12 4l4.25 4.25M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6' }]],
    globe: [
        ['circle', { cx: 12, cy: 12, r: 8.5 }],
        ['ellipse', { cx: 12, cy: 12, rx: 3.6, ry: 8.5 }],
        ['path', { d: 'M3.75 12h16.5' }],
    ],
    book: [
        ['path', { d: 'M6.5 3.5h12v13.25h-12a2 2 0 0 0-2 2V5.5a2 2 0 0 1 2-2Z' }],
        ['path', { d: 'M4.5 18.75a2 2 0 0 0 2 1.75h12v-3.75M8.75 8h5.5' }],
    ],
    braces: [
        ['path', { d: 'M8.5 5.5c-2 0-2.5 1-2.5 2.5v1.75c0 1.25-.75 2.25-2 2.25 1.25 0 2 1 2 2.25V16c0 1.5.5 2.5 2.5 2.5' }],
        ['path', { d: 'M15.5 5.5c2 0 2.5 1 2.5 2.5v1.75c0 1.25.75 2.25 2 2.25-1.25 0-2 1-2 2.25V16c0 1.5-.5 2.5-2.5 2.5' }],
    ],
    stack: [
        ['rect', { x: 4.5, y: 9, width: 15, height: 11, rx: 2.25 }],
        ['path', { d: 'M6.75 6.25h10.5M9 3.5h6' }],
    ],
    gauge: [
        ['path', { d: 'M4.6 17.5a8 8 0 1 1 14.8 0' }],
        ['path', { d: 'm12 14 3.8-4.3' }],
        ['circle', { cx: 12, cy: 14, r: 1.4, fill: true }],
    ],
    wand: [
        ['path', { d: 'M4.5 19.5 14.75 9.25M13.25 7.75l3 3' }],
        ['path', { d: 'M17 3.5v3M15.5 5h3M19.75 9.5v2M18.75 10.5h2M10.75 3.75v2M9.75 4.75h2' }],
    ],
    grid: [
        ['rect', { x: 4, y: 4, width: 6.75, height: 6.75, rx: 1.75 }],
        ['rect', { x: 13.25, y: 4, width: 6.75, height: 6.75, rx: 1.75 }],
        ['rect', { x: 4, y: 13.25, width: 6.75, height: 6.75, rx: 1.75 }],
        ['rect', { x: 13.25, y: 13.25, width: 6.75, height: 6.75, rx: 1.75 }],
    ],
    list: [
        ['path', { d: 'M9 6.5h11M9 12h11M9 17.5h11' }],
        ['circle', { cx: 4.75, cy: 6.5, r: 1.15, fill: true }],
        ['circle', { cx: 4.75, cy: 12, r: 1.15, fill: true }],
        ['circle', { cx: 4.75, cy: 17.5, r: 1.15, fill: true }],
    ],
    route: [
        ['circle', { cx: 6, cy: 5.5, r: 2.2 }],
        ['circle', { cx: 18, cy: 18.5, r: 2.2 }],
        ['path', { d: 'M8.2 5.5H15a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 0 0 7h6.8' }],
    ],
    cube: [
        ['path', { d: 'M12 3.25 19.75 7.6v8.8L12 20.75 4.25 16.4V7.6Z' }],
        ['path', { d: 'M4.5 7.75 12 12l7.5-4.25M12 12v8.5' }],
    ],
    link: [
        ['path', { d: 'M10 13.9a4 4 0 0 0 5.7.1l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3' }],
        ['path', { d: 'M14 10.1a4 4 0 0 0-5.7-.1l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3' }],
    ],
    key: [
        ['circle', { cx: 8, cy: 15.5, r: 4 }],
        ['path', { d: 'm10.9 12.6 8.35-8.35M16.5 7l2.5 2.5M14.25 9.25l1.75 1.75' }],
    ],
    info: [
        ['circle', { cx: 12, cy: 12, r: 8.75 }],
        ['path', { d: 'M12 11v5.25' }],
        ['circle', { cx: 12, cy: 7.9, r: 1.1, fill: true }],
    ],
    warning: [
        ['path', { d: 'M10.4 4.8a1.85 1.85 0 0 1 3.2 0l7 12.2a1.85 1.85 0 0 1-1.6 2.75H5a1.85 1.85 0 0 1-1.6-2.75Z' }],
        ['path', { d: 'M12 9.5v4.25' }],
        ['circle', { cx: 12, cy: 16.6, r: 1.05, fill: true }],
    ],
    error: [
        ['circle', { cx: 12, cy: 12, r: 8.75 }],
        ['path', { d: 'M12 7.5v5.5' }],
        ['circle', { cx: 12, cy: 16.1, r: 1.1, fill: true }],
    ],
    check: [['path', { d: 'm5.25 12.75 4.5 4.5 9-10' }]],
    'check-circle': [
        ['circle', { cx: 12, cy: 12, r: 8.75 }],
        ['path', { d: 'm8.25 12.25 2.6 2.6 5-5.35' }],
    ],
    trash: [['path', { d: 'M4.75 7h14.5M9.75 7V5.25h4.5V7M6.75 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h5.7a1.5 1.5 0 0 0 1.5-1.4L17.25 7' }]],
    pencil: [['path', { d: 'M15.2 5.2a2.1 2.1 0 0 1 3 3L8.9 17.5 5 18.9l1.4-3.9ZM13.4 7l3.1 3.1' }]],
    duplicate: [
        ['rect', { x: 8.5, y: 8.5, width: 11.5, height: 11.5, rx: 2.25 }],
        ['path', { d: 'M15.5 8.5V6.25A2.25 2.25 0 0 0 13.25 4h-7A2.25 2.25 0 0 0 4 6.25v7a2.25 2.25 0 0 0 2.25 2.25H8.5' }],
    ],
    eye: [
        ['path', { d: 'M2.75 12S6.1 5.75 12 5.75 21.25 12 21.25 12 17.9 18.25 12 18.25 2.75 12 2.75 12Z' }],
        ['circle', { cx: 12, cy: 12, r: 2.9 }],
    ],
    'play-fill': [['path', { d: 'M8 5.6v12.8l10.2-6.4Z', fill: true }]],
    lock: [
        ['rect', { x: 5.5, y: 10.5, width: 13, height: 9.5, rx: 2.2 }],
        ['path', { d: 'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5' }],
    ],
    branch: [
        ['circle', { cx: 6.5, cy: 5.5, r: 2 }],
        ['circle', { cx: 6.5, cy: 18.5, r: 2 }],
        ['circle', { cx: 17.5, cy: 7.5, r: 2 }],
        ['path', { d: 'M6.5 7.5v9M17.5 9.5c0 4-4.5 3.5-9.6 7.6' }],
    ],
    terminal: [
        ['rect', { x: 3.5, y: 4.75, width: 17, height: 14.5, rx: 2.75 }],
        ['path', { d: 'm7.5 9.5 2.75 2.5-2.75 2.5M12.75 14.75h4' }],
    ],
    person: [
        ['circle', { cx: 12, cy: 8.25, r: 3.75 }],
        ['path', { d: 'M4.75 20c.9-3.6 3.75-5.6 7.25-5.6s6.35 2 7.25 5.6' }],
    ],
    people: [
        ['circle', { cx: 9, cy: 8.5, r: 3.25 }],
        ['path', { d: 'M3 19.25c.75-3.1 3.1-4.85 6-4.85s5.25 1.75 6 4.85' }],
        ['path', { d: 'M15.25 5.6a3.25 3.25 0 0 1 0 5.8M17.5 14.6c1.8.65 3.05 2.2 3.5 4.65' }],
    ],
    home: [['path', { d: 'M4.5 10.25 12 4l7.5 6.25V19a1.25 1.25 0 0 1-1.25 1.25H14.5v-5.5h-5v5.5H5.75A1.25 1.25 0 0 1 4.5 19Z' }]],
    expand: [['path', { d: 'M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5 13.75 10.25M4.5 19.5l5.75-5.75' }]],
    filter: [['path', { d: 'M4.5 7h15M7.5 12h9M10.5 17h3' }]],
    logout: [
        ['path', { d: 'M14 4.5H7.25A1.75 1.75 0 0 0 5.5 6.25v11.5c0 .97.78 1.75 1.75 1.75H14' }],
        ['path', { d: 'M10.5 12h9.25M16.75 8.75 20 12l-3.25 3.25' }],
    ],
    sparkles: [
        ['path', { d: 'M11 3.5c.55 4 2.3 5.75 6.3 6.3-4 .55-5.75 2.3-6.3 6.3-.55-4-2.3-5.75-6.3-6.3 4-.55 5.75-2.3 6.3-6.3Z' }],
        ['path', { d: 'M18 14.75c.2 1.5.9 2.2 2.4 2.4-1.5.2-2.2.9-2.4 2.4-.2-1.5-.9-2.2-2.4-2.4 1.5-.2 2.2-.9 2.4-2.4Z' }],
    ],
    command: [['path', { d: 'M9 9V6.75A2.25 2.25 0 1 0 6.75 9H9Zm0 0h6m-6 0v6m6-6V6.75A2.25 2.25 0 1 1 17.25 9H15Zm0 0v6m0 0h2.25A2.25 2.25 0 1 1 15 17.25V15Zm0 0H9m0 0v2.25A2.25 2.25 0 1 1 6.75 15H9Z' }]],
    clock: [
        ['circle', { cx: 12, cy: 12, r: 8.5 }],
        ['path', { d: 'M12 7.5V12l3 2' }],
    ],
    layers: [
        ['path', { d: 'm12 4 8.25 4.5L12 13 3.75 8.5Z' }],
        ['path', { d: 'm3.75 12.25 8.25 4.5 8.25-4.5M3.75 16 12 20.5l8.25-4.5' }],
    ],
    shield: [['path', { d: 'M12 3.5 19 6.25v5.5c0 4.4-2.9 7.6-7 8.75-4.1-1.15-7-4.35-7-8.75v-5.5Z' }]],
    image: [
        ['rect', { x: 3.75, y: 5, width: 16.5, height: 14, rx: 2.5 }],
        ['circle', { cx: 9, cy: 10, r: 1.6 }],
        ['path', { d: 'm4.5 17 4.75-4.5 3.25 3 3-2.75 4.25 3.75' }],
    ],
    chat: [['path', { d: 'M5.75 5h12.5A1.75 1.75 0 0 1 20 6.75v8.5A1.75 1.75 0 0 1 18.25 17H11l-4.25 3.25V17h-1A1.75 1.75 0 0 1 4 15.25v-8.5C4 5.78 4.78 5 5.75 5Z' }]],
});

export const ATRIA_ICON_NAMES = Object.freeze(Object.keys(ICONS));

export function hasAtriaIcon(name) {
    return Object.prototype.hasOwnProperty.call(ICONS, String(name || ''));
}

/**
 * Create a decorative SVG icon.
 *
 * @param {Document} documentRef
 * @param {string} name
 * @param {{ size?: number, className?: string }} [options]
 * @returns {SVGSVGElement}
 */
export function createAtriaIcon(documentRef, name, { size = 20, className = '' } = {}) {
    const glyph = ICONS[String(name || '')] || ICONS.document;
    const svg = documentRef.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', ['atria-icon', className].filter(Boolean).join(' '));
    svg.setAttribute('data-atria-icon', String(name || 'document'));

    for (const [tag, attributes] of glyph) {
        const node = documentRef.createElementNS(SVG_NS, tag);
        for (const [key, value] of Object.entries(attributes)) {
            if (key === 'fill') continue;
            node.setAttribute(key, String(value));
        }
        if (attributes.fill) {
            node.setAttribute('fill', 'currentColor');
            node.setAttribute('stroke', 'none');
        }
        svg.append(node);
    }
    return svg;
}
