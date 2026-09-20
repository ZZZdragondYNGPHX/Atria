import { CORRELATION_KEYS, LOG_LEVELS } from './model.js';
import { LOG_SIDES } from './modules.js';

function normalizeList(value) {
    const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return [...new Set(list.map(item => String(item || '').trim().toLowerCase()).filter(Boolean))];
}

function normalizeTime(value) {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : null;
}

export function normalizeLogQuery(query = {}) {
    return {
        modules: normalizeList(query.modules ?? query.module),
        sides: normalizeList(query.sides ?? query.side).filter(side => LOG_SIDES.includes(side)),
        levels: normalizeList(query.levels ?? query.level).filter(level => LOG_LEVELS.includes(level)),
        categories: normalizeList(query.categories ?? query.category),
        events: normalizeList(query.events ?? query.event),
        startTime: normalizeTime(query.startTime),
        endTime: normalizeTime(query.endTime),
        sinceId: Number.isFinite(Number(query.sinceId)) ? Math.max(0, Math.floor(Number(query.sinceId))) : 0,
        text: String(query.text ?? query.searchTerm ?? '').trim().toLowerCase(),
        correlation: String(query.correlation ?? '').trim().toLowerCase(),
        limit: Number.isFinite(Number(query.limit)) ? Math.min(5000, Math.max(1, Math.floor(Number(query.limit)))) : 500,
    };
}

export function matchesLogQuery(entry, rawQuery = {}) {
    const query = rawQuery.modules ? rawQuery : normalizeLogQuery(rawQuery);
    if (Number(entry?.id || 0) <= query.sinceId) return false;
    if (query.modules.length && !query.modules.includes(String(entry?.module || '').toLowerCase())) return false;
    if (query.sides.length && !query.sides.includes(String(entry?.side || '').toLowerCase())) return false;
    if (query.levels.length && !query.levels.includes(String(entry?.level || '').toLowerCase())) return false;
    if (query.categories.length && !query.categories.includes(String(entry?.category || '').toLowerCase())) return false;
    if (query.events.length && !query.events.includes(String(entry?.event || '').toLowerCase())) return false;
    if (query.startTime !== null && Number(entry?.timestamp || 0) < query.startTime) return false;
    if (query.endTime !== null && Number(entry?.timestamp || 0) > query.endTime) return false;
    if (query.correlation && !CORRELATION_KEYS.some(key => String(entry?.correlation?.[key] || '').toLowerCase().includes(query.correlation))) return false;
    if (query.text) {
        const haystack = [
            entry?.module, entry?.category, entry?.event, entry?.level,
            entry?.message, JSON.stringify(entry?.data ?? {}),
        ].join(' ').toLowerCase();
        if (!haystack.includes(query.text)) return false;
    }
    return true;
}

export function queryLogEntries(entries = [], rawQuery = {}) {
    const query = normalizeLogQuery(rawQuery);
    const filtered = entries.filter(entry => matchesLogQuery(entry, query));
    return filtered.length > query.limit ? filtered.slice(filtered.length - query.limit) : filtered;
}
