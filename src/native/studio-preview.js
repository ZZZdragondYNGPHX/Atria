import { randomUUID } from 'node:crypto';

import { assertNativeId } from './identity.js';
import { inspectAtriaPackageContainer } from './package-container.js';

function clonePreview(value) {
    return structuredClone(value);
}

export class StudioPreviewHost {
    constructor({ previewIdFactory = randomUUID } = {}) {
        if (typeof previewIdFactory !== 'function') {
            throw new TypeError('StudioPreviewHost previewIdFactory must be a function');
        }
        this._previewIdFactory = previewIdFactory;
        this._previews = new Map();
    }

    create({ projectId, archive, entryPointId = undefined }) {
        assertNativeId(projectId, 'project', 'StudioPreview.projectId');
        const inspected = inspectAtriaPackageContainer(archive);
        const entryPoint = entryPointId == null
            ? inspected.manifest.entryPoints[0]
            : inspected.manifest.entryPoints.find(item => item.entryPointId === entryPointId);
        if (!entryPoint) throw new Error('Studio Preview entry point does not exist in Package');

        const previewId = 'preview_' + String(this._previewIdFactory()).replaceAll('-', '').toLowerCase();
        if (!/^preview_[a-f0-9]{32}$/.test(previewId)) {
            throw new Error('StudioPreviewHost previewIdFactory must return a UUID-shaped value');
        }

        const record = Object.freeze({
            kind: 'studio-preview',
            previewId,
            projectId,
            packageId: inspected.manifest.packageId,
            packageVersionId: inspected.manifest.packageVersionId,
            entryPointId: entryPoint.entryPointId,
            persisted: false,
            createdAt: Date.now(),
            manifest: inspected.manifest,
            sourceFiles: inspected.sourceFiles,
            assets: inspected.assets,
        });
        this._previews.set(previewId, record);
        return record;
    }

    get(previewId) {
        const record = this._previews.get(previewId);
        return record ? clonePreview({
            ...record,
            sourceFiles: [...record.sourceFiles.entries()],
            assets: [...record.assets.entries()],
        }) : null;
    }

    list() {
        return [...this._previews.values()].map(record => Object.freeze({
            previewId: record.previewId,
            projectId: record.projectId,
            packageId: record.packageId,
            packageVersionId: record.packageVersionId,
            entryPointId: record.entryPointId,
            persisted: false,
            createdAt: record.createdAt,
        }));
    }

    close(previewId) {
        return this._previews.delete(previewId);
    }

    clear() {
        this._previews.clear();
    }
}

export class StudioProjectRouter {
    constructor({ projectStore }) {
        if (!projectStore) throw new TypeError('StudioProjectRouter requires ProjectStore');
        this._projectStore = projectStore;
    }

    async open(handle, projectId) {
        assertNativeId(projectId, 'project', 'Studio route projectId');
        const source = await this._projectStore.get(handle, projectId);
        if (!source) return null;
        return Object.freeze({
            surface: 'studio',
            projectId,
            packageId: source.project.packageId,
            project: source.project,
        });
    }
}
