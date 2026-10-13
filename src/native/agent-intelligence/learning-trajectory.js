import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { hashNativeDocument } from '../repositories/common.js';
import { fields } from './contracts.js';
import { assertFeedbackInput } from './experience-repository.js';

const digest = value => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError('Invalid learning hash'); };
const keys = ['observation', 'action', 'outcome', 'receipt', 'preference', 'reward'];
const fileLimit = 262144;
const missingReason = key => key === 'reward' ? 'not_numeric_human_reward'
    : key === 'preference' ? 'not_explicit_human_preference' : 'not_exposed_by_source';

// Metadata only: intentionally do not copy notes, prompts, task intent or trace payloads.
export function learningRecord(scope, item, document, diagnoses = []) {
    const { applicability, ...feedback } = item;
    const feedbackHash = hashNativeDocument(feedback);
    const derivedDiagnoses = diagnoses.filter(diagnosis => diagnosis.feedbackRefs.some(ref => ref.id === item.id && ref.revision === item.revision
        && ref.integrity === feedbackHash)).map(diagnosis => ({
        id: hashNativeDocument({ id: diagnosis.id, batchHash: diagnosis.batchHash }),
        origin: diagnosis.origin, direction: diagnosis.direction, derived: true,
    }));
    const project = item.source.kind === 'project_task';
    const preference = item.kind === 'explicit' && item.origin === 'user'
        ? { signal: item.signal, dimension: item.dimension, origin: 'user' } : null;
    const record = {
        id: hashNativeDocument({ id: item.id, revision: item.revision, source: item.source.integrity, diagnoses: derivedDiagnoses }),
        family: hashNativeDocument(scope),
        observation: { sourceKind: item.source.kind, sourceHash: item.source.integrity },
        action: { kind: project ? 'project_task' : 'captured_run', status: document.status },
        outcome: project || document.origin === 'host' ? { status: document.status, origin: 'host' } : null,
        receipt: project ? document.changeSets.filter(change => change.resultingRevision).map(change => ({
            hash: hashNativeDocument({ changeSetId: change.changeSetId, resultingRevision: change.resultingRevision }),
        })) : document.outcome?.receiptHash ? [{ hash: document.outcome.receiptHash }] : null,
        preference,
        reward: null,
        label: { kind: item.kind, origin: item.origin, signal: item.signal, dimension: item.dimension,
            derived: item.kind !== 'explicit' },
        diagnoses: derivedDiagnoses,
        missing: [],
        missingReasons: {},
    };
    if (Array.isArray(record.receipt) && !record.receipt.length) record.receipt = null;
    record.missing = keys.filter(key => record[key] === null);
    record.missingReasons = Object.fromEntries(record.missing.map(key => [key, missingReason(key)]));
    return record;
}

export function learningExport(owner, scope, sequence, exportedAt, records) {
    const content = { format: 'atria-learning-trajectory', schemaVersion: 1, purpose: 'offline-analysis',
        ownerHash: hashNativeDocument(owner), scopeHash: hashNativeDocument(scope), sequence, exportedAt, records };
    return assertLearningExport({ ...content, integrity: hashNativeDocument(content) });
}

export function assertLearningExport(value) {
    fields(value, ['format', 'schemaVersion', 'purpose', 'ownerHash', 'scopeHash', 'sequence', 'exportedAt', 'records', 'integrity'], 'Learning export');
    const { integrity, ...content } = value;
    if (value.format !== 'atria-learning-trajectory' || value.schemaVersion !== 1 || value.purpose !== 'offline-analysis'
        || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !Number.isSafeInteger(value.exportedAt) || value.exportedAt < 0
        || !Array.isArray(value.records) || value.records.length > 256 || Buffer.byteLength(JSON.stringify(value)) > 262144) throw new TypeError('Invalid learning export');
    for (const hash of [integrity, value.ownerHash, value.scopeHash]) digest(hash);
    if (integrity !== hashNativeDocument(content)) throw new TypeError('Learning integrity mismatch');
    const ids = new Set();
    for (const record of value.records) {
        fields(record, ['id', 'family', ...keys, 'label', 'diagnoses', 'missing', 'missingReasons'], 'Learning record');
        digest(record.id); digest(record.family);
        if (record.family !== value.scopeHash || ids.has(record.id)) throw new TypeError('Learning family/identity mismatch');
        ids.add(record.id);
        fields(record.observation, ['sourceKind', 'sourceHash'], 'Learning observation'); digest(record.observation.sourceHash);
        if (!['evidence', 'project_task'].includes(record.observation.sourceKind)) throw new TypeError('Invalid learning source');
        fields(record.action, ['kind', 'status'], 'Learning action');
        const project = record.observation.sourceKind === 'project_task';
        const states = project ? ['planning', 'planned', 'working', 'evaluating', 'repair', 'blocked', 'review', 'committing', 'completed', 'conflict', 'taken_over', 'cancelled']
            : ['capturing', 'completed', 'cancelled', 'failed'];
        if (record.action.kind !== (project ? 'project_task' : 'captured_run') || !states.includes(record.action.status)) throw new TypeError('Invalid learning action');
        if (record.outcome !== null) {
            fields(record.outcome, ['status', 'origin'], 'Learning outcome');
            if (record.outcome.origin !== 'host' || record.outcome.status !== record.action.status) throw new TypeError('Invalid learning outcome');
        }
        if (record.receipt !== null) {
            if (!Array.isArray(record.receipt) || !record.receipt.length || record.receipt.length > 256) throw new TypeError('Invalid learning receipt');
            for (const receipt of record.receipt) { fields(receipt, ['hash'], 'Learning receipt'); digest(receipt.hash); }
        }
        fields(record.label, ['kind', 'origin', 'signal', 'dimension', 'derived'], 'Learning label');
        const origins = { explicit: 'user', technical: 'host', observation: 'client_observation', assessment: ['host_check', 'model_assessment'] };
        const origin = origins[record.label.kind];
        if (!origin || !(Array.isArray(origin) ? origin.includes(record.label.origin) : origin === record.label.origin)
            || record.label.derived !== (record.label.kind !== 'explicit')) throw new TypeError('Learning label origin mismatch');
        if (record.label.kind !== 'assessment') assertFeedbackInput({ kind: record.label.kind, signal: record.label.signal, dimension: record.label.dimension, note: '' }, 2);
        else if (!['verified_failure', 'no_failure', 'unknown', 'suspected_failure'].includes(record.label.signal)
            || record.label.dimension !== 'general' || record.label.origin === 'model_assessment' && record.label.signal === 'verified_failure') throw new TypeError('Invalid learning classification');
        if (record.preference !== null) {
            fields(record.preference, ['signal', 'dimension', 'origin'], 'Learning preference');
            if (record.label.kind !== 'explicit' || record.preference.origin !== 'user' || record.preference.signal !== record.label.signal
                || record.preference.dimension !== record.label.dimension) throw new TypeError('Learning preference origin mismatch');
        } else if (record.label.kind === 'explicit') throw new TypeError('Missing explicit preference');
        if (record.reward !== null || JSON.stringify(record.missing) !== JSON.stringify(keys.filter(key => record[key] === null))) throw new TypeError('Learning missing/reward mismatch');
        fields(record.missingReasons, record.missing, 'Learning missing reasons');
        if (record.missing.some(key => record.missingReasons[key] !== missingReason(key))) throw new TypeError('Learning missing reason mismatch');
        if (!Array.isArray(record.diagnoses) || record.diagnoses.length > 64) throw new TypeError('Invalid learning diagnoses');
        const diagnoses = new Set();
        for (const diagnosis of record.diagnoses) {
            fields(diagnosis, ['id', 'origin', 'direction', 'derived'], 'Learning diagnosis'); digest(diagnosis.id);
            if (diagnoses.has(diagnosis.id) || !['user_hypothesis', 'model_hypothesis'].includes(diagnosis.origin) || diagnosis.derived !== true
                || !['skill', 'prompt', 'orchestration', 'undetermined'].includes(diagnosis.direction)) throw new TypeError('Invalid learning diagnosis origin');
            diagnoses.add(diagnosis.id);
        }
    }
    return value;
}

export function analyzeLearningExports(exports) {
    if (!Array.isArray(exports) || !exports.length || exports.length > 32) throw new TypeError('Bounded exports required');
    const records = new Map(), owners = new Set(), diagnoses = new Map(), coverage = Object.fromEntries(keys.map(key => [key, 0]));
    for (const value of exports) {
        assertLearningExport(value); owners.add(value.ownerHash);
        for (const record of value.records) {
            const previous = records.get(record.id);
            if (previous && hashNativeDocument(previous) !== hashNativeDocument(record)) throw new TypeError('Conflicting offline record');
            records.set(record.id, record);
            for (const diagnosis of record.diagnoses) {
                const previous = diagnoses.get(diagnosis.id);
                const current = { ...diagnosis, family: record.family };
                if (previous && hashNativeDocument(previous) !== hashNativeDocument(current)) throw new TypeError('Conflicting offline diagnosis');
                diagnoses.set(diagnosis.id, current);
            }
        }
    }
    if (owners.size !== 1) throw new TypeError('Mixed offline owners');
    const splits = { development: [], evaluation: [] };
    let derived = 0;
    for (const record of records.values()) {
        for (const key of keys) if (record[key] !== null) coverage[key]++;
        if (record.label.derived) derived++;
        // Split whole scope families; never split individual feedback or corrected versions.
        splits[parseInt(record.family.slice(0, 8), 16) % 5 === 0 ? 'evaluation' : 'development'].push(record.id);
    }
    for (const ids of Object.values(splits)) ids.sort();
    return { format: 'atria-learning-analysis', schemaVersion: 1, records: records.size, derivedLabels: derived, derivedDiagnoses: diagnoses.size, coverage, splits,
        limitations: ['metadata_only', 'integrity_is_not_authenticity', 'not_training_or_promotion', 'split_not_independent_acceptance_qualification', 'downloaded_copies_not_revocable'] };
}

export async function analyzeLearningFiles(paths) {
    if (!Array.isArray(paths) || !paths.length || paths.length > 32) throw new TypeError('Bounded files required');
    const exports = [];
    for (const path of paths) {
        if (typeof path !== 'string' || !path.trim()) throw new TypeError('Local file path required');
        const file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
        try {
            const before = await file.stat();
            if (!before.isFile() || before.size > fileLimit) throw new TypeError('Offline file budget exceeded');
            // A growing file is still bounded even when it changes after stat.
            const bytes = Buffer.alloc(fileLimit + 1);
            let size = 0;
            while (size < bytes.length) {
                const result = await file.read(bytes, size, bytes.length - size, size);
                if (!result.bytesRead) break;
                size += result.bytesRead;
            }
            const after = await file.stat();
            if (size > fileLimit || after.size > fileLimit) throw new TypeError('Offline file budget exceeded');
            if (size !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new TypeError('Offline file changed during read');
            exports.push(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))));
        } finally { await file.close(); }
    }
    return analyzeLearningExports(exports);
}
