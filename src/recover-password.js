import fs from 'node:fs';
import yaml from 'yaml';
import storage from 'node-persist';
import { NativeHostOwner } from './storage/native-host-owner.js';
import {
    initUserStorage,
    getPasswordSalt,
    getPasswordHash,
    toKey,
} from './users.js';

/**
 * Initializes the storage with the data root specified in the config file.
 * @param {string} configPath - The path to the config file.
 */
async function initStorage(configPath) {
    const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    const dataRoot = config.dataRoot;

    if (!dataRoot) {
        console.error('No "dataRoot" setting found in config.yaml file.');
        process.exit(1);
    }

    const hostOwner = new NativeHostOwner();
    await hostOwner.acquireLocal(dataRoot);
    try { await initUserStorage(dataRoot); } catch (error) { await hostOwner.close(); throw error; }
    return hostOwner;
}

/**
 * Recovers a user account by enabling it and optionally setting a new password.
 * @param {string} configPath - The path to the config file.
 * @param {string} userAccount - The username of the account to recover.
 * @param {string} [userPassword] - The new password for the account. If not provided, sets an empty password.
 */
export async function recoverPassword(configPath, userAccount, userPassword) {
    const hostOwner = await initStorage(configPath);
    try { await recoverOwnedAccount(userAccount, userPassword); } finally { await hostOwner.close(); }
}

async function recoverOwnedAccount(userAccount, userPassword) {
    /**
     * @type {import('./users').User}
     */
    const user = await storage.get(toKey(userAccount));

    if (!user) {
        console.error(`User "${userAccount}" not found.`);
        process.exit(1);
    }

    if (!user.enabled) {
        console.log('User is disabled. Enabling...');
        user.enabled = true;
    }

    if (userPassword) {
        console.log('Setting new password...');
        const salt = getPasswordSalt();
        const passwordHash = getPasswordHash(userPassword, salt);
        user.password = passwordHash;
        user.salt = salt;
    } else {
        console.log('Setting an empty password...');
        user.password = '';
        user.salt = '';
    }

    await storage.setItem(toKey(userAccount), user);
    console.log('User recovered. A program will exit now.');
}
