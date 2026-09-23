import {
    ATRIA_AUTHORING_SCHEMA_VERSION,
    ATRIA_RESOURCE_GRAPH_MODE,
    assertResourceDescriptor,
    assertResourceRegistryContract,
} from '../authoring-contracts.js';

export const CORE_RESOURCE_DESCRIPTORS = Object.freeze([
    {
        resourceType: 'core.project',
        displayName: 'Project',
        provider: { kind: 'core' },
        authority: 'project-source',
        capabilities: ['create', 'read', 'update', 'delete', 'validate', 'preview'],
        schema: { type: 'object' },
        metadata: { category: 'work', ownership: ['project'] },
    },
    {
        resourceType: 'core.actor',
        displayName: 'Actor',
        provider: { kind: 'core' },
        authority: 'project-source',
        capabilities: ['create', 'read', 'update', 'delete', 'validate'],
        schema: { type: 'object' },
        metadata: { category: 'actor', ownership: ['project'] },
    },
    {
        resourceType: 'core.world',
        displayName: 'World',
        provider: { kind: 'core' },
        authority: 'native-library',
        capabilities: ['create', 'read', 'update', 'delete', 'attach', 'fork', 'publish', 'validate'],
        schema: { type: 'object' },
        metadata: { category: 'world', ownership: ['project', 'library'], immutableRevision: true },
    },
    {
        resourceType: 'core.knowledge',
        displayName: 'Knowledge',
        provider: { kind: 'core' },
        authority: 'native-library',
        capabilities: ['create', 'read', 'update', 'delete', 'attach', 'fork', 'publish', 'validate'],
        schema: { type: 'object' },
        metadata: { category: 'knowledge', ownership: ['project', 'library'], immutableRevision: true },
    },
    {
        resourceType: 'core.knowledge-entry',
        displayName: 'Knowledge Entry',
        provider: { kind: 'core' },
        authority: 'project-source',
        capabilities: ['create', 'read', 'update', 'delete', 'validate'],
        schema: { type: 'object' },
        metadata: { category: 'knowledge-entry', ownership: ['project', 'library'] },
    },
    {
        resourceType: 'core.knowledge-binding',
        displayName: 'Knowledge Binding',
        provider: { kind: 'core' },
        authority: 'native-library',
        capabilities: ['create', 'read', 'update', 'delete', 'validate'],
        schema: { type: 'object' },
        metadata: { category: 'knowledge-binding', ownership: ['project', 'library'] },
    },
    {
        resourceType: 'core.asset',
        displayName: 'Asset',
        provider: { kind: 'core' },
        authority: 'native-library',
        capabilities: ['create', 'read', 'delete', 'attach', 'fork', 'publish', 'preview'],
        schema: { type: 'object' },
        metadata: { category: 'media', ownership: ['project', 'library'], immutableRevision: 'contentHash' },
    },
    {
        resourceType: 'core.package',
        displayName: 'Work',
        provider: { kind: 'core' },
        authority: 'native-library',
        capabilities: ['read', 'delete', 'validate', 'preview'],
        schema: { type: 'object' },
        metadata: { category: 'work', ownership: ['library'], immutableRevision: true },
    },
].map(assertResourceDescriptor));

function matches(descriptor, query = {}) {
    if (query.authority && descriptor.authority !== query.authority) return false;
    if (query.providerKind && descriptor.provider.kind !== query.providerKind) return false;
    if (query.capability && !descriptor.capabilities.includes(query.capability)) return false;
    if (query.resourceType && descriptor.resourceType !== query.resourceType) return false;
    return true;
}

export class ResourceRegistry {
    constructor({ descriptors = CORE_RESOURCE_DESCRIPTORS } = {}) {
        if (!Array.isArray(descriptors)) throw new TypeError('ResourceRegistry descriptors must be an array');
        this._descriptors = new Map();
        for (const descriptor of descriptors) this.register(descriptor);
    }

    register(value, { replace = false } = {}) {
        const descriptor = assertResourceDescriptor(value);
        if (this._descriptors.has(descriptor.resourceType) && !replace) {
            throw new TypeError('ResourceRegistry resourceType is already registered: ' + descriptor.resourceType);
        }
        this._descriptors.set(descriptor.resourceType, descriptor);
        return descriptor;
    }

    unregister(resourceType) {
        return this._descriptors.delete(resourceType);
    }

    has(resourceType) {
        return this._descriptors.has(resourceType);
    }

    get(resourceType) {
        return this._descriptors.get(resourceType) || null;
    }

    list(query = {}) {
        return Object.freeze(
            [...this._descriptors.values()]
                .filter(descriptor => matches(descriptor, query))
                .sort((left, right) => left.resourceType.localeCompare(right.resourceType)),
        );
    }

    contract() {
        return assertResourceRegistryContract({
            schemaVersion: ATRIA_AUTHORING_SCHEMA_VERSION,
            graphMode: ATRIA_RESOURCE_GRAPH_MODE,
            descriptors: this.list(),
        });
    }
}

export function createCoreResourceRegistry() {
    return new ResourceRegistry();
}
