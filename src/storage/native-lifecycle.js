import { NATIVE_RESOURCE_KINDS as K } from '../native/contracts.js';
import { inRecoveryPublication } from '../native/recovery-roots.js';
import { personaFields, personaHash } from '../native/persona-contract.js';

/** Default runtime repositories share the management lifecycle, including
 * non-HTTP consumers. Recovery still invokes their original domain deletion. */
export function installNativeLifecycle(engine, { sessions, packages, worlds, knowledge, personas }, recycle = null) {
    function wrap(repo, method, kind, field, type, targetFor, response = () => true) {
        const remove = repo[method].bind(repo);
        repo[method] = async (handle, ...args) => {
            if (inRecoveryPublication()) return remove(handle, ...args);
            const target = targetFor ? targetFor(args) : { type, id: args[0], ...args[1] };
            const row = await engine.withTransaction(handle, tx => tx.getResource({ kind, handle, [field]: target.id }));
            if (!row?.doc) return remove(handle, ...args);
            const recycleNativeResource = recycle || (await import('./center-instance.js')).recycleNativeResource;
            await recycleNativeResource(handle, target);
            return response(target);
        };
    }
    wrap(sessions, 'delete', K.session, 'sessionId', 'session');
    wrap(packages, 'delete', K.package, 'packageId', 'package');
    wrap(worlds, 'delete', K.world, 'worldId', 'world');
    wrap(knowledge, 'delete', K.knowledgeBase, 'knowledgeBaseId', 'knowledge');
    wrap(knowledge, 'deleteBinding', K.knowledgeBinding, 'knowledgeBindingId', 'binding');
    wrap(personas, 'delete', K.persona, 'personaId', 'persona', ([input]) => {
        personaFields(input, ['personaId', 'expectedFingerprint']);
        personaHash(input.expectedFingerprint);
        return { type: 'persona', id: input.personaId, expectedFingerprint: input.expectedFingerprint };
    }, target => ({ deleted: true, personaId: target.id }));
}
