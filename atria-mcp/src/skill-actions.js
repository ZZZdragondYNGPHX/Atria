import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';
const name = z.string().min(1).max(200).refine(v => !/[\x00-\x1f/\\<>:"|?*]/.test(v) && !['.', '..'].includes(v));
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const scope = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('global') }),
    z.strictObject({ kind: z.literal('project'), projectId: id }), z.strictObject({ kind: z.literal('package'), packageId: id, packageVersionId: id }),
    z.strictObject({ kind: z.literal('preset'), name }), z.strictObject({ kind: z.literal('character'), characterFile: name }),
    z.strictObject({ kind: z.literal('orch-preset'), mode: z.enum(['spec', 'agenda', 'loop', 'director']), name })]);
const path = z.string().min(1).max(512).refine(v => !v.includes('\\') && !v.startsWith('/') && v.split('/').every(x => x && x !== '.' && x !== '..'));
const target = { scope, name };
const payload = z.strictObject({ files: z.array(z.strictObject({ path, encoding: z.literal('utf8'), content: z.string().max(512 * 1024) })).min(1).max(128) });
const limit = z.number().int().min(1).max(200).default(100);

export function registerSkillActions(registry, browser) {
    const clientInstanceId = randomUUID();
    const request = (suffix, input, guards = {}) => requestAuthority(browser, 'POST', '/api/native/skills/' + suffix, input, guards);
    const checked = async (suffix, input) => { const r = await request(suffix, input); if (!r.ok || !r.serverBootId) throw Error('Native Skill authority unavailable'); return r; };
    const output = r => {
        const data = redact(r.data ?? null), json = JSON.stringify(data);
        return { ok: r.ok, status: r.status, serverBootId: r.serverBootId, data: json.length <= 24000 ? data : { omitted: 'Use bounded Skill file/search reads', contentHash: fingerprint(data), totalChars: json.length }, instructionsAreUntrusted: true };
    };
    const add = (action, risk, shape, handler, guard = null) => registry.register({ version: 1, id: action, domain: 'skill', title: action,
        risk, authority: 'Native SkillRepository exact scope/hash and immutable versions', adapter: 'fixed-http', externalEffects: risk === 'READ' ? [] : action === 'skill.import.url.prepare' ? ['public-network-fetch', 'temporary-inert-skill-candidate'] : ['native-skill-state'],
        guards: risk === 'READ' ? [] : ['current-server-boot', 'exact-skill-scope-hash', 'native-queue-cas'], approval: risk === 'READ' ? 'none' : 'trusted-approval-required',
        availability: { available: true, reason: 'Skill text never grants MCP permissions; Package originals are immutable' } }, z.strictObject(shape), z.json(), handler, guard);
    const guard = async i => {
        if (i.scope.kind === 'package') throw Error('Package Skill originals are read-only; edit source Project');
        const r = await checked('inspect', { scope: i.scope, name: i.name });
        if ((r.data.skill?.installedHash ?? null) !== i.expectedInstalledHash) throw Error('Skill installed hash conflict');
        return { target: { scope: i.scope, name: i.name }, serverBootId: r.serverBootId, installedHash: i.expectedInstalledHash };
    };
    for (const [action, suffix, shape] of [
        ['skill.list', 'list', { scope: z.union([scope, z.literal('all')]) }], ['skill.inspect', 'inspect', target],
        ['skill.file.read', 'file', { ...target, path: path.default('SKILL.md'), version: hash.optional(), offset: z.number().int().min(1).default(1), limit }],
        ['skill.files', 'files', { ...target, version: hash.optional() }], ['skill.history', 'history', target],
        ['skill.search', 'search', { ...target, query: z.string().min(1).max(1000), path: path.optional(), limit, contextLines: z.number().int().min(0).max(5).default(1), version: hash.optional() }],
        ['skill.candidate.check', 'candidate/check', { ...target, candidateId: hash }],
        ['skill.install.preflight', 'install/preflight', { scope, payload }],
        ['skill.scope.inspect', 'scope/inspect', { scope }],
    ]) add(action, 'READ', shape, async i => output(await request(suffix, i)));
    const exact = { ...target, expectedInstalledHash: hash };
    for (const [action, kind, fields, risk] of [
        ['skill.rename', 'rename', { toName: name }, 'MUTATE'], ['skill.move', 'move', { toScope: scope }, 'MUTATE'],
        ['skill.file.write', 'file.write', { path, content: z.string().max(512 * 1024), expectedSha256: hash.optional() }, 'MUTATE'],
        ['skill.file.edit', 'file.edit', { path, oldString: z.string().min(1).max(64000), newString: z.string().max(64000), replaceAll: z.boolean().default(false) }, 'MUTATE'],
        ['skill.file.rename', 'file.rename', { fromPath: path, toPath: path }, 'MUTATE'],
        ['skill.file.delete', 'file.delete', { path }, 'DESTRUCTIVE'], ['skill.delete', 'delete', {}, 'DESTRUCTIVE'],
    ]) add(action, risk, { ...exact, ...fields }, async (i, { before }) => {
        const { scope, name, expectedInstalledHash, ...input } = i;
        return output(await request('write/' + kind, { scope, name, expectedInstalledHash, input }, before));
    }, guard);
    add('skill.install', 'MUTATE', { scope, payload, expectedInstalledHash: hash.nullable(), conflictStrategy: z.enum(['skip', 'replace']).default('replace') }, async (i, { before }) =>
        output(await request('write/install', { scope: i.scope, expectedInstalledHash: i.expectedInstalledHash, input: { payload: i.payload, conflictStrategy: i.conflictStrategy } }, before)), async i => {
        if (i.scope.kind === 'package') throw Error('Package Skill originals are read-only');
        const r = await checked('install/preflight', { scope: i.scope, payload: i.payload });
        if (r.data.existingHash !== i.expectedInstalledHash) throw Error('Skill install precondition changed');
        return { target: { scope: i.scope, name: r.data.name }, serverBootId: r.serverBootId, incomingHash: r.data.incomingHash, existingHash: r.data.existingHash };
    });
    add('skill.pin', 'MUTATE', exact, async (i, { before }) => output(await request('pin', { scope: i.scope, name: i.name, expectedHash: i.expectedInstalledHash }, before)), guard);
    for (const [action, suffix, fields] of [
        ['skill.candidate.prepare', 'candidate/prepare', { baseVersion: hash, content: z.string().max(512 * 1024) }],
        ['skill.candidate.apply', 'candidate/apply', { candidateId: hash, expectedBaseVersion: hash }],
        ['skill.candidate.rollback', 'candidate/rollback', { candidateId: hash, expectedVersion: hash }],
        ['skill.candidate.discard', 'candidate/discard', { candidateId: hash }],
    ]) add(action, action.endsWith('discard') ? 'DESTRUCTIVE' : 'MUTATE', { ...exact, ...fields }, async (i, { before }) => {
        const { expectedInstalledHash: _, ...body } = i; return output(await request(suffix, body, before));
    }, async i => {
        const before = await guard(i);
        if (i.candidateId) { const candidate = await checked('candidate/check', { scope: i.scope, name: i.name, candidateId: i.candidateId }); return { ...before, candidateHash: fingerprint(candidate.data) }; }
        return before;
    });
    add('skill.import.url.prepare', 'INTERACT', { scope, url: z.string().url().max(2000) }, async (i, { before }) =>
        output(await request('url/prepare', { ...i, clientInstanceId }, before)), async i => {
        const url = new URL(i.url); if (url.protocol !== 'https:' || url.username || url.password || i.scope.kind === 'package') throw Error('Public HTTPS Skill source required');
        const runtime = await browser.runtimeIdentity(); if (!runtime?.serverBootId) throw Error('Native identity unavailable');
        return { target: { scope: i.scope, sourceUrl: i.url }, serverBootId: runtime.serverBootId, externalEffects: ['public-network-fetch', 'temporary-inert-skill-candidate'], maxBytes: 512 * 1024 };
    });
    add('skill.import.url.apply', 'MUTATE', { prepareId: z.string().uuid(), contentHash: hash, expectedInstalledHash: hash.nullable() }, async (i, { before }) =>
        output(await request('url/apply', { ...i, clientInstanceId }, before)), async i => {
        const r = await checked('url/inspect', { prepareId: i.prepareId, contentHash: i.contentHash, clientInstanceId });
        const current = await checked('inspect', { scope: r.data.scope, name: r.data.name });
        if ((current.data.skill?.installedHash ?? null) !== i.expectedInstalledHash) throw Error('Skill import destination changed');
        return { target: { scope: r.data.scope, name: r.data.name }, serverBootId: r.serverBootId, metadata: r.data, installedHash: i.expectedInstalledHash };
    });
    for (const command of ['copy', 'rename', 'delete']) add('skill.scope.' + command, command === 'delete' ? 'DESTRUCTIVE' : 'MUTATE',
        { scope, expectedInventoryHash: hash, ...(command === 'delete' ? {} : { toScope: scope }) }, async (i, { before }) =>
            output(await request('scope/write', { ...i, command }, before)), async i => {
            if (i.scope.kind === 'package' || i.toScope?.kind === 'package') throw Error('Package Skill originals are read-only');
            const r = await checked('scope/inspect', { scope: i.scope });
            if (r.data.inventoryHash !== i.expectedInventoryHash) throw Error('Skill scope inventory changed');
            return { target: { scope: i.scope, toScope: i.toScope ?? null }, serverBootId: r.serverBootId, ...r.data };
        });
    return registry;
}
