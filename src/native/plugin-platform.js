import {
    ATRIA_PLUGIN_CONTRIBUTION_TYPES,
    assertAtriaPluginContract,
    assertAuthoringOperation,
} from './authoring-contracts.js';

const PACKAGE_CONTRIBUTION_CAPABILITIES = Object.freeze({
    'ui.component': 'runtime.ui',
    'play.selector': 'runtime.selector',
    'play.command': 'runtime.command',
    'play.rule': 'runtime.rule',
    'play.reducer': 'runtime.reducer',
    'play.validator': 'runtime.validator',
    'play.inspector': 'runtime.ui',
});

const PACKAGE_CAPABILITY_PERMISSIONS = Object.freeze({
    'runtime.ui': 'custom-ui',
    'runtime.command': 'runtime-tools',
    'runtime.rule': 'world-write',
    'runtime.reducer': 'world-write',
});

const HOST_CONTRIBUTION_CAPABILITIES = Object.freeze({
    'authoring.resource': 'host.resource-registration',
    'authoring.operation': 'host.authoring',
    'build.validator': 'host.build',
    'build.generator': 'host.build',
    'build.asset-importer': 'host.build',
    'build.component-palette': 'host.build',
    'ui.component': 'host.play',
    'play.selector': 'host.play',
    'play.command': 'host.play',
    'play.rule': 'host.play',
    'play.reducer': 'host.play',
    'play.validator': 'host.play',
    'play.inspector': 'host.play',
});

const HOST_CAPABILITY_PERMISSIONS = Object.freeze({
    'host.resource-registration': 'host.authoring',
    'host.authoring': 'host.authoring',
    'host.build': 'host.build',
    'host.play': 'host.play',
});

function fail(message, code = 'atria_plugin_invalid') {
    const error = new Error(message);
    error.code = code;
    throw error;
}

function contributionSurface(type) {
    if (type.startsWith('authoring.') || type.startsWith('build.')) return 'build';
    if (type === 'ui.component' || type.startsWith('play.')) return 'play';
    return 'unknown';
}

function assertContributionType(contribution) {
    if (!ATRIA_PLUGIN_CONTRIBUTION_TYPES.includes(contribution.type)) {
        fail('Unsupported Atria Plugin contribution type: ' + contribution.type);
    }
}

function normalizeDeclaredPermissions(values = []) {
    const out = new Set();
    for (const value of values) {
        if (typeof value === 'string') out.add(value);
        else if (value?.permission) out.add(value.permission);
    }
    return out;
}

export function resolvePluginDependencies(values) {
    if (!Array.isArray(values)) throw new TypeError('Plugin dependency resolution requires an array');
    const manifests = values.map(assertAtriaPluginContract);
    const byId = new Map();
    for (const manifest of manifests) {
        if (byId.has(manifest.pluginId)) fail('Duplicate Atria Plugin id: ' + manifest.pluginId);
        byId.set(manifest.pluginId, manifest);
    }

    const visiting = new Set();
    const visited = new Set();
    const ordered = [];
    function visit(manifest) {
        if (visited.has(manifest.pluginId)) return;
        if (visiting.has(manifest.pluginId)) {
            fail('Atria Plugin dependency cycle includes ' + manifest.pluginId, 'atria_plugin_dependency_cycle');
        }
        visiting.add(manifest.pluginId);
        for (const dependency of manifest.dependencies) {
            const target = byId.get(dependency.pluginId);
            if (!target) {
                if (dependency.optional) continue;
                fail(
                    `Atria Plugin ${manifest.pluginId} requires missing dependency ${dependency.pluginId}`,
                    'atria_plugin_dependency_missing',
                );
            }
            if (target.version !== dependency.version) {
                fail(
                    `Atria Plugin ${manifest.pluginId} requires ${dependency.pluginId}@${dependency.version}`,
                    'atria_plugin_dependency_version',
                );
            }
            visit(target);
        }
        visiting.delete(manifest.pluginId);
        visited.add(manifest.pluginId);
        ordered.push(manifest);
    }
    for (const manifest of manifests) visit(manifest);
    return Object.freeze(ordered);
}

export function compilePackageRuntimePlugins(values = [], { declaredPermissions = [] } = {}) {
    if (!Array.isArray(values)) throw new TypeError('Package runtime plugins must be an array');
    const permissions = normalizeDeclaredPermissions(declaredPermissions);
    const ordered = resolvePluginDependencies(values);

    const runtimePlugins = ordered.map(manifest => {
        if (manifest.host) {
            fail(
                'Package runtime must not include executable Host Plugin entrypoints: ' + manifest.pluginId,
                'atria_package_host_plugin_forbidden',
            );
        }
        if (manifest.contributions.length > 0) {
            fail(
                'Package runtime must not include Host Plugin contributions: ' + manifest.pluginId,
                'atria_package_host_contribution_forbidden',
            );
        }
        if (!manifest.packageRuntime) {
            fail('Package plugin requires packageRuntime: ' + manifest.pluginId);
        }

        const capabilities = new Set(manifest.packageRuntime.capabilities);
        for (const capability of capabilities) {
            const permission = PACKAGE_CAPABILITY_PERMISSIONS[capability];
            if (permission && !permissions.has(permission)) {
                fail(
                    `Package plugin ${manifest.pluginId} capability ${capability} requires declared package permission ${permission}`,
                    'atria_package_plugin_permission_missing',
                );
            }
        }

        const contributions = manifest.packageRuntime.contributions.map(contribution => {
            assertContributionType(contribution);
            const requiredCapability = PACKAGE_CONTRIBUTION_CAPABILITIES[contribution.type];
            if (!requiredCapability || !capabilities.has(requiredCapability)) {
                fail(
                    `Package plugin ${manifest.pluginId} contribution ${contribution.type} requires ${requiredCapability || 'a Host Plugin boundary'}`,
                    'atria_package_plugin_capability_missing',
                );
            }
            return contribution;
        });

        return Object.freeze({
            pluginId: manifest.pluginId,
            version: manifest.version,
            capabilities: manifest.packageRuntime.capabilities,
            contributions: Object.freeze(contributions),
        });
    });

    return Object.freeze({
        manifests: Object.freeze(ordered),
        pluginIds: Object.freeze(runtimePlugins.map(item => item.pluginId)),
        runtimePlugins: Object.freeze(runtimePlugins),
    });
}

export class ContributionRegistry {
    constructor({ resourceRegistry = null } = {}) {
        this._resources = resourceRegistry;
        this._records = new Map();
        this._resourceTypes = new Map();
    }

    registerPlugin(value, { source = 'host' } = {}) {
        if (!['host', 'package'].includes(source)) throw new TypeError('Contribution source must be host or package');
        const manifest = assertAtriaPluginContract(value);
        const contributions = source === 'host'
            ? manifest.contributions
            : (manifest.packageRuntime?.contributions || []);

        if (source === 'host') {
            if (!manifest.host) fail('Host contributions require a Host Plugin manifest');
            const hostCapabilities = new Set(manifest.host.capabilities);
            for (const contribution of contributions) {
                assertContributionType(contribution);
                const required = HOST_CONTRIBUTION_CAPABILITIES[contribution.type];
                if (!required || !hostCapabilities.has(required)) {
                    fail(`Host contribution ${contribution.type} requires capability ${required || 'unsupported'}`);
                }
            }
        } else {
            compilePackageRuntimePlugins([manifest], { declaredPermissions: [
                'custom-ui',
                'runtime-tools',
                'world-write',
                'generation',
                'network',
                'clipboard',
                'asset-access',
            ] });
        }

        const inserted = [];
        try {
            for (const contribution of contributions) {
                assertContributionType(contribution);
                const key = source + '\0' + manifest.pluginId + '\0' + contribution.id;
                if (this._records.has(key)) fail('Duplicate contribution id for plugin: ' + contribution.id);
                const record = Object.freeze({
                    pluginId: manifest.pluginId,
                    pluginVersion: manifest.version,
                    source,
                    surface: contributionSurface(contribution.type),
                    id: contribution.id,
                    type: contribution.type,
                    config: structuredClone(contribution.config),
                });
                this._records.set(key, record);
                inserted.push(key);

                if (
                    source === 'host'
                    && contribution.type === 'authoring.resource'
                    && contribution.config?.descriptor
                    && this._resources
                ) {
                    const descriptor = this._resources.register({
                        ...structuredClone(contribution.config.descriptor),
                        provider: { kind: 'plugin', pluginId: manifest.pluginId },
                        authority: 'plugin-source',
                    });
                    this._resourceTypes.set(key, descriptor.resourceType);
                }
            }
        } catch (error) {
            for (const key of inserted.reverse()) {
                const resourceType = this._resourceTypes.get(key);
                if (resourceType) this._resources?.unregister(resourceType);
                this._resourceTypes.delete(key);
                this._records.delete(key);
            }
            throw error;
        }
        return this.list({ pluginId: manifest.pluginId, source });
    }

    unregisterPlugin(pluginId, { source = undefined } = {}) {
        let count = 0;
        for (const [key, record] of [...this._records]) {
            if (record.pluginId !== pluginId || (source && record.source !== source)) continue;
            const resourceType = this._resourceTypes.get(key);
            if (resourceType) this._resources?.unregister(resourceType);
            this._resourceTypes.delete(key);
            this._records.delete(key);
            count += 1;
        }
        return count;
    }

    list(query = {}) {
        return Object.freeze(
            [...this._records.values()]
                .filter(record => !query.pluginId || record.pluginId === query.pluginId)
                .filter(record => !query.source || record.source === query.source)
                .filter(record => !query.surface || record.surface === query.surface)
                .filter(record => !query.type || record.type === query.type)
                .sort((left, right) => (
                    left.pluginId.localeCompare(right.pluginId)
                    || left.id.localeCompare(right.id)
                )),
        );
    }
}

export class HostPluginBoundary {
    constructor({
        contributionRegistry,
        authoringSubmit = null,
        projectRead = null,
        buildInvoke = null,
        playInvoke = null,
    } = {}) {
        if (!(contributionRegistry instanceof ContributionRegistry)) {
            throw new TypeError('HostPluginBoundary requires ContributionRegistry');
        }
        this._contributions = contributionRegistry;
        this._authoringSubmit = authoringSubmit;
        this._projectRead = projectRead;
        this._buildInvoke = buildInvoke;
        this._playInvoke = playInvoke;
        this._active = new Map();
    }

    _assertDependencies(manifest) {
        for (const dependency of manifest.dependencies) {
            const active = this._active.get(dependency.pluginId);
            if (!active) {
                if (dependency.optional) continue;
                fail(
                    `Host Plugin ${manifest.pluginId} requires active dependency ${dependency.pluginId}`,
                    'atria_plugin_dependency_missing',
                );
            }
            if (active.manifest.version !== dependency.version) {
                fail(
                    `Host Plugin ${manifest.pluginId} requires ${dependency.pluginId}@${dependency.version}`,
                    'atria_plugin_dependency_version',
                );
            }
        }
    }

    _api(manifest) {
        const capabilities = new Set(manifest.host.capabilities);
        const permissions = new Set(manifest.permissions);
        const pluginOrigin = Object.freeze({ kind: 'plugin', id: manifest.pluginId });
        const api = {
            plugin: Object.freeze({ pluginId: manifest.pluginId, version: manifest.version }),
            contributions: Object.freeze({
                list: query => this._contributions.list({ ...query, pluginId: manifest.pluginId }),
            }),
        };

        if (permissions.has('host.project-read') && this._projectRead) {
            api.project = Object.freeze({
                read: input => this._projectRead(structuredClone(input), manifest),
            });
        }
        if (capabilities.has('host.authoring') && this._authoringSubmit) {
            api.authoring = Object.freeze({
                submit: input => {
                    const payload = structuredClone(input || {});
                    payload.origin = pluginOrigin;
                    if (Array.isArray(payload.operations)) {
                        payload.operations = payload.operations.map(operation => assertAuthoringOperation({
                            ...operation,
                            origin: pluginOrigin,
                        }));
                    }
                    return this._authoringSubmit(payload, manifest);
                },
            });
        }
        if (capabilities.has('host.build') && this._buildInvoke) {
            api.build = Object.freeze({
                invoke: input => this._buildInvoke(structuredClone(input), manifest),
            });
        }
        if (capabilities.has('host.play') && this._playInvoke) {
            api.play = Object.freeze({
                invoke: input => this._playInvoke(structuredClone(input), manifest),
            });
        }
        return Object.freeze(api);
    }

    async activate(value, module, { grantedPermissions = [] } = {}) {
        const manifest = assertAtriaPluginContract(value);
        if (!manifest.host) fail('HostPluginBoundary requires manifest.host');
        if (this._active.has(manifest.pluginId)) fail('Host Plugin is already active: ' + manifest.pluginId);
        this._assertDependencies(manifest);

        const declared = new Set(manifest.permissions);
        for (const capability of manifest.host.capabilities) {
            const permission = HOST_CAPABILITY_PERMISSIONS[capability];
            if (permission && !declared.has(permission)) {
                fail(`Host capability ${capability} requires manifest permission ${permission}`);
            }
        }
        const granted = new Set(grantedPermissions);
        const missing = manifest.permissions.filter(permission => !granted.has(permission));
        if (missing.length) {
            const error = new Error('Host Plugin requires explicit permission grant: ' + missing.join(', '));
            error.code = 'atria_plugin_permission_required';
            error.permissions = missing;
            throw error;
        }

        const activate = module?.activate || module?.default?.activate;
        if (typeof activate !== 'function') fail('Host Plugin module must export activate(api)');
        this._contributions.registerPlugin(manifest, { source: 'host' });
        let cleanup = null;
        try {
            const result = await activate(this._api(manifest));
            cleanup = typeof result === 'function'
                ? result
                : (typeof result?.dispose === 'function' ? () => result.dispose() : null);
        } catch (error) {
            this._contributions.unregisterPlugin(manifest.pluginId, { source: 'host' });
            throw error;
        }

        const active = Object.freeze({ manifest, cleanup });
        this._active.set(manifest.pluginId, active);
        return manifest;
    }

    async activateAll(entries, { grantsByPlugin = {} } = {}) {
        if (!Array.isArray(entries)) throw new TypeError('Host Plugin entries must be an array');
        const ordered = resolvePluginDependencies(entries.map(entry => entry.manifest));
        const byId = new Map(entries.map(entry => [entry.manifest.pluginId, entry]));
        const activated = [];
        try {
            for (const manifest of ordered) {
                if (!manifest.host) continue;
                const entry = byId.get(manifest.pluginId);
                await this.activate(manifest, entry.module, {
                    grantedPermissions: grantsByPlugin[manifest.pluginId] || [],
                });
                activated.push(manifest.pluginId);
            }
        } catch (error) {
            for (const pluginId of activated.reverse()) await this.deactivate(pluginId);
            throw error;
        }
        return Object.freeze(activated);
    }

    async deactivate(pluginId) {
        const active = this._active.get(pluginId);
        if (!active) return false;
        this._active.delete(pluginId);
        try {
            await active.cleanup?.();
        } finally {
            this._contributions.unregisterPlugin(pluginId, { source: 'host' });
        }
        return true;
    }

    listActive() {
        return Object.freeze([...this._active.values()].map(item => item.manifest));
    }
}
