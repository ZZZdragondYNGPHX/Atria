/**
 * Template-variable helpers for orchestrator user/system prompts.
 *
 * Pure string transforms — no chat-state, no `capabilitySettings`, no
 * I/O. Owns the four operations every caller needs against the
 * mustache-style `{{var}}` syntax used in node prompt templates:
 *
 *   - `extractTemplateVariables` / `getUnsupportedTemplateVariables`:
 *     scan a template for placeholders and flag any not in the project's
 *     allow-list (user-visible vars + current auto-injected vars).
 *   - `replaceAutoInjectedTemplatePlaceholders`: collapse the
 *     `{{previous_orchestration}}` placeholder so it cannot leak back
 *     into a runtime prompt; the runtime injects that content out-of-band.
 *   - `normalizeTemplateForRuntime` / `normalizeTemplateForAiPrompt`:
 *     wrappers that replace current auto-injected placeholders with a
 *     context-appropriate note.
 *
 * `renderTemplate` is the final substitution pass that fills in the
 * concrete user-visible variables (recent_chat, last_user, etc.). It
 * accepts the current `previous_orchestration` value.
 */

import {
    ALLOWED_TEMPLATE_VARS,
    AUTO_INJECTED_PLACEHOLDER_AI_NOTE,
    AUTO_INJECTED_PLACEHOLDER_REGEX,
    AUTO_INJECTED_PLACEHOLDER_RUNTIME_NOTE,
} from './defaults.js';

export function extractTemplateVariables(template) {
    const result = [];
    const text = String(template || '');
    const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        result.push(String(match[1] || '').trim());
    }
    return [...new Set(result.filter(Boolean))];
}

export function getUnsupportedTemplateVariables(template) {
    const used = extractTemplateVariables(template);
    return used.filter(name => !ALLOWED_TEMPLATE_VARS.includes(name));
}

export function replaceAutoInjectedTemplatePlaceholders(template, replacement = '') {
    const source = String(template || '');
    if (!source) {
        return '';
    }
    return source.replace(AUTO_INJECTED_PLACEHOLDER_REGEX, String(replacement || ''));
}

export function normalizeTemplateForRuntime(template) {
    return replaceAutoInjectedTemplatePlaceholders(template, AUTO_INJECTED_PLACEHOLDER_RUNTIME_NOTE);
}

export function normalizeTemplateForAiPrompt(template) {
    return replaceAutoInjectedTemplatePlaceholders(template, AUTO_INJECTED_PLACEHOLDER_AI_NOTE);
}

export function renderTemplate(template, vars) {
    const safeVars = vars && typeof vars === 'object' ? vars : {};
    const replacements = {
        recent_chat: String(safeVars.recent_chat || ''),
        last_user: String(safeVars.last_user || ''),
        previous_outputs: String(safeVars.previous_outputs || ''),
        distiller: String(safeVars.distiller || ''),
        previous_orchestration: String(safeVars.previous_orchestration || ''),
    };
    let output = String(template || '');
    for (const [key, value] of Object.entries(replacements)) {
        output = output.replaceAll(`{{${key}}}`, value);
    }
    return output;
}
