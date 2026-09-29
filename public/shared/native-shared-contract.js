import { fields } from './native-values.js';
import { assertLifecycleJson } from './native-lifecycle-contract.js';
import { assertContinuityRuntime } from './native-continuity-contract.js';
import { taskId } from './native-task-contract.js';

export const SHARED_NAMESPACE = 'atri_shared';
export const REALM_TRANSFER_NAMESPACE = 'atri_realm_transfers';
export function assertSharedRuntime(raw, lifecycle, information, continuity) {
    const value = assertLifecycleJson(raw);
    fields(value, ['schemaVersion', 'seats', 'rules', 'realm'], 'Shared runtime');
    if (value.schemaVersion !== 1 || !lifecycle || !information) throw new TypeError('Shared runtime requires lifecycle and information contracts');
    if (!Array.isArray(value.seats) || !value.seats.length || value.seats.length > 32) throw new TypeError('Shared seat limit');
    for (const seat of value.seats) {
        fields(seat, ['id', 'actorId', 'scopeId', 'viewIds', 'ruleIds', 'realmViewIds', 'realmCommands'], 'Shared seat'); taskId(seat.id);
        const actor = information.actors.find(item => item.id === seat.actorId);
        if (!actor || actor.scopeId !== seat.scopeId) throw new TypeError('Shared seat requires exact Actor scope');
        for (const key of ['viewIds', 'ruleIds']) if (!Array.isArray(seat[key]) || seat[key].length > 16 || new Set(seat[key]).size !== seat[key].length) throw new TypeError('Shared seat grants limit');
        for (const id of seat.viewIds) {
            const view = information.views.find(item => item.id === id);
            if (!view || view.actorId !== seat.actorId || !view.exposure.includes('display')) throw new TypeError('Shared view requires explicit Actor display grant');
            if (view.sources.some(id => information.sources.find(source => source.id === id).scopeId !== seat.scopeId)) throw new TypeError('Shared view must stay within Scene Scope');
        }
        if (seat.realmViewIds !== undefined && (!Array.isArray(seat.realmViewIds) || seat.realmViewIds.length > 16
            || new Set(seat.realmViewIds).size !== seat.realmViewIds.length || seat.realmViewIds.some(id => !value.realm?.views?.some(view => view.id === id)))) throw new TypeError('Shared Realm display grants required');
        if (seat.realmCommands !== undefined) {
            if (!Array.isArray(seat.realmCommands) || seat.realmCommands.length > 16) throw new TypeError('Shared Realm Command grant limit');
            for (const grant of seat.realmCommands) {
                fields(grant, ['domainId', 'commandId'], 'Shared Realm Command grant');
                if (!value.realm?.domains?.find(d => d.id === grant.domainId)?.commands?.some(c => c.id === grant.commandId)) throw new TypeError('Unknown Shared Realm Command grant');
            }
        }
    }
    if (new Set(value.seats.map(s => s.id)).size !== value.seats.length || new Set(value.seats.map(s => s.actorId)).size !== value.seats.length) throw new TypeError('Duplicate Shared seat/Actor');
    if (!Array.isArray(value.rules) || value.rules.length > 32) throw new TypeError('Shared rule limit');
    for (const rule of value.rules) {
        fields(rule, ['id', 'domainId', 'commandId', 'roll'], 'Shared rule'); taskId(rule.id);
        const domain = lifecycle.domains.find(item => item.id === rule.domainId);
        const command = domain?.commands.find(item => item.id === rule.commandId);
        if (!command) throw new TypeError('Shared rule requires typed App Command');
        if (rule.roll !== undefined) {
            fields(rule.roll, ['argument', 'sides'], 'Shared roll');
            const schema = command.argsSchema.properties[rule.roll.argument];
            if (!Number.isSafeInteger(rule.roll.sides) || rule.roll.sides < 2 || rule.roll.sides > 1000000 || schema?.type !== 'integer'
                || (schema.minimum ?? 1) > 1 || (schema.maximum ?? rule.roll.sides) < rule.roll.sides) throw new TypeError('Shared roll requires bounded integer argument');
        }
    }
    if (new Set(value.rules.map(r => r.id)).size !== value.rules.length) throw new TypeError('Duplicate Shared rule');
    for (const seat of value.seats) for (const id of seat.ruleIds) {
        const rule = value.rules.find(item => item.id === id);
        if (!rule || lifecycle.domains.find(item => item.id === rule.domainId).scopeId !== seat.scopeId) throw new TypeError('Shared rule grant outside seat scope');
    }
    if (value.realm !== undefined) {
        assertContinuityRuntime(value.realm, lifecycle);
        const playerDomains = new Set((continuity?.transfers ?? []).map(item => item.sessionDomainId));
        if (value.realm.transfers.some(item => playerDomains.has(item.sessionDomainId))) throw new TypeError('Player and Realm require distinct Session transfer endpoints');
    }
    return value;
}
