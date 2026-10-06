import { describe, test, expect } from '@jest/globals';
import { computationFixture, tradeSource } from './helpers/package-computation-fixture.js';
import { prepareAuthorityTransaction } from '../../src/native/authority-transaction.js';
import { runPackageComputation, compilePackageComputation } from '../../src/native/package-computation.js';
import { validateExperienceResources } from '../../src/native/experience-validation.js';

const run = f => prepareAuthorityTransaction(f.base, f.installed, f.request);
const values = base => ['wallet', 'shop', 'bag'].map(id => base.states.atri_lifecycle.domains[id].records[0].value.value);
describe('Package domain computation', () => {
    test('fixed complex algorithm atomically prepares payment, stock and delivery without publishing', async () => {
        const f = computationFixture(); const before = structuredClone(f.base);
        const prepared = await run(f);
        expect(values(prepared.candidate)).toEqual([14, 3, 2]); expect(f.base).toEqual(before);
        expect(prepared.receipt.result).toEqual({ outcome: 'success' });
        expect(prepared.receipt.execution.map(item => item.stage)).toEqual(['precondition','compute','invariant','invariant']);
        expect(prepared.receipt.execution.every(item => /^[a-f0-9]{64}$/.test(item.resourceHash))).toBe(true);
        expect(JSON.stringify(prepared.receipt)).not.toContain('PRIVATE SENTINEL');
        expect(await run(f)).toEqual(prepared);
    });
    test.each(['insufficient', 'invariant', 'late-effect', 'scope', 'output', 'loop', 'heap', 'promise', 'ungranted', 'mutation', 'ambient'])('%s rejection leaves no formal state or receipt', async kind => {
        let source = tradeSource;
        if (kind === 'invariant') source = source.replace('reads.wallet.value >= 0', 'reads.wallet.value < 0');
        if (kind === 'output') source = source.replace('balance:reads.wallet.value-price', 'balance:"spoof"');
        if (kind === 'loop') source = source.replace('const prices =', 'while(true){}; const prices =');
        if (kind === 'heap') source = source.replace('const prices =', 'const garbage=[]; while(true) garbage.push(new Array(100000).fill(1)); const prices =');
        if (kind === 'promise') source = source.replace('compute({args, reads})', 'async compute({args, reads})');
        if (kind === 'ungranted') source = source.replace('const prices =', 'reads.secret.value; const prices =');
        if (kind === 'mutation') source = source.replace('const prices =', 'reads.wallet.value=1000; const prices =');
        if (kind === 'ambient') source = source.replace('const prices =', 'Math.random(); const prices =');
        const f = computationFixture(source);
        if (kind === 'insufficient') f.base.states.atri_lifecycle.domains.wallet.records[0].value.value = 1;
        if (kind === 'late-effect') f.logic.transactions[0].effects[2].args.value = -1;
        if (kind === 'scope') f.base.states.atri_lifecycle.scopes.session.status = 'suspended';
        f.sync(); const before = structuredClone(f.base);
        await expect(run(f)).rejects.toMatchObject({ code: 'AUTHORITY_PREPARATION_FAILED' }); expect(f.base).toEqual(before);
    });
    test('caller cannot replace fixed source, validators or inject effects', async () => {
        const f = computationFixture(); f.request.computation = { source: 'my.ts' };
        await expect(run(f)).rejects.toThrow();
        delete f.request.computation; f.request.input.effects = [];
        await expect(run(f)).rejects.toThrow();
    });
    test('changed dependency misses exact cache and changes safe resource evidence', async () => {
        const f = computationFixture(); const a = await run(f);
        f.installed.sourceFiles.set('rules/price.ts', Buffer.from('export const total = (quantity:number) => quantity*300;'));
        await expect(run(f)).rejects.toThrow();
        f.installed.sourceFiles.set('rules/price.ts', Buffer.from('export const total = (quantity:number) => quantity*2;'));
        const b = await run(f); expect(b.receipt.execution[0].resourceHash).not.toBe(a.receipt.execution[0].resourceHash);
    });
    test('build/install validation rejects open and forbidden fixed resources', () => {
        const f = computationFixture(); validateExperienceResources(f.base.manifest, f.installed.sourceFiles, f.installed.assets);
        f.installed.sourceFiles.delete('rules/price.ts');
        expect(() => validateExperienceResources(f.base.manifest, f.installed.sourceFiles, f.installed.assets)).toThrow();
        expect(() => compilePackageComputation('bad.js', new Map([['bad.js', Buffer.from('export default {compute(){return process.env}}')]]))).toThrow();
    });
    test('pure computation cannot obtain a dynamic constructor or a provider/commit bridge', async () => {
        const f = computationFixture('export default {derive(input) { const key="con"+"structor"; return {dynamic:typeof ({}[key][key]), bridge:typeof input.bridge}; }}');
        const result = await runPackageComputation(f.installed, 'rules/trade.ts', 'derive', {});
        expect(result.value).toEqual({ dynamic: 'undefined', bridge: 'undefined' });
    });
});
