import { evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';

// Trial configuration precedes publication's Project binding metadata. Compare
// the exact consumed prompt and transport against that frozen configuration.
export function projectActivationMatches(config, settings, publication, candidate) {
    const trialConfig = { ...config, route: { ...publication.previous, promptProgramRef: settings.projectPromptRef } };
    const trialSettings = { projectPromptRef: settings.projectPromptRef, version: candidate.candidateId };
    return hash(trialConfig) === candidate.report.configurations.candidate && hash(trialSettings) === candidate.report.settings.candidate;
}
