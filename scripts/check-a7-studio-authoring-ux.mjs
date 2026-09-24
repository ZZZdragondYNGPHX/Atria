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
    'public/scripts/native/studio-client.js',
    /\/api\/native\/studio\//,
    'A7 Studio client must consume the A1 Native Studio boundary',
);
rejectPattern(
    'public/scripts/native/studio-workspace.js',
    /nativeProductClient|(?:from|import\s*\()[^\n]*(?:project-store|world-repo|knowledge-repo|asset-store)|\b(?:localStorage|sessionStorage|indexedDB|setChatState|createFloorState)\b/,
    'A7 Studio UI must not bypass Native authoring/resource authorities',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /nativeStudioClient\.inspectWorkspace[\s\S]*nativeStudioClient\.executeWorkspace/,
    'A7 human authoring must inspect/review then execute through Workspace/ChangeSet',
);
requirePattern(
    'public/scripts/native/studio-authoring.js',
    /operationType:\s*['"]project\.save['"][\s\S]*operationType:\s*['"]source\.write['"]/,
    'A7 structured/source edits must project to A1 Authoring Operations',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /baseRevision:\s*state\.revision\.revision/,
    'A7 authoring actions must pin the current project revision',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /Revision conflict[\s\S]*never silently rebases|never silently rebases[\s\S]*Revision conflict/,
    'A7 must expose the project revision conflict/review boundary',
);

requirePattern(
    'public/scripts/native/studio-workspace.js',
    /atriaStudioResourceTree[\s\S]*atriaStudioEditor[\s\S]*atriaStudioInspector[\s\S]*atriaStudioActivity/,
    'A7 desktop Studio must expose Resource Tree, Editor, Inspector and Activity regions',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /\['project',\s*'Project'\][\s\S]*\['editor',\s*'Editor'\][\s\S]*\['preview',\s*'Preview'\][\s\S]*\['ai',\s*'AI'\][\s\S]*\['more',\s*'More'\]/,
    'A7 compact Studio must expose Project / Editor / Preview / AI / More views',
);
requirePattern(
    'public/css/atria-build.css',
    /data-atria-studio-mobile-view="project"[\s\S]*data-atria-studio-mobile-view="editor"[\s\S]*data-atria-studio-mobile-view="preview"[\s\S]*data-atria-studio-mobile-view="ai"[\s\S]*data-atria-studio-mobile-view="more"/,
    'A7 mobile Studio views must be independent layouts rather than desktop compression',
);

requirePattern(
    'public/scripts/native/studio-ui-editor.js',
    /\['design',\s*'structure',\s*'bindings',\s*'source'\]/,
    'A7 Structured UI must provide Design / Structure / Bindings / Source',
);
requirePattern(
    'public/scripts/native/studio-ui-editor.js',
    /compileExperienceComponentModel[\s\S]*renderExperienceComponentModel/,
    'A7 visual UI editor must consume the shared A4 Component Model',
);
rejectPattern(
    'public/scripts/native/studio-ui-editor.js',
    /innerHTML|DOMParser|eval\s*\(|new Function|javascript:/,
    'A7 must not implement arbitrary HTML/JS visual-designer round-tripping',
);

requirePattern(
    'public/scripts/native/studio-workspace.js',
    /attachResource[\s\S]*forkResource[\s\S]*updateResource/,
    'A7 must productize exact Library Attach / Fork / explicit Update',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /getResourceReferences\(ref\)[\s\S]*getResourceReferences\(ref,\s*\{\s*reverse:\s*true\s*\}\)/,
    'A7 Inspector must consume Resource Graph References / Used By',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /provider\?\.kind\s*===\s*['"]plugin['"][\s\S]*atriaStudioPluginResource/,
    'A7 Resource Explorer must expose A5 Plugin-defined Resource Registry contributions',
);

requirePattern(
    'public/scripts/native/studio-workspace.js',
    /nativeStudioClient\.validateProject[\s\S]*nativeStudioClient\.preview[\s\S]*nativeStudioClient\.simulate[\s\S]*nativeStudioClient\.preflight/,
    'A7 Studio must expose validation, Native Preview, simulation and build preflight',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /\['problems',\s*'Problems'\][\s\S]*\['output',\s*'Output'\][\s\S]*\['history',\s*'History'\][\s\S]*\['changes',\s*'Changes'\]/,
    'A7 Activity Panel must expose Problems / Output / History / Changes',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /mountNativeStudioAgent\([\s\S]*onProjectCommitted/,
    'Studio must host the integrated A8 Agent through its dedicated controller',
);
rejectPattern(
    'public/scripts/native/studio-workspace.js',
    /kind:\s*['"]agent['"]|agent\.plan|projectAgent|executeAgent|repairLoop/,
    'A7 must not start A8 Project Agent mutation/planning workflows',
);

console.log('A7 Studio Authoring UX residual guard passed.');
