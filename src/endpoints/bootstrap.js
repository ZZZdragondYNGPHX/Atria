import express from 'express';

import { getImages, getVersion } from '../util.js';
import { getCharactersSnapshot } from './characters.js';
import { getGroupsSnapshot } from './groups.js';
import { SecretManager } from './secrets.js';
import { buildSettingsResponse } from './settings.js';
import { markStartupMilestone, startStartupPhase } from '../startup-timing.js';

export const router = express.Router();

router.post('/bootstrap', async (request, response) => {
    markStartupMilestone('http.bootstrap.start');
    const finishStartupPhase = startStartupPhase('http.bootstrap');
    try {
        const directories = request.user.directories;
        const handle = request.user.profile.handle;
        const charactersPromise = getCharactersSnapshot(directories, { useShallowCharacters: true, handle });
        const groupsPromise = getGroupsSnapshot(handle);
        const versionPromise = getVersion();
        const settings = await buildSettingsResponse(request, {
            includePresetContents: false,
            includeQuickReplyPresets: false,
        });
        const avatars = getImages(directories.avatars);
        // Bootstrap needs the full masked secret metadata so the client can
        // render the key manager without an extra shape conversion step.
        const secret_state = new SecretManager(directories).getSecretState();
        const characters = await charactersPromise;
        const groups = await groupsPromise;
        const version = await versionPromise;

        const characterCount = Array.isArray(characters) ? characters.length : 0;
        const groupCount = Array.isArray(groups) ? groups.length : 0;
        const avatarCount = Array.isArray(avatars) ? avatars.length : 0;
        finishStartupPhase(`characters=${characterCount} groups=${groupCount} avatars=${avatarCount}`);
        markStartupMilestone('http.bootstrap.done');
        return response.send({
            version,
            settings,
            characters,
            groups,
            avatars,
            secret_state,
        });
    } catch (error) {
        finishStartupPhase('failed');
        console.error(error);
        return response.sendStatus(500);
    }
});
