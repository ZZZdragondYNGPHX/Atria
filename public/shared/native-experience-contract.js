// Implementation Baseline v1.0 vocabulary. A reserved version is not a Host
// implementation, permission grant, runtime role, or state namespace.
export const ATRIA_EXPERIENCE_CONTRACT_VERSION = 1;
export const ATRIA_EXPERIENCE_CAPABILITIES = Object.freeze(Object.fromEntries([
    ['component-model', [1, 2], [1, 2]],
    ['local-ui-state', [1], [1]],
    ['player-preference-state', [1], [1]],
    ['package-data', [1], [1]],
    ['data-projection', [1]],
    ['composer', [1], [1]],
    ['action', [2], [2]],
    ['declarative-mutation', [1], [1]],
    ['message-projection', [1], [1]],
    ['turn-contract', [1]],
    ['turn-envelope', [1], [1]],
    ['narrative-outcome', [1]],
    ['runtime-automation', [1]],
    ['opening', [1], [1]],
    ['reply-variant', [1], [1]],
    ['conversation-presentation', [1], [1]],
    ['host-presentation-input', [1]],
    ['safe-presentation', [1]],
    ['studio-authoring', [2]],
    ['experience-health', [1]],
    ['activity', [1]],
    ['media-scene', [1]],
    ['asset-pack', [1]],
    ['auxiliary-task', [1]],
    ['addon', [1]],
    ['perspective', [1]],
    ['model-task', [1]],
    ['session-application', [1]],
    ['temporal', [1]],
    ['player-continuity', [1]],
    ['shared-realm', [1]],
    ['workflow', [1]],
].map(([id, versions, supported = []]) => [id, Object.freeze({
    versions: Object.freeze(versions),
    supported: Object.freeze(supported),
})])));

function fields(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.prototype.toString.call(value) !== '[object Object]'
        || (Object.getPrototypeOf(value) !== null && Object.getPrototypeOf(Object.getPrototypeOf(value)) !== null)) {
        throw new TypeError(label + ' must be a plain object');
    }
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) throw new TypeError(label + ' contains unsupported field ' + key);
    }
}

function list(value, label, validate, key) {
    if (!Array.isArray(value) || value.length > 256) throw new TypeError(label + ' must be an array of at most 256 items');
    const result = value.map(validate);
    if (new Set(result.map(key)).size !== result.length) throw new TypeError(label + ' contains duplicates');
    return Object.freeze(result);
}

// Independent schema boundary: Component Model v1 remains v1; future document,
// action, turn, task and authority bodies require their own strict contracts.
// No generic config/extension/persistence/exposure payload belongs in this seam.
export function assertNativeExperienceContract(value) {
    fields(value, ['schemaVersion', 'capabilities', 'dataResources'], 'ExperienceContract');
    if (value.schemaVersion !== ATRIA_EXPERIENCE_CONTRACT_VERSION) {
        throw new TypeError('ExperienceContract.schemaVersion must be 1');
    }
    const capabilities = list(value.capabilities, 'ExperienceContract.capabilities', item => {
        fields(item, ['id', 'version', 'required'], 'Experience capability');
        const definition = typeof item.id === 'string' && Object.hasOwn(ATRIA_EXPERIENCE_CAPABILITIES, item.id)
            ? ATRIA_EXPERIENCE_CAPABILITIES[item.id] : null;
        if (!definition) throw new TypeError('Unknown Experience capability ' + String(item.id));
        if (!definition.versions.includes(item.version)) throw new TypeError('Unsupported Experience capability version');
        if (typeof item.required !== 'boolean') throw new TypeError('Experience capability.required must be boolean');
        return Object.freeze({ id: item.id, version: item.version, required: item.required });
    }, item => item.id);
    const dataResources = list(value.dataResources, 'ExperienceContract.dataResources', item => {
        fields(item, ['resourceId', 'assetId', 'contentHash'], 'Package Data reference');
        if (typeof item.resourceId !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(item.resourceId)) {
            throw new TypeError('Package Data resourceId must be a stable local identifier');
        }
        if (typeof item.assetId !== 'string' || !/^asset_[a-f0-9]{32}$/.test(item.assetId)) {
            throw new TypeError('Package Data assetId must be an exact Native AssetRef identity');
        }
        if (typeof item.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(item.contentHash)) {
            throw new TypeError('Package Data contentHash must be a lowercase SHA-256 digest');
        }
        return Object.freeze({ resourceId: item.resourceId, assetId: item.assetId, contentHash: item.contentHash });
    }, item => item.resourceId);
    return Object.freeze({ schemaVersion: ATRIA_EXPERIENCE_CONTRACT_VERSION, capabilities, dataResources });
}

// The containing immutable PackageVersion supplies ownership. No URL, mutable
// latest ref, executable resource or separate data store is introduced.
export function assertExperienceDataClosure(contract, assets) {
    const normalized = assertNativeExperienceContract(contract);
    for (const ref of normalized.dataResources) {
        const asset = assets.find(item => item.assetId === ref.assetId && item.contentHash === ref.contentHash);
        if (!asset || asset.mediaType !== 'application/json') {
            throw new TypeError('Package Data reference must resolve to an exact application/json AssetRef in this PackageVersion');
        }
    }
    return normalized;
}

// Required unsupported features fail closed before activation. Optional reserved
// features are metadata only: they neither execute nor enable partial behavior.
export function assertSupportedExperienceContract(value) {
    const contract = assertNativeExperienceContract(value);
    for (const item of contract.capabilities) {
        if (item.required && !ATRIA_EXPERIENCE_CAPABILITIES[item.id].supported.includes(item.version)) {
            throw new TypeError('Host does not support required Experience capability ' + item.id + '@' + item.version);
        }
    }
    return contract;
}
