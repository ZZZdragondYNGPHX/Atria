import {
    assertExactResourceRef,
    assertGenerationProfile,
    assertPromptModule,
    assertPromptProgram,
} from './contracts.js';

export const VERSIONED_MODEL_PROMPT_RESOURCE_TYPES = Object.freeze([
    'core.prompt-module',
    'core.prompt-program',
    'core.generation-profile',
]);

const DEFINITIONS = Object.freeze({
    'core.prompt-module': Object.freeze({
        idKind: 'promptModule',
        idField: 'promptModuleId',
        validator: assertPromptModule,
    }),
    'core.prompt-program': Object.freeze({
        idKind: 'promptProgram',
        idField: 'promptProgramId',
        validator: assertPromptProgram,
    }),
    'core.generation-profile': Object.freeze({
        idKind: 'generationProfile',
        idField: 'generationProfileId',
        validator: assertGenerationProfile,
    }),
});

export function getVersionedModelPromptResourceDefinition(resourceType) {
    const definition = DEFINITIONS[resourceType];
    if (!definition) throw new TypeError('Unsupported versioned model/prompt resourceType: ' + String(resourceType));
    return definition;
}

export function assertVersionedModelPromptResource(resourceType, value) {
    return getVersionedModelPromptResourceDefinition(resourceType).validator(value);
}

export function getVersionedModelPromptResourceIdentity(resourceType, value) {
    const definition = getVersionedModelPromptResourceDefinition(resourceType);
    const resource = definition.validator(value);
    return Object.freeze({
        resourceType,
        resourceId: resource[definition.idField],
        revision: resource.revision,
        displayName: resource.displayName,
    });
}

export function collectVersionedModelPromptResourceRefs(resourceType, value) {
    const resource = assertVersionedModelPromptResource(resourceType, value);
    if (resourceType !== 'core.prompt-program') return Object.freeze([]);
    const refs = [];
    if (resource.parentRef) refs.push(resource.parentRef);
    for (const stage of resource.stages) refs.push(...stage.moduleRefs);
    for (const operation of resource.derive) {
        if (operation.replacementRef) refs.push(operation.replacementRef);
    }
    return Object.freeze(refs.map(ref => Object.freeze({ ...ref })));
}

export function mapVersionedModelPromptResourceRefs(resourceType, value, mapper) {
    if (typeof mapper !== 'function') throw new TypeError('Versioned resource ref mapper must be a function');
    const resource = structuredClone(assertVersionedModelPromptResource(resourceType, value));
    if (resourceType !== 'core.prompt-program') return assertVersionedModelPromptResource(resourceType, resource);

    const mapRef = (ref, expectedType, field) => {
        const mapped = mapper(Object.freeze({ ...ref }), expectedType, field);
        return assertExactResourceRef(mapped, expectedType, field);
    };

    if (resource.parentRef) {
        resource.parentRef = mapRef(resource.parentRef, 'core.prompt-program', 'PromptProgram.parentRef');
    }
    resource.stages = resource.stages.map((stage, stageIndex) => ({
        ...stage,
        moduleRefs: stage.moduleRefs.map((ref, refIndex) => mapRef(
            ref,
            'core.prompt-module',
            `PromptProgram.stages[${stageIndex}].moduleRefs[${refIndex}]`,
        )),
    }));
    resource.derive = resource.derive.map((operation, index) => (
        operation.replacementRef
            ? {
                ...operation,
                replacementRef: mapRef(
                    operation.replacementRef,
                    'core.prompt-module',
                    `PromptProgram.derive[${index}].replacementRef`,
                ),
            }
            : operation
    ));
    return assertVersionedModelPromptResource(resourceType, resource);
}
