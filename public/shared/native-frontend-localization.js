import { fields, identifier } from './native-frontend-contract.js';

export function localeId(value) {
    if (typeof value !== 'string' || value.length > 64 || Intl.getCanonicalLocales(value)[0] !== value) throw new TypeError('Invalid canonical locale');
    return value;
}
export function assertLocalization(value) {
    fields(value, ['version', 'defaultLocale', 'catalogs']);
    if (value.version !== 1) throw new TypeError('Invalid localization version');
    localeId(value.defaultLocale);
    fields(value.catalogs, Object.keys(value.catalogs));
    if (!Object.hasOwn(value.catalogs, value.defaultLocale) || Object.keys(value.catalogs).length > 32) throw new TypeError('Invalid locale fallback');
    let count = 0;
    const message = (node, depth = 0) => {
        if (++count > 50000 || depth > 12) throw new TypeError('Localization budget exceeded');
        if (typeof node === 'string') { if (node.length > 4096) throw new TypeError('Message too long'); return; }
        if (Array.isArray(node)) { if (node.length > 64) throw new TypeError('Message too long'); node.forEach(item => message(item, depth + 1)); return; }
        fields(node, ['arg', 'format', 'cases', 'unit']); identifier(node.arg);
        if (!['text', 'plural', 'select', 'number', 'date', 'time', 'relative', 'list'].includes(node.format)) throw new TypeError('Invalid message formatter');
        if (['plural', 'select'].includes(node.format)) {
            fields(node.cases, Object.keys(node.cases));
            if (!Object.hasOwn(node.cases, 'other') || Object.keys(node.cases).length > 32) throw new TypeError('Message requires other case');
            for (const [key, item] of Object.entries(node.cases)) { if (!/^(?:[a-zA-Z][\w-]{0,63}|=\d+)$/.test(key)) throw new TypeError('Invalid message case'); message(item, depth + 1); }
        } else if (node.cases) throw new TypeError('Unexpected message cases');
        if (node.format === 'relative' && !['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'].includes(node.unit)) throw new TypeError('Invalid relative unit');
    };
    for (const [locale, catalog] of Object.entries(value.catalogs)) {
        localeId(locale); fields(catalog, ['direction', 'messages']);
        if (!['ltr', 'rtl'].includes(catalog.direction)) throw new TypeError('Invalid locale direction');
        fields(catalog.messages, Object.keys(catalog.messages));
        if (Object.keys(catalog.messages).length > 4096) throw new TypeError('Message budget exceeded');
        for (const [key, node] of Object.entries(catalog.messages)) { identifier(key); message(node); }
    }
    return value;
}

export function createLocalization(resource, requested, diagnostic = () => {}) {
    const value = assertLocalization(resource), seen = new Set(); let locale;
    const setLocale = next => {
        localeId(next); const parts = next.split('-');
        while (parts.length && !Object.hasOwn(value.catalogs, parts.join('-'))) parts.pop();
        locale = parts.length ? parts.join('-') : value.defaultLocale;
    };
    setLocale(requested ?? value.defaultLocale);
    function format(node, args) {
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) return node.map(item => format(item, args)).join('');
        const arg = Object.hasOwn(args, node.arg) ? args[node.arg] : '';
        switch (node.format) {
            case 'plural': return format(node.cases['=' + Number(arg)] ?? node.cases[new Intl.PluralRules(locale).select(Number(arg))] ?? node.cases.other, args);
            case 'select': return format(Object.hasOwn(node.cases, String(arg)) ? node.cases[String(arg)] : node.cases.other, args);
            case 'number': return new Intl.NumberFormat(locale).format(Number(arg));
            case 'date': return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(arg));
            case 'time': return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(new Date(arg));
            case 'relative': return new Intl.RelativeTimeFormat(locale).format(Number(arg), node.unit);
            case 'list': return new Intl.ListFormat(locale).format(Array.isArray(arg) ? arg.slice(0, 64).map(String) : []);
            default: return String(arg).slice(0, 4096);
        }
    }
    return { setLocale, get locale() { return locale; }, get direction() { return value.catalogs[locale].direction; },
        text(key, args = {}) {
            const messages = value.catalogs[locale].messages, fallback = value.catalogs[value.defaultLocale].messages;
            const node = Object.hasOwn(messages, key) ? messages[key] : Object.hasOwn(fallback, key) ? fallback[key] : undefined;
            if (node === undefined) { if (!seen.has(key)) { seen.add(key); diagnostic({ reasonCode: 'localization_missing_key', sourceId: key }); } return key; }
            return format(node, args).slice(0, 65536);
        },
    };
}
