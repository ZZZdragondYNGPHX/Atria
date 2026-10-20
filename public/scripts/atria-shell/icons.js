/**
 * Atria line icons.
 *
 * One 24px grid, 1.6px round strokes (Atrium sprite). Icons are decorative: callers always
 * pair them with visible text or an accessible name on the control. Built with
 * createElementNS so no markup strings are parsed.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Each entry is a list of primitive descriptors: [tag, attributes].
// `fill: true` marks a filled glyph element (no stroke).
const ICONS = Object.freeze({
    play: [
        ['path', { d: 'M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2z' }],
        ['path', { d: 'M12 6.5v13' }],
    ],
    library: [
        ['rect', { x: 4, y: 4, width: 3.4, height: 16, rx: 0.8 }],
        ['rect', { x: 9.4, y: 4, width: 3.4, height: 16, rx: 0.8 }],
        ['path', { d: 'M15.2 4.9l2.9-.8 3.6 14.9-2.9.8z' }],
    ],
    build: [
        ['path', { d: 'M4 20l1-4.2L16 4.8a2.1 2.1 0 0 1 3 3L8 18.9z' }],
        ['path', { d: 'M14 7l3 3' }],
        ['path', { d: 'M13 20h7' }],
    ],
    agents: [
        ['circle', { cx: 6, cy: 6, r: 2.4 }],
        ['circle', { cx: 18, cy: 6, r: 2.4 }],
        ['circle', { cx: 12, cy: 18, r: 2.4 }],
        ['path', { d: 'M8.4 6h7.2M7.1 8.1l3.8 7.7M16.9 8.1l-3.8 7.7' }],
    ],
    // Runtime routes a task to a model: two endpoints joined by a route.
    runtime: [
        ['circle', { cx: 6, cy: 18, r: 2.4 }],
        ['circle', { cx: 18, cy: 6, r: 2.4 }],
        ['path', { d: 'M8.4 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.6' }],
    ],
    search: [
        ['circle', { cx: 11, cy: 11, r: 6.5 }],
        ['path', { d: 'M20 20l-4.2-4.2' }],
    ],
    // A gear, so Settings never shares the slider glyph used by story options (`tune`).
    settings: [
        ['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }],
        ['circle', { cx: 12, cy: 12, r: 3 }],
    ],
    plugins: [
        ['path', { d: 'M5 7a2 2 0 0 1 2-2h2.5a2.25 2.25 0 1 1 4.5 0H17a2 2 0 0 1 2 2v2.5a2.25 2.25 0 1 1 0 4.5V17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z' }],
    ],
    diagnostics: [
        ['path', { d: 'M3 12h4l2.2-6 4.3 12 2.2-6H21' }],
    ],
    account: [
        ['circle', { cx: 12, cy: 8.5, r: 3.8 }],
        ['path', { d: 'M4.5 20.5c1.4-3.8 4.3-5.6 7.5-5.6s6.1 1.8 7.5 5.6' }],
    ],
    'chevron-left': [
        ['path', { d: 'M14.5 5.5 8 12l6.5 6.5' }],
    ],
    'chevron-right': [
        ['path', { d: 'M9.5 5.5 16 12l-6.5 6.5' }],
    ],
    'chevron-down': [
        ['path', { d: 'M5.5 9.25 12 15.75l6.5-6.5' }],
    ],
    'chevron-up': [
        ['path', { d: 'M5.5 14.75 12 8.25l6.5 6.5' }],
    ],
    close: [
        ['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }],
    ],
    plus: [
        ['path', { d: 'M12 5v14M5 12h14' }],
    ],
    minus: [
        ['path', { d: 'M5 12h14' }],
    ],
    'arrow-up': [
        ['path', { d: 'M12 19V5M6.5 10.5 12 5l5.5 5.5' }],
    ],
    'arrow-down': [
        ['path', { d: 'M12 5v14M6.5 13.5 12 19l5.5-5.5' }],
    ],
    inspector: [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.75 }],
        ['path', { d: 'M14.75 4.5v15' }],
    ],
    sidebar: [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.75 }],
        ['path', { d: 'M9.25 4.5v15' }],
    ],
    more: [
        ['circle', { cx: 5.5, cy: 12, r: 1.1, fill: true }],
        ['circle', { cx: 12, cy: 12, r: 1.1, fill: true }],
        ['circle', { cx: 18.5, cy: 12, r: 1.1, fill: true }],
    ],
    send: [
        ['path', { d: 'M12 19V5.5M6.5 11L12 5.5 17.5 11' }],
    ],
    stop: [
        ['rect', { x: 7, y: 7, width: 10, height: 10, rx: 2 }],
    ],
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
    bookmark: [
        ['path', { d: 'M7 4h10a1 1 0 0 1 1 1v15l-6-3.9L6 20V5a1 1 0 0 1 1-1Z' }],
    ],
    bolt: [
        ['path', { d: 'M13.2 3 5.5 13.4h5.8L10.6 21l7.9-10.5h-5.9Z' }],
    ],
    folder: [
        ['path', { d: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z' }],
    ],
    document: [
        ['path', { d: 'M7 3.5h6.75L18.5 8.25V19A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z' }],
        ['path', { d: 'M13.5 3.75V8.5h4.75M8.75 12.5h6.5M8.75 16h4.5' }],
    ],
    import: [
        ['path', { d: 'M12 4v10.5M7.75 10.25 12 14.5l4.25-4.25M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3' }],
    ],
    export: [
        ['path', { d: 'M12 14.5V4M7.75 8.25 12 4l4.25 4.25M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6' }],
    ],
    globe: [
        ['circle', { cx: 12, cy: 12, r: 8.8 }],
        ['path', { d: 'M3.2 12h17.6M12 3.2c2.8 3.2 2.8 14.4 0 17.6M12 3.2c-2.8 3.2-2.8 14.4 0 17.6' }],
    ],
    book: [
        ['path', { d: 'M5.5 5.5a2 2 0 0 1 2-2h11v14h-11a2 2 0 0 0-2 2z' }],
        ['path', { d: 'M5.5 19.5a2 2 0 0 0 2 2h11v-4' }],
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
        ['path', { d: 'M4 17a8 8 0 1 1 16 0' }],
        ['path', { d: 'M12 17l3.5-5' }],
        ['circle', { cx: 12, cy: 17, r: 1.2, fill: true }],
    ],
    wand: [
        ['path', { d: 'M4.5 19.5 14.75 9.25M13.25 7.75l3 3' }],
        ['path', { d: 'M17 3.5v3M15.5 5h3M19.75 9.5v2M18.75 10.5h2M10.75 3.75v2M9.75 4.75h2' }],
    ],
    grid: [
        ['rect', { x: 4, y: 4, width: 6.5, height: 6.5, rx: 1.4 }],
        ['rect', { x: 13.5, y: 4, width: 6.5, height: 6.5, rx: 1.4 }],
        ['rect', { x: 4, y: 13.5, width: 6.5, height: 6.5, rx: 1.4 }],
        ['rect', { x: 13.5, y: 13.5, width: 6.5, height: 6.5, rx: 1.4 }],
    ],
    list: [
        ['path', { d: 'M9 6.5h11M9 12h11M9 17.5h11' }],
        ['circle', { cx: 4.75, cy: 6.5, r: 1.15, fill: true }],
        ['circle', { cx: 4.75, cy: 12, r: 1.15, fill: true }],
        ['circle', { cx: 4.75, cy: 17.5, r: 1.15, fill: true }],
    ],
    route: [
        ['circle', { cx: 6, cy: 18, r: 2.2 }],
        ['circle', { cx: 18, cy: 6, r: 2.2 }],
        ['path', { d: 'M8.2 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.8' }],
    ],
    cube: [
        ['path', { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' }],
        ['path', { d: 'M4 7.5l8 4.5 8-4.5M12 12v9' }],
    ],
    link: [
        ['path', { d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1' }],
        ['path', { d: 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' }],
    ],
    key: [
        ['circle', { cx: 8, cy: 15.5, r: 3.8 }],
        ['path', { d: 'M10.8 12.8L19.5 4M16.5 7l2.6 2.6M14.3 9.2l2 2' }],
    ],
    info: [
        ['circle', { cx: 12, cy: 12, r: 8.8 }],
        ['path', { d: 'M12 11v5.5M12 7.8h.01' }],
    ],
    warning: [
        ['path', { d: 'M10.4 4.8a1.85 1.85 0 0 1 3.2 0l7 12.2a1.85 1.85 0 0 1-1.6 2.75H5a1.85 1.85 0 0 1-1.6-2.75Z' }],
        ['path', { d: 'M12 9.5v4.25' }],
        ['circle', { cx: 12, cy: 16.6, r: 1.05, fill: true }],
    ],
    error: [
        ['circle', { cx: 12, cy: 12, r: 8.8 }],
        ['path', { d: 'M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6' }],
    ],
    check: [
        ['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }],
    ],
    'check-circle': [
        ['circle', { cx: 12, cy: 12, r: 8.75 }],
        ['path', { d: 'm8.25 12.25 2.6 2.6 5-5.35' }],
    ],
    trash: [
        ['path', { d: 'M4 7h16M9.5 7V4.5h5V7M6.2 7l.9 13h9.8l.9-13M10 11v5.5M14 11v5.5' }],
    ],
    pencil: [
        ['path', { d: 'M15.2 5.2a2.1 2.1 0 0 1 3 3L8.9 17.5 5 18.9l1.4-3.9ZM13.4 7l3.1 3.1' }],
    ],
    duplicate: [
        ['rect', { x: 8.5, y: 8.5, width: 11.5, height: 11.5, rx: 2.25 }],
        ['path', { d: 'M15.5 8.5V6.25A2.25 2.25 0 0 0 13.25 4h-7A2.25 2.25 0 0 0 4 6.25v7a2.25 2.25 0 0 0 2.25 2.25H8.5' }],
    ],
    eye: [
        ['path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }],
        ['circle', { cx: 12, cy: 12, r: 2.8 }],
    ],
    'play-fill': [
        ['path', { d: 'M8 5.6v12.8l10.2-6.4Z', fill: true }],
    ],
    lock: [
        ['rect', { x: 5, y: 10.5, width: 14, height: 10, rx: 2.2 }],
        ['path', { d: 'M8 10.5V8a4 4 0 0 1 8 0v2.5' }],
    ],
    branch: [
        ['circle', { cx: 6.5, cy: 5, r: 2 }],
        ['circle', { cx: 6.5, cy: 19, r: 2 }],
        ['circle', { cx: 17.5, cy: 7, r: 2 }],
        ['path', { d: 'M6.5 7v10M17.5 9a6 6 0 0 1-6 6h-3' }],
    ],
    terminal: [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.2 }],
        ['path', { d: 'M7.5 9.5l3 2.5-3 2.5M13 15h4' }],
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
    home: [
        ['path', { d: 'M4.5 10.25 12 4l7.5 6.25V19a1.25 1.25 0 0 1-1.25 1.25H14.5v-5.5h-5v5.5H5.75A1.25 1.25 0 0 1 4.5 19Z' }],
    ],
    expand: [
        ['path', { d: 'M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5 13.75 10.25M4.5 19.5l5.75-5.75' }],
    ],
    filter: [
        ['path', { d: 'M4 5.5h16l-6.2 7v5.5l-3.6 2v-7.5z' }],
    ],
    logout: [
        ['path', { d: 'M14 4.5H7.25A1.75 1.75 0 0 0 5.5 6.25v11.5c0 .97.78 1.75 1.75 1.75H14' }],
        ['path', { d: 'M10.5 12h9.25M16.75 8.75 20 12l-3.25 3.25' }],
    ],
    sparkles: [
        ['path', { d: 'M11 3.5c.55 4 2.3 5.75 6.3 6.3-4 .55-5.75 2.3-6.3 6.3-.55-4-2.3-5.75-6.3-6.3 4-.55 5.75-2.3 6.3-6.3Z' }],
        ['path', { d: 'M18 14.75c.2 1.5.9 2.2 2.4 2.4-1.5.2-2.2.9-2.4 2.4-.2-1.5-.9-2.2-2.4-2.4 1.5-.2 2.2-.9 2.4-2.4Z' }],
    ],
    command: [
        ['path', { d: 'M9 6.5a2.5 2.5 0 1 0-2.5 2.5h11A2.5 2.5 0 1 0 15 6.5v11a2.5 2.5 0 1 0 2.5-2.5h-11A2.5 2.5 0 1 0 9 17.5z' }],
    ],
    clock: [
        ['circle', { cx: 12, cy: 12, r: 8.8 }],
        ['path', { d: 'M12 7.5V12l3 2' }],
    ],
    layers: [
        ['path', { d: 'M12 4l8.5 4.5L12 13 3.5 8.5z' }],
        ['path', { d: 'M3.5 15.5L12 20l8.5-4.5' }],
    ],
    shield: [
        ['path', { d: 'M12 3.2l7.5 2.8v6c0 4.8-3.3 7.8-7.5 8.8-4.2-1-7.5-4-7.5-8.8V6z' }],
        ['path', { d: 'M9 12l2.2 2.2L15.2 10' }],
    ],
    image: [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.2 }],
        ['circle', { cx: 9, cy: 10, r: 1.8 }],
        ['path', { d: 'M20.5 15.5l-4.8-4.8-9.2 8.8' }],
    ],
    chat: [
        ['path', { d: 'M5.75 5h12.5A1.75 1.75 0 0 1 20 6.75v8.5A1.75 1.75 0 0 1 18.25 17H11l-4.25 3.25V17h-1A1.75 1.75 0 0 1 4 15.25v-8.5C4 5.78 4.78 5 5.75 5Z' }],
    ],
    atria: [
        ['path', { d: 'M5 21V11a7 7 0 0 1 14 0v10' }],
        ['path', { d: 'M12 6.8l1.05 3.15L16.2 11l-3.15 1.05L12 15.2l-1.05-3.15L7.8 11l3.15-1.05z' }],
        ['path', { d: 'M3 21h18' }],
    ],
    studio: [
        ['path', { d: 'M4 20l1-4.2L16 4.8a2.1 2.1 0 0 1 3 3L8 18.9z' }],
        ['path', { d: 'M14 7l3 3' }],
        ['path', { d: 'M13 20h7' }],
    ],
    extensions: [
        ['path', { d: 'M10 4.5a2 2 0 1 1 4 0V6h4v4h-1.5a2 2 0 1 0 0 4H18v4h-4v-1.5a2 2 0 1 0-4 0V18H6v-4h1.5a2 2 0 1 0 0-4H6V6h4z' }],
    ],
    learning: [
        ['path', { d: 'M9.2 18h5.6M10.2 21h3.6' }],
        ['path', { d: 'M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z' }],
    ],
    save: [
        ['path', { d: 'M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z' }],
    ],
    history: [
        ['path', { d: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1' }],
        ['path', { d: 'M3.5 4.5v4h4' }],
        ['path', { d: 'M12 7.5V12l3 2' }],
    ],
    context: [
        ['path', { d: 'M12 3.5l8.5 4.6L12 12.7 3.5 8.1z' }],
        ['path', { d: 'M3.5 12.3l8.5 4.6 8.5-4.6' }],
        ['path', { d: 'M3.5 16.4l8.5 4.6 8.5-4.6' }],
    ],
    tune: [
        ['path', { d: 'M6 4v6M6 14v6M12 4v2M12 10v10M18 4v10M18 18v2' }],
        ['path', { d: 'M4 12h4M10 8h4M16 16h4' }],
    ],
    persona: [
        ['path', { d: 'M4 5.5c3.2 1.4 12.8 1.4 16 0v5.5a8 8 0 0 1-16 0z' }],
        ['path', { d: 'M8.6 10.4c.6-.5 1.4-.5 2 0M13.4 10.4c.6-.5 1.4-.5 2 0M9.5 14.5c1.6 1 3.4 1 5 0' }],
    ],
    'chev-r': [
        ['path', { d: 'M9.5 6l6 6-6 6' }],
    ],
    'chev-l': [
        ['path', { d: 'M14.5 6l-6 6 6 6' }],
    ],
    'chev-d': [
        ['path', { d: 'M6 9.5l6 6 6-6' }],
    ],
    'chev-u': [
        ['path', { d: 'M6 14.5l6-6 6 6' }],
    ],
    fork: [
        ['circle', { cx: 6, cy: 5, r: 2 }],
        ['circle', { cx: 18, cy: 5, r: 2 }],
        ['circle', { cx: 12, cy: 19, r: 2 }],
        ['path', { d: 'M6 7v1.5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 11.5V17' }],
    ],
    unlink: [
        ['path', { d: 'M15.5 13.5l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3M8.5 10.5l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3' }],
        ['path', { d: 'M4 4l16 16' }],
    ],
    exact: [
        ['circle', { cx: 12, cy: 12, r: 6.5 }],
        ['circle', { cx: 12, cy: 12, r: 1.6, fill: true }],
        ['path', { d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3' }],
    ],
    warn: [
        ['path', { d: 'M12 4.2L21 19.8H3z' }],
        ['path', { d: 'M12 10.2v4.2M12 17.2h.01' }],
    ],
    unknown: [
        ['circle', { cx: 12, cy: 12, r: 8.8, 'stroke-dasharray': '2.4 2.6' }],
        ['path', { d: 'M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1.1.9-1.1 1.6v.4M12 16.8h.01' }],
    ],
    diff: [
        ['rect', { x: 4.5, y: 3.5, width: 15, height: 17, rx: 2.2 }],
        ['path', { d: 'M9 9h6M12 6v6M9 16h6' }],
    ],
    file: [
        ['path', { d: 'M6.5 3.5h7.5l4 4v13h-11.5z' }],
        ['path', { d: 'M13.5 3.5v4.5h4.5' }],
    ],
    sparkle: [
        ['path', { d: 'M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5l-1.7-4.8L4.5 10l4.8-1.7z' }],
        ['path', { d: 'M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z' }],
    ],
    speaker: [
        ['path', { d: 'M4 9.5h3.5l5-4v13l-5-4H4z' }],
        ['path', { d: 'M16 9a4.5 4.5 0 0 1 0 6M18.6 6.5a8 8 0 0 1 0 11' }],
    ],
    refresh: [
        ['path', { d: 'M20 12a8 8 0 1 1-2.4-5.7' }],
        ['path', { d: 'M20 4.5V9h-4.5' }],
    ],
    restore: [
        ['path', { d: 'M4 12a8 8 0 1 0 2.4-5.7' }],
        ['path', { d: 'M4 4.5V9h4.5' }],
    ],
    download: [
        ['path', { d: 'M12 4v11M7 10.5l5 4.5 5-4.5M5 20h14' }],
    ],
    upload: [
        ['path', { d: 'M12 20V9M7 13.5L12 9l5 4.5M5 4h14' }],
    ],
    plug: [
        ['path', { d: 'M9 3v4.5M15 3v4.5M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0zM12 16v5' }],
    ],
    memory: [
        ['path', { d: 'M9.5 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 7 17.5a2.8 2.8 0 0 0 5 1.3V6a2.8 2.8 0 0 0-2.5-1.5z' }],
        ['path', { d: 'M14.5 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2.5 4.8 2.8 2.8 0 0 1-5 1.3' }],
        ['path', { d: 'M12 9.5h2M12 13.5h-2' }],
    ],
    users: [
        ['circle', { cx: 9, cy: 8.5, r: 3.3 }],
        ['path', { d: 'M3 19.5c1.1-3.2 3.4-4.8 6-4.8s4.9 1.6 6 4.8' }],
        ['path', { d: 'M15.5 5.6a3.3 3.3 0 0 1 0 6M17.5 14.9c1.6.6 2.8 2.1 3.5 4.6' }],
    ],
    'panel-r': [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.2 }],
        ['path', { d: 'M14.5 4.5v15' }],
    ],
    'panel-b': [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.2 }],
        ['path', { d: 'M3.5 14.5h17' }],
    ],
    'panel-l': [
        ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.2 }],
        ['path', { d: 'M9.5 4.5v15' }],
    ],
    'arrow-d': [
        ['path', { d: 'M12 5v14M6.5 13.5L12 19l5.5-5.5' }],
    ],
    'arrow-r': [
        ['path', { d: 'M5 12h14M13.5 6.5L19 12l-5.5 5.5' }],
    ],
    'arrow-l': [
        ['path', { d: 'M19 12H5M10.5 6.5L5 12l5.5 5.5' }],
    ],
    copy: [
        ['rect', { x: 8.5, y: 8.5, width: 11.5, height: 11.5, rx: 2 }],
        ['path', { d: 'M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3' }],
    ],
    run: [
        ['path', { d: 'M7.5 5.2l11 6.8-11 6.8z' }],
    ],
    pause: [
        ['path', { d: 'M8.5 5.5v13M15.5 5.5v13' }],
    ],
    grip: [
        ['circle', { cx: 9, cy: 6, r: 1, fill: true }],
        ['circle', { cx: 15, cy: 6, r: 1, fill: true }],
        ['circle', { cx: 9, cy: 12, r: 1, fill: true }],
        ['circle', { cx: 15, cy: 12, r: 1, fill: true }],
        ['circle', { cx: 9, cy: 18, r: 1, fill: true }],
        ['circle', { cx: 15, cy: 18, r: 1, fill: true }],
    ],
    sort: [
        ['path', { d: 'M7 4.5v15M3.5 16l3.5 3.5 3.5-3.5M17 19.5v-15M13.5 8L17 4.5 20.5 8' }],
    ],
    moon: [
        ['path', { d: 'M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z' }],
    ],
    sun: [
        ['circle', { cx: 12, cy: 12, r: 3.8 }],
        ['path', { d: 'M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7' }],
    ],
    wave: [
        ['path', { d: 'M3 12c1.8-4 3.6-4 5.4 0s3.6 4 5.4 0 3.6-4 5.4 0' }],
    ],
    type: [
        ['path', { d: 'M5 7.5V5h14v2.5M12 5v14M9 19h6' }],
    ],
    phone: [
        ['rect', { x: 7, y: 2.5, width: 10, height: 19, rx: 2.4 }],
        ['path', { d: 'M11 18.2h2' }],
    ],
    desktop: [
        ['rect', { x: 3, y: 4, width: 18, height: 12.5, rx: 2 }],
        ['path', { d: 'M8.5 20h7M12 16.5V20' }],
    ],
    stamp: [
        ['path', { d: 'M9 3.5h6v4.5l2.5 3.5v3h-11v-3L9 8z' }],
        ['path', { d: 'M5 18.5h14M7 21h10' }],
    ],
    hourglass: [
        ['path', { d: 'M6.5 3.5h11M6.5 20.5h11M8 3.5c0 4.8 8 5.6 8 8.5s-8 3.7-8 8.5M16 3.5c0 4.8-8 5.6-8 8.5s8 3.7 8 8.5' }],
    ],
    'cloud-off': [
        ['path', { d: 'M3.5 3.5l17 17' }],
        ['path', { d: 'M8.6 8.7A5.5 5.5 0 0 0 6.5 13 4 4 0 0 0 7 21h10.5M11 6.6a5.5 5.5 0 0 1 8 4A3.8 3.8 0 0 1 21 17' }],
    ],
    brush: [
        ['path', { d: 'M18 3.5l2.5 2.5-8.5 8.5-2.5-2.5z' }],
        ['path', { d: 'M9.5 12c-2 0-3.7 1.7-3.7 3.7 0 1.2-.9 2.3-2.3 2.3 2.3 2.3 6.4 2.1 7.6-.6.7-1.6.4-3.4-1.6-5.4z' }],
    ],
    hand: [
        ['path', { d: 'M8 13V6a1.5 1.5 0 0 1 3 0v5.5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.7-2.3L3.4 16a1.5 1.5 0 0 1 2.3-1.9L8 16.5' }],
    ],
    'check-c': [
        ['circle', { cx: 12, cy: 12, r: 8.8 }],
        ['path', { d: 'M8.2 12.3l2.6 2.6 5-5.2' }],
    ],
    db: [
        ['ellipse', { cx: 12, cy: 6, rx: 7.5, ry: 2.8 }],
        ['path', { d: 'M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8' }],
    ],
    coin: [
        ['circle', { cx: 12, cy: 12, r: 8.8 }],
        ['path', { d: 'M14.6 9.3a2.7 2.7 0 0 0-2.6-1.6c-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.6.8 2.6 2.1-1.1 2-2.6 2a2.7 2.7 0 0 1-2.6-1.6M12 6v1.7M12 16.3V18' }],
    ],
    external: [
        ['path', { d: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }],
    ],
    bell: [
        ['path', { d: 'M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.8 2H4.7z' }],
        ['path', { d: 'M10 21h4' }],
    ],
    pin: [
        ['path', { d: 'M9 3.5h6l-1 5.5 3.5 3.5h-11L10 9z' }],
        ['path', { d: 'M12 12.5V21' }],
    ],
    quote: [
        ['path', { d: 'M5 17.5c2.5-1 4-3 4-6.5V7H5v4h4M14 17.5c2.5-1 4-3 4-6.5V7h-4v4h4' }],
    ],
    undo: [
        ['path', { d: 'M9 7.5L4.5 12 9 16.5' }],
        ['path', { d: 'M4.5 12H15a4.5 4.5 0 0 1 0 9h-2' }],
    ],
    flow: [
        ['rect', { x: 3.5, y: 4, width: 6, height: 5, rx: 1.2 }],
        ['rect', { x: 14.5, y: 15, width: 6, height: 5, rx: 1.2 }],
        ['path', { d: 'M6.5 9v3.5a2.5 2.5 0 0 0 2.5 2.5h5.5' }],
    ],
    dot: [
        ['circle', { cx: 12, cy: 12, r: 3.2, fill: true, stroke: 'none' }],
    ],
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
    svg.setAttribute('stroke-width', '1.6');
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
