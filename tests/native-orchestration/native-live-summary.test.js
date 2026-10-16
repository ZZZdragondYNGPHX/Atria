import { projectProbeSummary } from './helpers/native-live-summary.js';

test('live Project diagnostics expose only closed statuses, counts and equality, never source or diagnostic values', () => {
    const privateText = 'provider-private-value';
    const source = { project: { displayName: privateText }, package: { entryPoints: [] }, dependencies: { worlds: [privateText] }, files: { [privateText]: privateText } };
    const trial = { evidence: [{ name: 'native_project_pilot', observed: { currentTask: { status: 'repair' },
        validation: { status: 'failed', diagnostics: [{ code: privateText, message: privateText }] }, validatedProposal: source },
    expected: { proposed: { ...source, package: { entryPoints: [privateText] } } } }] };
    expect(projectProbeSummary(trial)).toMatchObject({ available: true, taskStatus: 'repair', validationStatus: 'failed', diagnosticCount: 1,
        proposalPresent: true, equalSections: { project: true, package: false, dependencies: true, files: true } });
    expect(JSON.stringify(projectProbeSummary(trial))).not.toContain(privateText);
    trial.evidence[0].observed.currentTask.status = privateText; trial.evidence[0].observed.validation.status = privateText;
    expect(projectProbeSummary(trial)).toMatchObject({ taskStatus: 'other', validationStatus: 'unavailable' });
    expect(projectProbeSummary({ evidence: [] })).toEqual({ available: false });
});

test('failed trial diagnostics remain available before a worker abort without exposing arbitrary projection fields', () => {
    const privateText = 'private-worker-value';
    const trial = { evidence: [{ name: 'native_project_execution_failure', observed: { status: 'available', task: { status: 'planning', validationStatus: privateText },
        projection: { status: 'reconciling', source: privateText, privateText, capacity: { status: 'available', used: { requests: 5, jobs: 32, tokens: privateText },
            remaining: { jobs: 0, requests: 1, inputBytes: -1, privateText } } } } }] };
    expect(projectProbeSummary(trial)).toMatchObject({ available: true, failed: true, runStatus: 'reconciling', taskStatus: 'planning', validationStatus: 'unavailable',
        capacity: { status: 'available', used: { requests: 5, jobs: 32, tokens: null }, remaining: { jobs: 0, requests: 1, inputBytes: null } } });
    expect(JSON.stringify(projectProbeSummary(trial))).not.toContain(privateText);
});
