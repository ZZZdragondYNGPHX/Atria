import { projectPreservationEvidence } from '../../src/native/agent-intelligence/evaluation/project-preservation.js';

const source = { project: { displayName: 'Original' }, package: { entryPoints: [
    { id: 'first', worldIds: ['original-world'], primaryWorldId: 'original-world', knowledgeBindingIds: ['original-binding'] },
    { id: 'second', worldIds: [], knowledgeBindingIds: [] },
] }, dependencies: { worlds: ['pinned-world'] } };
const edits = [{ index: 0, worldIndex: 1, bindingIndices: [1] }, { index: 1, worldIndex: 0 }];

test.each([null, {}, { package: {} }, { package: { entryPoints: [] } }, { package: { entryPoints: [null] } },
    { package: { entryPoints: ['invalid'] } }, { package: { entryPoints: {} } }])('malformed Project proposal %# fails preservation without throwing or filling missing structure', proposal => {
    const evidence = projectPreservationEvidence(source, proposal, edits);
    expect(evidence.observed).toBeNull(); expect(evidence.expected).toMatch(/^[a-f0-9]{64}$/);
});

test('restoring only declared fields preserves exact hash semantics and never mutates either input', () => {
    const proposal = structuredClone(source); proposal.package.entryPoints[0].worldIds = ['different'];
    proposal.package.entryPoints[0].knowledgeBindingIds = ['different'];
    const before = JSON.stringify(proposal), original = JSON.stringify(source), evidence = projectPreservationEvidence(source, proposal, edits);
    expect(evidence.observed).toBe(evidence.expected); expect(JSON.stringify(proposal)).toBe(before); expect(JSON.stringify(source)).toBe(original);
    proposal.project.displayName = 'Unauthorized rename';
    const changed = projectPreservationEvidence(source, proposal, edits);
    expect(changed.observed).not.toBe(changed.expected);
});
