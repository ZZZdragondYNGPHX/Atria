import { RouteResolver } from './route-resolver.js';
import { flattenPromptProgram } from './prompt-compiler.js';
import { bindValues } from './prompt-values.js';
import { getVersionedModelPromptResourceIdentity } from './resources.js';

// Read exact resources through their existing owners, including installed, frozen Programs.
export async function readPromptControls(host, handle, route) {
    const resolver = new RouteResolver({ persistence: host.persistence, library: host.library, providers: host.providers,
        getScopedResource: async (owner, ref) => {
            const entries = ref.scope === 'project'
                ? (await host.studio.getProject(owner, ref.projectId)).source.resources
                : (await host.packageInstaller.open(owner, ref.packageId, ref.packageVersionId)).manifest.resources;
            const entry = entries.find(item => {
                const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
                return identity.resourceType === ref.resourceType && identity.resourceId === ref.resourceId && identity.revision === ref.revision;
            });
            return entry && { snapshot: entry.resource, origin: ref.scope === 'project' ? { scope: 'project', projectId: ref.projectId } : entry.origin };
        },
    });
    const resolved = await resolver.resolve({ handle, routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, role: route.role });
    return flattenPromptProgram(resolved, { validateBindings: false }).parameters;
}

export function validatePromptOverrides(definitions, parameters) {
    // Overrides can be partial: required values without defaults remain a visible runtime requirement.
    return bindValues(Object.fromEntries(Object.entries(definitions).map(([name, definition]) => [name, { ...definition, required: false }])), parameters);
}
