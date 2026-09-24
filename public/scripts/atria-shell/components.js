/**
 * Atria product components.
 *
 * Small DOM builders shared by every domain surface so Play, Library,
 * Runtime, Build and the utilities speak one visual language. Builders only
 * create presentation; callers keep ownership of data and behavior.
 */

import { createAtriaIcon } from './icons.js';
import { translateShellText } from './localization.js';

const COVER_PALETTES = Object.freeze([
    ['#262a6b', '#6d5cf2'],
    ['#17364b', '#2f97a3'],
    ['#431b3a', '#bf5579'],
    ['#3a2717', '#c3884a'],
    ['#172c25', '#4b9670'],
    ['#22223a', '#5a6aa0'],
    ['#381d1c', '#b25646'],
    ['#132036', '#4b72c4'],
    ['#2c1845', '#8b58c6'],
    ['#1b2831', '#6a8c9f'],
    ['#2a2410', '#a8923d'],
    ['#10282c', '#3c8f8a'],
]);

export function atriaText(value) {
    return translateShellText(value);
}

export function atriaElement(documentRef, tag, className = '', text = null) {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text !== null && text !== undefined) node.textContent = String(text);
    return node;
}

export function stableHash(value) {
    let hash = 0x811c9dc5;
    const input = String(value ?? '');
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

export function firstGrapheme(value, fallback = 'A') {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    const [first] = Array.from(text);
    return (first || fallback).toLocaleUpperCase();
}

/**
 * @param {Document} documentRef
 * @param {{
 *   label: string,
 *   icon?: string,
 *   variant?: 'primary'|'secondary'|'plain'|'destructive'|'tinted',
 *   size?: 'sm'|'md'|'lg',
 *   type?: string,
 *   title?: string,
 *   className?: string,
 *   iconOnly?: boolean,
 *   onClick?: Function,
 * }} options
 */
export function createAtriaButton(documentRef, {
    label,
    icon = '',
    variant = 'secondary',
    size = 'md',
    type = 'button',
    title = '',
    className = '',
    iconOnly = false,
    onClick = null,
} = {}) {
    const button = atriaElement(documentRef, 'button', ['atria-button', className].filter(Boolean).join(' '));
    button.type = type;
    button.dataset.variant = variant;
    button.dataset.size = size;
    if (icon) button.append(createAtriaIcon(documentRef, icon, { size: size === 'sm' ? 15 : size === 'lg' ? 20 : 17 }));
    const text = atriaElement(documentRef, 'span', 'atria-button__label', label);
    if (iconOnly) {
        button.dataset.iconOnly = 'true';
        button.setAttribute('aria-label', String(label));
        text.classList.add('atria-visually-hidden');
    }
    button.append(text);
    if (title) button.title = title;
    else if (iconOnly) button.title = String(label);
    if (typeof onClick === 'function') button.addEventListener('click', onClick);
    return button;
}

export function setAtriaButtonLabel(button, label) {
    const text = button?.querySelector?.('.atria-button__label');
    if (text) text.textContent = String(label);
    else if (button) button.textContent = String(label);
    if (button?.dataset?.iconOnly === 'true') {
        button.setAttribute('aria-label', String(label));
        button.title = String(label);
    }
}

export function createAtriaIconButton(documentRef, {
    label,
    icon,
    className = '',
    variant = 'plain',
    onClick = null,
} = {}) {
    const button = atriaElement(documentRef, 'button', ['atria-icon-button', className].filter(Boolean).join(' '));
    button.type = 'button';
    button.dataset.variant = variant;
    button.setAttribute('aria-label', String(label));
    button.title = String(label);
    button.append(createAtriaIcon(documentRef, icon, { size: 18 }));
    if (typeof onClick === 'function') button.addEventListener('click', onClick);
    return button;
}

export function createAtriaBadge(documentRef, { label, tone = 'neutral', dot = false } = {}) {
    const badge = atriaElement(documentRef, 'span', 'atria-badge');
    badge.dataset.tone = tone;
    if (dot) {
        const marker = atriaElement(documentRef, 'span', 'atria-badge__dot');
        marker.setAttribute('aria-hidden', 'true');
        badge.append(marker);
    }
    badge.append(atriaElement(documentRef, 'span', 'atria-badge__label', label));
    return badge;
}

/**
 * Page header: optional eyebrow, title, subtitle and trailing actions.
 */
export function createAtriaPageHeader(documentRef, {
    title,
    subtitle = '',
    eyebrow = '',
    actions = [],
    level = 2,
    size = 'large',
    className = '',
} = {}) {
    const header = atriaElement(documentRef, 'header', ['atria-page-header', className].filter(Boolean).join(' '));
    header.dataset.size = size;
    const text = atriaElement(documentRef, 'div', 'atria-page-header__text');
    if (eyebrow) text.append(atriaElement(documentRef, 'span', 'atria-page-header__eyebrow', eyebrow));
    const heading = atriaElement(documentRef, `h${Math.min(6, Math.max(1, level))}`, 'atria-page-header__title', title);
    text.append(heading);
    if (subtitle) text.append(atriaElement(documentRef, 'p', 'atria-page-header__subtitle', subtitle));
    header.append(text);
    const actionNodes = actions.filter(Boolean);
    if (actionNodes.length) {
        const bar = atriaElement(documentRef, 'div', 'atria-page-header__actions');
        bar.append(...actionNodes);
        header.append(bar);
    }
    return header;
}

/**
 * Section inside a page: title row with optional trailing accessory.
 */
export function createAtriaSection(documentRef, {
    title = '',
    subtitle = '',
    actions = [],
    className = '',
    level = 3,
} = {}) {
    const section = atriaElement(documentRef, 'section', ['atria-section', className].filter(Boolean).join(' '));
    if (title || actions.length) {
        const header = atriaElement(documentRef, 'div', 'atria-section__header');
        const text = atriaElement(documentRef, 'div', 'atria-section__text');
        if (title) text.append(atriaElement(documentRef, `h${level}`, 'atria-section__title', title));
        if (subtitle) text.append(atriaElement(documentRef, 'p', 'atria-section__subtitle', subtitle));
        header.append(text);
        const nodes = actions.filter(Boolean);
        if (nodes.length) {
            const bar = atriaElement(documentRef, 'div', 'atria-section__actions');
            bar.append(...nodes);
            header.append(bar);
        }
        section.append(header);
    }
    const body = atriaElement(documentRef, 'div', 'atria-section__body');
    section.append(body);
    section.body = body;
    return section;
}

export function createAtriaList(documentRef, { label = '', className = '', inset = true } = {}) {
    const list = atriaElement(documentRef, 'div', ['atria-list', className].filter(Boolean).join(' '));
    list.setAttribute('role', 'list');
    if (label) list.setAttribute('aria-label', label);
    list.dataset.inset = String(Boolean(inset));
    return list;
}

/**
 * List row. When `onClick` is supplied the row is one button (whole-row
 * target); trailing controls are then rendered beside it, never nested.
 */
export function createAtriaListRow(documentRef, {
    title,
    subtitle = '',
    meta = '',
    icon = '',
    leading = null,
    trailing = [],
    onClick = null,
    chevron = Boolean(onClick),
    className = '',
    tone = '',
} = {}) {
    const row = atriaElement(documentRef, 'div', ['atria-list-row', className].filter(Boolean).join(' '));
    row.setAttribute('role', 'listitem');
    if (tone) row.dataset.tone = tone;

    const main = atriaElement(documentRef, onClick ? 'button' : 'div', 'atria-list-row__main');
    if (onClick) {
        main.type = 'button';
        main.addEventListener('click', onClick);
    }
    if (leading) {
        const lead = atriaElement(documentRef, 'span', 'atria-list-row__leading');
        lead.append(leading);
        main.append(lead);
    } else if (icon) {
        const lead = atriaElement(documentRef, 'span', 'atria-list-row__icon');
        lead.append(createAtriaIcon(documentRef, icon, { size: 18 }));
        main.append(lead);
    }
    const text = atriaElement(documentRef, 'span', 'atria-list-row__text');
    text.append(atriaElement(documentRef, 'span', 'atria-list-row__title', title));
    if (subtitle) text.append(atriaElement(documentRef, 'span', 'atria-list-row__subtitle', subtitle));
    main.append(text);
    if (meta) main.append(atriaElement(documentRef, 'span', 'atria-list-row__meta', meta));
    if (chevron) {
        const mark = atriaElement(documentRef, 'span', 'atria-list-row__chevron');
        mark.append(createAtriaIcon(documentRef, 'chevron-right', { size: 16 }));
        main.append(mark);
    }
    row.append(main);

    const accessories = trailing.filter(Boolean);
    if (accessories.length) {
        const bar = atriaElement(documentRef, 'span', 'atria-list-row__accessories');
        bar.append(...accessories);
        row.append(bar);
    }
    return row;
}

export function createAtriaDisclosure(documentRef, {
    summary,
    content = null,
    open = false,
    className = '',
} = {}) {
    const details = atriaElement(documentRef, 'details', ['atria-disclosure', className].filter(Boolean).join(' '));
    details.open = Boolean(open);
    const label = atriaElement(documentRef, 'summary', 'atria-disclosure__summary');
    label.append(
        atriaElement(documentRef, 'span', 'atria-disclosure__label', summary),
        createAtriaIcon(documentRef, 'chevron-down', { size: 16, className: 'atria-disclosure__chevron' }),
    );
    const body = atriaElement(documentRef, 'div', 'atria-disclosure__body');
    if (content !== null && content !== undefined) {
        if (typeof content === 'string') body.textContent = content;
        else body.append(content);
    }
    details.append(label, body);
    details.body = body;
    return details;
}

export function createAtriaCode(documentRef, value, { className = '' } = {}) {
    const pre = atriaElement(documentRef, 'pre', ['atria-code', className].filter(Boolean).join(' '));
    pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return pre;
}

/**
 * Two-column key/value facts (monospace values optional).
 */
export function createAtriaFacts(documentRef, entries = [], { mono = false, className = '' } = {}) {
    const list = atriaElement(documentRef, 'dl', ['atria-facts', className].filter(Boolean).join(' '));
    for (const [key, value] of entries) {
        if (value === undefined || value === null || value === '') continue;
        const row = atriaElement(documentRef, 'div', 'atria-facts__row');
        const term = atriaElement(documentRef, 'dt', 'atria-facts__term', key);
        const detail = atriaElement(documentRef, 'dd', 'atria-facts__value', value);
        if (mono) detail.dataset.mono = 'true';
        row.append(term, detail);
        list.append(row);
    }
    return list;
}

export function createAtriaNotice(documentRef, {
    tone = 'info',
    title = '',
    message = '',
    actions = [],
    icon = '',
} = {}) {
    const notice = atriaElement(documentRef, 'div', 'atria-notice');
    notice.dataset.tone = tone;
    notice.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    const glyph = icon || (tone === 'danger' ? 'error' : tone === 'warning' ? 'warning' : tone === 'success' ? 'check-circle' : 'info');
    const visual = atriaElement(documentRef, 'span', 'atria-notice__icon');
    visual.append(createAtriaIcon(documentRef, glyph, { size: 18 }));
    const text = atriaElement(documentRef, 'div', 'atria-notice__text');
    if (title) text.append(atriaElement(documentRef, 'strong', 'atria-notice__title', title));
    if (message) text.append(atriaElement(documentRef, 'span', 'atria-notice__message', message));
    notice.append(visual, text);
    const nodes = actions.filter(Boolean);
    if (nodes.length) {
        const bar = atriaElement(documentRef, 'div', 'atria-notice__actions');
        bar.append(...nodes);
        notice.append(bar);
    }
    return notice;
}

/**
 * Generated artwork for content without a cover: a stable gradient and an
 * oversized monogram, derived from the resource id.
 */
export function createAtriaCover(documentRef, {
    title = '',
    seed = '',
    shape = 'poster',
    className = '',
} = {}) {
    const hash = stableHash(seed || title);
    const [from, to] = COVER_PALETTES[hash % COVER_PALETTES.length];
    const cover = atriaElement(documentRef, 'span', ['atria-cover', className].filter(Boolean).join(' '));
    cover.dataset.shape = shape;
    cover.setAttribute('aria-hidden', 'true');
    cover.style.setProperty('--atri-cover-from', from);
    cover.style.setProperty('--atri-cover-to', to);
    cover.style.setProperty('--atri-cover-angle', `${135 + (hash % 70) - 35}deg`);
    cover.style.setProperty('--atri-cover-glow-x', `${18 + (hash % 50)}%`);
    cover.append(atriaElement(documentRef, 'span', 'atria-cover__monogram', firstGrapheme(title)));
    return cover;
}

export function createAtriaAvatar(documentRef, { name = '', seed = '', size = 32, className = '' } = {}) {
    const hash = stableHash(seed || name);
    const [from, to] = COVER_PALETTES[hash % COVER_PALETTES.length];
    const avatar = atriaElement(documentRef, 'span', ['atria-avatar', className].filter(Boolean).join(' '), firstGrapheme(name, '?'));
    avatar.setAttribute('aria-hidden', 'true');
    avatar.style.setProperty('--atri-avatar-size', `${size}px`);
    avatar.style.setProperty('--atri-cover-from', from);
    avatar.style.setProperty('--atri-cover-to', to);
    return avatar;
}

export function createAtriaSpinner(documentRef, { label = '' } = {}) {
    const spinner = atriaElement(documentRef, 'span', 'atria-spinner');
    if (label) {
        spinner.setAttribute('role', 'status');
        spinner.setAttribute('aria-label', label);
    } else {
        spinner.setAttribute('aria-hidden', 'true');
    }
    return spinner;
}

function readLocale() {
    try {
        const stored = globalThis.localStorage?.getItem?.('language');
        return String(stored || globalThis.navigator?.language || 'en');
    } catch {
        return 'en';
    }
}

export function formatAtriaRelativeTime(timestamp, now = Date.now()) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) return '';
    const seconds = Math.round((value - now) / 1000);
    const abs = Math.abs(seconds);
    const units = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
    ];
    try {
        const formatter = new Intl.RelativeTimeFormat(readLocale(), { numeric: 'auto' });
        for (const [unit, size] of units) {
            if (abs >= size) return formatter.format(Math.round(seconds / size), unit);
        }
        return formatter.format(0, 'second');
    } catch {
        return new Date(value).toLocaleString();
    }
}

export function formatAtriaDate(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) return '';
    try {
        return new Intl.DateTimeFormat(readLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch {
        return new Date(value).toLocaleString();
    }
}

export function shortAtriaId(value, length = 8) {
    const text = String(value ?? '');
    if (text.length <= length + 4) return text;
    return `${text.slice(0, length)}…`;
}
