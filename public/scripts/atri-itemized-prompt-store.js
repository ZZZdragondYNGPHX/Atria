/**
 * P-02 prompt-diagnostics persistence.
 *
 * Keeps a small per-chat index resident while prompt bodies live in
 * independent localForage records. The old SillyTavern_Prompts layout stored
 * the whole diagnostics array at key <chatId>; migration is lazy, preserves
 * that key, and can be explicitly rolled back by rematerializing the current
 * records into the legacy array.
 */

export const ITEMIZED_PROMPT_INDEX_VERSION = 1;
export const ITEMIZED_PROMPT_INDEX_PREFIX = 'atri:p2:index:';
export const ITEMIZED_PROMPT_RECORD_PREFIX = 'atri:p2:record:';

function normalizeChatId(chatId) {
    return String(chatId || '').trim();
}

function safeMesId(value) {
    const mesId = Number(value);
    return Number.isInteger(mesId) && mesId >= 0 ? mesId : null;
}

function encodeKeyPart(value) {
    return encodeURIComponent(String(value));
}

export function getItemizedPromptIndexKey(chatId) {
    return `${ITEMIZED_PROMPT_INDEX_PREFIX}${encodeKeyPart(normalizeChatId(chatId))}`;
}

export function getItemizedPromptRecordKey(chatId, recordId) {
    return `${ITEMIZED_PROMPT_RECORD_PREFIX}${encodeKeyPart(normalizeChatId(chatId))}:${encodeKeyPart(recordId)}`;
}

export function normalizeItemizedPromptIndex(entries) {
    if (!Array.isArray(entries)) return [];
    const byMessage = new Map();
    for (const entry of entries) {
        const mesId = safeMesId(entry?.mesId);
        const recordId = String(entry?.recordId || '').trim();
        if (mesId === null || !recordId) continue;
        byMessage.set(mesId, {
            mesId,
            recordId,
            hasRawPrompt: Boolean(entry?.hasRawPrompt),
        });
    }
    return [...byMessage.values()].sort((a, b) => a.mesId - b.mesId);
}

export function swapItemizedPromptIndexMessageIds(entries, sourceMessageId, targetMessageId) {
    const source = safeMesId(sourceMessageId);
    const target = safeMesId(targetMessageId);
    const next = normalizeItemizedPromptIndex(entries);
    if (source === null || target === null || source === target) return next;
    for (const entry of next) {
        if (entry.mesId === source) entry.mesId = target;
        else if (entry.mesId === target) entry.mesId = source;
    }
    return normalizeItemizedPromptIndex(next);
}

export function deleteItemizedPromptIndexMessage(entries, messageId) {
    const deleted = safeMesId(messageId);
    const current = normalizeItemizedPromptIndex(entries);
    if (deleted === null) return { entries: current, removedRecordIds: [] };
    const removedRecordIds = current
        .filter(entry => entry.mesId === deleted)
        .map(entry => entry.recordId);
    const next = current
        .filter(entry => entry.mesId !== deleted)
        .map(entry => ({
            ...entry,
            mesId: entry.mesId > deleted ? entry.mesId - 1 : entry.mesId,
        }));
    return {
        entries: normalizeItemizedPromptIndex(next),
        removedRecordIds,
    };
}

export class ItemizedPromptStore {
    constructor(storage, {
        now = () => Date.now(),
        makeRecordId = null,
        migrationBatchSize = 32,
    } = {}) {
        if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
            throw new TypeError('ItemizedPromptStore requires a localForage-compatible storage adapter.');
        }
        this.storage = storage;
        this.now = now;
        this.sequence = 0;
        this.makeRecordId = makeRecordId || ((chatId, mesId) => {
            this.sequence += 1;
            return `${mesId}-${this.now().toString(36)}-${this.sequence.toString(36)}`;
        });
        this.migrationBatchSize = Math.max(1, Math.floor(Number(migrationBatchSize) || 32));
    }

    async #readCurrentIndex(chatId) {
        const id = normalizeChatId(chatId);
        if (!id) return null;
        const raw = await this.storage.getItem(getItemizedPromptIndexKey(id));
        if (!raw || raw.version !== ITEMIZED_PROMPT_INDEX_VERSION || !Array.isArray(raw.entries)) {
            return null;
        }
        return normalizeItemizedPromptIndex(raw.entries);
    }

    async persistIndex(chatId, entries) {
        const id = normalizeChatId(chatId);
        if (!id) return [];
        const normalized = normalizeItemizedPromptIndex(entries);
        await this.storage.setItem(getItemizedPromptIndexKey(id), {
            version: ITEMIZED_PROMPT_INDEX_VERSION,
            entries: normalized,
        });
        return normalized;
    }

    async #writeRecordBatch(chatId, records) {
        for (let offset = 0; offset < records.length; offset += this.migrationBatchSize) {
            const batch = records.slice(offset, offset + this.migrationBatchSize);
            await Promise.all(batch.map(({ recordId, record }) => (
                this.storage.setItem(getItemizedPromptRecordKey(chatId, recordId), record)
            )));
        }
    }

    async loadIndex(chatId) {
        const id = normalizeChatId(chatId);
        if (!id) return [];

        const current = await this.#readCurrentIndex(id);
        if (current) return current;

        // Lazy one-time migration. The old full-array key is deliberately
        // preserved so migration is reversible and old diagnostics remain
        // accessible even if the new layout later needs to be rolled back.
        const legacy = await this.storage.getItem(id);
        if (!Array.isArray(legacy) || legacy.length === 0) {
            return [];
        }

        const records = [];
        const summaries = [];
        const seen = new Map();
        for (const rawRecord of legacy) {
            const mesId = safeMesId(rawRecord?.mesId);
            if (mesId === null || !rawRecord || typeof rawRecord !== 'object') continue;
            const recordId = seen.get(mesId)?.recordId || this.makeRecordId(id, mesId);
            const summary = {
                mesId,
                recordId,
                hasRawPrompt: Boolean(rawRecord.rawPrompt),
            };
            seen.set(mesId, summary);
        }

        for (const summary of [...seen.values()].sort((a, b) => a.mesId - b.mesId)) {
            const rawRecord = [...legacy].reverse().find(record => safeMesId(record?.mesId) === summary.mesId);
            records.push({ recordId: summary.recordId, record: structuredClone(rawRecord) });
            summaries.push(summary);
        }

        await this.#writeRecordBatch(id, records);
        await this.persistIndex(id, summaries);
        return summaries;
    }

    async getRecord(chatId, mesId, entries = null) {
        const id = normalizeChatId(chatId);
        const targetMesId = safeMesId(mesId);
        if (!id || targetMesId === null) return null;
        const index = normalizeItemizedPromptIndex(entries ?? await this.loadIndex(id));
        const summary = index.find(entry => entry.mesId === targetMesId);
        if (!summary) return null;
        const record = await this.storage.getItem(getItemizedPromptRecordKey(id, summary.recordId));
        if (!record || typeof record !== 'object') return null;
        return { ...record, mesId: targetMesId };
    }

    async getPreviousRecordWithRawPrompt(chatId, mesId, entries = null) {
        const targetMesId = safeMesId(mesId);
        if (targetMesId === null) return null;
        const index = normalizeItemizedPromptIndex(entries ?? await this.loadIndex(chatId));
        const candidates = index
            .filter(entry => entry.mesId < targetMesId && entry.hasRawPrompt)
            .sort((a, b) => b.mesId - a.mesId);
        for (const candidate of candidates) {
            const record = await this.getRecord(chatId, candidate.mesId, index);
            if (record?.rawPrompt) return record;
        }
        return null;
    }

    async upsert(chatId, record, entries = null) {
        const id = normalizeChatId(chatId);
        const mesId = safeMesId(record?.mesId);
        if (!id || mesId === null || !record || typeof record !== 'object') {
            return normalizeItemizedPromptIndex(entries);
        }

        const index = normalizeItemizedPromptIndex(entries ?? await this.loadIndex(id));
        let summary = index.find(entry => entry.mesId === mesId);
        if (!summary) {
            summary = {
                mesId,
                recordId: this.makeRecordId(id, mesId),
                hasRawPrompt: Boolean(record.rawPrompt),
            };
            index.push(summary);
        } else {
            summary.hasRawPrompt = Boolean(record.rawPrompt);
        }

        await this.storage.setItem(
            getItemizedPromptRecordKey(id, summary.recordId),
            structuredClone(record),
        );
        return await this.persistIndex(id, index);
    }

    async replaceRawPrompt(chatId, mesId, rawPrompt, entries = null) {
        const index = normalizeItemizedPromptIndex(entries ?? await this.loadIndex(chatId));
        const record = await this.getRecord(chatId, mesId, index);
        if (!record) return index;
        record.rawPrompt = rawPrompt;
        return await this.upsert(chatId, record, index);
    }

    async copyChat(sourceChatId, targetChatId, entries = null) {
        const source = normalizeChatId(sourceChatId);
        const target = normalizeChatId(targetChatId);
        if (!source || !target) return [];
        if (source === target) return await this.persistIndex(target, entries ?? await this.loadIndex(source));

        const sourceIndex = normalizeItemizedPromptIndex(entries ?? await this.loadIndex(source));
        const targetRecords = [];
        const targetIndex = [];
        for (const entry of sourceIndex) {
            const record = await this.getRecord(source, entry.mesId, sourceIndex);
            if (!record) continue;
            const recordId = this.makeRecordId(target, entry.mesId);
            targetRecords.push({ recordId, record: structuredClone(record) });
            targetIndex.push({
                mesId: entry.mesId,
                recordId,
                hasRawPrompt: Boolean(record.rawPrompt),
            });
        }
        await this.#writeRecordBatch(target, targetRecords);
        return await this.persistIndex(target, targetIndex);
    }

    async replaceChatFromRecords(chatId, records) {
        const id = normalizeChatId(chatId);
        if (!id) return [];
        await this.deleteCurrentLayout(id);
        const index = [];
        const writes = [];
        for (const record of Array.isArray(records) ? records : []) {
            const mesId = safeMesId(record?.mesId);
            if (mesId === null || !record || typeof record !== 'object') continue;
            const recordId = this.makeRecordId(id, mesId);
            writes.push({ recordId, record: structuredClone(record) });
            index.push({ mesId, recordId, hasRawPrompt: Boolean(record.rawPrompt) });
        }
        await this.#writeRecordBatch(id, writes);
        return await this.persistIndex(id, index);
    }

    async deleteCurrentLayout(chatId) {
        const id = normalizeChatId(chatId);
        if (!id) return;
        const index = await this.#readCurrentIndex(id);
        if (index) {
            await Promise.all(index.map(entry => (
                this.storage.removeItem(getItemizedPromptRecordKey(id, entry.recordId))
            )));
        }
        await this.storage.removeItem(getItemizedPromptIndexKey(id));
    }

    async deleteChat(chatId) {
        const id = normalizeChatId(chatId);
        if (!id) return;
        await this.deleteCurrentLayout(id);
        await this.storage.removeItem(id);
    }

    async swapMessageIds(chatId, sourceMessageId, targetMessageId, entries = null) {
        const index = normalizeItemizedPromptIndex(entries ?? await this.loadIndex(chatId));
        return await this.persistIndex(
            chatId,
            swapItemizedPromptIndexMessageIds(index, sourceMessageId, targetMessageId),
        );
    }

    async deleteMessage(chatId, messageId, entries = null) {
        const id = normalizeChatId(chatId);
        const index = normalizeItemizedPromptIndex(entries ?? await this.loadIndex(id));
        const next = deleteItemizedPromptIndexMessage(index, messageId);
        await Promise.all(next.removedRecordIds.map(recordId => (
            this.storage.removeItem(getItemizedPromptRecordKey(id, recordId))
        )));
        return await this.persistIndex(id, next.entries);
    }

    async rollbackToLegacy(chatId, entries = null) {
        const id = normalizeChatId(chatId);
        if (!id) return [];
        const index = normalizeItemizedPromptIndex(entries ?? await this.loadIndex(id));
        const records = [];
        for (const entry of index) {
            const record = await this.getRecord(id, entry.mesId, index);
            if (record) records.push(record);
        }
        await this.storage.setItem(id, records);
        return records;
    }

    async clear() {
        await this.storage.clear();
    }
}
