import { assertNativeId } from './identity.js';
import { visualObject, visualText, nonSecretVisualJson, assertCapabilityManifest, visualError } from '../../public/shared/native-visual-contract.js';

function base(value, idField, kind, keys) {
    visualObject(value, ['schemaVersion', idField, 'revision', 'displayName', ...keys]);
    if (value.schemaVersion !== 2 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value.revision)) visualError('resource_invalid');
    assertNativeId(value[idField], kind); visualText(value.displayName, 256);
}
export function assertImageTarget(value) {
    base(value, 'imageTargetId', 'imageTarget', ['connectionProfileId', 'model', 'serviceVersion', 'nativeParameters', 'workflow', 'capabilities']);
    assertNativeId(value.connectionProfileId, 'connectionProfile'); visualText(value.model, 512); visualText(value.serviceVersion, 256);
    visualObject(value.nativeParameters, Object.keys(value.nativeParameters ?? {}));
    if (value.workflow !== null) {
        visualObject(value.workflow, ['id', 'graph', 'bindings', 'outputNodes', 'nodeTypes']);
        visualText(value.workflow.id, 256); nonSecretVisualJson(value.workflow.graph);
        if (!Array.isArray(value.workflow.bindings) || !Array.isArray(value.workflow.outputNodes)) visualError('workflow_invalid');
        for (const binding of value.workflow.bindings) {
            visualObject(binding, ['nodeId', 'input', 'semantic', 'type']);
            if (!['prompt', 'negativePrompt', 'seed', 'width', 'height', 'base', 'mask', 'identity', 'outfit', 'style', 'structure', 'vibe'].includes(binding.semantic) || !['string', 'number', 'image'].includes(binding.type)) visualError('workflow_invalid');
            visualText(binding.nodeId, 128); visualText(binding.input, 128);
        }
    }
    if (value.capabilities !== null) assertCapabilityManifest(value.capabilities);
    return nonSecretVisualJson(value);
}
export function assertImageRendering(value) {
    base(value, 'imageRenderingId', 'imageRendering', ['style', 'quality', 'negativePrompt', 'defaultTargetId', 'constraints']);
    if (value.defaultTargetId !== null) assertNativeId(value.defaultTargetId, 'imageTarget');
    for (const key of ['style', 'quality', 'negativePrompt']) visualText(value[key]);
    if (!Array.isArray(value.constraints) || value.constraints.length > 64) visualError('constraint_invalid');
    for (const c of value.constraints) {
        visualObject(c, ['capability', 'tier']); visualText(c.capability, 128);
        if (!['required', 'preferred', 'optional'].includes(c.tier)) visualError('constraint_invalid');
    }
    return nonSecretVisualJson(value);
}
