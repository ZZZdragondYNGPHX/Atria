import * as orchestrator from '../../public/scripts/agents/orchestrator/register-custom-tool.js';

// Explicit capability host for the registration integration tests.
const context = { getCapabilityApi: name => name === 'orchestrator' ? orchestrator : null };
globalThis.Atria = { getContext: () => context };
