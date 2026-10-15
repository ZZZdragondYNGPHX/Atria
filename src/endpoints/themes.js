import express from 'express';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { InvalidArgumentError, NotFoundError } from '../storage/errors.js';
import { getNamedDocRepo, getSettingsRepo } from '../storage/index.js';
import { assertSafeRepoName } from '../storage/name-validation.js';
import { serverDirectory } from '../server-directory.js';
import { validateNativeTheme } from '../../public/scripts/atria-shell/theme-model.js';

export const router = express.Router();
// Native identity is stable across display-name edits; still one NamedDocRepo bucket.
const nativeThemeKey = id => `Atria Theme ${createHash('sha256').update(id).digest('hex')}`;

// Reads use the same repositories as settings bootstrap, including uncertain-write recovery.
router.post('/list', async (request, response) => {
    try {
        const handle = request.user.profile.handle;
        const directory = path.join(serverDirectory, 'default/content/themes');
        const originals = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'))));
        const entries = await getNamedDocRepo().listWithDocs(handle, 'themes');
        const settings = await getSettingsRepo().get(handle);
        response.set('Cache-Control', 'private, no-store').json({ themes: entries.map(({ name, doc }) => ({ ...doc, name: doc.format === 'atria-theme' ? doc.name : name })), originals, selection: settings?.power_user?.atria_theme ?? null });
    } catch (error) {
        console.error('Error reading themes:', error);
        response.sendStatus(500);
    }
});

router.post('/save', async (request, response) => {
    if (!request.body || !request.body.name) return response.sendStatus(400);
    let safeName;
    let theme = request.body;
    const native = theme.format !== undefined || theme.version !== undefined;
    try {
        if (native) {
            theme = validateNativeTheme(theme);
            if (theme.id.startsWith('builtin:')) return response.status(400).json({ error: 'Built-in themes are read-only.' });
            safeName = nativeThemeKey(theme.id);
        } else safeName = assertSafeRepoName(theme.name);
    } catch (err) {
        if (err instanceof InvalidArgumentError || err instanceof TypeError) {
            return response.status(400).send({ error: err.message });
        }
        throw err;
    }
    try {
        if (native) {
            const entries = await getNamedDocRepo().listWithDocs(request.user.profile.handle, 'themes');
            if (entries.some(({ name, doc }) => (doc.format === 'atria-theme' ? doc.name : name) === theme.name && doc.id !== theme.id)) return response.status(409).json({ error: 'Theme name already exists. Save with another name.' });
        }
        await getNamedDocRepo().save(request.user.profile.handle, 'themes', safeName, theme);
        return response.sendStatus(200);
    } catch (err) {
        console.error('Error saving theme:', err);
        return response.sendStatus(500);
    }
});

router.post('/delete', async (request, response) => {
    if (!request.body || !request.body.name) return response.sendStatus(400);
    try {
        if (request.body.id && (typeof request.body.id !== 'string' || request.body.id.startsWith('builtin:'))) return response.sendStatus(400);
        const key = request.body.id ? nativeThemeKey(request.body.id) : request.body.name;
        await getNamedDocRepo().delete(request.user.profile.handle, 'themes', key, { strict: true });
        return response.sendStatus(200);
    } catch (err) {
        if (err instanceof NotFoundError) {
            console.error('Theme file not found:', request.body.name);
            return response.sendStatus(404);
        }
        console.error('Error deleting theme:', err);
        return response.sendStatus(500);
    }
});
