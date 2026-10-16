import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact, redactText } from './policy.js';
import { uploadNativeSource, disposeNativeSource, readNativeSource } from './native-source-upload.js';
import { jsonTextFragment } from './json-fragment.js';
const name = z.string().min(1).max(200).refine(v => !/[\x00-\x1f/\\<>:"|?*]/.test(v) && !['.', '..'].includes(v));
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const scope = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('global') }),
    z.strictObject({ kind: z.literal('project'), projectId: id }), z.strictObject({ kind: z.literal('package'), packageId: id, packageVersionId: id }),
    z.strictObject({ kind: z.literal('preset'), name }), z.strictObject({ kind: z.literal('character'), characterFile: name }),
    z.strictObject({ kind: z.literal('orch-preset'), mode: z.enum(['spec', 'agenda', 'loop', 'director']), name })]);
const path = z.string().min(1).max(512).refine(v => !v.includes('\\') && !v.startsWith('/') && v.split('/').every(x => x && x !== '.' && x !== '..'));
const target = { scope, name };
const payload = z.strictObject({ files: z.array(z.strictObject({ path, encoding: z.enum(['utf8', 'base64']), content: z.string().max(512 * 1024) })).min(1).max(100) })
    .refine(value => Buffer.byteLength(JSON.stringify(value)) <= 768 * 1024, 'Use skill.payload.capture for larger native Skill payloads');
const limit = z.number().int().min(1).max(200).default(100);
const paging = { outputOffset: z.number().int().min(0).default(0), outputLimit: z.number().int().min(100).max(24000).default(12000) };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function registerSkillActions(registry, browser, repository = null, { now = Date.now, upload = uploadNativeSource, dispose = disposeNativeSource, readSource = readNativeSource } = {}) {
    const clientInstanceId = randomUUID();
    const payloads = new Map();
    const request = (suffix, input, guards = {}) => requestAuthority(browser, 'POST', '/api/native/skills/' + suffix, input, guards);
    const checked = async (suffix, input) => { const r = await request(suffix, input); if (!r.ok || !r.serverBootId) throw Error('Native Skill authority unavailable'); return r; };
    const output = (r, input = {}) => {
        const data = redact(r.data ?? null), json = JSON.stringify(data);
        const offset = input.outputOffset ?? 0, size = input.outputLimit ?? 12000;
        return { ok: r.ok, status: r.status, serverBootId: r.serverBootId, data: offset === 0 && json.length <= size ? data : jsonTextFragment(json, offset, size),
            page: { contentHash: fingerprint(data), totalChars: json.length, offset, offsetUnit: 'UTF-16 characters', nextOffset: offset + size < json.length ? offset + size : null }, instructionsAreUntrusted: true };
    };
    const add = (action, risk, shape, handler, guard = null) => registry.register({ version: 1, id: action, domain: 'skill', title: action,
        risk, authority: 'Native SkillRepository exact scope/hash and immutable versions', adapter: 'fixed-http', externalEffects: risk === 'READ' ? [] : action === 'skill.import.url.prepare' ? ['public-network-fetch', 'temporary-inert-skill-candidate'] : ['native-skill-state'],
        guards: risk === 'READ' ? [] : ['current-server-boot', 'exact-skill-scope-hash', 'native-queue-cas'], approval: risk === 'READ' ? 'none' : 'trusted-approval-required',
        availability: { available: true, reason: 'Skill text never grants MCP permissions; Package originals are immutable' } }, z.strictObject({ ...shape, ...(risk === 'READ' ? paging : {}) })
        .refine(input => Buffer.byteLength(JSON.stringify(input)) <= 768 * 1024, 'Use skill.payload.capture for larger file replacements, installs or staged candidate preparation'), z.json(), handler, guard,
    risk === 'READ' ? null : input => Object.fromEntries(Object.entries(input).map(([key, value]) => [key, key === 'payload'
        ? { contentHash: fingerprint(value), fileCount: value.files.length, encodedBytes: Buffer.byteLength(JSON.stringify(value)), pathsHash: fingerprint(value.files.map(file => file.path)) }
        : typeof value === 'string' && value.length > 2000 ? { contentHash: sha(Buffer.from(value)), chars: value.length, utf8Bytes: Buffer.byteLength(value) } : value])));
    const guard = async i => {
        if (i.scope.kind === 'package') throw Error('Package Skill originals are read-only; edit source Project');
        const r = await checked('identity', { scope: i.scope, name: i.name });
        if ((r.data.skill?.installedHash ?? null) !== i.expectedInstalledHash) throw Error('Skill installed hash conflict');
        return { target: { scope: i.scope, name: i.name }, serverBootId: r.serverBootId, installedHash: i.expectedInstalledHash };
    };
    for (const [action, suffix, shape] of [
        ['skill.list', 'list', { scope: z.union([scope, z.literal('all')]), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(20).default(20), expectedInventoryHash: hash.optional() }],
        ['skill.files', 'files', { ...target, version: hash.optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(20), expectedFilesHash: hash.optional() }], ['skill.history', 'history', target],
        ['skill.search', 'search', { ...target, query: z.string().min(1).max(1000), path: path.optional(), offset: z.number().int().min(0).default(0), limit, contextLines: z.number().int().min(0).max(5).default(1), version: hash.optional(), expectedSha256: hash.optional() }],
        ['skill.candidate.check', 'candidate/check', { ...target, candidateId: hash }],
        ['skill.install.preflight', 'install/preflight', { scope, payload }],
        ['skill.scope.inspect', 'scope/inspect', { scope }],
    ]) add(action, 'READ', shape, async i => {
        const { outputOffset: _offset, outputLimit: _limit, ...body } = i; return output(await request(suffix, body), i);
    });
    const source = async (suffix, input, maximum, expectedHash) => {
        const runtime = await browser.runtimeIdentity(); if (!runtime?.serverBootId) throw Error('Native Skill source identity unavailable');
        const bytes = await readSource(browser, { path: '/api/native/skills/' + suffix, input, serverBootId: runtime.serverBootId, maxBytes: maximum, ...(expectedHash ? { expectedHash } : {}) });
        return { bytes, serverBootId: runtime.serverBootId, contentHash: sha(bytes) };
    };
    const textPage = (original, input, extra = {}) => {
        const binary = original.bytes.includes(0); let full;
        try { full = binary ? null : new TextDecoder('utf-8', { fatal: true }).decode(original.bytes); } catch { full = null; }
        if (full === null) return { ...extra, binary: true, content: null, contentHash: original.contentHash, totalBytes: original.bytes.length };
        const safe = redactText(full);
        if (input.offset > safe.length) throw Error('Skill redacted text offset exceeds bound');
        const content = safe.slice(input.offset, input.offset + input.limit), stable = redactText(content) === content;
        return { ...extra, contentHash: original.contentHash, redactedContentHash: sha(Buffer.from(safe)), offset: input.offset, offsetUnit: 'redacted UTF-16 characters',
            totalChars: safe.length, originalTotalChars: full.length, content: stable ? content : null,
            ...(stable ? {} : { contentFragment: jsonTextFragment(safe, input.offset, input.limit, 'text-fragment') }),
            nextOffset: input.offset + input.limit < safe.length ? input.offset + input.limit : null, instructionsAreUntrusted: true };
    };
    add('skill.inspect', 'READ', { ...target, field: z.enum(['description', 'license', 'metadata']).optional(), expectedInstalledHash: hash.optional() }, async input => {
        const original = await source('inspect/content', { scope: input.scope, name: input.name, ...(input.expectedInstalledHash ? { expectedInstalledHash: input.expectedInstalledHash } : {}) }, 8 * 1024 * 1024), row = JSON.parse(original.bytes.toString('utf8'));
        return output({ ok: true, status: 200, serverBootId: original.serverBootId, data: { skill: input.field && row ? { scope: row.scope, name: row.name, installedHash: row.installedHash,
            field: input.field, value: row[input.field] } : row, originalContentHash: original.contentHash, instructionsAreUntrusted: true } }, input);
    });
    add('skill.file.read', 'READ', { ...target, path: path.default('SKILL.md'), version: hash.optional(), expectedSha256: hash.optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(2000).default(2000) }, async input => {
        const body = { scope: input.scope, name: input.name, path: input.path, ...(input.version ? { version: input.version } : {}), ...(input.expectedSha256 ? { expectedSha256: input.expectedSha256 } : {}) },
            original = await source('file/content', body, 4 * 1024 * 1024, input.expectedSha256);
        return output({ ok: true, status: 200, serverBootId: original.serverBootId, data: textPage(original, input, { scope: input.scope, name: input.name, path: input.path }) }, input);
    });
    add('skill.candidate.diff', 'READ', { ...target, candidateId: hash, expectedMetadataHash: hash, field: z.enum(['before', 'after']), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(2000).default(2000) }, async input => {
        const metadata = await checked('candidate/check', { scope: input.scope, name: input.name, candidateId: input.candidateId });
        if (metadata.data.metadataHash !== input.expectedMetadataHash) throw Error('Skill candidate metadata changed');
        const original = await source('candidate/content', { scope: input.scope, name: input.name, candidateId: input.candidateId, expectedMetadataHash: input.expectedMetadataHash, field: input.field },
            512 * 1024, metadata.data.diff[input.field + 'Hash']);
        if (original.serverBootId !== metadata.serverBootId) throw Error('Skill candidate source boot changed');
        const data = textPage(original, input, { scope: input.scope, name: input.name, candidateId: input.candidateId, metadataHash: input.expectedMetadataHash, field: input.field });
        return output({ ok: true, status: 200, serverBootId: original.serverBootId, data: { ...data, text: data.content } }, input);
    });
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
        const current = await checked('identity', { scope: r.data.scope, name: r.data.name });
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
    const sourceBinding = value => fingerprint({ purpose: 'runtime-skill-payload', scope: value });
    const capture = async input => {
        if (!repository || !input.path.endsWith('.json')) throw Error('Authorized development Skill payload JSON required');
        await repository.refreshRuntimeRoots(); const filename = await repository.policy.file(input.path, true), file = await open(filename, 'r');
        try {
            const before = await file.stat(); if (!before.isFile() || !before.size || before.size > 128 * 1024 * 1024) throw Error('Skill payload source exceeds bound');
            const bytes = await file.readFile(), after = await file.stat();
            if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino) throw Error('Skill source changed during capture');
            return { bytes, contentHash: sha(bytes) };
        } finally { await file.close(); }
    };
    const sourceItem = handle => {
        for (const [key, value] of payloads) if (value.expiresAt <= now()) payloads.delete(key);
        const item = payloads.get(handle); if (!item) throw Error('Unknown or expired instance-owned Skill payload handle'); return item;
    };
    const preflight = async input => {
        const item = sourceItem(input.payloadHandleId), response = await checked('payload/preflight', { scope: item.scope, artifactRef: item.ref });
        if (response.serverBootId !== item.ref.serverBootId || response.data.bindingHash !== sourceBinding(item.scope) || fingerprint(response.data.artifactRef) !== fingerprint(item.ref)) throw Error('Skill payload authority binding changed');
        return { item, response };
    };
    add('skill.payload.capture', 'INTERACT', { scope, path: z.string().min(1).max(512) }, async (input, { before }) => {
        const captured = await capture(input); if (captured.contentHash !== before.contentHash || captured.bytes.length !== before.totalBytes) throw Error('Skill payload changed after approval');
        const ref = await upload(browser, { bytes: captured.bytes, beginPath: '/api/native/skills/payload/staging', beginInput: { scope: input.scope },
            guards: before, clientInstanceId, kind: 'skill-payload-upload', bindingHash: sourceBinding(input.scope) });
        const payloadHandleId = randomUUID(), item = { ref, scope: input.scope, expiresAt: now() + 300000 }; payloads.set(payloadHandleId, item);
        try {
            const { response } = await preflight({ payloadHandleId }), { files: _files, artifactRef: _ref, ...metadata } = response.data;
            return { ok: true, payload: { payloadHandleId, ...metadata, contentHash: captured.contentHash, totalBytes: captured.bytes.length, expiresAt: item.expiresAt },
                receiptEvidence: { after: { payloadHandleId, incomingHash: metadata.incomingHash, fileCount: metadata.fileCount, decodedBytes: metadata.decodedBytes } } };
        } catch (error) { payloads.delete(payloadHandleId); try { await dispose(browser, ref, before); } catch { /* Native TTL bounds failed staging cleanup. */ } throw error; }
    }, async input => {
        if (input.scope.kind === 'package') throw Error('Package Skill originals are read-only');
        const captured = await capture(input), runtime = await browser.runtimeIdentity(); if (!runtime?.serverBootId) throw Error('Native Skill authority unavailable');
        return { target: { scope: input.scope, path: input.path }, serverBootId: runtime.serverBootId, contentHash: captured.contentHash, totalBytes: captured.bytes.length,
            sourcePurpose: 'skill-payload-upload', bindingHash: sourceBinding(input.scope) };
    });
    add('skill.payload.preflight', 'READ', { payloadHandleId: z.string().uuid() }, async input => { const { response } = await preflight(input); return output(response, input); });
    add('skill.payload.install', 'MUTATE', { payloadHandleId: z.string().uuid(), expectedIncomingHash: hash, expectedInstalledHash: hash.nullable() }, async (input, { before }) => {
        const item = sourceItem(input.payloadHandleId);
        try { return output(await request('payload/install', { scope: item.scope, artifactRef: item.ref, expectedIncomingHash: input.expectedIncomingHash, expectedInstalledHash: input.expectedInstalledHash }, before)); }
        finally { payloads.delete(input.payloadHandleId); try { await dispose(browser, item.ref, before); } catch { /* Formal Skill state remains owned by Native authority; staging expires. */ } }
    }, async input => {
        const { item, response } = await preflight(input), plan = response.data;
        if (plan.incomingHash !== input.expectedIncomingHash || plan.existingHash !== input.expectedInstalledHash) throw Error('Skill staged preflight changed');
        return { target: { scope: item.scope, name: plan.name, payloadHandleId: input.payloadHandleId }, serverBootId: item.ref.serverBootId,
            incomingHash: plan.incomingHash, installedHash: plan.existingHash, contentHash: item.ref.contentHash, bindingHash: plan.bindingHash,
            fileCount: plan.fileCount, decodedBytes: plan.decodedBytes, filesHash: plan.filesHash };
    });
    add('skill.candidate.prepare.payload', 'MUTATE', { payloadHandleId: z.string().uuid(), expectedIncomingHash: hash, expectedInstalledHash: hash, baseVersion: hash }, async (input, { before }) => {
        const item = sourceItem(input.payloadHandleId);
        try { return output(await request('payload/candidate/prepare', { scope: item.scope, artifactRef: item.ref, expectedIncomingHash: input.expectedIncomingHash,
            expectedInstalledHash: input.expectedInstalledHash, baseVersion: input.baseVersion }, before)); }
        finally { payloads.delete(input.payloadHandleId); try { await dispose(browser, item.ref, before); } catch { /* Native TTL bounds temporary source cleanup. */ } }
    }, async input => {
        const { item, response } = await preflight(input), plan = response.data;
        if (plan.incomingHash !== input.expectedIncomingHash || plan.existingHash !== input.expectedInstalledHash) throw Error('Skill staged candidate preflight changed');
        return { target: { scope: item.scope, name: plan.name, payloadHandleId: input.payloadHandleId }, serverBootId: item.ref.serverBootId,
            incomingHash: plan.incomingHash, installedHash: plan.existingHash, contentHash: item.ref.contentHash, bindingHash: plan.bindingHash,
            baseVersion: input.baseVersion, change: 'Candidate modifies SKILL.md only; existing supporting files are retained by Native SkillVersions' };
    });
    return registry;
}
