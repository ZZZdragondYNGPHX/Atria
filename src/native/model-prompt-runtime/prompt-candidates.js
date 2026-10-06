import { createNativeId } from '../identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { getNativeDocument, hashNativeDocument, putImmutable, putMutable } from '../repositories/common.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { NativeModelPromptPersistence, withRuntimeWrite } from './persistence.js';
import { PromptPresetStore } from './presets.js';
import { assertExactResourceRef, assertRuntimeRoute } from './contracts.js';
import { assertVersionedModelPromptResource, mapVersionedModelPromptResourceRefs } from './resources.js';
import { flattenPromptProgram } from './prompt-compiler.js';
import { interpolate, readVariable } from './prompt-values.js';

const PROGRAM = 'core.prompt-program', MODULE = 'core.prompt-module';
const key = (handle, ref) => ({ kind: ref.revision ? K.versionedJsonResourceRevision : K.versionedJsonResource, handle, resourceType: ref.resourceType, resourceId: ref.resourceId, ...(ref.revision ? { revision: ref.revision } : {}) });
const rootRef = id => ({ resourceType: PROGRAM, resourceId: id });
const same = (a, b) => hashNativeDocument(a) === hashNativeDocument(b);
const conflict = () => { throw new ConflictError('native_prompt_candidate_conflict'); };
const fields = (input, allowed) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) throw new TypeError('Invalid Prompt candidate fields');
};
const body = value => {
    if (typeof value !== 'string' || Buffer.byteLength(value) > 65536) throw new TypeError('Prompt candidate body exceeds 64 KiB');
    return value;
};
const envelope = (preset, refs = preset.refs) => ({ route: { promptProgramRef: refs.find(r => r.resourceId === preset.programId) }, resources: preset.entries.map(e => ({ ref: refs.find(r => r.resourceId === (e.resource.promptModuleId || e.resource.promptProgramId || e.resource.generationProfileId)), resource: e.resource })) });

function validateBodyBindings(preset, moduleId) {
    const flat = flattenPromptProgram(envelope(preset), { validateBindings: false });
    const host = Object.fromEntries(['role', 'sourceKind', 'sessionId', 'branchId', 'revisionId', 'projectId', 'projectRevision'].map(k => [k, {}]));
    for (const stage of flat.stages) for (const entry of stage.modules) {
        if (entry.disabled || entry.ref.resourceId !== moduleId) continue;
        const declarations = { host, param: flat.parameters, local: flat.locals, module: entry.module.parameters,
            artifact: Object.fromEntries(stage.consumes.map(k => [k, flat.artifacts[k]])) };
        // Reuse the compiler's interpolation/parser. Values remain request-bound;
        // this checks declarations and forbidden paths without fabricating inputs.
        interpolate(entry.module.body, path => { readVariable(path, {}, declarations); return ''; });
    }
}

// Candidate metadata lives on the existing Preset root. Exact definitions and
// the effective Route remain owned by their original repositories.
export class PromptCandidateStore {
    constructor({ engine }) {
        this.engine = engine;
        this.presets = new PromptPresetStore({ engine });
        this.persistence = new NativeModelPromptPersistence({ engine });
    }

    async _read(handle, id) {
        const preset = await this.presets.get(handle, id);
        const root = await this.engine.withTransaction(handle, tx => getNativeDocument(tx, key(handle, rootRef(id))));
        // Normalize/validate the full closure before granting any new versions.
        for (const e of preset.entries) e.resource = assertVersionedModelPromptResource(e.resourceType, e.resource);
        flattenPromptProgram(envelope(preset), { validateBindings: false });
        return { preset, root, fingerprint: hashNativeDocument(preset) };
    }

    async declare(handle, id, input) {
        fields(input, ['expectedRevision', 'moduleRefs']);
        if (!Array.isArray(input.moduleRefs) || input.moduleRefs.length > 64) throw new TypeError('Invalid evolvable modules');
        return withRuntimeWrite(handle, async () => {
            assertWritable();
            const { preset, root } = await this._read(handle, id);
            if (preset.revision !== input.expectedRevision) conflict();
            const refs = input.moduleRefs.map(r => assertExactResourceRef(r, MODULE));
            const active = flattenPromptProgram(envelope(preset), { validateBindings: false }).stages.flatMap(s => s.modules.filter(m => !m.disabled).map(m => m.ref));
            if (new Set(refs.map(r => r.resourceId)).size !== refs.length || refs.some(r => r.scope !== 'library' || !preset.refs.some(p => same(p, r)) || !active.some(p => same(p, r)))) throw new TypeError('Declare active exact modules from this Preset only');
            const declaration = { schemaVersion: 1, moduleRefs: refs };
            await this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, rootRef(id)), { ...root, promptEvolution: { declaration, candidates: [] } }));
            return declaration;
        });
    }

    async inspect(handle, id) {
        return withRuntimeWrite(handle, async () => {
            const { root } = await this._read(handle, id);
            return structuredClone(root.promptEvolution || { declaration: null, candidates: [] });
        });
    }

    async prepare(handle, id, input) {
        fields(input, ['runtimeRouteId', 'expectedRouteFingerprint', 'moduleRef', 'body']);
        body(input.body);
        const moduleRef = assertExactResourceRef(input.moduleRef, MODULE);
        return withRuntimeWrite(handle, async () => {
            assertWritable();
            const { preset, root, fingerprint } = await this._read(handle, id);
            const declaration = root.promptEvolution?.declaration;
            if (declaration?.schemaVersion !== 1 || !declaration.moduleRefs.some(r => same(r, moduleRef))) throw new TypeError('Prompt body is not declared evolvable');
            const route = await this.persistence.getRuntimeRoute(handle, input.runtimeRouteId);
            if (!route || hashNativeDocument(route) !== input.expectedRouteFingerprint) conflict();
            if (route.scope !== 'player' || !same(route.promptProgramRef, preset.refs.find(r => r.resourceId === id)) || !preset.refs.some(r => same(r, route.generationProfileRef))) throw new TypeError('Choose this Preset exact pair on the target Route');
            const source = preset.entries.find(e => e.resourceType === MODULE && e.resource.promptModuleId === moduleRef.resourceId);
            body(source.resource.body);
            if (source.resource.body === input.body) throw new TypeError('Prompt candidate must change body');
            const seed = { schemaVersion: 1, presetId: id, basePresetFingerprint: fingerprint, declarationFingerprint: hashNativeDocument(declaration), baseRoute: route, moduleRef, diff: { field: 'body', before: source.resource.body, after: input.body } };
            const candidateId = hashNativeDocument(seed);
            const previous = root.promptEvolution.candidates.find(c => c.candidateId === candidateId);
            if (previous) { await this._check(handle, id, previous); return structuredClone(previous); }
            const changedRefs = preset.refs.filter(r => [PROGRAM, MODULE].includes(r.resourceType) && (r.resourceType === PROGRAM || same(r, moduleRef)))
                .map(r => ({ ...r, revision: createNativeId('revision') }));
            const candidate = { ...seed, candidateId, changedRefs };
            const candidates = [...root.promptEvolution.candidates, candidate];
            if (candidates.length > 16 || Buffer.byteLength(JSON.stringify(candidates)) > 2 * 1024 * 1024) throw new TypeError('Prompt candidate capacity exceeded');
            const desired = this._desired(preset, candidate);
            validateBodyBindings(desired, moduleRef.resourceId);
            await this.engine.withTransaction(handle, async tx => {
                for (const ref of changedRefs) await putImmutable(tx, key(handle, ref), desired.entries.find(e => (e.resource.promptModuleId || e.resource.promptProgramId) === ref.resourceId).resource);
                // Commit metadata last; orphan immutable revisions are never effective.
                await putMutable(tx, key(handle, rootRef(id)), { ...root, promptEvolution: { declaration, candidates } });
            });
            return structuredClone(candidate);
        });
    }

    _desired(preset, candidate) {
        const refs = preset.refs.map(r => candidate.changedRefs.find(c => c.resourceId === r.resourceId) || r);
        const entries = preset.entries.map(e => {
            const resourceId = e.resource.promptModuleId || e.resource.promptProgramId || e.resource.generationProfileId;
            const changed = candidate.changedRefs.find(r => r.resourceId === resourceId);
            if (!changed) return e;
            const resource = mapVersionedModelPromptResourceRefs(e.resourceType, { ...e.resource, revision: changed.revision, ...(same(candidate.moduleRef, preset.refs.find(r => r.resourceId === resourceId)) ? { body: candidate.diff.after } : {}) }, r => refs.find(v => v.resourceId === r.resourceId));
            return { resourceType: e.resourceType, resource };
        });
        return { ...preset, refs, entries };
    }

    async _check(handle, id, candidate) {
        fields(candidate, ['schemaVersion', 'presetId', 'basePresetFingerprint', 'declarationFingerprint', 'baseRoute', 'moduleRef', 'diff', 'candidateId', 'changedRefs']);
        const { preset, root, fingerprint } = await this._read(handle, id);
        const declaration = root.promptEvolution?.declaration;
        if (candidate.schemaVersion !== 1 || candidate.presetId !== id || fingerprint !== candidate.basePresetFingerprint || declaration?.schemaVersion !== 1 || hashNativeDocument(declaration) !== candidate.declarationFingerprint) conflict();
        const { candidateId, changedRefs, ...seed } = candidate;
        if (candidateId !== hashNativeDocument(seed)) throw new TypeError('Prompt candidate identity mismatch');
        fields(candidate.diff, ['field', 'before', 'after']);
        body(candidate.diff.before); body(candidate.diff.after);
        const moduleRef = assertExactResourceRef(candidate.moduleRef, MODULE);
        if (candidate.diff.field !== 'body' || !declaration.moduleRefs.some(r => same(r, moduleRef)) || !preset.refs.some(r => same(r, moduleRef))) throw new TypeError('Invalid Prompt body declaration');
        const source = preset.entries.find(e => e.resource.promptModuleId === moduleRef.resourceId);
        if (candidate.diff.before !== source.resource.body || candidate.diff.after === source.resource.body) throw new TypeError('Invalid Prompt diff');
        const required = preset.refs.filter(r => r.resourceType === PROGRAM || same(r, moduleRef));
        if (!Array.isArray(changedRefs) || changedRefs.length !== required.length || new Set(changedRefs.map(r => r.resourceId)).size !== required.length) throw new TypeError('Invalid candidate closure');
        for (const ref of changedRefs) {
            assertExactResourceRef(ref);
            if (ref.scope !== 'library' || !required.some(r => r.resourceType === ref.resourceType && r.resourceId === ref.resourceId && r.revision !== ref.revision)) throw new TypeError('Invalid candidate revision');
        }
        const route = assertRuntimeRoute(candidate.baseRoute);
        if (route.scope !== 'player' || !same(route.promptProgramRef, preset.refs.find(r => r.resourceId === id)) || !preset.refs.some(r => same(r, route.generationProfileRef))) throw new TypeError('Invalid candidate base binding');
        const desired = this._desired(preset, candidate);
        for (const e of desired.entries) {
            const ref = desired.refs.find(r => r.resourceId === (e.resource.promptModuleId || e.resource.promptProgramId || e.resource.generationProfileId));
            const actual = await this.engine.withTransaction(handle, tx => getNativeDocument(tx, key(handle, ref)));
            if (!actual) throw new NotFoundError('Candidate exact Prompt revision');
            if (!same(actual, e.resource)) throw new TypeError('Candidate exact Prompt content mismatch');
        }
        validateBodyBindings(desired, moduleRef.resourceId);
        const desiredRoute = assertRuntimeRoute({ ...route, promptProgramRef: desired.refs.find(r => r.resourceId === id) });
        const current = await this.persistence.getRuntimeRoute(handle, route.runtimeRouteId);
        const alreadyApplied = same(current, desiredRoute);
        if (!alreadyApplied && !same(current, route)) conflict();
        return { candidate: structuredClone(candidate), desiredRoute, alreadyApplied };
    }

    async check(handle, id, candidateId) {
        return withRuntimeWrite(handle, async () => {
            const { root } = await this._read(handle, id);
            const candidate = root.promptEvolution?.candidates.find(c => c.candidateId === candidateId);
            if (!candidate) throw new NotFoundError('Prompt candidate');
            return this._check(handle, id, candidate);
        });
    }

    async apply(handle, id, candidateId) {
        return withRuntimeWrite(handle, async () => {
            assertWritable();
            const { root } = await this._read(handle, id);
            const candidate = root.promptEvolution?.candidates.find(c => c.candidateId === candidateId);
            if (!candidate) throw new NotFoundError('Prompt candidate');
            const result = await this._check(handle, id, candidate);
            if (!result.alreadyApplied) await this.engine.withTransaction(handle, async tx => {
                assertWritable();
                await putMutable(tx, { kind: K.runtimeRoute, handle, runtimeRouteId: result.desiredRoute.runtimeRouteId }, result.desiredRoute, { expectedIntegrity: hashNativeDocument(candidate.baseRoute) });
            });
            return result;
        });
    }
}
