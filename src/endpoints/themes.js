import express from 'express';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { InvalidArgumentError, NotFoundError } from '../storage/errors.js';
import { getNamedDocRepo, getSettingsRepo } from '../storage/index.js';
import { assertSafeRepoName } from '../storage/name-validation.js';
import { serverDirectory } from '../server-directory.js';
import { validateNativeTheme } from '../../public/scripts/atria-shell/theme-model.js';

export const router = express.Router();

// Reads use the same repositories as settings bootstrap, including uncertain-write recovery.
router.post('/list', async (request, response) => {
    try {
        const handle = request.user.profile.handle;
        const directory = path.join(serverDirectory, 'default/content/themes');
        const originals = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'))));
        const entries = await getNamedDocRepo().listWithDocs(handle, 'themes');
        const settings = await getSettingsRepo().get(handle);
        response.set('Cache-Control', 'private, no-store').json({ themes: entries.map(({ name, doc }) => ({ ...doc, name })), originals, selection: settings?.power_user?.atria_theme ?? null });
    } catch (error) {
        console.error('Error reading themes:', error);
        response.sendStatus(500);
    }
});

router.post('/save', async (request, response) => {
    if (!request.body || !request.body.name) return response.sendStatus(400);
    let safeName;
    try {
        safeName = assertSafeRepoName(request.body.name);
    } catch (err) {
        if (err instanceof InvalidArgumentError) {
            return response.status(400).send({ error: err.message });
        }
        throw err;
    }
    try {
        if (request.body.format !== undefined || request.body.version !== undefined) {
            try { validateNativeTheme(request.body); } catch (error) { return response.status(400).json({ error: error.message }); }
            if (request.body.id.startsWith('builtin:')) return response.status(400).json({ error: 'Built-in themes are read-only.' });
            const existing = await getNamedDocRepo().get(request.user.profile.handle, 'themes', safeName);
            if (existing && existing.id !== request.body.id) return response.status(409).json({ error: 'Theme name already exists. Save with another name.' });
        }
        await getNamedDocRepo().save(request.user.profile.handle, 'themes', safeName, request.body);
        return response.sendStatus(200);
    } catch (err) {
        console.error('Error saving theme:', err);
        return response.sendStatus(500);
    }
});

router.post('/delete', async (request, response) => {
    if (!request.body || !request.body.name) return response.sendStatus(400);
    try {
        await getNamedDocRepo().delete(request.user.profile.handle, 'themes', request.body.name, { strict: true });
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
