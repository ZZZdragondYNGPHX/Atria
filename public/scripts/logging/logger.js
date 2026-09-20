import { normalizeFrontendLogModule } from './modules.js';
import { FrontendLogStore } from './store.js';

export const frontendLogStore = new FrontendLogStore();

function toPayload(event, message, data, context) {
    if (event && typeof event === 'object' && !Array.isArray(event)) return { ...event };
    return {
        event: String(event || 'log'),
        message: String(message || ''),
        data: data ?? {},
        ...(context && typeof context === 'object' ? context : {}),
    };
}

export function createLogger(module, options = {}) {
    const store = options.store || frontendLogStore;
    const normalizedModule = normalizeFrontendLogModule(module);
    const defaults = options.defaults && typeof options.defaults === 'object' ? options.defaults : {};
    const write = (level, event, message, data, context) => {
        try {
            const payload = toPayload(event, message, data, context);
            return store.append({
                ...defaults,
                ...payload,
                side: 'frontend',
                level,
                module: normalizedModule,
                source: payload.source || defaults.source || 'structured',
            });
        } catch {
            return null;
        }
    };
    return Object.freeze({
        module: normalizedModule,
        write,
        trace: (event, message, data, context) => write('trace', event, message, data, context),
        debug: (event, message, data, context) => write('debug', event, message, data, context),
        log: (event, message, data, context) => write('log', event, message, data, context),
        info: (event, message, data, context) => write('info', event, message, data, context),
        warn: (event, message, data, context) => write('warn', event, message, data, context),
        error: (event, message, data, context) => write('error', event, message, data, context),
    });
}
