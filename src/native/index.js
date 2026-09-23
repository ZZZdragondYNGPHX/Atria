export {
    NATIVE_ID_FAMILIES,
    assertNativeId,
    createNativeId,
    isNativeId,
    parseNativeId,
} from './identity.js';

export {
    ATRIA_PACKAGE_CAPABILITIES,
    ATRIA_PACKAGE_FORMAT,
    ATRIA_PACKAGE_PERMISSIONS,
    ATRIA_PACKAGE_SCHEMA_VERSION,
    ATRIA_SAVE_FORMAT,
    ATRIA_SAVE_SCHEMA_VERSION,
    ATRIA_SAVE_SCOPES,
    FORBIDDEN_NATIVE_IDENTITY_FIELDS,
    NATIVE_RESOURCE_KINDS,
    NATIVE_SCHEMA_VERSION,
    NATIVE_STORE_FAMILIES,
    NATIVE_STORE_SCHEMA_VERSION,
    SAVE_POINT_KINDS,
    assertActor,
    assertAssetRef,
    assertAtriaPackageManifest,
    assertAtriaSave,
    assertBranch,
    assertEntryPoint,
    assertNativeResourceKey,
    assertPackageRecord,
    assertPackageVersion,
    assertProject,
    assertSavePoint,
    assertSession,
    assertSessionRevision,
    assertTimelineEntry,
    assertVariant,
    getNativeResourceKeyFields,
    validateAtriaPackageManifest,
    validateAtriaSave,
} from './contracts.js';

export {
    KNOWLEDGE_BINDING_MODES,
    KNOWLEDGE_SOURCE_KINDS,
    KNOWLEDGE_VISIBILITY_TARGETS,
    WORLD_KNOWLEDGE_FORBIDDEN_IDENTITY_FIELDS,
    assertKnowledgeBase,
    assertKnowledgeBinding,
    assertKnowledgeEntry,
    assertKnowledgeRevision,
    assertPackagedKnowledgeSnapshot,
    assertPackagedWorldSnapshot,
    assertWorld,
    assertWorldRevision,
} from './world-knowledge.js';

export {
    AssetStore,
    KnowledgeRepo,
    PackageRepo,
    SavePointRepo,
    SessionRepo,
    WorldRepo,
} from './repositories/index.js';

export {
    ATRIA_PROJECT_FORMAT,
    ATRIA_PROJECT_MANIFEST,
    ATRIA_PROJECT_SCHEMA_VERSION,
    assertAtriaProjectSource,
    validateAtriaProjectSource,
} from './project-source.js';

export { ProjectStore } from './project-store.js';

export {
    STUDIO_SOURCE_OPERATION_TYPES,
    StudioService,
} from './authoring/studio-service.js';

export {
    PROJECT_AGENT_MAX_REPAIR_ROUNDS,
    ProjectAgentService,
    buildProjectAgentTools,
} from './project-agent.js';

export {
    CORE_RESOURCE_DESCRIPTORS,
    ResourceRegistry,
    createCoreResourceRegistry,
} from './authoring/resource-registry.js';

export {
    LIBRARY_RESOURCE_TYPES,
    NativeLibraryService,
} from './authoring/library-service.js';

export { ResourceGraph } from './authoring/resource-graph.js';

export {
    compileNativeRuntimeDescriptor,
    resolveNativeRuntimePackage,
} from './runtime-descriptor.js';

export {
    LibraryAuthoringPlanner,
    STUDIO_RESOURCE_OPERATION_TYPES,
} from './authoring/library-authoring.js';

export {
    NativeDependencyError,
    resolveProjectDependencyClosure,
} from './dependency-closure.js';

export {
    ATRIA_PACKAGE_CONTAINER_FORMAT,
    ATRIA_PACKAGE_CONTAINER_LIMITS,
    ATRIA_PACKAGE_CONTAINER_MAGIC,
    ATRIA_PACKAGE_CONTAINER_VERSION,
    buildAtriaPackageContainer,
    hashAtriaPackageContainer,
    inspectAtriaPackageContainer,
    preflightAtriaPackageContainer,
} from './package-container.js';

export {
    PackageInstaller,
    buildProjectPackage,
} from './package-composition.js';

export {
    StudioPreviewHost,
    StudioProjectRouter,
} from './studio-preview.js';

export { SessionCore } from './session-core.js';
export { resolveSessionKnowledge, validateKnowledgeBindingSet } from './session-knowledge.js';

export {
    ATRIA_SAVE_CONTAINER_FORMAT,
    ATRIA_SAVE_CONTAINER_LIMITS,
    ATRIA_SAVE_CONTAINER_MAGIC,
    ATRIA_SAVE_CONTAINER_VERSION,
    buildAtriaSaveContainer,
    hashAtriaSaveContainer,
    inspectAtriaSaveContainer,
    preflightAtriaSaveContainer,
} from './save-container.js';

export { NativeSaveSystem } from './save-system.js';

export { NativeProductService } from './product-service.js';

export {
    ATRIA_AUTHORING_ORIGINS,
    ATRIA_AUTHORING_SCHEMA_VERSION,
    ATRIA_CHANGESET_VALIDATION_STATES,
    ATRIA_COMPONENT_MODEL_VERSION,
    ATRIA_EXPERIENCE_MODES,
    ATRIA_NATIVE_SKILL_SCOPES,
    ATRIA_HOST_PLUGIN_CAPABILITIES,
    ATRIA_PACKAGE_RUNTIME_CAPABILITIES,
    ATRIA_PACKAGE_RUNTIME_FORMAT,
    ATRIA_PACKAGE_RUNTIME_VERSION,
    ATRIA_PLUGIN_API_VERSION,
    ATRIA_PLUGIN_CONTRIBUTION_TYPES,
    ATRIA_PLUGIN_PERMISSIONS,
    ATRIA_PLUGIN_FORMAT,
    ATRIA_PLUGIN_SCHEMA_VERSION,
    ATRIA_PROJECT_CONFLICT_CODE,
    ATRIA_RESOURCE_AUTHORITIES,
    ATRIA_RESOURCE_CAPABILITIES,
    ATRIA_RESOURCE_GRAPH_MODE,
    ATRIA_RUNTIME_DESCRIPTOR_FORMAT,
    ATRIA_RUNTIME_DESCRIPTOR_SCHEMA_VERSION,
    assertAtriaPluginContract,
    assertAuthoringChangeSet,
    assertAuthoringOperation,
    assertAuthoringWorkspace,
    assertExperienceContract,
    assertNativeRuntimeDescriptor,
    assertNativeSkillScope,
    assertPackageRuntimeV1,
    assertProjectRevision,
    assertProjectRevisionConflict,
    assertResourceDescriptor,
    assertResourceRegistryContract,
} from './authoring-contracts.js';


export {
    ContributionRegistry,
    HostPluginBoundary,
    compilePackageRuntimePlugins,
    resolvePluginDependencies,
} from './plugin-platform.js';

export {
    ATRIA_HOST_PLUGIN_MANIFEST,
    loadAtriaHostPluginDirectory,
} from './host-plugin-loader.js';

export {
    resolveNativeSkillEntries,
    toNativeSkillScope,
} from './skill-platform.js';

export {
    ATRIA_CAPABILITY_PROVENANCE_KINDS,
    ATRIA_CAPABILITY_STATES,
    ATRIA_CONTEXT_SOURCE_KINDS,
    ATRIA_MODEL_PROMPT_SCHEMA_VERSION,
    ATRIA_PACKAGE_MODEL_PROMPT_FIELD,
    ATRIA_RESOURCE_REF_SCOPES,
    ATRIA_RUNTIME_ROUTE_SCOPES,
    assertCapabilityDecision,
    assertConnectionProfile,
    assertEffectiveRequestSnapshot,
    assertExactResourceRef,
    assertGenerationProfile,
    assertModelProfile,
    assertPackageModelPromptRuntimeMetadata,
    assertPromptIR,
    assertPromptModule,
    assertPromptProgram,
    assertRequestContextPlan,
    assertRuntimeRoute,
    serializeEffectiveRequestSnapshot,
} from './model-prompt-runtime/contracts.js';

export {
    CONTEXT_PROVIDER_METHODS,
    GENERATION_SERVICE_METHODS,
    PROVIDER_PORT_METHODS,
    ROUTE_RESOLVER_METHODS,
    SECRET_PORT_METHODS,
    assertContextProviderPort,
    assertGenerationServicePort,
    assertProviderPort,
    assertRouteResolverPort,
    assertSecretPort,
} from './model-prompt-runtime/ports.js';

export {
    VERSIONED_MODEL_PROMPT_RESOURCE_TYPES,
    assertVersionedModelPromptResource,
    collectVersionedModelPromptResourceRefs,
    getVersionedModelPromptResourceDefinition,
    getVersionedModelPromptResourceIdentity,
    mapVersionedModelPromptResourceRefs,
} from './model-prompt-runtime/resources.js';

export {
    NativeModelPromptPersistence,
    VersionedJsonResourceHandler,
} from './model-prompt-runtime/persistence.js';

export { RouteResolver } from './model-prompt-runtime/route-resolver.js';
export { GenerationService } from './model-prompt-runtime/generation-service.js';
export { GenerationError, ProviderFailure } from './model-prompt-runtime/execution-utils.js';
export { PromptCompiler, flattenPromptProgram, PROMPT_TARGETS } from './model-prompt-runtime/prompt-compiler.js';
export { createTaskContextProvider, createStudioContextProvider, createNativeSessionContextProvider } from './model-prompt-runtime/context-providers.js';
export { renderPromptMessages, renderPromptProtocol } from './model-prompt-runtime/prompt-renderers.js';
