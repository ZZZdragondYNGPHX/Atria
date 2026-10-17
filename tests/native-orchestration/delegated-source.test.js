import { jest } from '@jest/globals';
import { rpDelegationFixture } from './helpers/rp-delegation-fixture.js';
import { readDelegatedRpSource } from '../../src/native/orchestration/delegated-source-contracts.js';
import { rpOperationInput } from '../../src/native/rp-run-control.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const harnesses = CONTRACT_HARNESSES;
if (harnesses.some(({ name }) => ['MysqlEngine', 'PgEngine'].includes(name))) jest.setTimeout(60000);

async function fixture(make, { parent = true, child = true } = {}) {
    let pin;
    const add = plan => {
        plan.dependencyPins.push(pin); plan.definition.nodes[0].dependencyPinIds.push(pin.pinId);
    };
    return rpDelegationFixture(make, { memorySettings: { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 }, seedMemory: true,
        configureChildPlan: async (plan, f) => {
            const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
            const { messageId, variantId, contentHash } = rpOperationInput(chat.body[0], 0);
            const resourceRef = { kind: 'native_rp_message', controlId: f.controlId, messageId, variantId, contentHash };
            pin = { pinId: 'delegated.source', port: 'context', resourceRef,
                integrity: hash(await readDelegatedRpSource(f.h.handle, resourceRef, f.control)) };
            if (child) add(plan);
        }, configureParentPlan: plan => { if (parent) add(plan); } });
}

async function edit(f) {
    const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
    chat.body[0].mes = 'Human source edit remains committed';
    await f.chats.save(f.h.handle, f.locator.charDir, f.locator.name, chat.header, chat.body, chat.integrity);
}

describe.each(harnesses)('$name explicit delegated SourceRef', ({ make }) => {
    test('the exact source independently pinned by parent and child reaches only the authorized child Context', async () => {
        const f = await fixture(make);
        try {
            const result = await f.run();
            expect(result.delegation.status).toBe('returned'); expect(f.requests).toHaveLength(2);
            const child = JSON.stringify(f.requests[0]);
            expect(child).toContain('Original RP input'); expect(child).toContain('Authorized advisory source [rp0]');
            expect(child).toContain('Original RP context');
            expect(child).not.toContain('Original RP remembered context promise'); expect(child).not.toContain('FUTURE FORBIDDEN MEMORY');
            const root = await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId);
            expect(root.parentRef.inputRefs).toContainEqual(expect.objectContaining({ kind: 'rp_delegated_source', sourceRef: expect.objectContaining({ messageId: 'rp0' }) }));
            const bank = await f.control.status(f.h.handle, f.controlId);
            expect(Object.values(bank.operations).flatMap(op => op.compute?.attempts ?? [])).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test.each([{ parent: true, child: false }, { parent: false, child: true }])('a one-sided pin is not delegation permission: %j', async options => {
        const f = await fixture(make, options);
        try { await expect(f.run()).rejects.toThrow(); expect(f.requests).toEqual([]); } finally { await f.cleanup(); }
    });

    test('withdrawal after child compile retains the human edit and prevents every Provider request', async () => {
        const f = await fixture(make), original = ContextPort.prototype.compile;
        const spy = jest.spyOn(ContextPort.prototype, 'compile').mockImplementation(async function (...args) {
            const compiled = await original.apply(this, args);
            if (this.rpDelegationCapture) await edit(f);
            return compiled;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toEqual([]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body[0].mes).toBe('Human source edit remains committed');
            const bank = await f.control.status(f.h.handle, f.controlId);
            expect(Object.values(bank.operations).flatMap(op => op.compute?.localWork ?? [])).toContainEqual(expect.objectContaining({ kind: 'context_build', status: 'settled' }));
        } finally { spy.mockRestore(); await f.cleanup(); }
    });

    test('withdrawal while the child Provider runs retains its paid attempt and withholds parent consumption', async () => {
        const f = await fixture(make);
        f.onResponse(async () => { if (f.requests.length === 1) await edit(f); });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const bank = await f.control.status(f.h.handle, f.controlId);
            expect(Object.values(bank.operations).flatMap(op => op.compute?.attempts ?? [])).toEqual([
                expect.objectContaining({ status: 'settled', usage: expect.objectContaining({ totalTokens: 20 }) }),
            ]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body[0].mes).toBe('Human source edit remains committed');
        } finally { await f.cleanup(); }
    });
});
