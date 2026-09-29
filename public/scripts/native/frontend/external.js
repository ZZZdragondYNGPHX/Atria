import { safeProseLink } from '../../../shared/native-safe-prose.js';
// Host policy gate shared by Managed and Package-owned Prose. Packages never
// receive Window, URL navigation or an opener reference.
export function openHostExternal(value) {
    const url = safeProseLink(value);
    if (!url) throw new TypeError('Unsafe external link');
    if (globalThis.confirm('Open external link?\n' + url)) globalThis.open(url, '_blank', 'noopener,noreferrer');
}
