import { parse as parseYaml } from 'yaml';
import { SKILL_INVOCATION_PATHS } from '../../public/shared/extension-contract.js';

const NAME_REGEX = /^[a-z0-9_-]+$/;
const NAME_MAX_LEN = 128;

export function parseSkillFrontmatter(content) {
    const normalized = String(content).replace(/\r\n/g, '\n');
    if (!normalized.startsWith('---\n')) {
        throw new Error('SKILL.md must start with YAML frontmatter (---)');
    }
    const rest = normalized.slice(4);
    const endIdx = rest.indexOf('\n---');
    if (endIdx === -1) {
        throw new Error('SKILL.md frontmatter is not closed (---)');
    }
    const yamlText = rest.slice(0, endIdx);

    let parsed;
    try {
        parsed = parseYaml(yamlText) || {};
    } catch (e) {
        throw new Error(`Invalid SKILL.md frontmatter YAML: ${e.message}`);
    }

    const name = String(parsed.name || '').trim();
    if (!name) throw new Error('SKILL.md frontmatter must include name');
    if (name.length > NAME_MAX_LEN) throw new Error(`SKILL.md name must be ≤${NAME_MAX_LEN} chars`);
    if (!NAME_REGEX.test(name)) throw new Error('SKILL.md name must match [a-z0-9_-]+');

    const description = String(parsed.description || '').trim();
    if (!description) throw new Error('SKILL.md frontmatter must include description');

    const metadata = parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {};
    let paths;
    if (Object.hasOwn(metadata, 'atria-paths')) {
        const raw = metadata['atria-paths'];
        if (typeof raw !== 'string') throw new Error('metadata.atria-paths must be a comma-separated string');
        paths = raw.trim() ? raw.split(',').map(path => path.trim()) : [];
        if (paths.some(path => !SKILL_INVOCATION_PATHS.includes(path))) throw new Error('metadata.atria-paths contains an unknown invocation path');
    }

    return {
        name,
        description,
        license: parsed.license ? String(parsed.license).trim() : null,
        metadata: {
            ...(paths === undefined ? {} : { 'atria-paths': [...new Set(paths)].join(',') }),
            author: metadata.author ? String(metadata.author).trim() : null,
            version: metadata.version ? String(metadata.version).trim() : null,
            tags: Array.isArray(metadata.tags) ? metadata.tags.map(t => String(t).trim()).filter(Boolean) : [],
        },
    };
}
