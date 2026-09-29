import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ATRIA_EXPERIENCE_CAPABILITIES } from '../../public/shared/native-experience-contract.js';

// Curated identifiers resolve to current, checked-in compiler contracts. Never
// interpret an AI-supplied path as a filesystem path.
const definitions = [
    ['frontend-authoring', 'Native v3 Studio Source Graph and format-preserving semantic patches', 'src/native/frontend/authoring.js'],
    ['frontend-guide', 'Native v3 authoring, controller and Studio guide', 'src/native/authoring-examples/frontend-v3/README.md'],
    ['frontend', 'Native Frontend v3 Source Index and source/compiled Experience contracts', 'public/shared/native-frontend-contract.js'],
    ['frontend-aui', 'Native .aui compiler skeleton, supported syntax and stable semantic IDs', 'src/native/frontend/aui-parser.js'],
    ['frontend-bridge', 'Frontend Host Bridge v1 typed target linker and compiled descriptor', 'src/native/frontend/bridge.js'],
    ['example-frontend-v3', 'Minimal native@3 frontend.json accepted by Project Build and Preview', 'src/native/authoring-examples/frontend-v3/frontend.json'],
    ['example-aui-v3', 'Minimal native@3 Main.aui accepted by the formal compiler', 'src/native/authoring-examples/frontend-v3/Main.aui'],
    ['project', 'Project Source, Package identity, resources and authoring operations', 'src/native/authoring-contracts.js'],
    ['package', 'Package manifest, permissions and immutable closure', 'src/native/contracts.js'],
    ['capabilities', 'Native Experience capability names, versions and declaration closure', 'public/shared/native-experience-contract.js'],
    ['ui-document', 'UI v2 views, local state, preferences, selectors, Opening and conversation', 'public/scripts/native/experience/ui/v2-document.js'],
    ['ui-actions', 'UI v2 typed actions and single authority write rules', 'public/scripts/native/experience/ui/v2-document.js'],
    ['messages', 'Message projection, Turn envelope and narrative-only presentation', 'public/shared/native-message-contract.js'],
    ['tasks', 'Model Tasks, result policy, binding slots and variants', 'public/shared/native-task-contract.js'],
    ['lifecycle', 'App domains, commands, retention, scopes, workflows and logical time', 'public/shared/native-lifecycle-contract.js'],
    ['presentation', 'Activity, Scene, Cue, AssetRef and Host capabilities', 'public/shared/native-presentation-contract.js'],
    ['information', 'Data projection, Truth/Belief, memory, rollup and exposure', 'public/shared/native-information-contract.js'],
    ['continuity', 'Player continuity and independent transfer Saga', 'public/shared/native-continuity-contract.js'],
    ['content', 'Exact Base/Add-on/Community contribution declarations', 'public/shared/native-content-contract.js'],
    ['shared', 'Fixed seats, Shared Turn, ACL and independent Realm', 'public/shared/native-shared-contract.js'],
    ['scenario', 'Studio Scenario fixture v1, recorded Tasks and assertions', 'src/native/studio-scenario.js'],
    ['prompt-resources', 'Typed Prompt Program, Module and Generation Profile resources', 'src/native/model-prompt-runtime/resources.js'],
    ['browser-extensions', 'Browser extension installation, SDK v1, scopes and lifecycle example', 'src/native/authoring-examples/browser-extension.md'],
    ['browser-extension-sdk', 'Executable browser SDK v1 helpers and typed Native adapters', 'public/scripts/native/extension-sdk.js'],
    ['example-ui-v2', 'Minimal Component UI v2 document accepted by the production compiler', 'src/native/authoring-examples/ui-v2.json'],
    ['example-scenario', 'Minimal non-mutating Studio Scenario fixture', 'src/native/authoring-examples/scenario.json'],
];

export function listAuthoringReferences(query = '') {
    if (typeof query !== 'string' || query.length > 200) throw new TypeError('Invalid reference search');
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return { schemaVersion: 1, capabilities: ATRIA_EXPERIENCE_CAPABILITIES,
        references: definitions.filter(([id, description]) => words.every(word => (id + ' ' + description).toLowerCase().includes(word)))
            .map(([id, description]) => ({ id, description })),
        usage: 'Read the relevant reference pages before authoring. Examples are component/fixture documents, not whole importable projects. Preserve exact IDs and revisions; propose edits through Studio and validate before Review.' };
}

export async function readAuthoringReference({ id, offset = 0, limit = 12000 } = {}) {
    const selected = definitions.find(entry => entry[0] === id);
    if (!selected) throw new TypeError('Unknown authoring reference');
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 24000) throw new TypeError('Invalid reference page');
    const content = await readFile(new URL('../../' + selected[2], import.meta.url), 'utf8');
    return { id, description: selected[1], sha256: createHash('sha256').update(content).digest('hex'), offset,
        content: content.slice(offset, offset + limit), totalCharacters: content.length,
        nextOffset: offset + limit < content.length ? offset + limit : null };
}
