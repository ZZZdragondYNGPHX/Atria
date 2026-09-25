import { createNativeId } from '../identity.js';
import { normalizeNativeRegexScripts } from '../../../public/shared/native-regex.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { getNativeDocument, listNativeDocuments, putImmutable, putMutable } from '../repositories/common.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { withRuntimeWrite } from './persistence.js';
import { assertVersionedModelPromptResource, collectVersionedModelPromptResourceRefs, getVersionedModelPromptResourceDefinition } from './resources.js';

const PROGRAM = 'core.prompt-program';
const MODULE = 'core.prompt-module';
const GENERATION = 'core.generation-profile';
const key = (handle, resourceType, resourceId, revision) => ({ kind: revision ? K.versionedJsonResourceRevision : K.versionedJsonResource, handle, resourceType, resourceId, ...(revision ? { revision } : {}) });
const identity = entry => entry.resource[getVersionedModelPromptResourceDefinition(entry.resourceType).idField];
const ref = entry => ({ scope: 'library', resourceType: entry.resourceType, resourceId: identity(entry), revision: entry.resource.revision });

// Preset membership lives on the existing Library resource root. Definitions
// remain ordinary exact Native resources, usable by the existing compiler.
export class PromptPresetStore {
    constructor({ engine }) { this.engine = engine; }

    async list(handle) {
        return this.engine.withTransaction(handle, async tx => (await listNativeDocuments(tx, { kind: K.versionedJsonResource, handle, resourceType: PROGRAM }))
            .filter(root => root.preset).map(root => ({ presetId: root.resourceId, displayName: root.displayName, revision: root.currentRevision })));
    }

    async get(handle, id) {
        return this.engine.withTransaction(handle, async tx => {
            const root = await getNativeDocument(tx, key(handle, PROGRAM, id));
            if (!root?.preset) throw new NotFoundError('Prompt preset');
            const entries = await Promise.all(root.preset.refs.map(async r => ({ resourceType: r.resourceType, resource: await getNativeDocument(tx, key(handle, r.resourceType, r.resourceId, r.revision)) })));
            return { format: 'atria.prompt-preset', schemaVersion: 1, presetId: id, revision: root.currentRevision, displayName: root.displayName, ...root.preset, regexScripts: root.preset.regexScripts || [], entries };
        });
    }

    async resolveRegex(handle, programRef) {
        if (programRef?.scope !== 'library' || programRef.resourceType !== PROGRAM) return null;
        return this.engine.withTransaction(handle, async tx => {
            const program = await getNativeDocument(tx, key(handle, PROGRAM, programRef.resourceId));
            if (!program?.presetOwner || !await getNativeDocument(tx, key(handle, PROGRAM, programRef.resourceId, programRef.revision))) return null;
            const owner = await getNativeDocument(tx, key(handle, PROGRAM, program.presetOwner));
            if (!owner?.preset) return null;
            // Regex belongs to the current preset, independently of pinned program revisions.
            return { presetId: owner.resourceId, revision: owner.currentRevision, displayName: owner.displayName, regexScripts: owner.preset.regexScripts || [] };
        });
    }

    async delete(handle, id, expectedRevision) {
        assertWritable();
        return withRuntimeWrite(handle, () => this.engine.withTransaction(handle, async tx => {
            assertWritable();
            const root = await getNativeDocument(tx, key(handle, PROGRAM, id));
            if (!root?.preset || root.currentRevision !== expectedRevision) throw new ConflictError('native_prompt_preset_conflict');
            for (const type of [PROGRAM, MODULE, GENERATION]) {
                for (const owned of await listNativeDocuments(tx, { kind: K.versionedJsonResource, handle, resourceType: type })) {
                    if (owned.presetOwner !== id) continue;
                    const { preset: _preset, presetOwner: _owner, ...retained } = owned;
                    await putMutable(tx, key(handle, type, owned.resourceId), { ...retained, archived: true });
                }
            }
            return { presetId: id, deleted: true };
        }));
    }

    async assertPair(handle, programRef, generationRef) {
        return this.engine.withTransaction(handle, async tx => {
            const owner = async r => r?.scope === 'library' ? (await getNativeDocument(tx, key(handle, r.resourceType, r.resourceId)))?.presetOwner : null;
            const programOwner = await owner(programRef), generationOwner = await owner(generationRef);
            if ((programOwner || generationOwner) && programOwner !== generationOwner) throw new TypeError('Choose the program and generation settings from the same Prompt preset');
        });
    }

    async save(handle, input, { id = null, expectedRevision = null, importing = false } = {}) {
        assertWritable();
        if (input.format !== 'atria.prompt-preset' || input.schemaVersion !== 1 || !Array.isArray(input.entries) || !input.entries.length || input.entries.length > 5000) throw new TypeError('Invalid Prompt preset file');
        const regexScripts = normalizeNativeRegexScripts(input.regexScripts);
        const entries = input.entries.map(e => ({ resourceType: e.resourceType, resource: structuredClone(assertVersionedModelPromptResource(e.resourceType, e.resource)) }));
        const byId = new Map(entries.map(e => [identity(e), e]));
        if (byId.size !== entries.length) throw new TypeError('Duplicate preset resource identity');
        const main = byId.get(input.programId);
        if (main?.resourceType !== PROGRAM || entries.filter(e => e.resourceType === GENERATION).length !== 1) throw new TypeError('A preset requires one main program and one generation profile');
        const categories = structuredClone(input.categories || []);
        if (!Array.isArray(categories) || categories.length > 1000) throw new TypeError('Invalid categories');
        const categoryIds = new Set(categories.map(c => c.id));
        if (categoryIds.size !== categories.length || categories.some(c => typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name.trim() || (c.parentId != null && !categoryIds.has(c.parentId)))) throw new TypeError('Invalid categories');
        for (const c of categories) {
            const seen = new Set([c.id]); let parent = c.parentId;
            while (parent != null) { if (seen.has(parent)) throw new TypeError('Category cycle'); if (seen.size > 32) throw new TypeError('Category nesting exceeds 32 levels'); seen.add(parent); parent = categories.find(v => v.id === parent).parentId; }
        }
        const assignments = { ...(input.moduleCategories || {}) };
        for (const [moduleId, categoryId] of Object.entries(assignments)) if (byId.get(moduleId)?.resourceType !== MODULE || !categoryIds.has(categoryId)) throw new TypeError('Invalid module category');
        const modules = entries.filter(e => e.resourceType === MODULE);
        if (importing && modules.length && !Object.keys(assignments).length) {
            const categoryId = createNativeId('revision');
            categories.push({ id: categoryId, name: main.resource.displayName, parentId: null });
            modules.forEach(e => { assignments[identity(e)] = categoryId; });
        }
        const visiting = new Set(), visited = new Set();
        const visit = e => {
            const resourceId = identity(e);
            if (visiting.has(resourceId)) throw new TypeError('Prompt dependency cycle');
            if (visited.has(resourceId)) return;
            visiting.add(resourceId);
            for (const r of collectVersionedModelPromptResourceRefs(e.resourceType, e.resource)) {
                const target = byId.get(r.resourceId);
                if (!target || target.resourceType !== r.resourceType || target.resource.revision !== r.revision) throw new TypeError('Preset references must resolve inside this preset');
                visit(target);
            }
            visiting.delete(resourceId); visited.add(resourceId);
        };
        visit(main);
        if (entries.some(e => e.resourceType === PROGRAM && !visited.has(identity(e)))) throw new TypeError('Additional programs must belong to the main program inheritance chain');
        entries.forEach(visit);
        return withRuntimeWrite(handle, () => this.engine.withTransaction(handle, async tx => {
            assertWritable();
            const previous = id ? await getNativeDocument(tx, key(handle, PROGRAM, id)) : null;
            if (id && (!previous?.preset || previous.currentRevision !== expectedRevision)) throw new ConflictError('native_prompt_preset_conflict');
            if (id && input.programId !== id) throw new TypeError('Cannot change preset identity');
            const mapping = new Map();
            const moduleIds = modules.map(identity).sort();
            const newModuleIds = moduleIds.map(() => createNativeId('promptModule')).sort();
            for (const e of entries) {
                const oldId = identity(e), definition = getVersionedModelPromptResourceDefinition(e.resourceType);
                if (id) {
                    const existing = await getNativeDocument(tx, key(handle, e.resourceType, oldId));
                    if (existing && existing.presetOwner !== id) throw new TypeError('Resource belongs outside this preset');
                }
                mapping.set(oldId, { resourceId: id ? oldId : (e.resourceType === MODULE ? newModuleIds[moduleIds.indexOf(oldId)] : createNativeId(definition.idKind)), revision: createNativeId('revision') });
            }
            const owner = mapping.get(input.programId).resourceId;
            const mapRef = r => ({ scope: 'library', resourceType: r.resourceType, ...mapping.get(r.resourceId) });
            for (const e of entries) {
                const oldId = identity(e), definition = getVersionedModelPromptResourceDefinition(e.resourceType);
                if (e.resourceType === PROGRAM) {
                    if (e.resource.parentRef) e.resource.parentRef = mapRef(e.resource.parentRef);
                    e.resource.stages.forEach(s => { s.moduleRefs = s.moduleRefs.map(mapRef); });
                    e.resource.derive.forEach(op => {
                        if (op.replacementRef) op.replacementRef = mapRef(op.replacementRef);
                        if (op.moduleId) { if (!mapping.has(op.moduleId)) throw new TypeError('Derive module must belong to preset'); op.moduleId = mapping.get(op.moduleId).resourceId; }
                    });
                }
                Object.assign(e.resource, { [definition.idField]: mapping.get(oldId).resourceId, revision: mapping.get(oldId).revision });
                e.resource = assertVersionedModelPromptResource(e.resourceType, e.resource);
            }
            const preset = { programId: owner, categories, moduleCategories: Object.fromEntries(Object.entries(assignments).map(([m, c]) => [mapping.get(m).resourceId, c])), refs: entries.map(ref), regexScripts };
            // Validate everything before publication; retain historical definitions
            // for pinned consumers when removing membership or whole categories.
            for (const e of entries) await putImmutable(tx, key(handle, e.resourceType, identity(e), e.resource.revision), e.resource);
            for (const e of entries) await putMutable(tx, key(handle, e.resourceType, identity(e)), { resourceType: e.resourceType, resourceId: identity(e), displayName: e.resource.displayName, currentRevision: e.resource.revision, presetOwner: owner, ...(identity(e) === owner ? { preset } : {}) });
            for (const r of previous?.preset.refs || []) if (!entries.some(e => identity(e) === r.resourceId)) {
                const oldRoot = await getNativeDocument(tx, key(handle, r.resourceType, r.resourceId));
                await putMutable(tx, key(handle, r.resourceType, r.resourceId), { ...oldRoot, archived: true });
            }
            return { presetId: owner, revision: mapping.get(input.programId).revision };
        }));
    }
}
