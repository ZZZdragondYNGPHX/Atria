import { describe, expect, test } from '@jest/globals';
import { initialHistory, historyMetrics, queryHistory } from '../../public/shared/native-history-runtime.js';
import { prepareHistory, validateHistory, retireInvocation, retiredInvocation, checkpointHistory } from '../../src/native/history-authority.js';
import { assertHistoryPolicy } from '../../public/shared/native-history-contract.js';

const clone = structuredClone;
function fixture() {
    const policy = { schemaVersion: 1, clockId: 'world', chronologyDomain: 'chronology', meaningfulDomains: ['person'],
        sources: [{ id: 'identity', domainId: 'person', recordId: 'main', path: ['identity'], public: true, refs: ['actor:hero', 'family:rook'], label: 'Identity' },
            { id: 'secret', domainId: 'person', recordId: 'main', path: ['secret'], public: false, refs: ['case:hidden'], label: 'Hidden fact' }],
        hot: 8, warm: 24, cold: 32, maxDurable: 1024, maxBytes: 1048576, checkpointTurns: 64 };
    return { manifest: { actors: [{ actorId: 'hero' }], runtime: { experienceContract: { lifecycleRuntime: { history: policy } } } },
        session: { sessionId: 'world.one' }, revision: { revisionId: 'rev.0', branchId: 'branch.one' }, timeline: [],
        states: { atri_lifecycle: { clocks: { world: 0 }, history: initialHistory(), domains: {
            chronology: { records: [{ id: 'main', value: { sequence: 0, calendar: { year: 1 }, era_id: 'opening' } }] },
            person: { records: [{ id: 'main', value: { identity: 'Original', secret: 'DO_NOT_DISCLOSE' } }] },
        } } } };
}
function advance(s, minutes = 6000, operation = null) {
    const c = clone(s), time = c.states.atri_lifecycle;
    time.clocks.world += minutes; time.domains.chronology.records[0].value.sequence++;
    time.domains.chronology.records[0].value.calendar.year = 1 + Math.floor(time.clocks.world / 525600);
    c.revision.revisionId = 'rev.' + time.domains.chronology.records[0].value.sequence;
    prepareHistory(s, c, { id: 'wait', verb: 'wait' }, { outcome: 'automatic' }, operation);
    return c;
}
const h = s => s.states.atri_lifecycle.history;
const op = (s, operation, input) => advance(s, 0, { operation, input });
describe('Native tiered history', () => {
    test.each([7, 71, 731])('deterministic seed %i: 1k state-changing turns, bounded tiers and selective recall', seed => {
        let s = fixture(); let early;
        for (let i = 1; i <= 1000; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            s = advance(s, 5760 + seed % 1440);
            if (i === 250) early = historyMetrics(s);
        }
        const late = historyMetrics(s);
        expect(h(s).turns).toBe(1000); expect(s.states.atri_lifecycle.clocks.world).toBeGreaterThan(10 * 525600);
        expect(late.historyBytes).toBeLessThan(early.historyBytes * 1.4);
        expect(late.rawHistoryBytes).toBeLessThan(early.rawHistoryBytes * 1.2);
        expect(h(s).archive.length).toBeLessThan(16);
        expect(JSON.stringify(queryHistory(s, { kind: 'fact' }))).not.toContain('DO_NOT_DISCLOSE');
        expect(queryHistory(s, { facet: 'family', value: 'rook' }).scanned).toBeLessThanOrEqual(4);
    });
    test('database JSON key normalization cannot change ledger equality or posting order', () => {
        const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
            ? Object.fromEntries(Object.keys(value).sort().reverse().map(k => [k, reorder(value[k])])) : value;
        let s = fixture(); for (let i = 0; i < 100; i++) s = advance(s);
        const reordered = reorder(s);
        expect(() => validateHistory(reordered)).not.toThrow();
        expect(queryHistory(reordered, { kind: 'fact' })).toEqual(queryHistory(s, { kind: 'fact' }));
        const page = queryHistory(s, { kind: 'fact', limit: 1 });
        expect(() => queryHistory(reordered, { limit: 1, kind: 'fact', cursor: page.next })).not.toThrow();
        expect(advance(reordered).states.atri_lifecycle.history.facts).toEqual(h(s).facts);
    });
    test('sequence-only/no-op does not count; canonical contradiction and corrupt index fail closed', () => {
        let s = advance(fixture()); const candidate = advance(s, 0);
        expect(h(candidate).turns).toBe(h(s).turns);
        candidate.states.atri_lifecycle.domains.person.records[0].value.identity = 'forged';
        expect(() => validateHistory(candidate)).toThrow('contradicts');
        s = clone(s); h(s).index = {}; expect(() => validateHistory(s)).toThrow('index');
    });
    test('artifact evidence, hooks and marked memory survive a century without mutating world truth', () => {
        let s = advance(fixture()); const fact = Object.values(h(s).facts).find(f => f.public);
        const event = h(s).hot[0];
        s = op(s, 'artifact.create', { kind: 'letter', title: 'First letter', content: 'Attributed statement', sourceId: fact.id, parentId: '' });
        const letter = Object.values(h(s).artifacts)[0];
        s = op(s, 'hook.create', { title: 'Find its author', sourceId: letter.id });
        const hook = Object.values(h(s).hooks)[0];
        s = op(s, 'memory.mark', { id: event.id, marked: true, journaled: true });
        s = op(s, 'artifact.change', { id: letter.id, status: 'lost' });
        s = advance(s, 100 * 525600);
        s = op(s, 'artifact.change', { id: letter.id, status: 'held' });
        s = op(s, 'hook.change', { id: hook.id, status: 'active' });
        expect(h(s).facts[fact.id]).toEqual(fact);
        expect(queryHistory(s, { id: letter.id }).items[0].provenance.map(p => p.status)).toEqual(['held', 'lost', 'held']);
        expect(queryHistory(s, { id: event.id, memory: true }).items[0].memory.clarity).toBe('clear');
        const secret = Object.values(h(s).facts).find(f => !f.public);
        expect(() => op(s, 'artifact.create', { kind: 'letter', title: 'Leak', content: 'Leak', sourceId: secret.id, parentId: '' })).toThrow('unavailable');
        s = op(s, 'artifact.change', { id: letter.id, status: 'destroyed' });
        expect(() => op(s, 'artifact.change', { id: letter.id, status: 'held' })).toThrow();
        expect(() => op(s, 'hook.change', { id: hook.id, status: 'active' })).toThrow();
    });
    test('an archival summary can become a durable hook source after later bin merges', () => {
        let s = fixture(); for (let i = 0; i < 100; i++) s = advance(s);
        const summary = h(s).archive[0];
        s = op(s, 'hook.create', { title: 'Investigate the old interval', sourceId: summary.id });
        for (let i = 0; i < 100; i++) s = advance(s);
        expect(queryHistory(s, { id: summary.id }).items[0].count).toBe(summary.count);
        expect(Object.values(h(s).hooks)[0].sourceId).toBe(summary.id);
        const fact = Object.values(h(s).facts).find(f => !f.public); fact.public = true;
        expect(() => validateHistory(s)).toThrow();
    });
    test('bounded pagination is revision-bound and does not scan unrelated artifacts', () => {
        let s = advance(fixture());
        for (let i = 0; i < 5; i++) s = op(s, 'artifact.create', { kind: 'diary', title: 'Entry ' + i, content: 'An attributed diary', sourceId: '', parentId: '' });
        const first = queryHistory(s, { kind: 'artifact', limit: 2 });
        expect(first.items).toHaveLength(2); expect(first.scanned).toBe(2);
        expect(queryHistory(s, { kind: 'artifact', limit: 2, cursor: first.next }).items[0].id).not.toBe(first.items[0].id);
        expect(() => queryHistory(advance(s), { kind: 'artifact', limit: 2, cursor: first.next })).toThrow('Stale');
        expect(queryHistory(s, { id: 'unknown' }).scanned).toBe(1);
        expect(() => queryHistory(s, { limit: 10000 })).toThrow();
    });
    test('portable checkpoint expires archived retries and protects unrelated tasks', () => {
        let s = fixture(); for (let i = 0; i < 64; i++) s = advance(s);
        s.states.atri_task_results = { records: [{ kind: 'turn', status: 'applied', invocationId: 'old' }, { kind: 'other', status: 'draft' }] };
        s.states.atri_action_receipts = { receipts: [{ authorityId: 'a', idempotencyKey: 'old-key' }, { idempotencyKey: 'ordinary' }] };
        expect(() => checkpointHistory(s, s.states, [], { kind: 'turn' })).toThrow('protected Task');
        s.states.atri_task_results.records.pop();
        s.states.atri_lifecycle.taskTombstones = [{ kind: 'turn', invocationId: 'older' }];
        const result = checkpointHistory(s, s.states, [], { kind: 'turn' });
        expect(result.parentRevisionId).toBeNull(); expect(result.timeline).toEqual([]);
        expect(s.states.atri_task_results.records).toHaveLength(0);
        expect(s.states.atri_lifecycle.taskTombstones).toHaveLength(0);
        expect(retiredInvocation(h(s), 'older')).toBe(true);
        expect(retiredInvocation(h(s), 'old')).toBe(true); expect(retiredInvocation(h(s), 'new')).toBe(false);
        expect(s.states.atri_action_receipts.receipts).toHaveLength(1);
        retireInvocation(h(s), 'other'); expect(retiredInvocation(h(s), 'other')).toBe(true);
        validateHistory(s);
    });
    test('checkpoint retires display-only advice and completed results with exact replay tombstones', () => {
        let s = fixture(); for (let i = 0; i < 64; i++) s = advance(s);
        s.manifest.runtime.experienceContract.taskRuntime = { tasks: [{ id: 'advice', resultPolicy: { resultClass: 'advisory', sink: 'proposal' } }] };
        s.states.atri_task_results = { records: [{ kind: 'task', taskId: 'advice', status: 'draft', invocationId: 'advice-1', fingerprint: 'exact' },
            { kind: 'task', status: 'completed', invocationId: 'display-1' }] };
        checkpointHistory(s, s.states, [], { kind: 'turn' });
        expect(s.states.atri_task_results.records).toEqual([]);
        expect(s.states.atri_lifecycle.taskTombstones).toEqual([expect.objectContaining({ invocationId: 'advice-1', fingerprint: 'exact' }),
            expect.objectContaining({ invocationId: 'display-1' })]);
    });
    test.each(['apply', 'interaction', 'scheduled', 'activity', 'pinned', 'domain', 'timeline', 'task', 'workflow', 'outbox', 'capacity'])('checkpoint preserves %s Task dependencies without mutation', protection => {
        let s = fixture(); for (let i = 0; i < 64; i++) s = advance(s);
        const task = { id: 'advice', resultPolicy: { resultClass: 'advisory', sink: 'proposal' } };
        s.manifest.runtime.experienceContract.taskRuntime = { tasks: [task] };
        const result = { kind: 'task', taskId: 'advice', status: 'draft', invocationId: 'protected' };
        s.states.atri_task_results = { records: [result] };
        if (protection === 'apply') task.resultPolicy.applyCommand = 'update';
        if (protection === 'interaction') s.manifest.runtime.experienceContract.lifecycleRuntime.interactions = [{ taskId: result.taskId }];
        if (protection === 'scheduled') { result.status = 'applied'; s.states.atri_lifecycle.interactions = [{ status: 'scheduled', proposalId: result.invocationId }]; }
        if (protection === 'activity') s.states.atri_lifecycle.activities = [{ status: 'settled', narrativeInvocationId: result.invocationId }];
        if (protection === 'capacity') s.manifest.runtime.experienceContract.lifecycleRuntime.retention = { maxReceipts: 0 };
        if (protection === 'pinned') result.pinned = true;
        if (protection === 'domain') s.states.atri_lifecycle.domains.person.records[0].value.task = result.invocationId;
        if (protection === 'timeline') s.timeline.push({ task: result.invocationId });
        if (protection === 'task') s.states.atri_task_results.records.push({ kind: 'task', status: 'completed', invocationId: 'dependent', payload: { source: result.invocationId } });
        if (protection === 'workflow') s.states.atri_lifecycle.workflows = { active: { status: 'active', taskInvocationId: result.invocationId } };
        if (protection === 'outbox') s.states.atri_lifecycle.outbox = [{ status: 'pending', invocationId: result.invocationId }];
        const before = clone(s);
        expect(() => checkpointHistory(s, s.states, [], { kind: 'turn' })).toThrow(protection === 'capacity' ? 'retention limit' : 'protected Task');
        expect(s).toEqual(before);
    });
    test('strict policy rejects undeclared fact paths and oversized work limits', () => {
        const s = fixture(), policy = s.manifest.runtime.experienceContract.lifecycleRuntime.history;
        const I = { type: 'integer' }, S = { type: 'string' };
        const lifecycle = { clocks: [{ id: 'world' }], domains: [
            { id: 'chronology', recordSchema: { properties: { calendar: { properties: { year: I } }, era_id: S, sequence: I } } },
            { id: 'person', recordSchema: { properties: { identity: S, secret: S } } },
        ] };
        expect(assertHistoryPolicy(policy, lifecycle)).toEqual(policy);
        expect(() => assertHistoryPolicy({ ...policy, hot: 10000 }, lifecycle)).toThrow();
        const bad = clone(policy); bad.sources[0].path = ['missing']; expect(() => assertHistoryPolicy(bad, lifecycle)).toThrow();
    });
});
