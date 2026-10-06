import { assertContextRuntime } from './native-context-contract.js';
import { assertStoryStart, assertRunPolicy, assertGenerationBudget } from './native-run-contract.js';
import { assertSimulationRuntime } from './native-simulation-contract.js';
import { assertAuthorityRuntime } from './native-authority-contract.js';
import { assertSharedRuntime } from './native-shared-contract.js';
import { assertPresentationRuntime, assertPresentationClosure } from './native-presentation-contract.js';
import { assertTaskRuntime } from './native-task-contract.js';
import { assertLifecycleRuntime } from './native-lifecycle-contract.js';
import { assertInformationRuntime } from './native-information-contract.js';
import { assertContentRuntime } from './native-content-contract.js';
import { assertContinuityRuntime } from './native-continuity-contract.js';

// Implementation Baseline v1.0 vocabulary. A reserved version is not a Host
// implementation, permission grant, runtime role, or state namespace.
export const ATRIA_EXPERIENCE_CONTRACT_VERSION = 1;
export const ATRIA_EXPERIENCE_CAPABILITIES = Object.freeze(Object.fromEntries([
    ['local-ui-state', [1], [1]],
    ['player-preference-state', [1], [1]],
    ['package-data', [1], [1]],
    ['data-projection', [1], [1]],
    ['composer', [1], [1]],
    ['action', [2], [2]],
    ['authority-transaction', [1], [1]],
    ['context-derivation', [1], [1]],
    ['world-simulation', [1], [1]],
    ['story-start', [1], [1]],
    ['generation-budget', [1], [1]],
    ['run-policy', [1], [1]],
    ['declarative-mutation', [1], [1]],
    ['message-projection', [1], [1]],
    ['turn-contract', [1], [1]],
    ['turn-envelope', [1], [1]],
    ['narrative-outcome', [1], [1]],
    ['runtime-automation', [1], [1]],
    ['reply-variant', [1], [1]],
    ['conversation-presentation', [1], [1]],
    ['host-presentation-input', [1], [1]],
    ['safe-presentation', [1], [1]],
    ['studio-authoring', [2], [2]],
    ['experience-health', [1], [1]],
    ['activity', [1], [1]],
    ['media-scene', [1], [1]],
    ['asset-pack', [1], [1]],
    ['auxiliary-task', [1], [1]],
    ['addon', [1], [1]],
    ['perspective', [1], [1]],
    ['model-task', [1], [1]],
    ['session-application', [1], [1]],
    ['temporal', [1], [1]],
    ['player-continuity', [1], [1]],
    ['shared-realm', [1], [1]],
    ['workflow', [1], [1]],
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

// Independent authority contracts retain their own strict versions. Frontend
// presentation is native@3 Core, not a legacy Component Model capability.
// No generic config/extension/persistence/exposure payload belongs in this seam.
export function assertNativeExperienceContract(value) {
    fields(value, ['schemaVersion', 'capabilities', 'dataResources', 'taskRuntime', 'lifecycleRuntime', 'presentationRuntime', 'informationRuntime', 'contentRuntime', 'continuityRuntime', 'sharedRuntime', 'authorityRuntime', 'simulationRuntime', 'storyStart', 'generationBudget', 'runPolicy', 'contextRuntime'], 'ExperienceContract');
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
    const taskRuntime = value.taskRuntime === undefined ? undefined : assertTaskRuntime(value.taskRuntime);
    const lifecycleRuntime = value.lifecycleRuntime === undefined ? undefined : assertLifecycleRuntime(value.lifecycleRuntime, taskRuntime);
    if (!lifecycleRuntime && taskRuntime?.tasks.some(task => task.resultPolicy.sink === 'app_command')) throw new TypeError('Declared App Command requires Lifecycle runtime');
    for (const task of taskRuntime?.tasks ?? []) for (const use of task.resultPolicy.uses ?? []) {
        if (use.viewIds.some(id => !value.informationRuntime?.views.some(view => view.id === id))
            || use.scopeIds.some(id => !lifecycleRuntime?.scopes.some(scope => scope.id === id))) throw new TypeError('Unknown Task artifact dependency');
    }
    const contextCapability = capabilities.find(item => item.id === 'context-derivation');
    if (Boolean(contextCapability) !== (value.contextRuntime !== undefined) || (contextCapability && !contextCapability.required)) throw new TypeError('Context derivation requires its declared capability');
    const contextRuntime = value.contextRuntime === undefined ? undefined : assertContextRuntime(value.contextRuntime, value.informationRuntime, taskRuntime);
    const authorityCapability = capabilities.some(item => item.id === 'authority-transaction');
    if (authorityCapability !== (value.authorityRuntime !== undefined)) throw new TypeError('authority-transaction capability and authorityRuntime must be declared together');
    const authorityRuntime = value.authorityRuntime === undefined ? undefined : assertAuthorityRuntime(value.authorityRuntime,
        lifecycleRuntime, value.informationRuntime === undefined ? undefined : assertInformationRuntime(value.informationRuntime, lifecycleRuntime, taskRuntime));
    const simulationCapability = capabilities.find(item => item.id === 'world-simulation');
    if (Boolean(simulationCapability) !== (value.simulationRuntime !== undefined)
        || (simulationCapability && (!simulationCapability.required || !capabilities.some(item => item.id === 'authority-transaction' && item.required)))) throw new TypeError('World simulation requires both required capabilities and simulationRuntime');
    const simulationRuntime = value.simulationRuntime === undefined ? undefined : assertSimulationRuntime(value.simulationRuntime, lifecycleRuntime, taskRuntime, authorityRuntime);
    for (const [capability, field] of [['story-start', 'storyStart'], ['generation-budget', 'generationBudget'], ['run-policy', 'runPolicy']]) {
        const declared = capabilities.find(item => item.id === capability);
        if (Boolean(declared) !== (value[field] !== undefined) || (declared && (!declared.required || !authorityRuntime))) throw new TypeError(capability + ' requires its runtime declaration and required authority capability');
    }
    if ((value.storyStart || value.generationBudget || value.runPolicy) && !capabilities.some(item => item.id === 'authority-transaction' && item.required)) throw new TypeError('Run capabilities require authority-transaction');
    if (value.runPolicy && (value.continuityRuntime || value.sharedRuntime)) throw new TypeError('Run policy v1 does not support cross-run transfers');
    const storyStart = value.storyStart === undefined ? undefined : assertStoryStart(value.storyStart, authorityRuntime);
    const runPolicy = value.runPolicy === undefined ? undefined : assertRunPolicy(value.runPolicy, storyStart);
    const generationBudget = value.generationBudget === undefined ? undefined : assertGenerationBudget(value.generationBudget, lifecycleRuntime);
    return Object.freeze({ schemaVersion: ATRIA_EXPERIENCE_CONTRACT_VERSION, capabilities, dataResources,
        ...(storyStart === undefined ? {} : { storyStart }),
        ...(runPolicy === undefined ? {} : { runPolicy }),
        ...(generationBudget === undefined ? {} : { generationBudget }),
        ...(simulationRuntime === undefined ? {} : { simulationRuntime }),
        ...(authorityRuntime === undefined ? {} : { authorityRuntime }),
        ...(taskRuntime === undefined ? {} : { taskRuntime }),
        ...(contextRuntime === undefined ? {} : { contextRuntime }),
        ...(lifecycleRuntime === undefined ? {} : { lifecycleRuntime }),
        ...(value.sharedRuntime === undefined ? {} : { sharedRuntime: assertSharedRuntime(value.sharedRuntime, lifecycleRuntime, value.informationRuntime === undefined ? undefined : assertInformationRuntime(value.informationRuntime, lifecycleRuntime, taskRuntime), value.continuityRuntime) }),
        ...(value.contentRuntime === undefined ? {} : { contentRuntime: assertContentRuntime(value.contentRuntime) }),
        ...(value.continuityRuntime === undefined ? {} : { continuityRuntime: assertContinuityRuntime(value.continuityRuntime, lifecycleRuntime) }),
        ...(value.informationRuntime === undefined ? {} : { informationRuntime: assertInformationRuntime(value.informationRuntime, lifecycleRuntime, taskRuntime) }),
        ...(value.presentationRuntime === undefined ? {} : { presentationRuntime: assertPresentationRuntime(value.presentationRuntime, lifecycleRuntime, taskRuntime) }) });
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
    assertPresentationClosure(normalized.presentationRuntime, assets);
    const composition = normalized.contentRuntime?.composition;
    if (composition) {
        const references = [...composition.resources.map(ref => ({ ...ref, mediaType: 'application/json' })),
            { assetId: 'asset_' + composition.base.packageContentHash.slice(0, 32), contentHash: composition.base.packageContentHash, mediaType: 'application/vnd.atria.package' }];
        for (const ref of references) {
            if (!assets.some(asset => asset.assetId === ref.assetId && asset.contentHash === ref.contentHash && asset.mediaType === ref.mediaType)) throw new TypeError('Content composition requires exact embedded Base and Community assets');
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
