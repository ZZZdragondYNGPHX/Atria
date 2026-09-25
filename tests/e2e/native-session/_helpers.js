import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { installFixture, sessionFixture } from '../../native/helpers/session-fixture.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const SCRATCH_ROOT = resolve(REPO_ROOT, 'tests/.e2e-scratch');
const HANDLE = 'default-user';

function treeDigest(root) {
    if (!existsSync(root)) return null;
    const hash = createHash('sha256');
    const visit = (dir) => {
        for (const name of readdirSync(dir).sort()) {
            const full = resolve(dir, name);
            const rel = relative(root, full).split(sep).join('/');
            const stat = statSync(full);
            if (stat.isDirectory()) {
                hash.update(`D\0${rel}\0`);
                visit(full);
            } else if (stat.isFile()) {
                hash.update(`F\0${rel}\0`);
                hash.update(readFileSync(full));
                hash.update('\0');
            }
        }
    };
    visit(root);
    return hash.digest('hex');
}

export function snapshotLegacyPersistence(dataRoot) {
    const userRoot = resolve(dataRoot, HANDLE);
    return Object.freeze({
        chats: treeDigest(resolve(userRoot, 'chats')),
        characters: treeDigest(resolve(userRoot, 'characters')),
        worlds: treeDigest(resolve(userRoot, 'worlds')),
        files: treeDigest(resolve(userRoot, 'files')),
    });
}

export function snapshotNativePersistence(dataRoot) {
    const userRoot = resolve(dataRoot, HANDLE);
    return Object.freeze({
        resources: treeDigest(resolve(userRoot, 'atria-native/resources')),
        blobs: treeDigest(resolve(userRoot, 'assets/atria-native/blobs')),
    });
}

export async function seedNativeSessionDataRoot({ suffix = 'runtime' } = {}) {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    const dataRoot = mkdtempSync(resolve(SCRATCH_ROOT, `native-session-n4-${suffix}-`));
    const userRoot = resolve(dataRoot, HANDLE);
    const assets = resolve(userRoot, 'assets');
    mkdirSync(assets, { recursive: true });

    const settings = JSON.parse(readFileSync(resolve(REPO_ROOT, 'default/content/settings.json'), 'utf8'));
    settings.firstRun = false;
    writeFileSync(resolve(userRoot, 'settings.json'), JSON.stringify(settings, null, 4));

    const fixture = sessionFixture();
    fixture.manifest.name = 'N4 Native Live Package';
    fixture.manifest.capabilities = [...new Set([...(fixture.manifest.capabilities || []), 'processors'])];
    fixture.manifest.actors[0].profile = {
        description: 'N4_NATIVE_ACTOR_DESCRIPTION',
        personality: 'N4_NATIVE_ACTOR_PERSONALITY',
        scenario: 'N4_NATIVE_ACTOR_SCENARIO',
        systemPrompt: 'N4_NATIVE_SYSTEM_PROMPT: respond as the live Native Session actor.',
    };
    fixture.manifest.entryPoints[0].primaryActorId = fixture.manifest.actors[0].actorId;

    fixture.knowledge.entries[0].content = 'N4_NATIVE_KNOWLEDGE_PAYLOAD: the obsidian beacon answers only to the cobalt tide.';
    fixture.knowledge.entries[0].discovery = { keywords: ['N4-LORE'] };
    fixture.knowledge.entries[0].delivery = { priority: 88, position: 'before' };

    fixture.manifest.processors = {
        regex: [
            {
                scriptName: 'n4-native-pre',
                findRegex: '/\\[N4_PRE\\]/g',
                replaceString: 'N4_PRE_APPLIED',
                placement: [1],
                disabled: false,
                markdownOnly: false,
                promptOnly: false,
                pluginOnly: false,
                runOnEdit: false,
            },
            {
                scriptName: 'n4-native-post',
                findRegex: '/lantern/g',
                replaceString: 'LANTERN_NATIVE',
                placement: [2],
                disabled: false,
                markdownOnly: false,
                promptOnly: false,
                pluginOnly: false,
                runOnEdit: false,
            },
        ],
    };

    const dirs = { root: userRoot, assets };
    const engine = new FsEngine({
        directoriesByHandle: handle => {
            if (handle !== HANDLE) throw new Error(`Unexpected N4 e2e handle: ${handle}`);
            return dirs;
        },
    });
    const installed = await installFixture({ engine, handle: HANDLE, dirs }, fixture);

    await engine.close();

    return {
        dataRoot,
        handle: HANDLE,
        start: installed.start,
        fixture,
    };
}

export async function createAndOpenNativeSession(page, start) {
    return page.evaluate(async (payload) => {
        const ctx = window.Atria.getContext();
        const response = await fetch('/api/native/session/create', {
            method: 'POST',
            headers: ctx.getRequestHeaders(),
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Native session create failed (${response.status})`);
        const created = await response.json();
        const mod = await import('/script.js');
        await mod.openNativeSession(created.session.sessionId);
        return {
            sessionId: created.session.sessionId,
            revisionId: mod.nativeSessionRuntime.snapshot.revision.revisionId,
            branchId: mod.nativeSessionRuntime.snapshot.revision.branchId,
        };
    }, start);
}

export async function openNativeSession(page, sessionId, options = {}) {
    return page.evaluate(async ({ sessionId, options }) => {
        const mod = await import('/script.js');
        await mod.openNativeSession(sessionId, options);
        return {
            sessionId: mod.nativeSessionRuntime.snapshot.session.sessionId,
            revisionId: mod.nativeSessionRuntime.snapshot.revision.revisionId,
            branchId: mod.nativeSessionRuntime.snapshot.revision.branchId,
            activeBranchId: mod.nativeSessionRuntime.snapshot.session.activeBranchId,
            history: mod.nativeSessionRuntime.history,
        };
    }, { sessionId, options });
}

export async function nativeRuntimeState(page) {
    return page.evaluate(async () => {
        const mod = await import('/script.js');
        const ctx = window.Atria.getContext();
        const snapshot = mod.nativeSessionRuntime.snapshot;
        return {
            active: mod.nativeSessionRuntime.active,
            failed: mod.nativeSessionRuntime.failed,
            history: mod.nativeSessionRuntime.history,
            generation: mod.nativeSessionRuntime.generation
                ? { kind: mod.nativeSessionRuntime.generation.kind ?? null }
                : null,
            sessionId: snapshot?.session?.sessionId ?? null,
            revisionId: snapshot?.revision?.revisionId ?? null,
            branchId: snapshot?.revision?.branchId ?? null,
            activeBranchId: snapshot?.session?.activeBranchId ?? null,
            messages: (ctx.chat || []).map(message => ({
                mes: message.mes,
                is_user: Boolean(message.is_user),
                swipe_id: message.swipe_id,
                swipes: Array.isArray(message.swipes) ? [...message.swipes] : [],
                messageId: message.atri_native?.messageId ?? null,
                variantIds: Array.isArray(message.atri_native?.variantIds) ? [...message.atri_native.variantIds] : [],
                files: (message.extra?.files || []).map(file => ({ ...file })),
                media: (message.extra?.media || []).map(file => ({ ...file })),
            })),
        };
    });
}

export async function loadNativeSnapshot(page, sessionId, revisionId = undefined) {
    return page.evaluate(async ({ sessionId, revisionId }) => {
        const ctx = window.Atria.getContext();
        const response = await fetch('/api/native/session/load', {
            method: 'POST',
            headers: ctx.getRequestHeaders(),
            body: JSON.stringify({ sessionId, ...(revisionId === undefined ? {} : { revisionId }) }),
        });
        if (!response.ok) throw new Error(`Native session load failed (${response.status})`);
        return response.json();
    }, { sessionId, revisionId });
}

export async function rememberR7Nodes(page) {
    await page.evaluate(() => {
        window.__n4R7Nodes = {
            sheld: document.querySelector('#sheld'),
            chat: document.querySelector('#chat'),
            formSheld: document.querySelector('#form_sheld'),
            sendForm: document.querySelector('#send_form'),
            textarea: document.querySelector('#send_textarea'),
            send: document.querySelector('#send_but'),
            shell: document.querySelector('#atria-shell'),
        };
    });
}

export async function assertR7NodesStable(page) {
    return page.evaluate(() => {
        const before = window.__n4R7Nodes || {};
        const selectors = {
            sheld: '#sheld',
            chat: '#chat',
            formSheld: '#form_sheld',
            sendForm: '#send_form',
            textarea: '#send_textarea',
            send: '#send_but',
            shell: '#atria-shell',
        };
        const result = {};
        for (const [key, selector] of Object.entries(selectors)) {
            const current = document.querySelector(selector);
            result[key] = {
                same: before[key] === current,
                count: document.querySelectorAll(selector).length,
                present: Boolean(current),
            };
        }
        return result;
    });
}

// Open only the requested editor sections, preserving other disclosure state.
export async function openPromptSections(page, ...keys) {
    for (const key of keys) {
        const summary = page.locator(`[data-prompt-fold="${key}"]:not([open]) > summary`);
        if (await summary.count()) await summary.click();
    }
}
