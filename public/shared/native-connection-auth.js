/** Existing adapters whose wire protocols support an explicitly anonymous endpoint. */
const OPTIONAL_SECRET_ADAPTERS = new Set(['provider.mcp', 'provider.a2a', 'provider.comfyui-image', 'provider.sd-webui-image', 'provider.forge-image']);
export function connectionRequiresSecret(providerAdapter) {
    return !OPTIONAL_SECRET_ADAPTERS.has(providerAdapter);
}
