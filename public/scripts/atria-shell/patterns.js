export const ATRIA_PATTERNS = Object.freeze([
    'list-detail',
    'master-detail',
    'editor-workspace',
    'runtime-status',
    'incident-list-detail',
    'mobile-drill-down',
]);

const PATTERN_SET = new Set(ATRIA_PATTERNS);

export function applyAtriaPattern(element, pattern) {
    if (!element) throw new Error('Atria pattern requires an element');
    if (!PATTERN_SET.has(pattern)) throw new Error(`Unknown Atria pattern: ${pattern}`);
    element.dataset.atriaPattern = pattern;
    return element;
}
