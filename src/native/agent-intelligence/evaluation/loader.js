// Fixed loader for the original browser consumers in the isolated Node process.
// No model-selected module, filesystem root, or executable is accepted.
const libraryUrl = new URL('./libraries.js', import.meta.url).href;
export async function resolve(specifier, context, nextResolve) {
    const result = await nextResolve(specifier, context);
    return result.url.endsWith('/public/lib.js') ? { url: libraryUrl, shortCircuit: true } : result;
}
