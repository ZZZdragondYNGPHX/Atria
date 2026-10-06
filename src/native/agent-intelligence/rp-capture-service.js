import { fields, evidenceSet } from './contracts.js';
import { hashNativeDocument } from '../repositories/common.js';

const budget = { maxSources: 32, maxBytes: 131072, maxScanMessages: 8192 };
/** Authenticated transport consumer; client observations cannot create Host receipts. */
export class RpEvidenceCaptureService {
    constructor({ repository, service }) { Object.assign(this, { repository, service }); }
    async begin(handle, input) {
        fields(input, ['scope', 'rootRunId', 'selectors'], 'Evidence begin');
        if (!['rp_chat', 'rp_session'].includes(input.scope?.domain)) throw new TypeError('RP scope required');
        const sources = await this.service.capture(handle, input.scope, input.selectors, budget);
        return this.repository.begin(handle, { scope: input.scope, rootRunId: input.rootRunId, sources, origin: 'client_observation' });
    }
    async update(handle, input) {
        fields(input, ['evidenceId', 'sequence', 'status', 'trace', 'output'], 'Evidence update');
        const previous = await this.repository.get(handle, input.evidenceId);
        if (!previous || previous.origin !== 'client_observation') throw new TypeError('Client evidence required');
        let sources = previous.sources, outputBound = Boolean(previous.outputRef);
        if (input.output !== null) {
            if (previous.sources.references.some(ref => hashNativeDocument(ref.selector) === hashNativeDocument(input.output.selector)
                && hashNativeDocument(ref) !== hashNativeDocument(previous.outputRef))) throw new TypeError('Input cannot become output');
            const observed = await this.service.capture(handle, previous.scope, [input.output.selector], budget);
            if (hashNativeDocument(observed.references[0]) !== hashNativeDocument(input.output)) throw new TypeError('Output variant changed');
            sources = evidenceSet(handle, previous.scope, [...previous.sources.references.filter(ref => hashNativeDocument(ref.selector) !== hashNativeDocument(input.output.selector)), observed.references[0]]);
            outputBound = true;
        }
        await this.repository.update(handle, input.evidenceId, { sequence: input.sequence, status: input.status, trace: input.trace, sources,
            outputRef: input.output ?? previous.outputRef }, 'client_observation');
        return { outputBound };
    }
    async inspect(handle, input) {
        fields(input, ['evidenceId'], 'Evidence identity');
        return this.repository.inspect(handle, input.evidenceId, this.service, budget);
    }
    async delete(handle, input) {
        fields(input, ['evidenceId'], 'Evidence identity');
        return { deleted: await this.repository.delete(handle, input.evidenceId) };
    }
}
