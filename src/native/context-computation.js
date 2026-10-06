import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { assertTaskValue } from '../../public/shared/native-task-contract.js';
import { runPackageComputation } from './package-computation.js';
import { readTaskArtifact } from './task-artifact-authority.js';
import { hashNativeDocument } from './repositories/common.js';

const outputSchema = { type: 'object', additionalProperties: false, properties: {
    text: { type: 'string', maxLength: 32768 }, compact: { type: 'string', maxLength: 32768 },
    eligible: { type: 'boolean' }, priority: { type: 'integer', minimum: -10000, maximum: 10000 },
}, required: ['text'] };

// A trusted read port used by the same ContextCompiler for preview and send.
// Installed resources and the declared matching audience are the only authority.
export function createPackageContextDerivation(snapshot, installed) {
    return async declaration => {
        const fixed = snapshot.manifest.runtime.experienceContract.contextRuntime.derivations.find(item => item.id === declaration.id);
        if (!fixed || hashNativeDocument(fixed) !== hashNativeDocument(declaration)
            || hashNativeDocument(installed.manifest.runtime?.experienceContract?.contextRuntime) !== hashNativeDocument(snapshot.manifest.runtime.experienceContract.contextRuntime)
            || installed.manifest.packageVersionId !== snapshot.session.packageVersionId
            || installed.manifest.packageId !== snapshot.session.packageId) throw new TypeError('Context Package pin mismatch');
        const artifacts = {}, sources = [];
        for (const grant of fixed.artifacts) {
            const records = snapshot.states.atri_task_results?.records ?? [];
            const record = [...records].reverse().find(record => record.kind === 'task' && record.taskId === grant.taskId && record.variantId === grant.variantId);
            if (!record) throw new TypeError('Context Task artifact missing');
            const artifact = readTaskArtifact(snapshot, grant, record.invocationId, 'context');
            artifacts[grant.id] = artifact.value; sources.push(artifact.evidence);
        }
        const projection = projectInformation(snapshot, fixed.viewId, { purpose: 'context', includeRollups: false });
        const result = await runPackageComputation(installed, fixed.source, 'derive', { projection, artifacts,
            seed: hashNativeDocument({ sessionId: snapshot.session.sessionId, branchId: snapshot.revision.branchId,
                revisionId: snapshot.revision.revisionId, derivationId: fixed.id }) });
        return { value: assertTaskValue(result.value, outputSchema), evidence: { ...result.evidence, derivationId: fixed.id, viewId: fixed.viewId, artifacts: sources } };
    };
}
