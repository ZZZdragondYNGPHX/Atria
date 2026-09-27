import { fields } from '../scripts/native/experience/ui/v2-values.js';
import { assertLifecycleJson, assertLifecycleRuntime } from './native-lifecycle-contract.js';
import { taskId } from './native-task-contract.js';

export const CONTINUITY_SESSION_NAMESPACE = 'atri_transfers';
export function assertContinuityRuntime(raw, lifecycle) {
    if (!lifecycle) throw new TypeError('Continuity requires lifecycleRuntime');
    const value = assertLifecycleJson(raw);
    fields(value, ['schemaVersion', 'domains', 'transfers', 'views'], 'Continuity runtime');
    if (value.schemaVersion !== 1) throw new TypeError('Continuity version');
    if (!Array.isArray(value.domains) || value.domains.length > 16 || !value.domains.length) throw new TypeError('Continuity domain limit');
    for (const domain of value.domains) fields(domain, ['id', 'schemaVersion', 'recordSchema', 'initial', 'commands', 'retention'], 'Continuity domain');
    // Reuse the same closed schemas, Command/Event/Reducer compiler and retention
    // contract. Continuity has its own logical Revision time, no World clock.
    const normalized = assertLifecycleRuntime({ schemaVersion: 1, scopes: [{ id: 'player', kind: 'session' }],
        domains: value.domains.map(domain => ({ ...domain, scopeId: 'player' })), clocks: [], advances: [],
        interactions: [], automations: [], workflows: [], retention: { maxTaskResults: 1, maxReceipts: 2048 } });
    const domains = normalized.domains.map(({ scopeId: _scopeId, ...domain }) => domain);
    if (!Array.isArray(value.transfers) || value.transfers.length > 32) throw new TypeError('Continuity transfer limit');
    const transfers = value.transfers.map(transfer => {
        fields(transfer, ['id', 'sessionDomainId', 'continuityDomainId'], 'Continuity transfer'); taskId(transfer.id);
        const session = lifecycle?.domains.find(domain => domain.id === transfer.sessionDomainId);
        const player = domains.find(domain => domain.id === transfer.continuityDomainId);
        if (!session || !player) throw new TypeError('Transfer requires declared Session and Continuity domains');
        if (player.commands.length) throw new TypeError('Transfer domain accepts ownership transfers only');
        return transfer;
    });
    if (new Set(transfers.map(item => item.id)).size !== transfers.length || new Set(transfers.map(item => item.sessionDomainId)).size !== transfers.length) throw new TypeError('Duplicate transfer endpoint');
    if (!Array.isArray(value.views) || value.views.length > 16) throw new TypeError('Continuity view limit');
    const views = value.views.map(view => {
        fields(view, ['id', 'domainId', 'fields', 'maxItems'], 'Continuity display view'); taskId(view.id);
        const domain = domains.find(domain => domain.id === view.domainId);
        if (!domain || !Array.isArray(view.fields) || !view.fields.length || new Set(view.fields).size !== view.fields.length
            || view.fields.some(field => !Object.hasOwn(domain.recordSchema.properties, field))) throw new TypeError('Continuity fields must be explicitly declared');
        if (!Number.isSafeInteger(view.maxItems) || view.maxItems < 1 || view.maxItems > 128) throw new TypeError('Continuity view bound');
        return view;
    });
    if (new Set(views.map(item => item.id)).size !== views.length) throw new TypeError('Duplicate Continuity view');
    return { schemaVersion: 1, domains, transfers, views };
}
