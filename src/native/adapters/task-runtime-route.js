export function taskRuntimeRoute(route, role, taskPlan, packageIdentity) {
    return { ...route, role, promptParameters: {},
        promptProgramRef: { ...taskPlan.variant.prompt, resourceType: 'core.prompt-program', scope: 'package', packageId: packageIdentity.packageId, packageVersionId: packageIdentity.packageVersionId },
        generationProfileRef: { ...taskPlan.variant.generation, resourceType: 'core.generation-profile', scope: 'package', packageId: packageIdentity.packageId, packageVersionId: packageIdentity.packageVersionId } };
}
