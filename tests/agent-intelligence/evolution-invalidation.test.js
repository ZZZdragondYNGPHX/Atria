import { expect, jest, test } from '@jest/globals';
import { AgentEvolutionService } from '../../src/native/agent-intelligence/evolution-service.js';

const document = { scopeId: 'exact-scope', sequence: 0, scope: { domain: 'project', projectId: 'fixture-project' }, subject: 'fixture-project',
    publications: [{ id: 'published', status: 'published' }] };
const service = (engine, rollback, cleanup, read = async () => structuredClone(document)) => Object.assign(Object.create(AgentEvolutionService.prototype), {
    host: { persistence: { _engine: engine } }, repository: { get: read }, _rollback: rollback, _cleanup: cleanup,
});
test('Experience invalidation and another service reconcile join one target recovery instead of racing cleanup CAS', async () => {
    let release, enter;
    const gate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { enter = resolve; });
    const engine = {}, rollback = jest.fn(async () => { enter(); await gate; }), cleanup = jest.fn(async () => {});
    const first = service(engine, rollback, cleanup), second = service(engine, rollback, cleanup);
    const background = first._rollbackInvalidated('owner', document);
    await entered;
    const reconcile = second._rollbackInvalidated('owner', structuredClone(document));
    expect(reconcile).toBe(background); expect(rollback).toHaveBeenCalledTimes(1);
    release(); await Promise.all([background, reconcile]);
    expect(cleanup).toHaveBeenCalledTimes(1);
});
test('a later journal sequence and publication arriving during pending recovery drain through the same promise', async () => {
    let release, enter;
    const gate = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { enter = resolve; });
    let journal = structuredClone(document);
    const read = jest.fn(async () => structuredClone(journal));
    const rollback = jest.fn(async (_handle, _scope, _subject, id) => {
        if (id === 'published') { enter(); await gate; }
        journal.publications.find(p => p.id === id).status = 'rolled_back';
    });
    const cleanup = jest.fn(async () => {}), engine = {};
    const first = service(engine, rollback, cleanup, read), second = service(engine, rollback, cleanup, read);
    const background = first._rollbackInvalidated('owner', structuredClone(journal));
    await entered;
    journal.sequence = 1; journal.publications.push({ id: 'later-publication', status: 'published' });
    const reconcile = second._rollbackInvalidated('owner', structuredClone(journal));
    expect(reconcile).toBe(background); release();
    await Promise.all([background, reconcile]);
    expect(rollback.mock.calls.map(args => args[3])).toEqual(['published', 'later-publication']);
    expect(journal.publications.every(p => p.status === 'rolled_back')).toBe(true);
    expect(read).toHaveBeenCalledTimes(2); expect(cleanup).toHaveBeenCalledTimes(2);
});
test('failed recovery drops only its transient join handle and can retry from the original journal', async () => {
    const rollback = jest.fn(async () => {}), cleanup = jest.fn().mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue(undefined);
    const current = service({}, rollback, cleanup);
    await expect(current._rollbackInvalidated('owner', document)).rejects.toThrow('storage unavailable');
    await expect(current._rollbackInvalidated('owner', document)).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(2); expect(rollback).toHaveBeenCalledTimes(2);
});
