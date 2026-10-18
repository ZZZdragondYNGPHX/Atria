import { performance } from 'node:perf_hooks';
import { GenerationError, checkCancellation } from '../model-prompt-runtime/execution-utils.js';
import { equalNativeDocuments, hashNativeDocument as hash } from '../repositories/common.js';
import { ContextPort } from './context-port.js';
import { BudgetPort, localWorkAttemptId, assertOriginalSendBank } from './budget-port.js';
import { ContextRetrievalPort } from './context-retrieval-port.js';

const compilations = new WeakMap();
const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const rootBinding = root => hash({ runId: root.runId, ownerRef: root.ownerRef, epoch: root.epoch,
    hostBootId: root.hostBootId, hostGeneration: root.hostGeneration,
    sourceBinding: root.sourceBinding, budgetAuthorityRef: root.budgetAuthorityRef });

// Shared lifecycle of original Host work. Admission, stable identities, limits
// and all persistent writes remain callbacks to the existing original banks.
export async function runGenerationLocalWork({ signal, attempt, admit, settle, assertCurrent, onAdmitted, discardResult, requireAdmission = false }, operation) {
    checkCancellation(signal);
    await assertCurrent();
    checkCancellation(signal);
    let receipt;
    try { receipt = await admit(attempt); } catch (error) { throw new GenerationError(error.code ?? 'generation_execution_failed'); }
    if (!receipt) {
        if (requireAdmission) fail('native_orchestration_context_budget_unavailable');
        return operation();
    }
    const entry = { ...(receipt.localWork ?? receipt) };
    onAdmitted?.(entry);
    const started = performance.now(), cpu = process.cpuUsage();
    let outcome = 'failed', result;
    try {
        try {
            await assertCurrent(); result = await operation(); await assertCurrent(); outcome = 'completed';
        } catch (error) { if (signal?.aborted) outcome = 'cancelled'; throw error; } finally {
            const used = process.cpuUsage(cpu);
            const usage = { wallMs: performance.now() - started, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome };
            Object.assign(entry, await settle({ receipt, attempt, usage }));
        }
        await assertCurrent(); return result;
    } catch (error) {
        if (result && discardResult) await discardResult(result);
        throw new GenerationError(error.code ?? 'generation_execution_failed');
    }
}

/** Pay for the actual existing compiler once, using the send's original bank. */
export async function compileNativeContextMetered({ handle, port, request, bank, budgetPort, root, effectId, limits, workDescriptor, assertCurrent, signal, contextRetrieval }) {
    if (!(port instanceof ContextPort) || !(budgetPort instanceof BudgetPort) || typeof assertCurrent !== 'function'
        || root.ownerRef.handle !== handle || !equalNativeDocuments(root.sourceBinding, request.sourceBinding)
        || !equalNativeDocuments(bank.authorityRef, root.budgetAuthorityRef) || !limits?.localWork
        || typeof workDescriptor?.requestId !== 'string' || !workDescriptor.requestId
        || typeof workDescriptor.pathFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(workDescriptor.pathFingerprint))
        fail('native_orchestration_context_compile_invalid');
    assertOriginalSendBank(bank, { budgetPort, handle, authorityRef: root.budgetAuthorityRef, effectId });
    checkCancellation(signal);
    await assertCurrent();
    await bank.assertCurrent();
    checkCancellation(signal);
    const skillCurrent = async () => { await assertCurrent(); await bank.assertCurrent(); };
    await ContextPort.prototype.prepareRpSkills.call(port, handle, request, (kind, input, operation) => {
        const attempt = { attemptId: bank.nextLocalWorkAttemptId(), requestId: workDescriptor.requestId, kind, estimatedItems: 1,
            estimatedInputBytes: Buffer.byteLength(JSON.stringify(input), 'utf8'), targetFingerprint: hash({ path: workDescriptor.pathFingerprint, kind, input }) };
        return runGenerationLocalWork({ signal, attempt, requireAdmission: true, assertCurrent: skillCurrent,
            admit: work => bank.chargeLocalWork(limits, work), settle: ({ attempt, usage }) => bank.settleLocalWork(attempt.attemptId, usage) }, operation);
    });
    const actualInput = await ContextPort.prototype.compilationDescriptor.call(port, handle, request);
    let retrievalScope;
    const node = root.graph.nodes.find(node => node.nodeId === request.inputRefs[0]?.nodeId);
    if (node?.capabilities.includes('memory.retrieve')) {
        if (!(contextRetrieval instanceof ContextRetrievalPort) || contextRetrieval.budgetPort !== budgetPort) fail('native_orchestration_context_retrieval_denied');
        retrievalScope = await ContextRetrievalPort.prototype.createCompilation.call(contextRetrieval, handle,
            { port, request, bank, root, modelEffectId: effectId, limits, actualInput, signal });
    }
    checkCancellation(signal);
    const attempt = { attemptId: bank.nextLocalWorkAttemptId(), requestId: workDescriptor.requestId, kind: 'context_build', estimatedItems: 1,
        estimatedInputBytes: Buffer.byteLength(JSON.stringify({ requestId: workDescriptor.requestId, pathFingerprint: workDescriptor.pathFingerprint, input: actualInput }), 'utf8'),
        targetFingerprint: hash({ path: workDescriptor.pathFingerprint, kind: 'context_build' }) };
    const compileCurrent = async () => { await assertCurrent(); await bank.assertCurrent(); };
    let entry;
    const compiled = await runGenerationLocalWork({ signal, attempt, requireAdmission: true, assertCurrent: compileCurrent,
        admit: work => bank.chargeLocalWork(limits, work),
        settle: ({ attempt, usage }) => bank.settleLocalWork(attempt.attemptId, usage),
        onAdmitted: row => { entry = row; } }, () => ContextPort.prototype.compile.call(port, handle, request,
        retrievalScope ? { port: contextRetrieval, scope: retrievalScope } : undefined));
    if (!entry?.orchestration || entry.orchestration.kind !== 'local_work' || entry.orchestration.effectId !== effectId
        || entry.attemptId !== localWorkAttemptId(effectId, entry.orchestration.ordinal)
        || !equalNativeDocuments(compiled.request, request)) fail('native_orchestration_context_compile_invalid');
    const ref = { kind: 'local_work', authorityRef: bank.authorityRef, effectId, localWorkOrdinal: entry.orchestration.ordinal,
        attemptId: entry.attemptId, reservationId: entry.reservationId ?? null };
    const proof = Object.freeze({});
    compilations.set(proof, { handle, port, compiled, bank, budgetPort, ref, rowHash: hash(entry), rootBinding: rootBinding(root),
        runId: root.runId, effectId, sourceBinding: root.sourceBinding, grantDigest: request.grantDigest });
    try { await assertContextCompilation({ proof, handle, port, compiled, bank, root }); } catch (error) { compilations.delete(proof); throw error; }
    return { compiled, proof };
}

/** Accounting proof only. Every sender/consumer must still check its real grant. */
export async function assertContextCompilation({ proof, handle, port, compiled, bank, root, intent, source }) {
    const value = compilations.get(proof);
    if (!value || value.handle !== handle || value.port !== port || value.compiled !== compiled || value.bank !== bank
        || !equalNativeDocuments(compiled.request.sourceBinding, value.sourceBinding) || compiled.request.grantDigest !== value.grantDigest)
        fail('native_orchestration_context_compile_proof_invalid');
    if (root && rootBinding(root) !== value.rootBinding) fail('native_orchestration_context_compile_proof_invalid');
    if (intent && (intent.runId !== value.runId || intent.effectId !== value.effectId
        || intent.sourceBindingDigest !== value.sourceBinding.bindingDigest || intent.grantDigest !== value.grantDigest))
        fail('native_orchestration_context_compile_proof_invalid');
    const ref = value?.sourceBinding.sourceRef;
    if (source && (value.sourceBinding.sourceAuthority === 'rp_chat'
        ? source.kind !== 'rp_chat' || source.controlId !== ref.controlId : value.sourceBinding.sourceAuthority === 'project'
            ? source.kind !== 'task' || source.projectId !== ref.projectId || source.taskId !== ref.taskId || source.revision !== ref.revision
            : source.kind !== 'session' || source.sessionId !== ref.sessionId || source.branchId !== ref.branchId || source.revisionId !== ref.revisionId))
        fail('native_orchestration_context_compile_proof_invalid');
    const row = await value.budgetPort.observeAttempt(handle, value.ref);
    if (row.status !== 'settled' || row.usage?.outcome !== 'completed' || hash(row) !== value.rowHash)
        fail('native_orchestration_context_compile_budget_invalid');
    return { budgetAttemptRef: structuredClone(value.ref), status: row.status, localWork: structuredClone(row) };
}
