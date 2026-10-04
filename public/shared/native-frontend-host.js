import { CHRONICLE_QUERY, CHRONICLE_PAGE, WORLD_QUERY, INTERVAL_QUERY, INTERVAL_RESULT } from './native-chronicle-host.js';
import { fields } from './native-frontend-contract.js';
import { assertMessageProjection } from './native-message-contract.js';

const string = maxLength => ({ type: 'string', maxLength });
export const hostObject = (properties = {}, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
export const HOST_EMPTY = hostObject();
const id = string(128), text = string(65536), number = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
export const MESSAGE_SCHEMA = hostObject({ messageId: id, sequence: number, role: string(16), content: text, actorId: id, predecessorId: id, branchId: id, revisionId: id });
export const SESSION_SCHEMA = hostObject({ sessionId: id, branchId: id, revisionId: id, tailMessageId: id });
export const GENERATION_SCHEMA = hostObject({ state: { ...string(16), enum: ['idle', 'preparing', 'streaming', 'finalizing', 'cancelling', 'failed'] }, text, error: string(128) });
export const MEDIA_REF_SCHEMA = hostObject({ kind: { ...string(16), enum: ['exact', 'declared', 'host'] }, id: string(64) });
const localeSchema = hostObject({ locale: string(64), direction: { ...string(3), enum: ['ltr', 'rtl'] } });
export const BRANCH_SCHEMA = hostObject({ branchId: id, parentBranchId: id, revisionId: id, predecessorId: id });
const saveSchema = hostObject({ saveId: id, revisionId: id, branchId: id, displayName: string(256), createdAt: number });
const rows = items => ({ type: 'array', items, maxItems: 10000 });
const read = (outputSchema, local = false, collection = false) => ({ kind: 'read', inputSchema: HOST_EMPTY, outputSchema, local, collection });
const action = (inputSchema = HOST_EMPTY, local = false, outputSchema = HOST_EMPTY) => ({ kind: 'action', inputSchema, outputSchema, local });
// Closed Host-owned target catalogue. These are capabilities, never arbitrary
// method dispatch; both authoring and installed graph validation use this table.
const targets = {
    'host.world.view': { ...read(CHRONICLE_PAGE), inputSchema: WORLD_QUERY },
    'host.history.query': { ...read(CHRONICLE_PAGE), inputSchema: CHRONICLE_QUERY },
    'host.chronology.interval': { ...read(INTERVAL_RESULT), inputSchema: INTERVAL_QUERY },
    'host.media.resolve': { ...read(hostObject({ ref: MEDIA_REF_SCHEMA, status: { ...string(16), enum: ['available', 'denied', 'unavailable'] }, reasonCode: string(128) }), true), inputSchema: hostObject({ ref: MEDIA_REF_SCHEMA, type: { ...string(8), enum: ['image', 'audio', 'video'] } }) },
    'host.presentation.locale': read(localeSchema, true),
    'host.presentation.setLocale': action(hostObject({ locale: string(64) }), true, localeSchema),
    'host.presentation.announce': action(hostObject({ text: string(4096) }), true),
    'host.conversation.messages': read(MESSAGE_SCHEMA, false, true),
    'host.conversation.status': read(SESSION_SCHEMA),
    'host.conversation.branches': read(BRANCH_SCHEMA, false, true),
    'host.conversation.alternatives': read(hostObject({ ...MESSAGE_SCHEMA.properties, alternativeBranchId: id }), false, true),
    'host.conversation.inspect': { ...read(rows(MESSAGE_SCHEMA)), inputSchema: hostObject({ revisionId: id }) },
    'host.conversation.retryStatus': { ...read(hostObject({ messageId: id, eligible: { type: 'boolean' }, reason: string(512) })), inputSchema: hostObject({ messageId: id }, []) },
    'host.conversation.retry': action(hostObject({ messageId: id })),
    'host.conversation.fork': action(hostObject({ revisionId: id, messageId: id }, ['revisionId'])),
    'host.conversation.switch': action(hostObject({ branchId: id })),
    'host.conversation.generation': read(GENERATION_SCHEMA, true),
    'host.conversation.cancel': action(HOST_EMPTY, true),
    'host.conversation.regenerate': action(hostObject({ messageId: id }), true),
    'host.composer.get': read(hostObject({ text }), true),
    'host.composer.set': action(hostObject({ text }), true),
    'host.composer.append': action(hostObject({ text }), true),
    'host.composer.clear': action(HOST_EMPTY, true),
    'host.composer.focus': action(HOST_EMPTY, true),
    'host.composer.submit': action(HOST_EMPTY, true),
    'host.session.status': read(SESSION_SCHEMA),
    'host.session.begin': action(hostObject({ inputJson: string(65536), invocationId: id })),
    'host.session.run': read(hostObject({ runId: id, mode: string(16), status: string(16), sequence: number, cleanup: string(16) })),
    'host.session.saves': read(saveSchema, false, true),
    'host.session.save': action(hostObject({ displayName: string(256) }, []), false, saveSchema),
    'host.session.restore': action(hostObject({ saveId: id })),
    'host.session.reload': action(HOST_EMPTY, true),
    'host.session.recover': action(HOST_EMPTY, true),
    'host.session.exit': action(HOST_EMPTY, true),
    'host.session.restart': action(HOST_EMPTY, true),
    'host.session.diagnostics': read(hostObject({ ...SESSION_SCHEMA.properties, failed: { type: 'boolean' }, historical: { type: 'boolean' } }), true),
};
export function fixedHostTarget(target, blockSchema) {
    fields(target, ['service', 'method', 'blockType']);
    const key = target.service + '.' + target.method;
    if (key === 'host.conversation.blocks') {
        if (!/^[a-z][a-z0-9._-]{0,63}$/.test(target.blockType) || blockSchema?.type !== 'object') throw new TypeError('Typed block schema required');
        return read(hostObject({ id, messageId: id, sequence: number, type: id, version: number, data: blockSchema }), false, true);
    }
    if (target.blockType !== undefined || !Object.hasOwn(targets, key)) throw new TypeError('Unknown fixed Host target');
    return structuredClone(targets[key]);
}
export function projectConversation(snapshot) {
    return (snapshot.timeline ?? []).map((entry, sequence, all) => ({ messageId: entry.messageId, sequence, role: entry.role,
        content: entry.content, actorId: entry.actorId ?? '', predecessorId: all[sequence - 1]?.messageId ?? '',
        branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId }));
}
export function projectSession(snapshot) {
    return { sessionId: snapshot.session.sessionId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId, tailMessageId: snapshot.timeline.at(-1)?.messageId ?? '' };
}
export function projectMessageBlocks(snapshot, type) {
    return snapshot.timeline.flatMap(entry => {
        const variant = snapshot.variants?.find(item => item.variantId === entry.activeVariantId);
        const projection = entry.projection ?? variant?.projection;
        if (!projection) return [];
        return assertMessageProjection(projection, entry.content).flow.flatMap((block, sequence) => block.kind === 'block' && (type === undefined || block.type === type)
            ? [{ id: entry.messageId + ':' + block.id, messageId: entry.messageId, sequence, type: block.type, version: block.version, data: block.data }] : []);
    });
}
export function projectSave(save) {
    return { saveId: save.saveId, revisionId: save.revisionId, branchId: save.branchId, displayName: save.displayName ?? '', createdAt: save.createdAt };
}
