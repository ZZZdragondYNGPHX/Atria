import { renderRuntimeHelpButton } from '../../lib/runtime-help.js';
import { renderFieldHelpButton } from '../../lib/field-help.js';

export function buildSchemaEditorPopupHtml(deps, popupId, scopeInfo) {
    const {
        escapeHtml,
        i18n,
        i18nFormat,
        normalizeNodeTypeSchema,
        renderNodeTypeSchemaCard,
    } = deps;
    const normalized = normalizeNodeTypeSchema(scopeInfo?.schema);
    const cardsHtml = normalized.map((spec, index) => renderNodeTypeSchemaCard(spec, index)).join('');
    const scopeText = scopeInfo?.hasOverride
        ? i18nFormat('Schema scope: character override (${0})', scopeInfo.characterName || scopeInfo.avatar || i18n('(unset)'))
        : i18n('Schema scope: global');
    return `
<div id="${popupId}" class="atria-rpg-schema-popup">
    <div class="atria-schema-topbar">
        <div>
            <div class="atria-schema-topbar-title">${escapeHtml(i18n('Memory Node Schema Editor'))}</div>
            <div class="atria-schema-topbar-note">${escapeHtml(i18n('Define node tables, extraction hints, and compression strategy. This controls what your memory graph stores and how it compacts over time.'))}</div>
        </div>
        <div class="atria-schema-chip-row">
            <span class="atria-schema-chip hier">${escapeHtml(i18n('Hierarchical Compression'))}</span>
            <span class="atria-schema-chip latest">${escapeHtml(i18n('Latest-only Merge'))}</span>
            <span class="atria-schema-chip inject">${escapeHtml(i18n('Always Inject'))}</span>
        </div>
    </div>
    <div class="atria-schema-editor-list">${cardsHtml}</div>
    <div class="atria-schema-footer">
        <div class="atria-schema-footer-meta">
            <div class="atria-schema-footer-note">${escapeHtml(i18nFormat('Current type count: ${0}', normalized.length))}</div>
            <div id="${popupId}_schema_scope" class="atria-schema-footer-note">${escapeHtml(scopeText)}</div>
        </div>
        <div class="atria-schema-footer-actions">
            <div class="menu_button atria-schema-editor-add">${escapeHtml(i18n('Add Type'))}</div>
            <div class="menu_button atria-schema-editor-reset">${escapeHtml(i18n('Reset to Default Schema'))}</div>
            <div id="${popupId}_schema_export" class="menu_button">${escapeHtml(i18n('Export Schema'))}</div>
            <div id="${popupId}_schema_import" class="menu_button">${escapeHtml(i18n('Import Schema'))}</div>
            <div id="${popupId}_schema_save_global" class="menu_button">${escapeHtml(i18n('Save Schema to Global'))}</div>
            <div id="${popupId}_schema_save_character" class="menu_button">${escapeHtml(i18n('Save Schema to Character'))}</div>
            <div id="${popupId}_schema_clear_character_override" class="menu_button">${escapeHtml(i18n('Clear Character Schema Override'))}</div>
        </div>
    </div>
</div>`;
}

export function buildManualCompressionPopupHtml(deps, popupId, settings, compressibleTypes) {
    const { escapeHtml, i18n } = deps;
    const excludeRecentDefault = Math.max(0, Number(settings.recentRawTurns || 0));
    const maxRoundsDefault = 3;
    const typeRows = compressibleTypes.map(item => `
        <label class="checkbox_label">
            <input type="checkbox" data-field="type" value="${escapeHtml(item.id)}" checked />
            ${escapeHtml(`${item.label} (${item.id}, ${item.mode})`)}
        </label>
    `).join('');
    return `
<div id="${popupId}" class="atria-rpg-memory-advanced-popup">
    <h3 class="margin0">${escapeHtml(i18n('Manual Compression'))}</h3>
    <label>${escapeHtml(i18n('Compression scope'))}
        <select id="${popupId}_scope" class="text_pole">
            <option value="all">${escapeHtml(i18n('All nodes'))}</option>
            <option value="older" selected>${escapeHtml(i18n('Older nodes only (exclude recent N assistant turns)'))}</option>
        </select>
    </label>
    <label id="${popupId}_exclude_recent_label">${escapeHtml(i18n('Exclude recent assistant turns'))}
        <input id="${popupId}_exclude_recent" class="text_pole" type="number" min="0" step="1" value="${excludeRecentDefault}" />
    </label>
    <label>${escapeHtml(i18n('Compression mode'))}
        <select id="${popupId}_mode" class="text_pole">
            <option value="schema" selected>${escapeHtml(i18n('Use schema thresholds'))}</option>
            <option value="force">${escapeHtml(i18n('Force compress (ignore threshold)'))}</option>
            <option value="flat">${escapeHtml(i18n('Force compress across depths (ignore hierarchy)'))}</option>
        </select>
    </label>
    <label>${escapeHtml(i18n('Max rounds per type'))}
        <input id="${popupId}_max_rounds" class="text_pole" type="number" min="1" step="1" value="${maxRoundsDefault}" />
    </label>
    <label>${escapeHtml(i18n('Types to compress'))}</label>
    <div id="${popupId}_types" style="max-height: 200px; overflow: auto; border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; padding: 8px;">
        ${typeRows}
    </div>
</div>`;
}

function buildRecallTabHtml(deps) {
    const { escapeHtml, i18n, world_info_position, extension_prompt_roles } = deps;
    const fh = (titleKey, bodyKey) => renderFieldHelpButton({
        title: i18n(titleKey),
        bodyHtml: escapeHtml(i18n(bodyKey)),
    });
    return `
            <p class="workspace-hint">${escapeHtml(i18n('Hybrid Memory recalls only current, permitted sources.'))}</p>
            ${deps.nativeRuntime ? `<p class="workspace-hint">${escapeHtml(i18n('Choose exact embedding and rerank revisions in Memory Maintenance.'))}</p>` : `<label>${escapeHtml(i18n('Embedding profile'))}</label>
            <select id="atria_rpg_memory_embedding_profile" class="text_pole flex1" aria-label="${escapeHtml(i18n('Embedding profile'))}"></select>`}
            <label class="checkbox_label"><input id="atria_rpg_memory_rerank_enabled" type="checkbox" /> ${escapeHtml(i18n('Enable rerank'))}</label>
            <div id="atria_rpg_memory_rerank_block" hidden>
                ${deps.nativeRuntime ? '' : `<label>${escapeHtml(i18n('Rerank profile'))}</label>
                <select id="atria_rpg_memory_rerank_profile" class="text_pole flex1" aria-label="${escapeHtml(i18n('Rerank profile'))}"></select>`}
            </div>
            <label for="atria_rpg_memory_recall_inject_position">${escapeHtml(i18n('Injection position'))}${fh('About Injection position', 'Injection position help body')}</label>
            <select id="atria_rpg_memory_recall_inject_position" class="text_pole">
                <option value="${world_info_position.before}">${escapeHtml(i18n('Before Character Definitions'))}</option>
                <option value="${world_info_position.after}">${escapeHtml(i18n('After Character Definitions'))}</option>
                <option value="${world_info_position.ANTop}">${escapeHtml(i18n('Before Author\'s Note'))}</option>
                <option value="${world_info_position.ANBottom}">${escapeHtml(i18n('After Author\'s Note'))}</option>
                <option value="${world_info_position.EMTop}">${escapeHtml(i18n('Before Example Messages'))}</option>
                <option value="${world_info_position.EMBottom}">${escapeHtml(i18n('After Example Messages'))}</option>
                <option value="${world_info_position.atDepth}">${escapeHtml(i18n('At Chat Depth'))}</option>
            </select>
            <div id="atria_rpg_memory_recall_inject_depth_block" style="display:none">
                <label for="atria_rpg_memory_recall_inject_depth">${escapeHtml(i18n('Injection depth'))}${fh('About Injection depth', 'Injection depth help body')}</label>
                <input id="atria_rpg_memory_recall_inject_depth" class="text_pole" type="number" min="0" max="10000" step="1" />
            </div>
            <div id="atria_rpg_memory_recall_inject_role_block" style="display:none">
                <label for="atria_rpg_memory_recall_inject_role">${escapeHtml(i18n('Injection role'))}${fh('About Injection role', 'Injection role help body')}</label>
                <select id="atria_rpg_memory_recall_inject_role" class="text_pole">
                    <option value="${extension_prompt_roles.SYSTEM}">${escapeHtml(i18n('System'))}</option>
                    <option value="${extension_prompt_roles.USER}">${escapeHtml(i18n('User'))}</option>
                    <option value="${extension_prompt_roles.ASSISTANT}">${escapeHtml(i18n('Assistant'))}</option>
                </select>
            </div>
            <label for="atria_rpg_memory_debug_query">${escapeHtml(i18n('Recall debug query'))}${fh('About Recall debug query', 'Recall debug query help body')}</label>
            <input id="atria_rpg_memory_debug_query" class="text_pole" type="text" placeholder="${escapeHtml(i18n('e.g. what happened at the ruins with Mira?'))}" />
            <div class="flex-container">
                <button type="button" id="atria_rpg_memory_recall_debug" class="menu_button">${escapeHtml(i18n('Run Recall Debug'))}</button>
                <button type="button" id="atria_rpg_memory_view_last_injection" class="menu_button">${escapeHtml(i18n('View Last Injection'))}</button>
            </div>`;
}

function buildExtractTabHtml(deps) {
    const { escapeHtml, i18n } = deps;
    const fh = (titleKey, bodyKey) => renderFieldHelpButton({
        title: i18n(titleKey),
        bodyHtml: escapeHtml(i18n(bodyKey)),
    });
    return `
            ${deps.nativeRuntime ? `<p class="workspace-hint">${escapeHtml(i18n('Configure this task’s Memory Runtime Route in Maintenance.'))}</p>` : `<label for="atria_rpg_memory_extract_api_preset">${escapeHtml(i18n('Extract API preset (Connection profile)'))}${fh('About Extract API preset', 'Extract API preset help body')}</label>
            <select id="atria_rpg_memory_extract_api_preset" class="text_pole"></select>
            <label for="atria_rpg_memory_extract_preset">${escapeHtml(i18n('Extract preset (params + prompt)'))}${renderRuntimeHelpButton({ kind: 'iteration', targetSelectId: 'atria_rpg_memory_extract_preset' })}</label>
            <select id="atria_rpg_memory_extract_preset" class="text_pole"></select>`}

            <div class="flex-container">
                <label style="flex:1">${escapeHtml(i18n('Update every N assistant turns'))}${fh('About Update every N assistant turns', 'Update every N assistant turns help body')} <input id="atria_rpg_memory_update_every" class="text_pole" type="number" min="1" step="1" /></label>
            </div>`;
}

function buildGraphTabHtml(deps) {
    const { escapeHtml, i18n } = deps;
    const helpBtn = (titleKey, bodyKey) => renderFieldHelpButton({
        title: i18n(titleKey),
        bodyHtml: escapeHtml(i18n(bodyKey)),
    });
    const btnRow = (id, labelKey, titleKey, bodyKey) => `
                <div class="memory-maintenance-action">
                    <button type="button" id="${id}" class="menu_button">${escapeHtml(i18n(labelKey))}</button>
                    ${helpBtn(titleKey, bodyKey)}
                </div>`;
    return `
            <div class="memory-maintenance-grid">
            ${btnRow('atria_rpg_memory_view_graph', 'View Graph', 'About View Graph', 'View Graph help body')}
            ${btnRow('atria_rpg_memory_fill', 'Fill Graph', 'About Fill Graph', 'Fill Graph help body')}
            ${btnRow('atria_rpg_memory_rebuild', 'Rebuild Graph', 'About Rebuild Graph', 'Rebuild Graph help body')}
            ${btnRow('atria_rpg_memory_rebuild_recent', 'Rebuild Recent', 'About Rebuild Recent', 'Rebuild Recent help body')}
            ${btnRow('atria_rpg_memory_manual_compress', 'Manual Compress', 'About Manual Compress', 'Manual Compress help body')}
            ${btnRow('atria_rpg_memory_recompute_vectors', 'Rebuild Vectors', 'About Rebuild Vectors', 'Rebuild Vectors help body')}
            ${btnRow('atria_rpg_memory_export', 'Export Graph', 'About Export Graph', 'Export Graph help body')}
            ${btnRow('atria_rpg_memory_import', 'Import Graph', 'About Import Graph', 'Import Graph help body')}
            </div>
            <div class="memory-danger-zone">${btnRow('atria_rpg_memory_reset', 'Reset Chat', 'About Reset Chat', 'Reset Chat help body')}</div>
            <input id="atria_rpg_memory_import_file" type="file" accept=".json,application/json" hidden />`;
}

function buildAdvancedTabHtml(deps) {
    const { escapeHtml, i18n } = deps;
    const fh = (titleKey, bodyKey) => renderFieldHelpButton({
        title: i18n(titleKey),
        bodyHtml: escapeHtml(i18n(bodyKey)),
    });
    return `
        <fieldset class="atria_rpg_memory_advanced_fieldset">
            <legend>${escapeHtml(i18n('Schema'))}</legend>
            <small style="opacity:0.8">${escapeHtml(i18n('Configure memory table types, extraction hints, and compression strategy in a popup editor.'))}</small>
            <small id="atria_rpg_memory_schema_scope" style="opacity:0.85"></small>
            <small id="atria_rpg_memory_schema_summary" style="opacity:0.85"></small>
            <div class="flex-container">
                <button type="button" id="atria_rpg_memory_open_schema_editor" class="menu_button">${escapeHtml(i18n('Open Schema Editor'))}</button>
                <button type="button" id="atria_rpg_memory_open_schema_studio" class="menu_button">${escapeHtml(i18n('AI Iterate Schema'))}</button>
            </div>
            ${deps.nativeRuntime ? `<p class="workspace-hint">${escapeHtml(i18n('Configure this task’s Memory Runtime Route in Maintenance.'))}</p>` : `<label for="atria_rpg_memory_request_api_preset">${escapeHtml(i18n('Iteration AI API preset (Connection profile)'))}${fh('About Iteration AI API preset', 'Iteration AI API preset help body')}</label>
            <select id="atria_rpg_memory_request_api_preset" class="text_pole"></select>
            <label for="atria_rpg_memory_request_llm_preset">${escapeHtml(i18n('Iteration AI prompt preset (params + prompt)'))}${renderRuntimeHelpButton({ kind: 'iteration', targetSelectId: 'atria_rpg_memory_request_llm_preset' })}</label>
            <select id="atria_rpg_memory_request_llm_preset" class="text_pole"></select>`}
            <label>${escapeHtml(i18n('Schema Iteration Prompt (schema-editor AI)'))}${fh('About Schema Iteration Prompt', 'Schema Iteration Prompt help body')}
                <textarea id="atria_rpg_memory_advanced_schema_iter_system_prompt" class="text_pole textarea_compact" rows="8"></textarea>
            </label>
        </fieldset>
        <fieldset class="atria_rpg_memory_advanced_fieldset">
            <legend>${escapeHtml(i18n('Advanced Settings'))}</legend>
            <small id="atria_rpg_memory_advanced_dirty_note" class="atria_rpg_memory_advanced_dirty_note" style="opacity:0.85; color: var(--warning); display:none">${escapeHtml(i18n('Changes take effect immediately but are not persisted. Click Save to Global or Save to Character to keep them.'))}</small>
            <label class="checkbox_label">
                <input id="atria_rpg_memory_advanced_include_world_info" type="checkbox" />
                ${escapeHtml(i18n('Include world info'))}${fh('About Include world info', 'Include world info help body')}
            </label>
            <label>${escapeHtml(i18n('Exclude latest N assistant turns from memory injection'))}${fh('About Exclude latest N assistant turns from memory injection', 'Exclude latest N assistant turns from memory injection help body')}
                <input id="atria_rpg_memory_advanced_recent_raw_turns" class="text_pole" type="number" min="0" step="1" />
            </label>
            <small style="display:block; opacity:0.8">${escapeHtml(i18n('How many trailing assistant turns are visible as raw text. Recall excludes events derived from these turns; the same window also offsets always-injected snapshots (except latest-only types like character sheets and locations, which stay as current truth).'))}</small>
            <label>${escapeHtml(i18n('Persistent injection recency horizon (assistant turns; 0 = no limit)'))}${fh('About Persistent injection recency horizon', 'Persistent injection recency horizon help body')}
                <input id="atria_rpg_memory_advanced_persistent_injection_max_seq_distance" class="text_pole" type="number" min="0" step="1" />
            </label>
<label>${escapeHtml(i18n('Tool-call retries'))}
                <input id="atria_rpg_memory_advanced_tool_retries" class="text_pole" type="number" min="0" max="10" step="1" />
            </label>
            <label>${escapeHtml(i18n('RPM limit (0 = unlimited)'))}
                <input id="atria_rpg_memory_advanced_rpm_limit" class="text_pole" type="number" min="0" max="600" step="1" />
            </label>
            <label>${escapeHtml(i18n('Extract context assistant turns'))}${fh('About Extract context assistant turns', 'Extract context assistant turns help body')}
                <input id="atria_rpg_memory_advanced_extract_context_turns" class="text_pole" type="number" min="1" max="32" step="1" />
            </label>
            <label>${escapeHtml(i18n('Exclude latest N assistant turns from graph extraction'))}${fh('About Exclude latest N assistant turns from graph extraction', 'Exclude latest N assistant turns from graph extraction help body')}
                <input id="atria_rpg_memory_advanced_extract_exclude_recent_turns" class="text_pole" type="number" min="0" step="1" />
            </label>
            <label>${escapeHtml(i18n('Recall query recent assistant turns'))}${fh('About Recall query recent assistant turns', 'Recall query recent assistant turns help body')}
                <input id="atria_rpg_memory_advanced_recall_query_messages" class="text_pole" type="number" min="1" max="64" step="1" />
            </label>
            <label>${escapeHtml(i18n('Visible recent message layers for generation (0 = disabled)'))}
                <input id="atria_rpg_memory_advanced_llm_visible_recent_messages" class="text_pole" type="number" min="0" max="200" step="1" />
            </label>
            <label>${escapeHtml(i18n('Extract batch assistant turns'))}
                <input id="atria_rpg_memory_advanced_extract_batch_turns" class="text_pole" type="number" min="1" step="1" />
            </label>
            <label>${escapeHtml(i18n('Extraction graph mode'))}${fh('About Extraction graph mode', 'Extraction graph mode help body')}
                <select id="atria_rpg_memory_advanced_extract_mode" class="text_pole">
                    <option value="oneshot">${escapeHtml(i18n('One-shot (full graph input)'))}</option>
                    <option value="crawl">${escapeHtml(i18n('Crawl (LLM-explored local slice)'))}</option>
                </select>
            </label>
            <label>${escapeHtml(i18n('Crawl max rounds'))}${fh('About Crawl max rounds', 'Crawl max rounds help body')}
                <input id="atria_rpg_memory_advanced_extract_crawl_rounds" class="text_pole" type="number" min="1" max="5" step="1" />
            </label>
            <label>${escapeHtml(i18n('Crawl candidate limit'))}${fh('About Crawl candidate limit', 'Crawl candidate limit help body')}
                <input id="atria_rpg_memory_advanced_extract_crawl_candidates" class="text_pole" type="number" min="10" max="100" step="1" />
            </label>
            <label>${escapeHtml(i18n('Crawl read budget'))}${fh('About Crawl read budget', 'Crawl read budget help body')}
                <input id="atria_rpg_memory_advanced_extract_crawl_reads" class="text_pole" type="number" min="1" max="30" step="1" />
            </label>
            <small style="display:block; opacity:0.8">${escapeHtml(i18n('Crawl mode shows a compact graph index and reads relevant nodes on demand before extraction.'))}</small>
            <details class="memory-prompt-editor"><summary>${escapeHtml(i18n('Prompt templates'))}</summary>
            <label>${escapeHtml(i18n('Extraction Crawl Prompt'))}${fh('About Extraction Crawl Prompt', 'Extraction Crawl Prompt help body')}
                <textarea id="atria_rpg_memory_advanced_extract_crawl_system_prompt" class="text_pole textarea_compact" rows="8"></textarea>
            </label>
            <label>${escapeHtml(i18n('Extract Table Fill Prompt'))}${fh('About Extract Table Fill Prompt', 'Extract Table Fill Prompt help body')}
                <textarea id="atria_rpg_memory_advanced_extract_system_prompt" class="text_pole textarea_compact" rows="8"></textarea>
            </label>
</details>
            <small id="atria_rpg_memory_advanced_scope" style="opacity:0.85"></small>
            <div class="flex-container">
                <button type="button" id="atria_rpg_memory_advanced_reset" class="menu_button">${escapeHtml(i18n('Reset Advanced Settings'))}</button>
                <button type="button" id="atria_rpg_memory_advanced_save_global" class="menu_button">${escapeHtml(i18n('Save Advanced to Global'))}</button>
                <button type="button" id="atria_rpg_memory_advanced_save_character" class="menu_button">${escapeHtml(i18n('Save Advanced to Character'))}</button>
                <button type="button" id="atria_rpg_memory_advanced_clear_character_override" class="menu_button">${escapeHtml(i18n('Clear Character Advanced Override'))}</button>
            </div>
        </fieldset>`;
}

export function buildMemoryGraphSettingsHtml(deps) {
    const { escapeHtml, i18n, UI_BLOCK_ID } = deps;
    const text = key => escapeHtml(i18n(key));
    const toggle = (id, title, description) => `<label class="memory-control-card" for="${id}">
        <span><strong>${text(title)}</strong><small>${text(description)}</small></span>
        <input id="${id}" type="checkbox" />
    </label>`;
    const group = (title, description, content, open = false) => `<details class="memory-settings-group"${open ? ' open' : ''}>
        <summary>${text(title)}</summary><p class="memory-section-description">${text(description)}</p>
        <div class="memory-settings-fields">${content}</div>
    </details>`;
    return `
<section id="${UI_BLOCK_ID}" class="memory-workspace-settings">
    <div class="memory-overview">
        <div class="memory-section-heading"><h3>${text('Memory overview')}</h3><p>${text('Choose what to remember and when to bring it into the conversation.')}</p></div>
        <div class="memory-control-grid">
            ${toggle('atria_rpg_memory_source_writes_enabled', 'Enable source writes', 'Allow extraction to add source-backed facts and relations. Recall reads permitted history independently.')}
            ${toggle('atria_rpg_memory_enabled', 'Enable memory', 'Keep and recall information across conversation turns.')}
            ${toggle('atria_rpg_memory_recall_enabled', 'Recall into replies', 'Bring relevant memories into the reply context.')}
            ${toggle('atria_rpg_memory_auto_extraction_enabled', 'Auto extraction', 'Extract new memories as the conversation progresses.')}
            ${toggle('atria_rpg_memory_auto_compression_enabled', 'Auto compression', 'Organize older memories using the configured schema.')}
        </div>
        <div class="memory-status-line" aria-live="polite"><span id="atria_rpg_memory_stats"></span><span id="atria_rpg_memory_status"></span></div>
    </div>
    ${group('Retrieval and injection', 'Choose how memories are found and where they enter the reply context.', buildRecallTabHtml(deps))}
    ${group('Extraction and organization', 'Choose the extraction model and how often new memories are recorded.', buildExtractTabHtml(deps))}
    ${group('Schema and advanced rules', 'Manage memory types, context budgets and prompts. Advanced changes have separate save controls.', buildAdvancedTabHtml(deps))}
    ${group('Data maintenance', 'Inspect, rebuild, import or export the current conversation memory.', buildGraphTabHtml(deps))}
</section>`;
}
