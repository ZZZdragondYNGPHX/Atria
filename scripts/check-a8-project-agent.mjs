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
    'src/native/project-agent.js',
    /class ProjectAgentService[\s\S]*createTask[\s\S]*setPlan[\s\S]*prepareReview[\s\S]*commit[\s\S]*takeOver/,
    'A8 must model Project Tasks, Plan, Review/Commit and human takeover explicitly',
);
requirePattern(
    'src/native/project-agent.js',
    /kind:\s*['"]agent['"][\s\S]*baseRevision[\s\S]*_assertTaskBaseRevision/,
    'A8 Agent writes must force agent origin and pin an explicit baseRevision',
);
requirePattern(
    'src/native/project-agent.js',
    /createWorkspace[\s\S]*evaluateWorkspace[\s\S]*executeWorkspace/,
    'A8 must reuse StudioService Workspace evaluation and ChangeSet commit authority',
);
requirePattern(
    'src/native/authoring/studio-service.js',
    /evaluateWorkspace[\s\S]*_snapshot[\s\S]*_validateUnlocked[\s\S]*buildProjectPackage[\s\S]*_simulationRunner[\s\S]*_restore/,
    'A8 dry-run evaluation must validate/preview/simulate through A1/A4 seams and restore the project snapshot',
);
requirePattern(
    'src/native/project-agent.js',
    /PROJECT_AGENT_MAX_REPAIR_ROUNDS\s*=\s*3[\s\S]*repairRound[\s\S]*project_agent_repair_limit/,
    'A8 repair loop must be bounded by server Task state',
);
requirePattern(
    'src/native/project-agent.js',
    /resource\.attach[\s\S]*resource\.update[\s\S]*resource\.fork|STUDIO_RESOURCE_OPERATION_TYPES[\s\S]*attach[\s\S]*update[\s\S]*fork/,
    'A8 must prefer existing A2 domain Library Authoring Operations',
);
requirePattern(
    'src/native/project-agent.js',
    /Low-level fallback Authoring Operation[\s\S]*atri_agent_source_write[\s\S]*atri_agent_source_move[\s\S]*atri_agent_source_delete/,
    'A8 source mutation tools must remain explicitly low-level fallback operations',
);
requirePattern(
    'src/native/project-agent.js',
    /getResourceRegistry[\s\S]*queryResources[\s\S]*getResourceReferences[\s\S]*resolveResourceClosure/,
    'A8 resource discovery must consume the A2 Resource Registry/Graph',
);
rejectPattern(
    'src/native/project-agent.js',
    /from ['"][^'"]*(?:project-store|repositories|world-repo|knowledge-repo|asset-store)|new ProjectStore|\.save\(handle,\s*projectId/,
    'A8 Project Agent must not create a direct Project/resource persistence authority',
);
rejectPattern(
    'src/native/project-agent.js',
    /atri_agent_commit|rebaseTask|autoRebase|latestRevision\s*=/,
    'A8 must not expose AI Commit or silent-rebase mechanisms',
);

requirePattern(
    'public/scripts/native/studio-agent.js',
    /generateTask[\s\S]*context\.tools|context\.tools[\s\S]*generateTask/,
    'A8 browser Agent must project backend Authoring tool schemas into generation',
);
requirePattern(
    'public/scripts/native/studio-agent.js',
    /\/api\/skills\?scope=all[\s\S]*atri_agent_read_skill/,
    'A8 Project Agent must consume A5 Native Skills as read-only know-how',
);
requirePattern(
    'public/scripts/native/studio-agent.js',
    /pluginResourceDescriptors[\s\S]*provider\?\.kind\s*===\s*['"]plugin['"]/,
    'A8 Project Agent must surface A5 Plugin authoring resource contributions',
);
requirePattern(
    'public/scripts/native/studio-agent.js',
    /You cannot commit[\s\S]*Review[\s\S]*human/,
    'A8 model contract must stop at the human Review gate',
);
rejectPattern(
    'public/scripts/native/studio-agent.js',
    /workspaces\/execute|projects\/[^'"`]+\/source|ProjectStore|localStorage|sessionStorage|indexedDB/,
    'A8 browser Agent must not bypass Project/Workspace authorities or persist conversation as project truth',
);
requirePattern(
    'public/scripts/native/studio-agent.js',
    /dataset\.auxiliary\s*=\s*['"]true['"]/,
    'A8 conversation UI must be explicitly auxiliary to Project Task state',
);

requirePattern(
    'src/endpoints/native-studio.js',
    /agent\/tasks[\s\S]*\/tool[\s\S]*\/commit[\s\S]*\/takeover/,
    'A8 must expose Project Task execution, explicit Commit and takeover at the Native Studio boundary',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /mountNativeStudioAgent[\s\S]*getRevision:\s*\(\)\s*=>\s*state\.revision/,
    'A8 Studio must mount Project Agent against the current A1 revision authority',
);
requirePattern(
    'public/scripts/native/studio-workspace.js',
    /Project Agent arrives in A8[\s\S]*dataset\.atriaStudioAi\s*=\s*['"]placeholder['"]|dataset\.atriaStudioAi\s*=\s*['"]placeholder['"][\s\S]*Project Agent arrives in A8/,
    'A8 must preserve the frozen A7 AI product-position marker while upgrading it at runtime',
);
requirePattern(
    'src/native/authoring/studio-service.js',
    /Task \$\{workspace\.origin\.id\}/,
    'A8 committed Agent ChangeSets must retain semantic Task identity in Git history',
);
requirePattern(
    'src/native/authoring/studio-service.js',
    /Atria Studio ChangeSet \$\{changeSetId\}\$\{semanticOrigin\}/,
    'A8 Git history must retain ChangeSet identity and semantic Agent Task origin',
);

console.log('A8 Project Agent residual guard passed.');
