import { formatAtriaDate } from './atria-shell/components.js';
import { installStorageChangeListener } from './native/storage-change-events.js';
import { translateShellText as tl } from './atria-shell/localization.js';
import { getRequestHeaders } from '../script.js';
import { installFrontendLogging } from './logging/bootstrap.js';
import { t } from './i18n.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from './popup.js';
import { renderTemplateAsync } from './templates.js';
import { ensureImageFormatSupported, getBase64Async, humanFileSize } from './utils.js';

/**
 * @type {import('../../src/users.js').UserViewModel} Logged in user
 */
export let currentUser = null;
export let accountsEnabled = false;

// Extend the session every 10 minutes
const SESSION_EXTEND_INTERVAL = 10 * 60 * 1000;
let backupSyncCenterModulePromise;
let storageManagementModulePromise;

function loadBackupSyncCenterModule() {
    return backupSyncCenterModulePromise ??= import('./backup-sync-center.js');
}

function loadStorageManagementModule() {
    return storageManagementModulePromise ??= import('./storage-management.js');
}

/**
 * Enable or disable user account controls in the UI.
 * @param {boolean} isEnabled User account controls enabled
 * @returns {Promise<void>}
 */
export async function setUserControls(isEnabled) {
    installStorageChangeListener(getCurrentUserHandle);
    accountsEnabled = isEnabled;
    installFrontendLogging();

    if (!isEnabled) {
        $('#logout_button').hide();
        $('#server_logs_button').show();
        return;
    }

    $('#logout_button').show();
    await getCurrentUser();
}

/**
 * Check if the current user is an admin.
 * @returns {boolean} True if the current user is an admin
 */
export function isAdmin() {
    if (!accountsEnabled) {
        return true;
    }

    if (!currentUser) {
        return false;
    }

    return Boolean(currentUser.admin);
}

/**
 * Gets the handle string of the current user.
 * @returns {string} User handle
 */
export function getCurrentUserHandle() {
    return currentUser?.handle || 'default-user';
}

/**
 * Map a config-validation error code returned by the server to a localized message.
 * This remains part of script.js' public startup contract even though the
 * former admin-panel UI has been removed.
 * @param {string} code Machine-readable error code
 * @returns {string|null} Localized message, or null if the code is unknown
 */
export function getConfigValidationMessage(code) {
    switch (code) {
        case 'CONFIG_UNSAFE_NO_AUTH':
            return t`Cannot save: with "listen" on, you must enable one of whitelistMode, basicAuthMode, or enableUserAccounts (or set securityOverride: true). Otherwise the server will refuse to start.`;
        case 'CONFIG_UNSAFE_NO_PROTOCOL':
            return t`Cannot save: at least one of protocol.ipv4 or protocol.ipv6 must be enabled (or set to "auto"). Otherwise the server will refuse to start.`;
        default:
            return null;
    }
}

/**
 * Refresh the current account view model.
 * @returns {Promise<void>}
 */
async function getCurrentUser({ throwOnError = false } = {}) {
    try {
        const response = await fetch('/api/users/me', {
            headers: getRequestHeaders(),
        });
        if (!response.ok) {
            throw new Error(tl('Failed to get current user'));
        }
        currentUser = await response.json();
        $('#server_logs_button').show();
    } catch (error) {
        console.error('Error getting current user:', error);
        if (throwOnError) throw error;
    }
}

let logsWorkspaceModulePromise;

function loadLogsWorkspaceModule() {
    return logsWorkspaceModulePromise ??= import('./logging/workspace.js');
}

async function openLogsViewer() {
    const { openLogsWorkspace } = await loadLogsWorkspaceModule();
    return openLogsWorkspace({
        canViewServerLogs: !accountsEnabled || isAdmin(),
    });
}

/**
 * Shows a popup to change a user's password.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
async function changePassword(handle, callback) {
    try {
        const template = $(await renderTemplateAsync('changePassword'));
        template.find('.currentPasswordBlock').toggle(!isAdmin());
        let newPassword = '';
        let confirmPassword = '';
        let oldPassword = '';
        template.find('input[name="current"]').on('input', function () {
            oldPassword = String($(this).val());
        });
        template.find('input[name="password"]').on('input', function () {
            newPassword = String($(this).val());
        });
        template.find('input[name="confirm"]').on('input', function () {
            confirmPassword = String($(this).val());
        });
        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: tl('Change'), cancelButton: tl('Cancel'), wide: false, large: false });
        if (result === POPUP_RESULT.CANCELLED || result === POPUP_RESULT.NEGATIVE) {
            return;
        }

        if (newPassword !== confirmPassword) {
            toastr.error(tl('Passwords do not match'), tl('Failed to change password'));
            throw new Error(tl('Passwords do not match'));
        }

        const response = await fetch('/api/users/change-password', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, newPassword, oldPassword }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(tl(data.error || 'Unknown error'), tl('Failed to change password'));
            throw new Error(tl('Failed to change password'));
        }

        toastr.success(tl('Password changed successfully'), tl('Password Changed'));
        await callback();
    } catch (error) {
        console.error('Error changing password:', error);
    }
}


/**
 * Reset a user's settings.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
async function resetSettings(handle, callback) {
    try {
        let password = '';
        const template = $(await renderTemplateAsync('resetSettings'));
        template.find('input[name="password"]').on('input', function () {
            password = String($(this).val());
        });
        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: tl('Reset'), cancelButton: tl('Cancel'), wide: false, large: false });

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        const response = await fetch('/api/users/reset-settings', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, password }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(tl(data.error || 'Unknown error'), tl('Failed to reset settings'));
            throw new Error(tl('Failed to reset settings'));
        }

        toastr.success(tl('Settings reset successfully'), tl('Settings Reset'));
        await callback();
    } catch (error) {
        console.error('Error resetting settings:', error);
    }
}

/** Persist a display name through the account authority, including single-user mode. */
export async function saveAccountName(name, handle = getCurrentUserHandle()) {
    const normalized = String(name).replace(/\s+/g, ' ').trim();
    if (!normalized) throw new Error(t`Enter a display name.`);
    const response = await fetch('/api/users/change-name', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ handle, name: normalized }),
    });
    if (!response.ok) throw new Error(t`Failed to change name`);
    if (currentUser?.handle === handle) currentUser.name = normalized;
}

/**
 * Change a user's display name.
 * @param {string} handle User handle
 * @param {string} name Current name
 * @param {function} callback Success callback
 */
async function changeName(handle, name, callback) {
    try {
        const template = $(await renderTemplateAsync('changeName'));
        const result = await callGenericPopup(template, POPUP_TYPE.INPUT, name, { okButton: tl('Change'), cancelButton: tl('Cancel'), wide: false, large: false });

        if (!result) {
            return;
        }

        name = String(result);

        await saveAccountName(name, handle);

        toastr.success(tl('Name changed successfully'), tl('Name Changed'));
        await callback();
    } catch (error) {
        toastr.error(error.message, t`Failed to change name`);
        console.error('Error changing name:', error);
    }
}

/**
 * Restore a settings snapshot.
 * @param {string} name Snapshot name
 * @param {function} callback Success callback
 */
async function restoreSnapshot(name, callback) {
    try {
        const confirm = await callGenericPopup(
            `Are you sure you want to restore the settings from "${name}"?`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: tl('Restore'), cancelButton: tl('Cancel'), wide: false, large: false },
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        const response = await fetch('/api/settings/restore-snapshot', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(tl(data.error || 'Unknown error'), tl('Failed to restore snapshot'));
            throw new Error(tl('Failed to restore snapshot'));
        }

        await callback();
    } catch (error) {
        console.error('Error restoring snapshot:', error);
    }
}

/**
 * Load the content of a settings snapshot.
 * @param {string} name Snapshot name
 * @returns {Promise<string>} Snapshot content
 */
async function loadSnapshotContent(name) {
    try {
        const response = await fetch('/api/settings/load-snapshot', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(tl(data.error || 'Unknown error'), tl('Failed to load snapshot content'));
            throw new Error(tl('Failed to load snapshot content'));
        }

        return response.text();
    } catch (error) {
        console.error('Error loading snapshot content:', error);
    }
}

/**
 * Gets a list of settings snapshots.
 * @returns {Promise<Snapshot[]>} List of snapshots
 * @typedef {Object} Snapshot
 * @property {string} name Snapshot name
 * @property {number} date Date in milliseconds
 * @property {number} size File size in bytes
 */
async function getSnapshots() {
    try {
        const response = await fetch('/api/settings/get-snapshots', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(tl(data.error || 'Unknown error'), tl('Failed to get settings snapshots'));
            throw new Error(tl('Failed to get settings snapshots'));
        }

        const snapshots = await response.json();
        return snapshots;
    } catch (error) {
        console.error('Error getting settings snapshots:', error);
        return [];
    }
}

/**
 * Make a snapshot of the current settings.
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
async function makeSnapshot(callback) {
    try {
        const response = await fetch('/api/settings/make-snapshot', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(tl(data.error || 'Unknown error'), tl('Failed to make snapshot'));
            throw new Error(tl('Failed to make snapshot'));
        }

        toastr.success(tl('Snapshot created successfully'), tl('Snapshot Created'));
        await callback();
    } catch (error) {
        console.error('Error making snapshot:', error);
    }
}

/**
 * Open the settings snapshots view.
 */
async function viewSettingsSnapshots() {
    const template = $(await renderTemplateAsync('snapshotsView'));
    let disposed = false, loading = false;
    const list = template.find('.snapshotList');
    const notice = $('<p>').attr('role', 'status'); list.before(notice);
    const retry = $('<button type="button">').addClass('menu_button').text(tl('Try again')).hide(); notice.after(retry);
    retry.on('click', () => void renderSnapshots());
    async function renderSnapshots() {
        if (loading || disposed) return;
        loading = true; notice.attr('role', 'status').text(tl('Loading…')); retry.hide();
        try {
            const snapshots = await getSnapshots();
            if (disposed) return;
            if (!Array.isArray(snapshots)) throw new Error(tl('Could not load settings snapshots. Try again.'));
            list.empty(); notice.text(snapshots.length ? '' : tl('No settings snapshots yet.'));

            for (const snapshot of snapshots.sort((a, b) => b.date - a.date)) {
                const snapshotBlock = template.find('.snapshotTemplate .snapshot').clone();
                snapshotBlock.find('.snapshotName').text(snapshot.name);
                snapshotBlock.find('.snapshotDate').text(formatAtriaDate(snapshot.date));
                snapshotBlock.find('.snapshotSize').text(humanFileSize(snapshot.size));
                snapshotBlock.find('.snapshotRestoreButton').on('click', async (e) => {
                    e.stopPropagation();
                    restoreSnapshot(snapshot.name, () => location.reload());
                });
                let reading = false, loaded = false;
                const read = async () => {
                    if (reading || loaded || disposed) return;
                    reading = true;
                    const contentBlock = snapshotBlock.find('.snapshotContent');
                    const feedback = snapshotBlock.find('.snapshotFeedback'), reload = snapshotBlock.find('.snapshotRetryButton');
                    feedback.attr('role', 'status').text(tl('Loading…')); reload.prop('hidden', true);
                    try {
                        const content = await loadSnapshotContent(snapshot.name);
                        if (disposed) return;
                        if (content === undefined) throw new Error(tl('Could not load snapshot content. Try again.'));
                        contentBlock.val(content); loaded = true; feedback.text('');
                    } catch (error) {
                        if (!disposed) { feedback.attr('role', 'alert').text(error.message); reload.prop('hidden', false); }
                    } finally { reading = false; }
                };
                snapshotBlock.find('.snapshotRetryButton').on('click', () => void read());
                snapshotBlock.on('toggle', () => {
                    if (snapshotBlock.prop('open')) void read();
                });
                list.append(snapshotBlock);
            }
        } catch (error) { if (!disposed) { notice.attr('role', 'alert').text(error.message); retry.show(); } } finally { loading = false; }
    }

    template.find('.makeSnapshotButton').on('click', async function () {
        if (this.disabled) return;
        this.disabled = true; this.setAttribute('aria-busy', 'true');
        try { await makeSnapshot(renderSnapshots); } finally { this.disabled = false; this.removeAttribute('aria-busy'); }
    });
    void renderSnapshots();
    try { return await callGenericPopup(template, POPUP_TYPE.TEXT, '', { okButton: tl('Close'), wide: false, large: false, allowVerticalScrolling: true }); } finally { disposed = true; }
}

/**
 * Reset everything to default.
 * @param {function} callback Success callback
 */
async function resetEverything(callback) {
    try {
        const step1Response = await fetch('/api/users/reset-step1', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!step1Response.ok) {
            const data = await step1Response.json();
            toastr.error(tl(data.error || 'Unknown error'), tl('Failed to reset'));
            throw new Error(tl('Failed to reset everything'));
        }

        let password = '';
        let code = '';

        const template = $(await renderTemplateAsync('userReset'));
        template.find('input[name="password"]').on('input', function () {
            password = String($(this).val());
        });
        template.find('input[name="code"]').on('input', function () {
            code = String($(this).val());
        });
        const confirm = await callGenericPopup(
            template,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: tl('Reset'), cancelButton: tl('Cancel'), wide: false, large: false },
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        const step2Response = await fetch('/api/users/reset-step2', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ password, code }),
        });

        if (!step2Response.ok) {
            const data = await step2Response.json();
            toastr.error(tl(data.error || 'Unknown error'), tl('Failed to reset'));
            throw new Error(tl('Failed to reset everything'));
        }

        toastr.success(tl('Everything reset successfully'), tl('Reset Everything'));
        await callback();
    } catch (error) {
        console.error('Error resetting everything:', error);
    }
}

export async function openUserProfile({ container = null } = {}) {
    await getCurrentUser({ throwOnError: true });
    const template = $(await renderTemplateAsync('userProfile'));
    const profileAction = (selector, callback) => template.find(selector).on('click', async function () {
        if (this.disabled) return;
        const hadFocus = document.activeElement === this;
        this.disabled = true; this.setAttribute('aria-busy', 'true');
        try { await callback(); } catch (error) { toastr.error(error.message); } finally {
            this.disabled = false; this.removeAttribute('aria-busy');
            if (hadFocus && this.isConnected && document.activeElement === document.body) this.focus();
        }
    });
    template.find('.userName').text(currentUser.name);
    template.find('.userHandle').text(currentUser.handle);
    template.find('.avatar img').attr('src', currentUser.avatar);
    template.find('.userRole').text(currentUser.admin ? t`Admin` : t`User`);
    profileAction('.userLogoutButton', logout);
    template.find('.userCreated').text(formatAtriaDate(currentUser.created));
    template.find('.hasPassword').toggle(currentUser.password);
    template.find('.noPassword').toggle(!currentUser.password);
    profileAction('.userSettingsSnapshotsButton', () => viewSettingsSnapshots());
    profileAction('.userBackupSyncButton', async () => {
        try {
            const { openBackupSyncCenter } = await loadBackupSyncCenterModule();
            await openBackupSyncCenter({
                handle: currentUser.handle,
                canManageGlobalExtensions: isAdmin(),
                openSettingsSnapshots: viewSettingsSnapshots,
                onRestored: () => location.reload(),
            });
        } catch (error) {
            console.error('Failed to load backup sync center:', error);
            toastr.error(t`Failed to load Backup & Sync Center.`);
        }
    });
    profileAction('.userStorageManagementButton', async () => {
        try {
            const { openStorageManagement } = await loadStorageManagementModule();
            await openStorageManagement();
        } catch (error) {
            console.error('Failed to load storage management:', error);
            toastr.error(t`Failed to load storage management.`);
        }
    });
    profileAction('.userChangeNameButton', async () => changeName(currentUser.handle, currentUser.name, async () => {
        await getCurrentUser();
        template.find('.userName').text(currentUser.name);
    }));
    profileAction('.userChangePasswordButton', () => changePassword(currentUser.handle, async () => {
        await getCurrentUser();
        template.find('.hasPassword').toggle(currentUser.password);
        template.find('.noPassword').toggle(!currentUser.password);
    }));
    profileAction('.userResetSettingsButton', () => resetSettings(currentUser.handle, () => location.reload()));
    profileAction('.userResetAllButton', () => resetEverything(() => location.reload()));
    template.find('.userAvatarChange').on('click', () => template.find('.avatarUpload').trigger('click'));
    template.find('.avatarUpload').on('change', async function () {
        if (!(this instanceof HTMLInputElement)) {
            return;
        }

        const file = this.files[0];
        if (!file) {
            return;
        }

        await cropAndUploadAvatar(currentUser.handle, file);
        await getCurrentUser();
        template.find('.avatar img').attr('src', currentUser.avatar);
    });
    profileAction('.userAvatarRemove', async function () {
        await changeAvatar(currentUser.handle, '');
        await getCurrentUser();
        template.find('.avatar img').attr('src', currentUser.avatar);
    });

    if (!accountsEnabled) {
        template.find('[data-require-accounts]').hide();
        template.find('.accountsDisabledHint').show();
    }

    const root = template.get(0);
    if (container?.replaceChildren && root) {
        container.replaceChildren(root);
        return root;
    }

    const popupOptions = {
        okButton: tl('Close'),
        wide: false,
        large: false,
        allowVerticalScrolling: true,
        allowHorizontalScrolling: false,
    };
    callGenericPopup(template, POPUP_TYPE.TEXT, '', popupOptions);
    return root || null;
}

/**
 * Crop and upload an avatar image.
 * @param {string} handle User handle
 * @param {File} file Avatar file
 * @returns {Promise<string>}
 */
async function cropAndUploadAvatar(handle, file) {
    const dataUrl = await getBase64Async(await ensureImageFormatSupported(file));
    const croppedImage = await callGenericPopup('Set the crop position of the avatar image', POPUP_TYPE.CROP, '', { cropAspect: 1, cropImage: dataUrl });
    if (!croppedImage) {
        return;
    }

    await changeAvatar(handle, String(croppedImage));

    return String(croppedImage);
}

/**
 * Change the avatar of the user.
 * @param {string} handle User handle
 * @param {string} avatar File to upload or base64 string
 * @returns {Promise<void>} Avatar URL
 */
async function changeAvatar(handle, avatar) {
    try {
        const response = await fetch('/api/users/change-avatar', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar, handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(tl(data.error || 'Unknown error'), tl('Failed to change avatar'));
            return;
        }
    } catch (error) {
        console.error('Error changing avatar:', error);
    }
}

/**
 * Log out the current user.
 * @returns {Promise<void>}
 */
async function logout() {
    const response = await fetch('/api/users/logout', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
    });
    if (!response.ok) throw new Error(tl('Could not sign out. Try again.'));

    // On an explicit logout stop auto login
    // to allow user to change username even
    // when auto auth (such as authelia or basic)
    // would be valid
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('noauto', 'true');

    window.location.search = urlParams.toString();
}


/**
 * Pings the server to extend the user session.
 */
async function extendUserSession() {
    try {
        const response = await fetch('/api/ping?extend=1', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            throw new Error(tl('Ping did not succeed'), { cause: response.status });
        }
    } catch (error) {
        console.error('Failed to extend user session', error);
    }
}

jQuery(() => {
    $('#logout_button').on('click', () => {
        void logout().catch(error => toastr.error(error.message));
    });
    $('#account_button').on('click', () => {
        openUserProfile();
    });
    $('#server_logs_button').on('click', () => {
        openLogsViewer();
    });
    setInterval(async () => {
        if (currentUser) {
            await extendUserSession();
        }
    }, SESSION_EXTEND_INTERVAL);
});
