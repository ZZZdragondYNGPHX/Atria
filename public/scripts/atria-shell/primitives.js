export const ATRIA_PRIMITIVES = Object.freeze([
    'AppShell',
    'NavigationRail',
    'BottomNavigation',
    'GlobalBar',
    'ContextBar',
    'FocusArea',
    'Stage',
    'Workspace',
    'Dock',
    'Sheet',
    'Inspector',
    'Timeline',
    'Composer',
    'CommandPalette',
    'CommandSheet',
    'RuntimeCard',
    'StatusChip',
    'Toolbar',
    'SegmentedControl',
    'SplitPane',
    'EmptyState',
    'ErrorState',
    'LoadingState',
    'HostRecovery',
]);

const PRIMITIVE_SET = new Set(ATRIA_PRIMITIVES);

function toKebabCase(value) {
    return String(value)
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/\s+/g, '-')
        .toLowerCase();
}

export function createAtriaPrimitive(documentRef, name, {
    tag = 'div',
    className = '',
    role = '',
    ariaLabel = '',
    attributes = {},
} = {}) {
    if (!documentRef?.createElement) throw new Error('Atria primitive requires a document');
    if (!PRIMITIVE_SET.has(name)) throw new Error(`Unknown Atria primitive: ${name}`);

    const element = documentRef.createElement(tag);
    const suffix = toKebabCase(name);
    element.className = ['atria-primitive', `atria-${suffix}`, className].filter(Boolean).join(' ');
    element.dataset.atriaPrimitive = name;
    if (role) element.setAttribute('role', role);
    if (ariaLabel) element.setAttribute('aria-label', ariaLabel);

    for (const [key, value] of Object.entries(attributes)) {
        if (value === undefined || value === null || value === false) continue;
        if (value === true) element.setAttribute(key, '');
        else element.setAttribute(key, String(value));
    }

    return element;
}

export function createAtriaStatusChip(documentRef, {
    label = '',
    tone = 'neutral',
    title = '',
} = {}) {
    const chip = createAtriaPrimitive(documentRef, 'StatusChip', {
        tag: 'span',
        attributes: { 'data-tone': tone },
    });
    chip.textContent = String(label);
    if (title) chip.title = String(title);
    return chip;
}

export function createAtriaRuntimeCard(documentRef, {
    title = '',
    description = '',
    status = '',
    tone = 'neutral',
} = {}) {
    const card = createAtriaPrimitive(documentRef, 'RuntimeCard', { tag: 'article' });
    const heading = documentRef.createElement('h3');
    heading.className = 'atria-runtime-card__title';
    heading.textContent = String(title);
    const body = documentRef.createElement('p');
    body.className = 'atria-runtime-card__description';
    body.textContent = String(description);
    card.append(heading, body);
    if (status) card.append(createAtriaStatusChip(documentRef, { label: status, tone }));
    return card;
}

export function createAtriaStatePanel(documentRef, kind, {
    title = '',
    message = '',
} = {}) {
    const name = kind === 'error'
        ? 'ErrorState'
        : kind === 'loading'
            ? 'LoadingState'
            : 'EmptyState';
    const panel = createAtriaPrimitive(documentRef, name, {
        role: kind === 'error' ? 'alert' : 'status',
    });
    const heading = documentRef.createElement('strong');
    heading.textContent = String(title);
    const body = documentRef.createElement('span');
    body.textContent = String(message);
    panel.append(heading, body);
    return panel;
}
