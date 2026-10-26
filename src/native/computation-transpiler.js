import { transform, transformSync } from 'esbuild';
import { createHash } from 'node:crypto';

// This worker dependency deliberately excludes the TypeScript AST checker.
// Sources are admitted by collectControllerSources in the host, and generated
// artifacts pass validateScriptArtifact there before any guest execution.
const options = id => ({ loader: id.endsWith('.ts') ? 'ts' : 'js', sourcefile: id,
    target: 'es2020', format: 'cjs', platform: 'neutral', sourcemap: 'external', sourcesContent: false,
    treeShaking: false, keepNames: true,
    tsconfigRaw: { compilerOptions: { alwaysStrict: true, useDefineForClassFields: false } },
});
function moduleArtifact({ id, source, imports }, output) {
    const map = JSON.parse(output.map); map.sources = [id];
    return { id, code: output.code, imports, map, sourceHash: createHash('sha256').update(source).digest('hex') };
}
const artifact = (entry, modules) => ({ format: 'atria-script', version: 1, entry,
    modules: modules.sort((a, b) => a.id.localeCompare(b.id)),
});
export function transpileComputation(entry, modules) {
    return artifact(entry, modules.map(module => moduleArtifact(module, transformSync(module.source, options(module.id)))));
}
export async function transpileComputationAsync(entry, modules) {
    return artifact(entry, await Promise.all(modules.map(async module => moduleArtifact(module, await transform(module.source, options(module.id))))));
}
