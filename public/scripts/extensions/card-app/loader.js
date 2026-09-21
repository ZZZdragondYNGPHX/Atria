/**
 * CardApp Loader - handles CSS scoping, JS loading, container management.
 */


const CONTAINER_ID = 'card-app-container';
const SCOPED_STYLE_ID = 'card-app-scoped-style';
const CONTAINER_SELECTOR = `#${CONTAINER_ID}`;

/**
 * Elements to hide when CardApp is active.
 */
const ELEMENTS_TO_HIDE = ['#chat', '#form_sheld', '#qr--bar'];
let activeContainerState = null;

function createRecoveryButton(action, label, handler) {
    if (typeof handler !== 'function') return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'atria-card-app-recovery-action';
    button.dataset.atriaCardAppRecoveryAction = action;
    button.textContent = label;
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void Promise.resolve(handler()).catch(error => {
            console.error('[card-app] Host recovery action failed', { action, error });
        });
    });
    return button;
}

/**
 * Scope CSS selectors to the CardApp container.
 * Rewrites selectors so they only apply within #card-app-container.
 * @param {string} css - Raw CSS string
 * @returns {string} Scoped CSS string
 */
export function scopeCSS(css) {
    // Remove comments
    let cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const result = [];
    let i = 0;

    while (i < cleaned.length) {
        // Skip whitespace
        while (i < cleaned.length && /\s/.test(cleaned[i])) {
            result.push(cleaned[i]);
            i++;
        }

        if (i >= cleaned.length) break;

        // Handle @-rules
        if (cleaned[i] === '@') {
            const atRuleMatch = cleaned.slice(i).match(/^@(\w[\w-]*)/);
            if (atRuleMatch) {
                const ruleName = atRuleMatch[1].toLowerCase();

                if (ruleName === 'media' || ruleName === 'supports' || ruleName === 'container' || ruleName === 'layer') {
                    // Conditional @-rules: copy the @-rule header, then recurse into the block
                    const headerEnd = cleaned.indexOf('{', i);
                    if (headerEnd === -1) break;
                    result.push(cleaned.slice(i, headerEnd + 1));
                    i = headerEnd + 1;

                    // Find matching closing brace and scope the inner content
                    const innerEnd = findMatchingBrace(cleaned, headerEnd);
                    if (innerEnd === -1) break;
                    const innerCSS = cleaned.slice(i, innerEnd);
                    result.push(scopeCSS(innerCSS));
                    result.push('}');
                    i = innerEnd + 1;
                    continue;
                } else if (ruleName === 'keyframes' || ruleName === '-webkit-keyframes') {
                    // Keyframes: pass through unchanged
                    const braceStart = cleaned.indexOf('{', i);
                    if (braceStart === -1) break;
                    const braceEnd = findMatchingBrace(cleaned, braceStart);
                    if (braceEnd === -1) break;
                    result.push(cleaned.slice(i, braceEnd + 1));
                    i = braceEnd + 1;
                    continue;
                } else if (ruleName === 'font-face' || ruleName === 'import' || ruleName === 'charset') {
                    // Global @-rules: pass through unchanged
                    const end = cleaned.indexOf(';', i);
                    const braceStart = cleaned.indexOf('{', i);
                    if (braceStart !== -1 && (end === -1 || braceStart < end)) {
                        const braceEnd = findMatchingBrace(cleaned, braceStart);
                        if (braceEnd === -1) break;
                        result.push(cleaned.slice(i, braceEnd + 1));
                        i = braceEnd + 1;
                    } else if (end !== -1) {
                        result.push(cleaned.slice(i, end + 1));
                        i = end + 1;
                    } else {
                        break;
                    }
                    continue;
                }
            }
        }

        // Regular rule: find selector(s) and scope them
        const braceStart = cleaned.indexOf('{', i);
        if (braceStart === -1) break;

        const selectorText = cleaned.slice(i, braceStart).trim();
        const braceEnd = findMatchingBrace(cleaned, braceStart);
        if (braceEnd === -1) break;

        const body = cleaned.slice(braceStart, braceEnd + 1);

        // Scope each selector
        const scopedSelectors = selectorText.split(',').map(sel => {
            sel = sel.trim();
            if (!sel) return sel;

            // Replace body/html/:root with container selector
            if (/^(body|html|:root)$/i.test(sel)) {
                return CONTAINER_SELECTOR;
            }
            // If selector starts with body/html/:root, replace that part
            if (/^(body|html|:root)\s/i.test(sel)) {
                return sel.replace(/^(body|html|:root)/i, CONTAINER_SELECTOR);
            }
            // Universal selector alone
            if (sel === '*') {
                return `${CONTAINER_SELECTOR} *`;
            }
            // Already scoped
            if (sel.startsWith(CONTAINER_SELECTOR)) {
                return sel;
            }
            // Normal selector: prefix with container
            return `${CONTAINER_SELECTOR} ${sel}`;
        }).join(', ');

        result.push(scopedSelectors + ' ' + body);
        i = braceEnd + 1;
    }

    return result.join('');
}

/**
 * Find the matching closing brace for an opening brace.
 * @param {string} str - The string to search
 * @param {number} openPos - Position of the opening brace
 * @returns {number} Position of the matching closing brace, or -1
 */
function findMatchingBrace(str, openPos) {
    let depth = 1;
    for (let i = openPos + 1; i < str.length; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * Create the legacy CardApp surface.
 *
 * Under the staged R7 Shell this is a recoverable Full Stage Surface: CardApp
 * owns Stage content while the Atria Host and its Recovery layer remain
 * authoritative. Outside the Shell the historical in-#sheld behavior remains
 * available as a compatibility fallback.
 *
 * @param {object} [options]
 * @returns {HTMLElement} The container element
 */
export function createContainer(options = {}) {
    if (activeContainerState || document.getElementById(CONTAINER_ID)) {
        throw new Error('CardApp surface is already active');
    }

    const shellFoundation = options.shell || globalThis.Atria?.shell || null;
    const shell = shellFoundation?.getShell?.() || shellFoundation;
    const nativePlayHost = options.nativePlayHost || shellFoundation?.getPlayHost?.() || null;
    const shellScoped = Boolean(
        shell?.slots?.stage
        && shell?.slots?.recovery
        && typeof nativePlayHost?.acquireStageOwnership === 'function',
    );

    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    if (shellScoped) {
        const stageOwnership = nativePlayHost.acquireStageOwnership('legacy-card-app');
        container.dataset.atriaLegacyFullStage = 'true';
        container.dataset.atriaGameHostScope = 'stage';
        shell.slots.stage.appendChild(container);

        const recovery = document.createElement('div');
        recovery.id = 'card-app-host-recovery';
        recovery.className = 'atria-card-app-host-recovery';
        recovery.dataset.atriaGameHostRecovery = 'true';
        recovery.setAttribute('role', 'toolbar');
        recovery.setAttribute('aria-label', 'Legacy CardApp recovery');

        for (const [action, label, handler] of [
            ['exit', 'Exit CardApp', options.onExit],
            ['stop', 'Stop generation', options.onStopGeneration],
            ['diagnostics', 'Diagnostics', options.onDiagnostics],
        ]) {
            const button = createRecoveryButton(action, label, handler);
            if (button) recovery.appendChild(button);
        }
        shell.slots.recovery.appendChild(recovery);

        activeContainerState = {
            shellScoped: true,
            container,
            recovery,
            stageOwnership,
            hidden: [],
        };
        return container;
    }

    const hidden = [];
    for (const selector of ELEMENTS_TO_HIDE) {
        const element = document.querySelector(selector);
        if (!element) continue;
        hidden.push({
            element,
            display: element.style.display,
            marker: element.getAttribute('data-card-app-hidden'),
        });
        element.dataset.cardAppHidden = 'true';
        element.style.display = 'none';
    }

    const sheld = document.getElementById('sheld');
    const formSheld = document.getElementById('form_sheld');
    if (sheld && formSheld) {
        sheld.insertBefore(container, formSheld);
    } else if (sheld) {
        sheld.appendChild(container);
    } else {
        document.body.appendChild(container);
    }

    // Fallback-only access to the inherited options menu. The R7 Shell path
    // keeps normal Host chrome and Command available instead.
    const menuBtn = document.createElement('button');
    menuBtn.id = 'card-app-menu-btn';
    menuBtn.innerHTML = '☰';
    menuBtn.title = 'Menu';
    menuBtn.addEventListener('click', () => {
        document.getElementById('options_button')?.click();
    });
    container.appendChild(menuBtn);

    activeContainerState = {
        shellScoped: false,
        container,
        recovery: null,
        stageOwnership: null,
        hidden,
    };
    return container;
}

/**
 * Remove the CardApp surface and restore the Native Play presentation.
 */
export function destroyContainer() {
    const state = activeContainerState;
    activeContainerState = null;

    const container = state?.container || document.getElementById(CONTAINER_ID);
    container?.remove();

    const style = document.getElementById(SCOPED_STYLE_ID);
    style?.remove();

    if (state) {
        state.recovery?.remove();
        state.stageOwnership?.release?.();
        for (const saved of state.hidden.slice().reverse()) {
            saved.element.style.display = saved.display;
            if (saved.marker === null) saved.element.removeAttribute('data-card-app-hidden');
            else saved.element.setAttribute('data-card-app-hidden', saved.marker);
        }
        return;
    }

    // Defensive cleanup for surfaces created before the R7C ownership adapter.
    for (const element of document.querySelectorAll('[data-card-app-hidden]')) {
        element.style.display = '';
        delete element.dataset.cardAppHidden;
    }
}

/**
 * Inject scoped CSS into the page.
 * @param {string} css - Raw CSS from the CardApp
 */
export function injectScopedCSS(css) {
    const scoped = scopeCSS(css);
    const style = document.createElement('style');
    style.id = SCOPED_STYLE_ID;
    style.textContent = scoped;
    document.head.appendChild(style);
}

/**
 * Load the CardApp entry JS module.
 * @param {string} charId - Character ID
 * @param {string} entry - Entry file name (e.g. 'index.js')
 * @returns {Promise<{init?: Function}>} The loaded module
 */
export async function loadEntryModule(charId, entry) {
    const url = `/api/card-app/${encodeURIComponent(charId)}/${entry}`;
    // Add cache buster to force reload on each activation
    const module = await import(`${url}?t=${Date.now()}`);
    return module;
}

/**
 * Show error UI in the container.
 * @param {HTMLElement} container - The container element
 * @param {Error|string} error - The error
 * @param {Function} onExit - Callback when user clicks exit
 */
export function showError(container, error, onExit) {
    const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
    container.innerHTML = `
        <div id="card-app-error">
            <h3>CardApp Error</h3>
            <div class="card-app-error-message">${escapeHtml(errorMsg)}</div>
            <button class="card-app-exit-btn">Exit CardApp</button>
        </div>
    `;
    container.querySelector('.card-app-exit-btn')?.addEventListener('click', onExit);
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
