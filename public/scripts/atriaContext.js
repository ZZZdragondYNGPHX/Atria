// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups

/**
 * Layer 2 exposure — `globalThis.atriaContext` = the same object returned
 * by `getContext()`.
 *
 * Existing bug this file resolves: three consumer modules (`lib/edits/`,
 * `extensions/field-help.js`, `extensions/atria-tabs.js`) each guard their
 * `attach` sequence with `if (typeof globalThis.atriaContext === 'object'
 * && globalThis.atriaContext) { ... }`.  A repo-wide grep for
 * `atriaContext\s*=` before this file existed found zero producers,
 * meaning all three attach blocks were dead code — `getContext()`-time
 * ctx assembly ran but `globalThis.atriaContext` remained `undefined`,
 * and every plugin that consumed `atriaContext.<field>` fell through to
 * an undefined-property TypeError.  This module fixes that by publishing
 * the same ctx object at module load.
 *
 * Load-order note: `public/script.js` re-exports `chat` (and many other
 * bindings) as `let`. Under ES-module linking those bindings are in TDZ
 * from the perspective of any importer whose top-level code runs before
 * `script.js` has finished its own top-level initialisation. Because
 * `st-context.js:getContext()` reads several of those bindings eagerly
 * (chat, characters, etc.), calling `getContext()` at *this* module's
 * load time throws `Cannot access 'chat' before initialization`.
 *
 * The fix: publish `globalThis.atriaContext` synchronously via a getter
 * that lazily invokes `getContext()` on first access. Every consumer sees
 * a stable object identity for a given process lifetime (memoised after
 * the first successful call) but the actual `getContext()` invocation
 * happens after script.js's top level has finished — by which time the
 * `let`-bound imports have all been assigned.
 */

import { getContext } from './st-context.js';

let cachedContext = null;

function realizeContext() {
    if (cachedContext) return cachedContext;
    const ctx = getContext();
    // Defensive integrity check — st-context.js's exposure block must have
    // installed `ctx.character.presets` before this module's first read; if
    // the block was moved or renamed and this fails, callers reading
    // `atriaContext.character.presets.*` would silently see `undefined` and
    // downstream Atria plugins would break at first call.  Bubble the error
    // up loudly so it surfaces at first access rather than at first plugin
    // invocation.
    if (!ctx.character || !ctx.character.presets) {
        throw new Error('atriaContext.js: ctx.character.presets missing — st-context.js exposure block not wired');
    }
    cachedContext = ctx;
    return cachedContext;
}

Object.defineProperty(globalThis, 'atriaContext', {
    configurable: true,
    get() { return realizeContext(); },
});

// Note: `export const atriaContext = ...` would trigger the same TDZ
// problem at *this* module's load time. Export a getter-backed accessor
// instead so consumers doing `import { atriaContext } from '...'` see the
// same lazy behaviour as `globalThis.atriaContext`.
export { realizeContext as getAtriaContext };

