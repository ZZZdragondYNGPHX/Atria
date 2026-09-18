import { renderPresetHelpButton } from '../preset-help.js';
import { renderFieldHelpButton } from '../field-help.js';

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
    const rewriteHelpBody = escapeHtml(i18n('Query rewrite sends the raw user query to a small LLM to rewrite it into a phrasing that vector search retrieves more relevant memory events. Costs one extra LLM call per recall.'));
    const rewriteHelpBtn = renderFieldHelpButton({
        title: i18n('About query rewrite'),
        bodyHtml: rewriteHelpBody,
    });
    return `
            <label for="atria_rpg_memory_recall_method">${escapeHtml(i18n('Recall method'))}${fh('About Recall method', 'Recall method help body')}</label>
            <select id="atria_rpg_memory_recall_method" class="text_pole">
                <option value="llm">${escapeHtml(i18n('LLM Recall (default)'))}</option>
                <option value="rag">${escapeHtml(i18n('RAG Recall (vector + optional rerank + optional rewrite)'))}</option>
            </select>
            <div id="atria_rpg_memory_rag_settings" style="display:none">
                <small style="opacity:0.85">${escapeHtml(i18n('Embedding profile is shared via the Connection Profile registry — pick one below. Manage profiles in the Connection Profile panel (Embedding tab) under API Connections.'))}</small><br>
                <label>${escapeHtml(i18n('Embedding profile'))}${fh('About Embedding profile', 'Embedding profile help body')}</label>
                <select id="atria_rpg_memory_embedding_profile" class="text_pole flex1"></select>
                <label>${escapeHtml(i18n('Vector pre-filter Top-K'))}${fh('About Vector pre-filter Top-K', 'Vector pre-filter Top-K help body')} <input id="atria_rpg_memory_vector_topk" class="text_pole" type="number" min="5" max="100" step="1" /></label>
                <label>${escapeHtml(i18n('Max recall results'))}${fh('About Max recall results', 'Max recall results help body')} <input id="atria_rpg_memory_hybrid_max_results" class="text_pole" type="number" min="3" max="50" step="1" /></label>
                <label>${escapeHtml(i18n('Default per-type quota'))}${fh('About Default per-type quota', 'Default per-type quota help body')} <input id="atria_rpg_memory_rag_default_per_type_k" class="text_pole" type="number" min="0" max="50" step="1" /></label>
                <label class="checkbox_label"><input id="atria_rpg_memory_rag_use_rerank" type="checkbox" /> ${escapeHtml(i18n('Enable rerank'))}${fh('About Enable rerank', 'Enable rerank help body')}</label>
                <div id="atria_rpg_memory_rag_rerank_block" style="display:none;padding-left:18px">
                    <label>${escapeHtml(i18n('Rerank profile'))}${fh('About Rerank profile', 'Rerank profile help body')}</label>
                    <select id="atria_rpg_memory_rerank_profile" class="text_pole flex1"></select>
                </div>
                <label class="checkbox_label"><input id="atria_rpg_memory_rag_use_query_rewrite" type="checkbox" /><span>${escapeHtml(i18n('Enable query rewrite (extra LLM call)'))}</span>${rewriteHelpBtn}</label>
                <div id="atria_rpg_memory_rag_rewrite_block" style="display:none;padding-left:18px">
                    <label for="atria_rpg_memory_rag_rewrite_api_preset">${escapeHtml(i18n('Query rewrite API preset (Connection profile)'))}${fh('About Query rewrite API preset', 'Query rewrite API preset help body')}</label>
                    <select id="atria_rpg_memory_rag_rewrite_api_preset" class="text_pole"></select>
                    <label for="atria_rpg_memory_rag_rewrite_llm_preset">${escapeHtml(i18n('Query rewrite prompt preset'))}${renderPresetHelpButton({ kind: 'iteration', targetSelectId: 'atria_rpg_memory_rag_rewrite_llm_preset' })}</label>
                    <select id="atria_rpg_memory_rag_rewrite_llm_preset" class="text_pole"></select>
                </div>
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
            <div id="atria_rpg_memory_recall_llm_settings">
                <label for="atria_rpg_memory_recall_api_preset">${escapeHtml(i18n('Recall API preset (Connection profile)'))}${fh('About Recall API preset', 'Recall API preset help body')}</label>
                <select id="atria_rpg_memory_recall_api_preset" class="text_pole"></select>
                <label for="atria_rpg_memory_recall_preset">${escapeHtml(i18n('Recall preset (params + prompt)'))}${renderPresetHelpButton({ kind: 'iteration', targetSelectId: 'atria_rpg_memory_recall_preset' })}</label>
                <select id="atria_rpg_memory_recall_preset" class="text_pole"></select>
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
            <label for="atria_rpg_memory_extract_api_preset">${escapeHtml(i18n('Extract API preset (Connection profile)'))}${fh('About Extract API preset', 'Extract API preset help body')}</label>
            <select id="atria_rpg_memory_extract_api_preset" class="text_pole"></select>
            <label for="atria_rpg_memory_extract_preset">${escapeHtml(i18n('Extract preset (params + prompt)'))}${renderPresetHelpButton({ kind: 'iteration', targetSelectId: 'atria_rpg_memory_extract_preset' })}</label>
            <select id="atria_rpg_memory_extract_preset" class="text_pole"></select>

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
            <label for="atria_rpg_memory_request_api_preset">${escapeHtml(i18n('Iteration AI API preset (Connection profile)'))}${fh('About Iteration AI API preset', 'Iteration AI API preset help body')}</label>
            <select id="atria_rpg_memory_request_api_preset" class="text_pole"></select>
            <label for="atria_rpg_memory_request_llm_preset">${escapeHtml(i18n('Iteration AI prompt preset (params + prompt)'))}${renderPresetHelpButton({ kind: 'iteration', targetSelectId: 'atria_rpg_memory_request_llm_preset' })}</label>
            <select id="atria_rpg_memory_request_llm_preset" class="text_pole"></select>
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
            <label id="atria_rpg_memory_advanced_recall_iterations_row">${escapeHtml(i18n('Recall max iterations'))}${fh('About Recall max iterations', 'Recall max iterations help body')}
                <input id="atria_rpg_memory_advanced_recall_iterations" class="text_pole" type="number" min="2" max="6" step="1" />
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
            <label id="atria_rpg_memory_advanced_recall_route_prompt_row">${escapeHtml(i18n('Recall Stage 1 Prompt (Route/Drill)'))}${fh('About Recall Stage 1 Prompt', 'Recall Stage 1 Prompt help body')} <!-- banned-words-allow -->
                <textarea id="atria_rpg_memory_advanced_recall_route_prompt" class="text_pole textarea_compact" rows="8"></textarea>
            </label>
            <label id="atria_rpg_memory_advanced_recall_finalize_prompt_row">${escapeHtml(i18n('Recall Stage 2 Prompt (Finalize)'))}${fh('About Recall Stage 2 Prompt', 'Recall Stage 2 Prompt help body')} <!-- banned-words-allow -->
                <textarea id="atria_rpg_memory_advanced_recall_finalize_prompt" class="text_pole textarea_compact" rows="8"></textarea>
            </label>
            <div id="atria_rpg_memory_advanced_rag_rewrite_prompt_block" style="display:none">
                <label>${escapeHtml(i18n('Query rewrite system prompt'))}${fh('About Query rewrite system prompt', 'Query rewrite system prompt help body')}
                    <textarea id="atria_rpg_memory_advanced_rag_rewrite_prompt" class="text_pole textarea_compact" rows="8"></textarea>
                </label>
            </div>
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
            ${toggle('atria_rpg_memory_os_enabled', 'Enable Memory OS', 'Enable source-backed facts and the world graph. Automatic extraction and reply injection use the memory controls below.')}
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
