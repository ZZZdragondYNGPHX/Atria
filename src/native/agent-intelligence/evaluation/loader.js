// Fixed loader for the original browser consumers in the isolated Node process.
// No model-selected module, filesystem root, or executable is accepted.
const libraryUrl = new URL('./libraries.js', import.meta.url).href;
export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'node-fetch' && context.parentURL !== new URL('./network-denied.js', import.meta.url).href)
        return { url: new URL('./network-denied.js', import.meta.url).href, shortCircuit: true };
    const result = await nextResolve(specifier, context);
    return result.url.endsWith('/public/lib.js') ? { url: libraryUrl, shortCircuit: true } : result;
}
