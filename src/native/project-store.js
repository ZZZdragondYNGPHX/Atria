import fs from 'node:fs';
import path from 'node:path';
import { sync as writeFileAtomic } from 'write-file-atomic';
import { resolveUserDirectory } from '../constants.js';

import { assertNativeId } from './identity.js';
import {
    ATRIA_PROJECT_MANIFEST,
    assertAtriaProjectSource,
} from './project-source.js';

const RESERVED_SOURCE_ROOTS = new Set([
    '.git',
    '.atria-save',
    '.atria-saves',
    'save',
    'saves',
    'progress',
    'checkpoints',
]);

function normalizeRelativePath(input, { allowManifest = false } = {}) {
    if (typeof input !== 'string' || !input) {
        throw new TypeError('Project source path must be a non-empty string');
    }
    if (
        input.includes('\\')
        || input.includes('\0')
        || input.startsWith('/')
        || /^[A-Za-z]:/.test(input)
        || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(input)
    ) {
        throw new TypeError('Project source path must be project-relative');
    }
    const segments = input.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
        throw new TypeError('Project source path contains an illegal segment');
    }
    if (segments[0] === '.git') {
        throw new TypeError('ProjectStore does not expose .git internals as source files');
    }
    if (!allowManifest && input === ATRIA_PROJECT_MANIFEST) {
        throw new TypeError('Use ProjectStore.save() to update the project manifest');
    }
    return segments.join('/');
}

function toBuffer(value) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === 'string') return Buffer.from(value, 'utf8');
    throw new TypeError('Project source bytes must be string, Buffer, or Uint8Array');
}

function isExcludedFromBuild(relativePath) {
    const first = relativePath.split('/')[0];
    return RESERVED_SOURCE_ROOTS.has(first);
}

export class ProjectStore {
    constructor({ directoriesByHandle }) {
        if (typeof directoriesByHandle !== 'function') {
            throw new TypeError('ProjectStore requires { directoriesByHandle }');
        }
        this._directoriesByHandle = directoriesByHandle;
    }

    _root(handle) {
        return resolveUserDirectory(this._directoriesByHandle(handle), 'projects');
    }

    _projectDir(handle, projectId) {
        const id = assertNativeId(projectId, 'project', 'ProjectStore.projectId');
        return path.join(this._root(handle), id);
    }

    _manifestPath(handle, projectId) {
        return path.join(this._projectDir(handle, projectId), ATRIA_PROJECT_MANIFEST);
    }

    async create(handle, value, { files = new Map() } = {}) {
        const source = assertAtriaProjectSource(value);
        const projectDir = this._projectDir(handle, source.project.projectId);
        if (fs.existsSync(projectDir)) {
            throw new Error('Studio Project already exists: ' + source.project.projectId);
        }
        fs.mkdirSync(projectDir, { recursive: true });
        try {
            writeFileAtomic(
                this._manifestPath(handle, source.project.projectId),
                JSON.stringify(source, null, 2) + '\n',
            );
            for (const [relativePath, bytes] of files instanceof Map ? files : new Map()) {
                await this.writeFile(handle, source.project.projectId, relativePath, bytes);
            }
            return source;
        } catch (error) {
            fs.rmSync(projectDir, { recursive: true, force: true });
            throw error;
        }
    }

    async get(handle, projectId) {
        const manifestPath = this._manifestPath(handle, projectId);
        if (!fs.existsSync(manifestPath)) return null;
        let value;
        try {
            value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch (error) {
            throw new Error(`Studio Project manifest is unreadable: ${error?.message || String(error)}`);
        }
        const source = assertAtriaProjectSource(value);
        if (source.project.projectId !== projectId) {
            throw new Error('Studio Project directory identity does not match its projectId');
        }
        return source;
    }

    async list(handle) {
        const root = this._root(handle);
        if (!fs.existsSync(root)) return [];
        const projects = [];
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            try {
                assertNativeId(entry.name, 'project', 'ProjectStore directory');
            } catch {
                continue;
            }
            const source = await this.get(handle, entry.name);
            if (source) projects.push(source.project);
        }
        return projects.sort((left, right) => (
            Number(right.updatedAt || right.createdAt || 0)
            - Number(left.updatedAt || left.createdAt || 0)
        ));
    }

    async save(handle, value) {
        const source = assertAtriaProjectSource(value);
        const existing = await this.get(handle, source.project.projectId);
        if (!existing) throw new Error('Studio Project does not exist: ' + source.project.projectId);
        if (existing.project.packageId !== source.project.packageId) {
            throw new Error('Studio Project packageId is immutable');
        }
        writeFileAtomic(
            this._manifestPath(handle, source.project.projectId),
            JSON.stringify(source, null, 2) + '\n',
        );
        return source;
    }

    async readFile(handle, projectId, relativePath) {
        const safePath = normalizeRelativePath(relativePath);
        const projectDir = this._projectDir(handle, projectId);
        const filePath = path.join(projectDir, ...safePath.split('/'));
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
        return fs.readFileSync(filePath);
    }

    async writeFile(handle, projectId, relativePath, value) {
        const safePath = normalizeRelativePath(relativePath);
        const projectDir = this._projectDir(handle, projectId);
        if (!fs.existsSync(this._manifestPath(handle, projectId))) {
            throw new Error('Studio Project does not exist: ' + projectId);
        }
        const filePath = path.join(projectDir, ...safePath.split('/'));
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileAtomic(filePath, toBuffer(value));
        return safePath;
    }

    async moveFile(handle, projectId, fromRelativePath, toRelativePath) {
        const fromPath = normalizeRelativePath(fromRelativePath);
        const toPath = normalizeRelativePath(toRelativePath);
        if (fromPath === toPath) return toPath;

        const projectDir = this._projectDir(handle, projectId);
        if (!fs.existsSync(this._manifestPath(handle, projectId))) {
            throw new Error('Studio Project does not exist: ' + projectId);
        }

        const sourcePath = path.join(projectDir, ...fromPath.split('/'));
        const destinationPath = path.join(projectDir, ...toPath.split('/'));
        if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
            throw new Error('Project source does not exist: ' + fromPath);
        }
        if (fs.existsSync(destinationPath)) {
            throw new Error('Project source destination already exists: ' + toPath);
        }

        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        fs.renameSync(sourcePath, destinationPath);
        return toPath;
    }

    async deleteFile(handle, projectId, relativePath) {
        const safePath = normalizeRelativePath(relativePath);
        const filePath = path.join(this._projectDir(handle, projectId), ...safePath.split('/'));
        if (!fs.existsSync(filePath)) return false;
        fs.rmSync(filePath, { force: true });
        return true;
    }

    async listFiles(handle, projectId, { buildableOnly = false } = {}) {
        const projectDir = this._projectDir(handle, projectId);
        if (!fs.existsSync(projectDir)) return [];
        const files = [];

        const walk = (directory, prefix = '') => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const relativePath = prefix ? prefix + '/' + entry.name : entry.name;
                if (entry.name === '.git') continue;
                if (relativePath === ATRIA_PROJECT_MANIFEST) continue;
                if (buildableOnly && isExcludedFromBuild(relativePath)) continue;

                const fullPath = path.join(directory, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath, relativePath);
                } else if (entry.isFile()) {
                    files.push(Object.freeze({
                        path: relativePath,
                        size: fs.statSync(fullPath).size,
                    }));
                }
            }
        };

        walk(projectDir);
        return files.sort((left, right) => left.path.localeCompare(right.path));
    }

    async readBuildFiles(handle, projectId) {
        const files = new Map();
        for (const file of await this.listFiles(handle, projectId, { buildableOnly: true })) {
            files.set(file.path, await this.readFile(handle, projectId, file.path));
        }
        return files;
    }

    getProjectDirectory(handle, projectId) {
        return this._projectDir(handle, projectId);
    }

    async delete(handle, projectId) {
        const projectDir = this._projectDir(handle, projectId);
        if (!fs.existsSync(projectDir)) return false;
        fs.rmSync(projectDir, { recursive: true, force: true });
        return true;
    }
}
