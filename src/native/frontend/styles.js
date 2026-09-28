import { parse } from '@adobe/css-tools';
import { FRONTEND_LIMITS, identifier } from '../../../public/shared/native-frontend-contract.js';

// Conservative compiler skeleton. The complete CSS/font pipeline belongs to
// Phase 2; unsupported syntax is rejected rather than passed through unchecked.
export function validateStyle(css) {
    if (typeof css !== 'string' || Buffer.byteLength(css) > FRONTEND_LIMITS.bytes) throw new TypeError('Style exceeds limits');
    if (/[\\\u0000-\u0008]/.test(css)) throw new TypeError('Escaped/control CSS is unsupported in compiler skeleton');
    const normalized = css.replace(/\/\*[\s\S]*?\*\//g, '');
    if (/@import\b|@namespace\b|expression\s*\(|-moz-binding|behavior\s*:|image-set\s*\(/i.test(normalized)) throw new TypeError('Unsafe style resource or executable CSS');
    const refs = new Set();
    let stripped = normalized.replace(/url\(\s*(?:"resource:([a-zA-Z][a-zA-Z0-9._-]*)"|'resource:([a-zA-Z][a-zA-Z0-9._-]*)'|resource:([a-zA-Z][a-zA-Z0-9._-]*))\s*\)/g, (_, a, b, c) => {
        refs.add(identifier(a ?? b ?? c)); return 'none';
    });
    if (/url\s*\(|https?:|data:|javascript:/i.test(stripped)) throw new TypeError('Style resources must use exact resource:id references');
    // Parsing errors are fatal; balanced delimiters alone are insufficient.
    parse(stripped, { silent: false });
    return [...refs].sort();
}
