import { createOrchestrationClient, classifyOrchestrationError, newCommandId } from '../../public/scripts/native/orchestration/client.js';

const json = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: name => headers[name] ?? null } });

describe('orchestration HTTP client', () => {
    test('reads use the read envelope and learn the Host boot from real responses', async () => {
        const calls = [];
        const client = createOrchestrationClient({ headers: () => ({ 'X-CSRF-Token': 't' }), fetchImpl: async (url, init) => {
            calls.push({ url, init: { ...init, body: JSON.parse(init.body) } });
            return json(200, { schemaVersion: 1, hostBootId: 'boot-1', outcome: { items: [], cursor: null } });
        } });
        await client.listPlans();
        expect(calls[0].url).toBe('/api/native/orchestration/plans/list');
        expect(calls[0].init.body).toEqual({ schemaVersion: 1, body: { cursor: null, limit: 50 } });
        expect(client.getHostBootId()).toBe('boot-1');
    });

    test('mutations carry commandId, expected boot and the same-value header; replay keeps the same identity', async () => {
        const calls = [];
        const client = createOrchestrationClient({ headers: () => ({}), fetchImpl: async (url, init) => {
            calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
            return json(200, { schemaVersion: 1, hostBootId: 'boot-1', commandId: JSON.parse(init.body).commandId, outcome: { ok: true } });
        } });
        const commandId = newCommandId();
        expect(commandId).toMatch(/^ocmd_[a-f0-9]{32}$/);
        await client.savePlan({ planId: 'p' }, { commandId });
        const mutation = calls.at(-1);
        expect(mutation.body).toEqual({ schemaVersion: 1, commandId, expectedHostBootId: 'boot-1', body: { planId: 'p' } });
        expect(mutation.headers['X-Atria-Host-Boot-Id']).toBe('boot-1');
    });

    test('a lost mutation response is unknown, never failure; a Host change is reported, not resent', async () => {
        let mode = 'boot';
        const client = createOrchestrationClient({ headers: () => ({}), fetchImpl: async () => {
            if (mode === 'boot') { mode = 'drop'; return json(200, { schemaVersion: 1, hostBootId: 'boot-1', outcome: { items: [], cursor: null } }); }
            if (mode === 'drop') throw new TypeError('network');
            return json(409, { schemaVersion: 1, hostBootId: 'boot-2', error: 'native_orchestration_host_changed' });
        } });
        const lost = await client.publishPlan({}, { commandId: 'ocmd_' + 'a'.repeat(32) }).catch(error => error);
        expect(lost).toMatchObject({ code: 'request_outcome_unknown', unknownOutcome: true, commandId: 'ocmd_' + 'a'.repeat(32) });
        expect(classifyOrchestrationError(lost)).toBe('unknown');
        mode = 'changed';
        const changed = await client.savePlan({}).catch(error => error);
        expect(classifyOrchestrationError(changed)).toBe('host_changed');
        expect(client.getHostBootId()).toBe('boot-2');
    });

    test('error classes stay distinct', () => {
        expect(classifyOrchestrationError({ code: 'storage_commit_unknown' })).toBe('unknown');
        expect(classifyOrchestrationError({ code: 'native_orchestration_draft_conflict', status: 409 })).toBe('conflict');
        expect(classifyOrchestrationError({ code: 'native_orchestration_projection_resync_required', status: 409 })).toBe('resync');
        expect(classifyOrchestrationError({ code: 'native_orchestration_writer_unavailable', status: 503 })).toBe('unavailable');
        expect(classifyOrchestrationError({ code: 'x', status: 404 })).toBe('missing');
    });
});
