import {
    ATRIA_PRIMARY_DOMAINS,
    ATRIA_ROUTE_CHILD_QUERY_KEY,
    ATRIA_ROUTE_QUERY_KEY,
} from './constants.js';

const HISTORY_KEY = 'atriaNavigation';
const HISTORY_VERSION = 1;
const CONTEXT_SHEET_STATES = new Set(['peek', 'half', 'full']);

function findDomain(domainId) {
    const id = String(domainId || '').trim();
    return ATRIA_PRIMARY_DOMAINS.find(domain => domain.id === id) || null;
}

function normalizeDomain(domainId, fallback = 'play') {
    return findDomain(domainId)?.id || findDomain(fallback)?.id || 'play';
}

function domainLabel(domainId) {
    return findDomain(domainId)?.label || String(domainId || 'Play');
}

function normalizeChild(child) {
    if (!child) return null;
    if (typeof child === 'string') {
        const id = child.trim();
        if (!id) return null;
        return Object.freeze({ id, label: id, kind: 'workspace' });
    }
    if (typeof child !== 'object') return null;

    const id = String(child.id || '').trim();
    if (!id) return null;
    return Object.freeze({
        id,
        label: String(child.label || id).trim() || id,
        kind: child.kind === 'detail' ? 'detail' : 'workspace',
    });
}

function normalizeBreadcrumb(domainId, parts, child = null) {
    const normalized = Array.isArray(parts)
        ? parts.map(value => String(value || '').trim()).filter(Boolean)
        : [];
    if (normalized.length) return Object.freeze(normalized);

    const values = [domainLabel(domainId)];
    if (child?.label) values.push(child.label);
    return Object.freeze(values);
}

function cloneHistoryBase(windowRef) {
    const current = windowRef.history?.state;
    return current && typeof current === 'object' && !Array.isArray(current)
        ? { ...current }
        : {};
}

function readUrlRoute(windowRef) {
    try {
        const url = new URL(windowRef.location?.href || 'http://localhost/');
        const domain = url.searchParams.get(ATRIA_ROUTE_QUERY_KEY);
        const childId = url.searchParams.get(ATRIA_ROUTE_CHILD_QUERY_KEY);
        return {
            domain,
            child: childId
                ? { id: childId, label: childId, kind: 'workspace' }
                : null,
        };
    } catch {
        return { domain: null, child: null };
    }
}

function routeUrl(windowRef, route) {
    const url = new URL(windowRef.location?.href || 'http://localhost/');
    url.searchParams.set(ATRIA_ROUTE_QUERY_KEY, route.domain);
    if (route.child?.id) {
        url.searchParams.set(ATRIA_ROUTE_CHILD_QUERY_KEY, route.child.id);
    } else {
        url.searchParams.delete(ATRIA_ROUTE_CHILD_QUERY_KEY);
    }
    return `${url.pathname}${url.search}${url.hash}`;
}

function sameChild(left, right) {
    if (!left && !right) return true;
    return Boolean(left && right)
        && left.id === right.id
        && left.label === right.label
        && left.kind === right.kind;
}

function sameArray(left, right) {
    return left.length === right.length
        && left.every((value, index) => value === right[index]);
}

function freezeRoute(domain, child, breadcrumb) {
    const normalizedDomain = normalizeDomain(domain);
    const normalizedChild = normalizeChild(child);
    return Object.freeze({
        domain: normalizedDomain,
        child: normalizedChild,
        breadcrumb: normalizeBreadcrumb(normalizedDomain, breadcrumb, normalizedChild),
    });
}

function freezeContext(value = {}) {
    return Object.freeze({
        id: String(value.id || 'context').trim() || 'context',
        title: String(value.title || 'Context').trim() || 'Context',
        open: Boolean(value.open),
        sheetState: CONTEXT_SHEET_STATES.has(value.sheetState) ? value.sheetState : 'half',
        initialized: Boolean(value.initialized),
    });
}

export function createAtriaNavigationAuthority({
    window: windowRef = globalThis.window,
    initialDomain = 'play',
} = {}) {
    if (!windowRef?.history || !windowRef?.location) {
        throw new Error('Atria Navigation Authority requires window history and location');
    }

    const listeners = new Set();
    let disposed = false;

    const historyState = windowRef.history.state?.[HISTORY_KEY];
    const urlRoute = readUrlRoute(windowRef);
    let historyIndex = Number.isInteger(historyState?.index) && historyState.index >= 0
        ? historyState.index
        : 0;
    let route = freezeRoute(
        historyState?.domain || urlRoute.domain || initialDomain,
        historyState?.child || urlRoute.child,
        historyState?.breadcrumb,
    );
    let context = freezeContext();

    function getState() {
        return Object.freeze({
            route,
            context,
            historyIndex,
            canGoBackWithinAtria: historyIndex > 0,
        });
    }

    function notify(reason) {
        const snapshot = getState();
        for (const listener of listeners) {
            try {
                listener(snapshot, reason);
            } catch (error) {
                console.error('[atria-shell] Navigation listener failed', error);
            }
        }
        return snapshot;
    }

    function writeHistory(mode) {
        const state = cloneHistoryBase(windowRef);
        state[HISTORY_KEY] = {
            version: HISTORY_VERSION,
            index: historyIndex,
            domain: route.domain,
            child: route.child ? { ...route.child } : null,
            breadcrumb: [...route.breadcrumb],
        };
        const method = mode === 'push' ? 'pushState' : 'replaceState';
        windowRef.history[method](state, '', routeUrl(windowRef, route));
    }

    function commitRoute(nextRoute, {
        history = 'push',
        reason = 'navigate',
    } = {}) {
        const normalized = freezeRoute(
            nextRoute.domain,
            nextRoute.child,
            nextRoute.breadcrumb,
        );
        const same = route.domain === normalized.domain
            && sameChild(route.child, normalized.child)
            && sameArray(route.breadcrumb, normalized.breadcrumb);
        if (same) return route;

        route = normalized;
        if (history === 'push') {
            historyIndex += 1;
            writeHistory('push');
        } else if (history === 'replace') {
            writeHistory('replace');
        }
        notify(reason);
        return route;
    }

    function navigate(domainId, {
        history = 'push',
        breadcrumb,
        reason = 'primary-navigation',
    } = {}) {
        const domain = findDomain(domainId);
        if (!domain) throw new Error(`Unknown Atria primary domain: ${domainId}`);

        return commitRoute({
            domain: domain.id,
            child: null,
            breadcrumb: breadcrumb || [domain.label],
        }, { history, reason });
    }

    function navigateChild(child, {
        history = 'push',
        breadcrumb,
        reason = 'child-navigation',
    } = {}) {
        const normalizedChild = normalizeChild(child);
        if (!normalizedChild) return clearChild({ history, reason });

        return commitRoute({
            domain: route.domain,
            child: normalizedChild,
            breadcrumb: breadcrumb || [domainLabel(route.domain), normalizedChild.label],
        }, { history, reason });
    }

    function clearChild({
        history = 'replace',
        reason = 'child-close',
    } = {}) {
        if (!route.child) return route;
        return commitRoute({
            domain: route.domain,
            child: null,
            breadcrumb: [domainLabel(route.domain)],
        }, { history, reason });
    }

    function setBreadcrumb(parts, { reason = 'breadcrumb' } = {}) {
        const next = normalizeBreadcrumb(route.domain, parts, route.child);
        if (sameArray(route.breadcrumb, next)) return route;
        route = freezeRoute(route.domain, route.child, next);
        writeHistory('replace');
        notify(reason);
        return route;
    }

    function setContext(next = {}, { reason = 'context' } = {}) {
        const merged = freezeContext({ ...context, ...next });
        const same = context.id === merged.id
            && context.title === merged.title
            && context.open === merged.open
            && context.sheetState === merged.sheetState
            && context.initialized === merged.initialized;
        if (same) return context;

        context = merged;
        notify(reason);
        return context;
    }

    function closeContext(options = {}) {
        if (!context.open) return false;
        setContext({ open: false }, { reason: options.reason || 'context-close' });
        return true;
    }

    function back() {
        if (historyIndex <= 0) return false;
        windowRef.history.back();
        return true;
    }

    function onPopState(event) {
        if (disposed) return;
        const state = event?.state?.[HISTORY_KEY];
        const url = readUrlRoute(windowRef);
        historyIndex = Number.isInteger(state?.index) && state.index >= 0
            ? state.index
            : 0;
        route = freezeRoute(
            state?.domain || url.domain || initialDomain,
            state?.child || url.child,
            state?.breadcrumb,
        );
        notify('popstate');
    }

    windowRef.addEventListener?.('popstate', onPopState);
    writeHistory('replace');

    return Object.freeze({
        navigate,
        navigateChild,
        clearChild,
        setBreadcrumb,
        setContext,
        closeContext,
        back,
        getRoute: () => route,
        getContext: () => context,
        getState,
        canGoBackWithinAtria: () => historyIndex > 0,
        subscribe(listener) {
            if (typeof listener !== 'function') {
                throw new TypeError('Navigation listener must be a function');
            }
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            listeners.clear();
            windowRef.removeEventListener?.('popstate', onPopState);
        },
    });
}
