function normalizeText(value) {
    return String(value ?? '').trim().toLocaleLowerCase();
}

function normalizeKeywords(value) {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeText).filter(Boolean);
}

function normalizeCommand(command) {
    if (!command || typeof command !== 'object') {
        throw new TypeError('Atria command must be an object');
    }

    const id = String(command.id || '').trim();
    const title = String(command.title || '').trim();
    if (!id) throw new Error('Atria command requires an id');
    if (!title) throw new Error(`Atria command "${id}" requires a title`);
    if (typeof command.run !== 'function') {
        throw new Error(`Atria command "${id}" requires a run function`);
    }

    return Object.freeze({
        id,
        title,
        description: String(command.description || '').trim(),
        group: String(command.group || 'General').trim() || 'General',
        keywords: Object.freeze(normalizeKeywords(command.keywords)),
        shortcut: String(command.shortcut || '').trim(),
        when: typeof command.when === 'function' ? command.when : null,
        run: command.run,
    });
}

function scoreCommand(command, query) {
    if (!query) return 1;

    const title = normalizeText(command.title);
    const id = normalizeText(command.id);
    const description = normalizeText(command.description);
    const group = normalizeText(command.group);
    const words = query.split(/\s+/).filter(Boolean);
    let score = 0;

    for (const word of words) {
        if (title === word || id === word) score += 100;
        else if (title.startsWith(word)) score += 60;
        else if (id.startsWith(word)) score += 45;
        else if (title.includes(word)) score += 30;
        else if (id.includes(word)) score += 25;
        else if (command.keywords.some(keyword => keyword.startsWith(word))) score += 20;
        else if (command.keywords.some(keyword => keyword.includes(word))) score += 15;
        else if (description.includes(word) || group.includes(word)) score += 8;
        else return 0;
    }

    return score;
}

export function createCommandRegistry() {
    let searchStatus = null;
    const commands = new Map();
    const listeners = new Set();

    function notify() {
        for (const listener of listeners) {
            try {
                listener();
            } catch (error) {
                console.error('[atria-shell] Command registry listener failed', error);
            }
        }
    }

    function register(command) {
        const normalized = normalizeCommand(command);
        if (commands.has(normalized.id)) {
            throw new Error(`Atria command already registered: ${normalized.id}`);
        }
        commands.set(normalized.id, normalized);
        notify();

        let disposed = false;
        return () => {
            if (disposed) return false;
            disposed = true;
            const removed = commands.delete(normalized.id);
            if (removed) notify();
            return removed;
        };
    }

    function get(id) {
        return commands.get(String(id || '')) || null;
    }

    function isAvailable(command, context) {
        if (!command?.when) return true;
        try {
            return command.when(context) !== false;
        } catch (error) {
            console.warn('[atria-shell] Command availability check failed', {
                command: command.id,
                error,
            });
            return false;
        }
    }

    function list(context) {
        return [...commands.values()]
            .filter(command => isAvailable(command, context))
            .sort((left, right) => (
                left.group.localeCompare(right.group)
                || left.title.localeCompare(right.title)
            ));
    }

    function search(query, context) {
        const normalizedQuery = normalizeText(query);
        return list(context)
            .map(command => ({ command, score: scoreCommand(command, normalizedQuery) }))
            .filter(item => item.score > 0)
            .sort((left, right) => (
                right.score - left.score
                || left.command.group.localeCompare(right.command.group)
                || left.command.title.localeCompare(right.command.title)
            ))
            .map(item => item.command);
    }

    async function execute(id, context) {
        const command = get(id);
        if (!command) throw new Error(`Unknown Atria command: ${id}`);
        if (!isAvailable(command, context)) {
            throw new Error(`Atria command is unavailable: ${id}`);
        }
        return await command.run(context);
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Atria command listener must be a function');
        }
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    return Object.freeze({
        setSearchStatus(value) { searchStatus = value; notify(); },
        getSearchStatus: () => searchStatus,
        register,
        get,
        list,
        search,
        execute,
        subscribe,
        size: () => commands.size,
    });
}
