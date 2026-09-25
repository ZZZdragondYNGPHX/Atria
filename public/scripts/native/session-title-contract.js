export function normalizeSessionTitle(value) {
    if (typeof value !== 'string' || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('Session title must be a single line of at most 256 characters');
    return value.trim() || null;
}
