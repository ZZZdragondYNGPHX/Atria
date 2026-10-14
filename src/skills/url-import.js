import { createHash } from 'node:crypto';
import { readPublicTargetText } from '../native/model-prompt-runtime/credential-fetch.js';
/**
 * URL-based skill import.
 *
 * Single-file SKILL.md fetcher. For multi-file or binary skills, the caller
 * should use the regular zip-upload import path instead.
 *
 * Security: HTTPS-only. The fetched payload must begin with a YAML
 * frontmatter delimiter (`---\n` or `---\r\n`); plain HTML pages or
 * arbitrary content are rejected before reaching the repository.
 */

const MAX_SKILL_MD_BYTES = 512 * 1024;

/**
 * Import a single SKILL.md file from an HTTPS raw URL.
 * @param {object} opts
 * @param {string} opts.url - HTTPS URL of the raw SKILL.md.
 * @param {object} opts.targetScope - destination scope.
 * @param {object} opts.repository - SkillRepository instance.
 * @returns {Promise<{name:string, conflict:'new'|'same'|'different'}>}
 */
export async function importFromUrl({ url, targetScope, repository, expectedInstalledHash, expectedContentHash, readText = readPublicTargetText }) {
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) {
        throw new Error('only https:// URLs are allowed');
    }
    const { text, contentType } = await readText(url, { maxBytes: MAX_SKILL_MD_BYTES });
    if (contentType && !/^(?:text\/(?:plain|markdown|x-markdown)|application\/octet-stream)(?:;|$)/i.test(contentType)) throw new Error('Unsupported Skill content type');
    if (Buffer.byteLength(text) > MAX_SKILL_MD_BYTES) throw new Error('fetched SKILL.md exceeds byte limit');
    const contentHash = createHash('sha256').update(text).digest('hex');
    if (expectedContentHash !== undefined && expectedContentHash !== contentHash) throw new Error('Skill source content changed');
    if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
        throw new Error('URL did not return SKILL.md (no YAML frontmatter)');
    }
    const result = await repository.install({
        scope: targetScope,
        ...(expectedInstalledHash !== undefined ? { expectedInstalledHash } : {}),
        payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: text }] },
    });
    return {
        name: result.name, contentHash,
        conflict: result.action === 'installed' ? 'new'
            : result.action === 'replaced' ? 'different'
                : 'same',
    };
}
