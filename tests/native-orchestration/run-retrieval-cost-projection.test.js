import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { contextRetrievalFixture } from './helpers/context-retrieval-fixture.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const bucket = (attempts = 0, knownTotalTokens = 0, unknownAttempts = 0, reservedUpperTokens = 0) => ({ attempts, knownTotalTokens, unknownAttempts, reservedUpperTokens });
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const observer = f => new RunObservationService({ engine: f.h.engine, sessionCore: f.host.sessionCore, rpControl: f.control });
const project = async (service, f, runId) => (await service.observe(f.h.handle, { runId, cursor: null, limit: 100 })).payload;

describe.each(harnesses)('$name original retrieval cost projection', ({ make }) => {
    test.each(['settled', 'retrieval_unknown', 'generation_unknown'])('provider work is classified from protected Effects with %s fees', async mode => {
        const f = await contextRetrievalFixture(make, { embedding: true, reranking: true, usage: mode !== 'retrieval_unknown', modelUsage: mode !== 'generation_unknown' });
        try {
            const outcome = await f.run({ floor: 2 }).then(value => ({ value }), error => ({ error }));
            expect(outcome).toHaveProperty(mode === 'retrieval_unknown' ? 'error' : 'value');
            let runId;
            if (mode === 'retrieval_unknown') {
                runId = await f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc.runId);
            } else runId = outcome.value.runId;
            const before = await bankOf(f), service = observer(f), payload = await project(service, f, runId);
            const providerWork = { generation: bucket(), embedding: bucket(), rerank: bucket(), other: bucket() };
            if (mode === 'retrieval_unknown') providerWork.embedding = bucket(1, 0, 1, before.attempts[0].estimatedTokens);
            else {
                providerWork.embedding = bucket(2, 14); providerWork.rerank = bucket(1, 7);
                providerWork.generation = mode === 'generation_unknown' ? bucket(1, 0, 1, before.attempts.at(-1).estimatedTokens) : bucket(1, 20);
            }
            expect(payload.costs.providerWork).toEqual(providerWork);
            const totals = Object.values(providerWork).reduce((sum, work) => ({ modelAttempts: sum.modelAttempts + work.attempts,
                knownTotalTokens: sum.knownTotalTokens + work.knownTotalTokens, unknownAttempts: sum.unknownAttempts + work.unknownAttempts,
                reservedUpperTokens: sum.reservedUpperTokens + work.reservedUpperTokens }), { modelAttempts: 0, knownTotalTokens: 0, unknownAttempts: 0, reservedUpperTokens: 0 });
            expect(payload.costs).toMatchObject({ ...totals, closed: mode === 'settled', status: mode === 'settled' ? 'settled' : 'pending' });
            expect(payload.costs.localJobs).toBe(before.localWork.length);
            const metadata = JSON.stringify(payload);
            for (const text of ['synthetic-rerank-secret', 'Alice left because', 'FUTURE FORBIDDEN MEMORY', 'nativeRetrievalRef', 'inputFingerprint']) expect(metadata).not.toContain(text);
            expect((await project(observer(f), f, runId)).costs).toEqual(payload.costs);
            expect(await bankOf(f)).toEqual(before);
            expect(f.calls).toHaveLength(mode === 'retrieval_unknown' ? 1 : 3); expect(f.requests).toHaveLength(mode === 'retrieval_unknown' ? 0 : 1);
        } finally { await f.cleanup(); }
    }, 180000);
});
