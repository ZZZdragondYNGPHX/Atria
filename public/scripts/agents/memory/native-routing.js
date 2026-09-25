import { normalizeRuntimeRouteRef } from '../../native/runtime-route-ref.js';

export const MEMORY_ROUTE_TASKS = Object.freeze({ recall: 'Recall route', extraction: 'Extraction route', schema: 'Schema assistance route', rewrite: 'RAG rewrite route' });

export function normalizeMemoryRoutes(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !Object.hasOwn(MEMORY_ROUTE_TASKS, key))) throw new TypeError('Invalid Memory route settings');
    return Object.fromEntries(Object.keys(MEMORY_ROUTE_TASKS).flatMap(task => {
        const ref = normalizeRuntimeRouteRef(input[task]);
        return ref ? [[task, ref]] : [];
    }));
}

export function memoryRouteOptions(settings, task) {
    if (!Object.hasOwn(MEMORY_ROUTE_TASKS, task)) throw new TypeError('Unknown Memory route task');
    const nativeRouteRef = normalizeRuntimeRouteRef(settings?.nativeRoutes?.[task]);
    return { nativeRole: 'memory', ...(nativeRouteRef ? { nativeRouteRef } : {}) };
}
