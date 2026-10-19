// Original Project prompt binding composition shared by the Host and its
// fixed orchestration producer. Resolution, resources and Secret stay native.
export function projectRuntimeRoute(original, projectId) {
    const binding = original?.projectPromptBindings?.find(item => item.projectId === projectId);
    return binding ? { ...original, promptProgramRef: binding.promptProgramRef } : original;
}
