import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Diagnostic only: imports independent Core test fixtures; never included in
// the Package archive. PASS confirms the current contract limitation, NOT P2.
const argv = process.argv.slice(2);
assert.equal(argv[0], '--core', 'Usage: node tools/probe-conditional-fortune.mjs --core <main-checkout>');
assert(argv[1]);
const core = path.resolve(argv[1]);
const load = relative => import(pathToFileURL(path.join(core, relative)).href);
const { authorityCandidateFixture } = await load('tests/native/helpers/authority-candidate-fixture.js');
const { prepareAuthorityTransaction } = await load('src/native/authority-transaction.js');
const { compileTransactionDeclarations } = await load('public/scripts/native/experience/logic/transactions.js');
const f = authorityCandidateFixture(({ logic }) => {
    const t = logic.transactions[0];
    t.validators = [];
    t.effects = [];
    t.resolution = { kind: 'bounded_fortune', sides: 3, cases: [
        { id: 'automatic', when: 'reads.note.text == "unopposed"', outcome: 'automatic' },
        { id: 'impossible', when: 'reads.note.text == "ineligible"', outcome: 'impossible' },
        { id: 'clean', when: 'resolution.roll == 3', outcome: 'clean' },
    ], fallback: 'costly' };
    t.receipt = { schema: { type: 'object', additionalProperties: false,
        properties: { outcome: { type: 'string', maxLength: 64 }, roll: { type: 'integer', minimum: 1, maximum: 3 } },
        required: ['outcome', 'roll'] },
        projection: { outcome: { formula: 'resolution.outcome' }, roll: { formula: 'resolution.roll' } }, maxBytes: 1024 };
});
const compile = logic => compileTransactionDeclarations(logic, { experienceContract: f.contract });
compile(f.logic);
f.sync();
const observations = [];
for (const [state, expected] of [['unopposed', 'automatic'], ['ineligible', 'impossible'], ['opposed', null]]) {
    f.base.states.atri_lifecycle.domains.notes.records[0].value.text = state;
    const before = structuredClone(f.base);
    const result = await prepareAuthorityTransaction(f.base, f.installed, f.request);
    if (expected) assert.equal(result.receipt.result.outcome, expected);
    assert(Number.isInteger(result.receipt.result.roll));
    assert(result.receipt.result.roll >= 1 && result.receipt.result.roll <= 3);
    assert.deepEqual(f.base, before, 'Probe must not mutate source authority');
    const retry = await prepareAuthorityTransaction(f.base, f.installed, f.request);
    assert.deepEqual(retry.receipt, result.receipt, 'Same-anchor retry remains deterministic');
    observations.push({ state, ...result.receipt.result });
}
const rejected = [];
const reject = (label, change, pattern) => {
    const logic = structuredClone(f.logic);
    change(logic);
    assert.throws(() => compile(logic), pattern);
    rejected.push(label);
};
reject('resolution.when is not a supported conditional-draw field', logic => {
    logic.transactions[0].resolution.when = 'reads.note.text == "opposed"';
}, /unknown field/i);
reject('resolution.kind cannot be selected by an authority formula', logic => {
    logic.transactions[0].resolution.kind = { formula: 'reads.note.text == "opposed"' };
}, /Unknown Transaction Resolution policy/);
reject('same verb cannot dispatch to deterministic and Fortune transactions', logic => {
    const t = structuredClone(logic.transactions[0]);
    t.id = 'note.automatic';
    t.resolution = { kind: 'deterministic', cases: [], fallback: 'automatic' };
    delete t.receipt.schema.properties.roll;
    t.receipt.schema.required = ['outcome'];
    delete t.receipt.projection.roll;
    logic.transactions.push(t);
}, /Duplicate Transaction verb/);
console.log(JSON.stringify({ status: 'CONFIRMED_CONTRACT_LIMITATION_NOT_P2_PASS',
    coreHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: core, encoding: 'utf8' }).trim(),
    observations, rejected,
    scope: 'In-process private preparation and declaration compilation only; no installation, save-container or provider test.' }, null, 2));
