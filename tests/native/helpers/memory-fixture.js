import { installAppraisalFixture } from './appraisal-fixture.js';
import { memoryStateSchema } from '../../../public/shared/native-memory-contract.js';
import { appraisalStateSchema } from '../../../public/shared/native-appraisal-contract.js';
import { projectInformation } from '../../../public/shared/native-information-runtime.js';
import { informationItemFingerprint } from '../../../public/shared/native-cognition-runtime.js';
import { hashNativeDocument } from '../../../src/native/repositories/common.js';

export async function installMemoryFixture(h, { mode = 'light', configure = null } = {}) {
    const f = await installAppraisalFixture(h, { publicAppraisal: true, configure: setup => {
        const { fixture, contract, actorId } = setup, info = contract.informationRuntime;
        fixture.manifest.entryPoints[0].initialTimeline[0].content = '阿岚与沈墨曾约定在下次询问时归还蓝封面书。';
        const initial = { actor: actorId, text: 'Memory baseline', status: 'active', recordedAt: 0, role: 'detail', clarity: 'clear', use: 'willing',
            basis: contract.lifecycleRuntime.domains.find(domain => domain.id === 'emotions').initial.basis,
            applicability: { goalId: '', until: 0, exceptionRefs: [] } };
        const actionInitial = { actor: actorId, text: 'Action baseline', basis: initial.basis };
        const actionSchema = { type: 'object', properties: { actor: { type: 'string', maxLength: 64 }, text: { type: 'string', maxLength: 2048 }, basis: appraisalStateSchema().properties.basis }, required: ['actor', 'text', 'basis'], additionalProperties: false };
        for (const [id, schema, value] of [['experiences', memoryStateSchema(), initial], ['actions', actionSchema, actionInitial]]) {
            contract.lifecycleRuntime.domains.push({ id, scopeId: 'session', schemaVersion: 1, recordSchema: schema, initial: value,
                commands: [{ id: 'save', argsSchema: schema, event: id + '.saved', assign: Object.fromEntries(Object.keys(value).map(key => [key, { formula: 'args.' + key }])) }],
                retention: { maxItems: 32, maxLogicalBytes: 262144, keepPinned: true, keepReferenced: true } });
        }
        const source = { id: 'experiences', kind: 'application', semantic: 'memory', domainId: 'experiences', scopeId: 'session', actorField: 'actor', statusField: 'status',
            fields: ['text', 'role', 'recordedAt', 'clarity', 'use', 'applicability'].map(field => [field]), memoryPolicy: { id: 'author-memory', revision: 'v1', mode, clockId: 'world', fadeAfter: 3 } };
        info.sources.push(source, { ...source, id: 'public-experiences', fields: [['text']] },
            { id: 'actions', kind: 'application', semantic: 'truth', domainId: 'actions', scopeId: 'session', actorField: 'actor', fields: [['text']], causalBasis: true });
        for (const view of info.views.filter(view => view.exposure.includes('context'))) {
            view.sources.push('history', 'experiences', 'actions'); view.memory = true;
        }
        info.views.find(view => view.id === 'player').sources.push('public-experiences', 'actions', 'history');
        configure?.(setup);
    } });
    let serial = 0;
    const load = () => f.core.load(h.handle, f.current().session.sessionId);
    const basis = async ids => {
        const projection = projectInformation(await load(), 'actor', { purpose: 'context', includeRollups: false });
        return { viewId: 'actor', anchor: projection.anchor, sourceRefs: ids.map(id => {
            const item = projection.items.find(item => item.id === id);
            if (!item) throw new Error('Fixture source unavailable: ' + id);
            return { itemId: id, fingerprint: informationItemFingerprint(item) };
        }) };
    };
    const write = async (domainId, recordId, args) => {
        const base = await load(), domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === domainId);
        return f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 's20-write-' + ++serial,
            action: { kind: 'app.command', domainId, recordId, commandId: 'save', args: { ...domain.initial, ...args } } }, { expectedRevisionId: base.revision.revisionId });
    };
    const memory = async (id, extra = {}, ids = null) => write('experiences', id,
        { text: '阿岚记得曾与沈墨约定下次询问时归还蓝封面书。', basis: await basis(ids ?? ['history:' + (await load()).timeline[0].messageId]), ...extra });
    const appraise = async () => {
        const base = await load(), domain = base.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === 'emotions');
        return write('emotions', 'relief', { dimension: 'relief', level: 20, text: '听到澄清后，阿岚稍感释然。', rationale: '获准的直接澄清。',
            basis: await basis(['events:contact']), appraisal: { ...domain.initial.appraisal, previousHash: hashNativeDocument(domain.initial) } });
    };
    return { ...f, load, basis, write, memory, appraise };
}
