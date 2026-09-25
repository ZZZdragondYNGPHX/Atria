import { compileGameSelectorDefinitions } from './declarative.js';

const PACKAGE_PLAY_TYPES = new Set([
    'ui.component',
    'play.selector',
    'play.command',
    'play.rule',
    'play.reducer',
    'play.validator',
    'play.inspector',
]);

function clone(value) {
    return structuredClone(value);
}

function plain(value, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(field + ' must be an object');
    }
    return value;
}

export function createPackageRuntimeContributionRegistry(runtimePlugins = []) {
    if (!Array.isArray(runtimePlugins)) {
        throw new Error('Package runtime plugins must be an array');
    }
    const records = [];
    const pluginIds = new Set();
    const keys = new Set();

    for (const [pluginIndex, rawPlugin] of runtimePlugins.entries()) {
        const plugin = plain(rawPlugin, 'Package runtime plugin ' + pluginIndex);
        const pluginId = String(plugin.pluginId || '').trim();
        if (!/^[a-z][a-z0-9]*(?:[._:-][a-z0-9][a-z0-9_-]*)+$/.test(pluginId)) {
            throw new Error('Package runtime plugin id is invalid');
        }
        if (pluginIds.has(pluginId)) throw new Error('Duplicate package runtime plugin ' + pluginId);
        pluginIds.add(pluginId);
        if (!Array.isArray(plugin.contributions)) {
            throw new Error('Package runtime plugin contributions must be an array');
        }
        if ('host' in plugin || 'entrypoint' in plugin) {
            throw new Error('Package runtime projection must not expose Host Plugin execution');
        }

        for (const [index, rawContribution] of plugin.contributions.entries()) {
            const contribution = plain(rawContribution, `Package contribution ${pluginId}[${index}]`);
            const id = String(contribution.id || '').trim();
            const type = String(contribution.type || '').trim();
            if (!id || !PACKAGE_PLAY_TYPES.has(type)) {
                throw new Error(`Unsupported package Play contribution '${type || id}'`);
            }
            const key = pluginId + '\0' + id;
            if (keys.has(key)) throw new Error('Duplicate package contribution ' + pluginId + ':' + id);
            keys.add(key);
            records.push(Object.freeze({
                pluginId,
                pluginVersion: String(plugin.version || ''),
                id,
                type,
                config: clone(contribution.config || {}),
            }));
        }
    }

    return Object.freeze({
        list(query = {}) {
            return Object.freeze(records
                .filter(record => !query.pluginId || record.pluginId === query.pluginId)
                .filter(record => !query.type || record.type === query.type)
                .map(record => record));
        },
        selectorDefinitions() {
            const definitions = [];
            for (const record of records) {
                if (record.type !== 'play.selector') continue;
                const raw = record.config.selectors;
                if (!Array.isArray(raw)) {
                    throw new Error('play.selector contribution requires config.selectors');
                }
                definitions.push(...compileGameSelectorDefinitions(raw));
            }
            return definitions;
        },
    });
}
