import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const read = path => readFileSync(resolve(ROOT, path), 'utf8');

function requirePattern(path, pattern, message) {
    if (!pattern.test(read(path))) throw new Error(message + ' (' + path + ')');
}

function rejectPattern(path, pattern, message) {
    if (pattern.test(read(path))) throw new Error(message + ' (' + path + ')');
}

requirePattern(
    'src/native/plugin-platform.js',
    /class HostPluginBoundary[\s\S]*const pluginOrigin = Object\.freeze\(\{ kind: ['"]plugin['"][\s\S]*origin: pluginOrigin/,
    'A5 Host Plugin authoring must force Plugin origin through the shared Authoring Operation boundary',
);
rejectPattern(
    'src/native/plugin-platform.js',
    /\b(?:SessionRepo|PackageRepo|WorldRepo|BranchRepo|TimelineRepo|getChatState|setChatState|createFloorState)\b/,
    'A5 Host Plugin boundary must not expose a second Native persistence authority',
);
requirePattern(
    'src/native/plugin-platform.js',
    /compilePackageRuntimePlugins[\s\S]*must not include executable Host Plugin/,
    'A5 package runtime must reject Host Plugin execution',
);
requirePattern(
    'src/native/authoring-contracts.js',
    /execution !== ['"]declarative['"][\s\S]*rejectExecutablePackagePayload/,
    'A5 package-runtime v1 must remain declarative and reject executable payloads',
);
requirePattern(
    'src/native/package-composition.js',
    /compilePackageRuntimePlugins/,
    'A5 Build must validate package plugin closure',
);
requirePattern(
    'src/native/runtime-descriptor.js',
    /compilePackageRuntimePlugins[\s\S]*plugins: \(runtime\.plugins \|\| \[\]\)\.map/,
    'A5 Play Runtime Descriptor must project exact package plugins',
);
requirePattern(
    'public/scripts/native/experience/ui/live.js',
    /createPackageRuntimeContributionRegistry[\s\S]*selectorDefinitions/,
    'A5 Experience Runtime must consume host-validated package Play contributions',
);
rejectPattern(
    'public/scripts/native/experience/ui/plugin-contributions.js',
    /\b(?:eval|Function|Worker|import\s*\()\b/,
    'A5 package Play contribution consumer must not execute arbitrary code',
);
requirePattern(
    'src/native/skill-platform.js',
    /global[\s\S]*project[\s\S]*package/,
    'A5 Native Skill resolver must support global/project/package scope',
);
rejectPattern(
    'src/native/skill-platform.js',
    /scope:\s*['"]character['"]|kind\s*===\s*['"]character['"]/,
    'A5 Native Skill identity must not restore Character scope',
);

console.log('A5 Plugin & Skill Platform residual guard passed.');
