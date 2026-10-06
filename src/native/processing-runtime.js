import { PROCESSING_LIMITS, processingText, transformProcessingText } from '../../public/shared/native-processing-contract.js';
import { runPackageComputation } from './package-computation.js';
import { hashNativeDocument } from './repositories/common.js';

// Receives only the already-authorized source text. No State/Task/Bridge handle.
export async function processPackageText(installed, runtime, stage, raw, source) {
    let text = raw; const evidence = [];
    const processors = runtime?.processors.filter(item => item.stage === stage) ?? [];
    if (!processors.length) return { text, evidence };
    processingText(text); let total = text.length;
    for (const item of processors) {
        const inputHash = hashNativeDocument(text);
        try {
            let execution;
            if (item.kind === 'script') {
                const result = await runPackageComputation(installed, item.source, 'transform', { text, stage, source, seed: inputHash });
                text = processingText(result.value); execution = result.evidence;
            } else text = transformProcessingText(item, text);
            total += text.length;
            if (total > PROCESSING_LIMITS.total) throw new TypeError('Processing cumulative limit');
            evidence.push({ processorId: item.id, stage, source, inputHash, outputHash: hashNativeDocument(text), ...(execution ? { execution } : {}) });
        } catch {
            throw Object.assign(new TypeError('native_processing_failed:' + item.id + ':' + stage), { code: 'native_processing_failed', processorId: item.id, stage,
                details: { resourceId: item.id, field: stage } });
        }
    }
    return { text, evidence };
}
