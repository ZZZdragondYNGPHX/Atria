import { authorityFixture } from './authority-fixture.js';
import { sessionFixture } from './session-fixture.js';
import { initialLifecycle } from '../../../src/native/lifecycle-authority.js';
import { createNativeId } from '../../../src/native/identity.js';

export function authorityCandidateFixture(change = () => {}) {
    const { manifest, entryPointId } = sessionFixture();
    const { contract, logic } = authorityFixture();
    contract.lifecycleRuntime.automations = [];
    contract.lifecycleRuntime.domains.push({ ...structuredClone(contract.lifecycleRuntime.domains[0]), id: 'other' });
    logic.transactions[0].resolution = { kind: 'deterministic', cases: [], fallback: 'success' };
    logic.transactions[0].effects.splice(2, 0, { kind: 'app.command', domainId: 'other', commandId: 'save', recordId: 'main', args: { text: 'other changed' } });
    change({ contract, logic });
    manifest.runtime = { game: { logic: 'logic.json' }, experienceContract: contract };
    const base = { manifest, session: { sessionId: createNativeId('session'), packageId: manifest.packageId,
        packageVersionId: manifest.packageVersionId, entryPointId },
    revision: { revisionId: createNativeId('revision'), branchId: createNativeId('branch') },
    timeline: [{ messageId: createNativeId('message'), activeVariantId: createNativeId('variant'), role: 'user', content: 'Update the note.' }],
    states: { atri_world_state: { initialState: { hp: 8 } }, atri_lifecycle: initialLifecycle(contract.lifecycleRuntime) } };
    base.states.atri_lifecycle.ready = true;
    for (const id of ['notes', 'other', 'public_notes']) {
        base.states.atri_lifecycle.domains[id].records.push({ id: 'main', scopeId: 'session', status: 'active', pinned: false,
            createdLogicalTime: 0, value: { text: id === 'notes' ? 'PRIVATE SENTINEL' : 'public note' } });
    }
    const installed = { manifest, entryPoint: manifest.entryPoints[0], assets: new Map(), sourceFiles: new Map() };
    const sync = () => installed.sourceFiles.set('logic.json', Buffer.from(JSON.stringify(logic)));
    sync();
    const request = { transactionId: 'note.update', input: { target: 'main', text: 'visible new note', amount: 2 },
        anchor: { sessionId: base.session.sessionId, packageVersionId: base.session.packageVersionId,
            branchId: base.revision.branchId, revisionId: base.revision.revisionId }, playerMessageId: base.timeline[0].messageId, ordinal: 0 };
    return { base, installed, request, contract, logic, sync };
}
