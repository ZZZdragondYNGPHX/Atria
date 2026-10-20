// Read-only projection of the existing authorities; never persists setup state.
import { connectionRequiresSecret } from '../../shared/native-connection-auth.js';
export function runtimeReadiness(configuration, secrets, resources) {
    const secretIds = new Set(secrets.map(item => item.secretId));
    const connections = configuration.connections.filter(item => item.secretRef
        ? secretIds.has(item.secretRef.secretId) : !connectionRequiresSecret(item.providerAdapter));
    const models = configuration.models.filter(item => connections.some(connection => connection.connectionProfileId === item.connectionProfileRef?.connectionProfileId));
    const matches = (a, b) => ['scope', 'resourceType', 'resourceId', 'revision', 'projectId', 'packageId', 'packageVersionId'].every(key => a?.[key] === b?.[key]);
    const exists = ref => resources.some(item => matches(item.ref, ref));
    const routes = configuration.routes.filter(route => models.some(model => model.modelProfileId === route.modelProfileRef?.modelProfileId
        && (!route.connectionProfileRef || connections.some(connection => connection.connectionProfileId === route.connectionProfileRef.connectionProfileId)))
        && exists(route.promptProgramRef) && exists(route.generationProfileRef));
    return [
        { label: 'Connection', ready: configuration.connections.length > 0, owner: 'runtime', section: 'connections' },
        ...(configuration.connections.some(item => item.secretRef || connectionRequiresSecret(item.providerAdapter))
            ? [{ label: 'Secret', ready: connections.length > 0, owner: 'runtime', section: 'connections' }] : []),
        { label: 'API presets', ready: routes.length > 0, owner: 'runtime', section: 'routes' },
    ];
}
