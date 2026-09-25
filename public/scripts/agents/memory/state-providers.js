// SPDX-License-Identifier: AGPL-3.0-or-later
// Optional adapters. Pinned source contracts and runtime boundaries: Phase 6 record.
import { sourceContent } from './source-provenance.js';
import { buildNativeKnowledgeStateProviders } from '../../native/knowledge-runtime.js';
const PREPARE_EVENT = 'prompt_template_prepare';
const blocked = new Set(['__proto__', 'constructor', 'prototype']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const mvuCommits = new WeakMap();

function flatten(value, path = [], result = []) {
    if (result.length >= 256 || path.length > 12) return result;
    if (value && typeof value === 'object') {
        for (const key of Object.keys(value).sort()) {
            if (!blocked.has(key) && !key.startsWith('$')) flatten(value[key], [...path, key], result);
        }
    } else if (path.length && ['string', 'number', 'boolean'].includes(typeof value) || path.length && value === null) {
        if (JSON.stringify(value).length <= 2000) result.push({ path, value });
    }
    return result;
}

function fieldsFor(state, providerId, settings) {
    const mappings = Array.isArray(settings.memoryOsStateMappings) ? settings.memoryOsStateMappings : [];
    return flatten(state).map(field => {
        const mapping = mappings.find(item => item?.providerId === providerId && JSON.stringify(item.path) === JSON.stringify(field.path));
        const key = String(mapping?.key || `${providerId}:${JSON.stringify(field.path)}`).slice(0, 500);
        return { ...field, label: String(mapping?.label || field.path.join('.')).slice(0, 200), key,
            owner: settings.memoryOsStateOwners?.[key] || null,
            entityId: typeof mapping?.entityId === 'string' ? mapping.entityId : null,
            predicate: typeof mapping?.predicate === 'string' ? mapping.predicate : null,
            remember: mapping?.remember === true };
    });
}

/** Reads detached committed state; never runs parsers or replaces variables. */
export function readStateProviders(context, settings = {}, host = globalThis) {
    const nativeProviders = context?.nativeSnapshot
        ? buildNativeKnowledgeStateProviders(context.nativeSnapshot)
        : [];
    const chat = context.chat || [];
    const floor = chat.findLastIndex(message => !message.is_user && !message.is_system);
    const mvu = host.Mvu;
    let mv = { providerId: 'mvu', status: 'absent', fields: [] };
    if (typeof mvu?.getMvuData === 'function') {
        try {
            if (mvu.isDuringExtraAnalysis?.()) mv.status = 'initializing';
            else {
                const data = floor >= 0 ? mvu.getMvuData({ type: 'message', message_id: floor }) : null;
                let chats = mvuCommits.get(mvu);
                if (!chats) { chats = new WeakMap(); mvuCommits.set(mvu, chats); }
                let floors = chats.get(chat);
                if (!floors) { floors = new Map(); chats.set(chat, floors); }
                const message = chat[floor];
                const raw = message?.variables?.[message.swipe_id || 0];
                const last = floors.get(floor);
                const committedSource = last && raw && last.raw !== raw ? sourceContent(message) : last?.committedSource || null;
                floors.set(floor, { raw, committedSource });
                // The getter reads the persisted message table. UPDATE_ENDED payloads
                // are mutable pre-commit data and are deliberately not consumed.
                mv = { ...mv, status: object(data?.stat_data) && object(data?.schema) ? 'ready' : 'initializing',
                    fields: object(data?.stat_data) ? fieldsFor(data.stat_data, 'mvu', settings) : [], floor,
                    committedSource,
                    revision: JSON.stringify([data?.stat_data, data?.schema]), contract: 'MagVarUpdate.getMvuData/message' };
            }
        } catch { mv.status = 'error'; mv.fields = []; }
    }
    let lore = { providerId: 'lorestate', status: 'absent', fields: [] };
    const bus = context.eventSource;
    // Verified Atria synchronous dispatch -> Tavern Helper wrapper -> LoreState
    // synchronous read-only prepare handler. No template execution or private slot.
    if (typeof bus?.emitAndWait === 'function' && bus.getListenersMeta?.(PREPARE_EVENT)?.length) {
        try {
            const request = { chatId: context.getCurrentChatId?.(), runType: 'generate',
                generateType: context.memoryOsGenerationType || 'normal' };
            bus.emitAndWait(PREPARE_EVENT, request);
            const api = request.LoreState;
            if (api && typeof api.ready === 'boolean' && typeof api.get === 'function' && object(api.state)) {
                const status = api.ready ? 'ready' : ['busy', 'uninitialized', 'generation-untracked'].includes(api.reason) ? 'initializing' : 'error';
                lore = { providerId: 'lorestate', status, fields: api.ready ? fieldsFor(api.state, 'lorestate', settings) : [],
                    floor, revision: JSON.stringify([api.reason, api.state]), contract: 'LoreState.readonly-prepare/v1' };
            }
        } catch { lore.status = 'error'; }
    }
    return [...nativeProviders, mv, lore];
}

/** Explicit field ownership; provider names alone never choose a winner. */
export function resolveProviderFields(providers, owners = {}) {
    const groups = new Map();
    for (const provider of providers.filter(item => item.status === 'ready')) {
        for (const field of provider.fields) {
            const list = groups.get(field.key) || [];
            list.push({ ...field, providerId: provider.providerId, snapshotId: provider.snapshotId });
            groups.set(field.key, list);
        }
    }
    return [...groups].map(([key, claims]) => {
        const owner = owners[key] || claims[0].owner;
        const selected = claims.filter(claim => !owner || claim.providerId === owner);
        const distinct = new Set(selected.map(claim => JSON.stringify(claim.value)));
        return { key, status: selected.length && distinct.size === 1 ? 'ready' : 'conflict', claims: selected.length ? selected : claims };
    });
}
