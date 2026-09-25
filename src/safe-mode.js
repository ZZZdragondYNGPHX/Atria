// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

import fs from 'node:fs';
import path from 'node:path';

import { getAllUserHandles } from './users.js';
import { getSettingsRepo } from './storage/index.js';

const SENTINEL_FILE_NAME = '.atria-safe-mode.json';
const APPLIED_LOG_FILE_NAME = '.atria-safe-mode-applied.log';

/** Disable the two optional Global Plugins after a Native boot watchdog failure.
 * Agents and Work capabilities keep their domain ownership and configuration.
 * @param {string} dataRoot Absolute data root.
 */
export async function applyPendingSafeMode(dataRoot) {
    const sentinel = path.join(dataRoot, SENTINEL_FILE_NAME);
    if (!fs.existsSync(sentinel)) {
        return;
    }

    let sentinelReason = '<unspecified>';
    try {
        const raw = fs.readFileSync(sentinel, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.reason === 'string') {
            sentinelReason = parsed.reason;
        }
    } catch {
        // Sentinel may be empty or malformed — treat as "applied with unknown reason".
    }

    const globalPlugins = ['regex', 'search-tools'];
    const handles = await getAllUserHandles();
    const repo = getSettingsRepo();

    let disabledCount = 0;
    let userCount = 0;
    for (const handle of handles) {
        const settings = (await repo.get(handle)) ?? {};
        const retained = new Set(['disabledPlugins', 'regex', 'regex_presets', 'regex_section_collapsed', 'character_allowed_regex', 'preset_allowed_regex', 'note', 'variables', 'attachments', 'character_attachments', 'disabled_attachments', 'orchestrator', 'memory_graph', 'game-runtime', 'search_tools']);
        const capabilities = Object.fromEntries(Object.entries(settings.atri_capabilities || settings.extension_settings || {}).filter(([key]) => retained.has(key)));
        const existing = Array.isArray(capabilities.disabledPlugins) ? capabilities.disabledPlugins : [];
        const merged = globalPlugins;
        settings.atri_capabilities = { ...capabilities, disabledPlugins: merged };
        await repo.save(handle, settings);
        disabledCount += (merged.filter(name => !existing.includes(name)).length);
        userCount += 1;
    }

    const summary = {
        appliedAt: new Date().toISOString(),
        reason: sentinelReason,
        userCount,
        disabledCount,
        globalPlugins,
    };

    try {
        const appliedLog = path.join(dataRoot, APPLIED_LOG_FILE_NAME);
        fs.writeFileSync(appliedLog, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    } catch (err) {
        console.warn('safe-mode: failed to write applied log', err?.message || err);
    }

    try {
        fs.unlinkSync(sentinel);
    } catch (err) {
        console.warn('safe-mode: failed to remove sentinel; next launch may re-disable', err?.message || err);
    }

    console.log(
        `safe-mode: applied (reason=${sentinelReason}); disabled ${disabledCount} Global Plugin(s) ` +
        `across ${userCount} user(s).`,
    );
}
