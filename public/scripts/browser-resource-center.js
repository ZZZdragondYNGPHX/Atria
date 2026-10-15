import { BrowserProvider, BrowserMutator, estimateEntryBytes, fingerprintBrowserResource } from './browser-storage-inspector.js';

const TASK_KEY = 'atria_storage_center_tasks_v1';
const preferenceKeys = new Set(['language', 'atri_ui_device_id', 'atri_learning_v1']);
const modelCaches = new Set(['webllm/model', 'webllm/config', 'webllm/wasm']);
const identity = path => JSON.stringify(path);

/** Identified device data shares the inspector's actual browser adapters.
 * Task history contains identities and outcomes, never stored values.
 */
export class BrowserResourceCenter {
    constructor() {
        this.provider = new BrowserProvider(); this.mutator = new BrowserMutator(); this.running = new Map();
    }
    tasks() {
        const parsed = JSON.parse(sessionStorage.getItem(TASK_KEY) || '[]');
        if (!Array.isArray(parsed)) throw new Error('Browser task history is unreadable.');
        return parsed.map(task => ['running', 'queued'].includes(task.status) && !this.running.has(task.id)
            ? { ...task, status: 'interrupted' } : task);
    }
    save(task) {
        const list = this.tasks().filter(item => item.id !== task.id);
        // Terminal metadata is bounded; active work never disappears to make room.
        const all = [task, ...list], active = all.filter(item => ['preview', 'running', 'queued', 'interrupted'].includes(item.status));
        sessionStorage.setItem(TASK_KEY, JSON.stringify([...active, ...all.filter(item => !active.includes(item)).slice(0, 100)]));
        return task;
    }
    async snapshot() {
        const resources = [], errors = [], startedAt = Date.now();
        let estimate = { usage: null, quota: null };
        try { if (navigator.storage?.estimate) estimate = await navigator.storage.estimate(); } catch (error) { errors.push({ source: 'origin-estimate', reason: error.message }); }
        let knownBytes = 0;
        for (const category of ['localStorage', 'sessionStorage']) {
            try {
                for (const entry of (await this.provider.fetch([category])).entries) {
                    if (entry.key === TASK_KEY) continue;
                    const path = [category, entry.key];
                    const semantic = category === 'localStorage' && preferenceKeys.has(entry.key);
                    knownBytes += entry.sizeBytes;
                    resources.push({ id: identity(path), target: { path }, name: entry.key, bytes: entry.sizeBytes,
                        category: semantic ? 'preferences' : 'advanced', managed: semantic, units: 1, method: 'utf16-estimate' });
                }
            } catch (error) { errors.push({ source: category, reason: error.message }); }
        }
        for (const category of ['indexeddb', 'cachestorage']) {
            try {
                for (const entry of (await this.provider.fetch([category])).entries) {
                    if (!modelCaches.has(entry.key)) continue;
                    const path = [category, entry.key];
                    resources.push({ id: identity(path), target: { path }, name: entry.label, bytes: null, category: 'offline', managed: true, units: entry.childCount, method: 'unavailable' });
                }
            } catch (error) { errors.push({ source: category, reason: error.message }); }
        }
        return { scope: { type: 'browser' }, startedAt, completedAt: Date.now(), totalBytes: estimate.usage ?? null,
            knownBytes, quotaBytes: estimate.quota ?? null, completeness: errors.length ? 'partial' : 'estimate',
            method: 'origin-estimate', errors, resources, suggestions: [], recovery: [], safeCleanupBytes: 0,
            categories: Object.fromEntries(['cache', 'offline', 'preferences', 'advanced'].map(category => [category, {
                bytes: category === 'offline' ? null : resources.filter(item => item.category === category).reduce((sum, item) => sum + item.bytes, 0),
                objectCount: resources.filter(item => item.category === category).length,
            }])) };
    }
    async expand(path) {
        if (path[0] === 'sessionStorage' && path[1] === TASK_KEY) throw new Error('Operation history is managed by the resource center.');
        if (['localStorage', 'sessionStorage'].includes(path[0]) && path.length === 2 || path[0] === 'indexeddb' && path.length >= 2
            || path[0] === 'cachestorage' && path.length >= 2) return [path];
        const response = await this.provider.fetch(path), result = [];
        for (const entry of response.entries) if (!(path[0] === 'sessionStorage' && entry.key === TASK_KEY)) result.push(...await this.expand([...path, entry.key]));
        return result;
    }
    async preview(action, targets) {
        if (action !== 'purge') throw new Error('Browser data requires explicit permanent deletion.');
        const paths = new Map(), items = [];
        for (const target of targets) {
            try { for (const path of await this.expand(target.path)) paths.set(identity(path), path); } catch (error) { items.push({ target, name: target.path.join(' / '), version: null, status: 'blocked', bytes: null, reason: error.message, consequences: [] }); }
        }
        for (const [key, path] of paths) if ([...paths.values()].some(parent => parent.length < path.length && parent.every((part, index) => path[index] === part))) paths.delete(key);
        for (const path of paths.values()) {
            try {
                const version = await fingerprintBrowserResource(path);
                const bytes = ['localStorage', 'sessionStorage'].includes(path[0]) ? estimateEntryBytes(path[1], window[path[0]].getItem(path[1])) : null;
                items.push({ target: { path }, name: path.join(' / '), version, status: 'pending', bytes, reason: null, consequences: [] });
            } catch (error) { items.push({ target: { path }, name: path.join(' / '), version: null, status: 'blocked', bytes: null, reason: error.message, consequences: [] }); }
        }
        return this.save({ id: crypto.randomUUID(), scope: 'browser', action, status: 'preview', createdAt: Date.now(), updatedAt: Date.now(),
            items, processedBytes: 0, stopRequested: false, recoverable: false, estimatedPhysicalRelease: null, retentionDays: null });
    }
    async execute(id, onProgress = () => {}) {
        const task = this.tasks().find(item => item.id === id);
        if (!task || task.status !== 'preview') throw new Error('Create a new preview before retrying interrupted browser work.');
        const state = { stop: false }; this.running.set(id, state);
        try {
            task.status = 'running'; this.save(task);
            for (const item of task.items) {
                if (state.stop) { task.status = 'stopped'; break; }
                if (item.status !== 'pending') continue;
                // The durable progress marker precedes each destructive action.
                // A refreshed page treats a processing item as requiring review.
                item.status = 'processing'; this.save(task); onProgress(task);
                try {
                    if (await fingerprintBrowserResource(item.target.path) !== item.version) throw new Error('Resource changed; create a new preview.');
                    await this.mutator.deleteAtPath(item.target.path);
                    item.status = 'succeeded'; task.processedBytes += item.bytes || 0;
                } catch (error) { item.status = 'failed'; item.reason = error.message; }
                task.updatedAt = Date.now(); this.save(task); onProgress(task);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            if (task.status === 'running') task.status = task.items.some(item => ['failed', 'blocked'].includes(item.status)) ? 'partial' : 'completed';
            return this.save(task);
        } finally { this.running.delete(id); }
    }
    stop(id) { const state = this.running.get(id); if (state) state.stop = true; }
}
