import { initAccessibility } from './a11y.js';
import { installAtriaAppearance } from './atria-shell/appearance.js';
import { createAtriaShellEnvironment } from './atria-shell/environment.js';

/**
 * CRSF token for requests.
 */
let csrfToken = '';
let discreetLogin = false;
let oauthAvailable = false;

/**
 * Gets a CSRF token from the server.
 * @returns {Promise<string>} CSRF token
 */
async function getCsrfToken() {
    const response = await fetch('/csrf-token');
    if (!response.ok) throw new Error('Cannot connect to Atria. Try again.');
    const data = await response.json();
    if (!data.token) throw new Error('Could not start a secure sign-in session. Try again.');
    return data.token;
}

/**
 * Gets a list of users from the server.
 * @returns {Promise<object>} List of users
 */
async function getUserList() {
    const response = await fetch('/api/users/list', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'The request could not be completed. Try again.');
    }

    if (response.status === 204) {
        discreetLogin = true;
        return [];
    }

    return response.json();
}

/**
 * Gets enabled OAuth providers from the server.
 * @returns {Promise<{providers: {github?: boolean, discord?: boolean}}|null>}
 */
async function getOAuthProviders() {
    try {
        const response = await fetch('/api/users/oauth/providers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
        });

        if (!response.ok) {
            return null;
        }

        return response.json();
    } catch {
        return null;
    }
}

/**
 * Gets account registration availability from the server.
 * @returns {Promise<{enabled: boolean}|null>}
 */
async function getRegistrationInfo() {
    try {
        const response = await fetch('/api/users/registration/info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
        });

        if (!response.ok) {
            return null;
        }

        return response.json();
    } catch {
        return null;
    }
}

/**
 * Submits a registration request to the server.
 * @param {{handle: string, name: string, password: string}} payload
 * @returns {Promise<void>}
 */
async function submitRegistrationRequest(payload) {
    try {
        const response = await fetch('/api/users/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return displayError(errorData.error || 'Registration failed.');
        }

        const data = await response.json();
        if (data.handle) {
            redirectToHome();
        }
    } catch (error) {
        console.error('Error registering:', error);
        displayError(error instanceof TypeError ? 'Cannot reach Atria. Check your connection and try again.' : error.message);
    }
}

/**
 * Requests a recovery code for the user.
 * @param {string} handle User handle
 * @returns {Promise<void>}
 */
async function sendRecoveryPart1Request(handle) {
    const response = await fetch('/api/users/recover-step1', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ handle }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'The request could not be completed. Try again.');
    }

    showRecoveryBlock();
}

/**
 * Sets a new password for the user using the recovery code.
 * @param {string} handle User handle
 * @param {string} code Recovery code
 * @param {string} newPassword New password
 * @returns {Promise<void>}
 */
async function sendRecoveryPart2Request(handle, code, newPassword) {
    const recoveryData = {
        handle,
        code,
        newPassword,
    };

    const response = await fetch('/api/users/recover-step2', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(recoveryData),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'The request could not be completed. Try again.');
    }

    await performLoginRequest(handle, newPassword);
}

/**
 * Attempts to log in the user.
 * @param {string} handle User's handle
 * @param {string} password User's password
 * @returns {Promise<void>}
 */
async function performLoginRequest(handle, password) {
    const userInfo = {
        handle,
        password,
    };

    try {
        const response = await fetch('/api/users/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(userInfo),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'The request could not be completed. Try again.');
        }

        const data = await response.json();

        if (data.handle) {
            redirectToHome();
        }
    } catch (error) {
        console.error('Error logging in:', error);
        displayError(error instanceof TypeError ? 'Cannot reach Atria. Check your connection and try again.' : error.message);
    }
}

let requestPending = false;
async function runAccountRequest(action) {
    if (requestPending) return;
    requestPending = true;
    document.querySelector('.atri-login').setAttribute('aria-busy', 'true');
    const buttons = [...document.querySelectorAll('.atri-login button')];
    buttons.forEach(button => { button.disabled = true; });
    $('#loginStatus').text('Please wait…').prop('hidden', false);
    displayError('');
    try {
        await action();
    } catch (error) {
        displayError(error.message || 'Cannot reach Atria. Check your connection and try again.');
    } finally {
        requestPending = false;
        buttons.forEach(button => { button.disabled = false; });
        document.querySelector('.atri-login').removeAttribute('aria-busy');
        $('#loginStatus').prop('hidden', true);
    }
}
const performLogin = (...args) => runAccountRequest(() => performLoginRequest(...args));
const submitRegistration = (...args) => runAccountRequest(() => submitRegistrationRequest(...args));
const sendRecoveryPart1 = (...args) => runAccountRequest(() => sendRecoveryPart1Request(...args));
const sendRecoveryPart2 = (...args) => runAccountRequest(() => sendRecoveryPart2Request(...args));

/**
 * Handles the user selection event.
 * @param {object} user User object
 * @returns {Promise<void>}
 */
async function onUserSelected(user) {
    // OAuth-only account (created by the GitHub/Discord flow, no local
    // password): the password path is closed for it server-side, so send
    // the user straight to the provider. Prefer the bound provider's
    // start URL; fall back to the login page (which shows the provider
    // buttons) if the account is bound to a provider that is no longer
    // enabled.
    if (!user.password && Array.isArray(user.oauthProviders) && user.oauthProviders.length > 0) {
        const provider = user.oauthProviders.find(p => p === 'github' || p === 'discord');
        if (provider && $(`#oauth${provider.charAt(0).toUpperCase() + provider.slice(1)}Button`).attr('href')) {
            return window.location.assign(`/api/users/oauth/start/${provider}`);
        }
        return displayError('This account signs in with GitHub or Discord. Use the buttons below.');
    }

    if (!user.password) {
        return performLogin(user.handle, '');
    }

    $('#passwordRecoveryBlock').hide();
    $('#passwordEntryBlock').show();
    $('#selectedAccount').text(user.name);
    $('.userSelect').attr('aria-pressed', 'false');
    $('#userPassword').val('').trigger('focus');
    $('#loginForm').off('submit').on('submit', async (event) => {
        event.preventDefault();
        const password = String($('#userPassword').val());
        await performLogin(user.handle, password);
    });

    $('#recoverPassword').off('click').on('click', async () => {
        await sendRecoveryPart1(user.handle);
    });

    $('#passwordRecoveryBlock').off('submit').on('submit', async (event) => {
        event.preventDefault();
        const code = String($('#recoveryCode').val());
        const newPassword = String($('#newPassword').val());
        await sendRecoveryPart2(user.handle, code, newPassword);
    });

    displayError('');
}

/**
 * Displays an error message to the user.
 * @param {string} message Error message
 */
function displayError(message) {
    $('#errorMessage').text(message);
    if (message) $('#errorMessage').trigger('focus');
}

/**
 * Redirects the user to the home page.
 */
function redirectToHome() {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('noauto');
    currentUrl.searchParams.delete('error');
    currentUrl.pathname = '/';
    window.location.href = currentUrl.toString();
}

/**
 * Hides the password entry block and shows the password recovery block.
 */
function showRecoveryBlock() {
    $('#passwordEntryBlock').hide();
    $('#passwordRecoveryBlock').show();
    $('#recoveryCode').trigger('focus');
    displayError('');
}

/**
 * Hides the password recovery block and shows the password entry block.
 */
function onCancelRecoveryClick() {
    $('#passwordRecoveryBlock').hide();
    $('#passwordEntryBlock').show();
    $('#userPassword').trigger('focus');
    displayError('');
}

/**
 * Configures OAuth buttons from provider payload.
 * @param {{providers?: {github?: boolean, discord?: boolean}}|null} oauthPayload
 */
function configureOAuthButtons(oauthPayload) {
    const providers = oauthPayload?.providers || {};

    const githubEnabled = Boolean(providers.github);
    const discordEnabled = Boolean(providers.discord);

    $('#oauthGithubButton').attr('href', '/api/users/oauth/start/github').toggle(githubEnabled);
    $('#oauthDiscordButton').attr('href', '/api/users/oauth/start/discord').toggle(discordEnabled);

    oauthAvailable = githubEnabled || discordEnabled;
    $('#oauthLoginBlock').toggle(oauthAvailable);
}

function showRegisterBlock() {
    $('#userList').hide();
    $('#handleEntryBlock').hide();
    $('#passwordEntryBlock').hide();
    $('#oauthLoginBlock').hide();
    $('#passwordRecoveryBlock').hide();
    $('#registerEntryBlock').hide();
    $('#normalLoginPrompt').hide();
    $('#discreetLoginPrompt').hide();
    $('#registerBlock').show();
    $('#registerName').val('');
    $('#registerHandle').val('');
    $('#registerPassword').val('');
    $('#registerConfirm').val('');
    displayError('');
    $('#registerName').trigger('focus');
}

function hideRegisterBlock() {
    $('#registerBlock').hide();
    if (discreetLogin) {
        $('#handleEntryBlock').show();
        $('#passwordEntryBlock').show();
        $('#discreetLoginPrompt').show();
    } else {
        $('#userList').show();
        $('#normalLoginPrompt').show();
    }
    $('#oauthLoginBlock').toggle(oauthAvailable);
    $('#registerEntryBlock').show();
    $('#openRegisterLink').trigger('focus');
    displayError('');
}

async function onSubmitRegistrationClick() {
    const name = String($('#registerName').val() || '').trim();
    const handle = String($('#registerHandle').val() || '').trim();
    const password = String($('#registerPassword').val() || '');
    const confirm = String($('#registerConfirm').val() || '');

    if (!name || !handle || !password) {
        return displayError('Display name, handle, and password are required.');
    }

    if (password !== confirm) {
        return displayError('Passwords do not match.');
    }

    await submitRegistration({ handle, name, password });
}

/**
 * Configures the registration entry button + form, if enabled.
 * @param {{enabled?: boolean}|null} registrationPayload
 */
function configureRegistration(registrationPayload) {
    const enabled = Boolean(registrationPayload?.enabled);
    $('#registerEntryBlock').toggle(enabled);

    if (!enabled) {
        return;
    }

    $('#openRegisterLink').off('click').on('click', showRegisterBlock);
    $('#registerBlock').off('submit').on('submit', (event) => {
        event.preventDefault();
        void onSubmitRegistrationClick();
    });
    $('#cancelRegister').off('click').on('click', hideRegisterBlock);
}

/**
 * Configures the login page for normal login.
 * @param {import('../../src/users').UserViewModel[]} userList List of users
 */
function configureNormalLogin(userList) {
    $('#handleEntryBlock').hide();
    $('#normalLoginPrompt').show();
    $('#discreetLoginPrompt').hide();

    for (const user of userList) {
        const userBlock = $('<button type="button"></button>').addClass('userSelect').attr('aria-pressed', 'false');
        const avatarBlock = $('<div></div>').addClass('avatar');
        avatarBlock.append($('<img>').attr({ src: user.avatar, alt: '', loading: 'lazy' }));
        userBlock.append(avatarBlock);
        userBlock.append($('<span></span>').addClass('userName').text(user.name));
        userBlock.append($('<small></small>').addClass('userHandle').text(user.handle));
        userBlock.on('click', () => {
            userBlock.attr('aria-pressed', 'true');
            void onUserSelected(user).then(() => userBlock.attr('aria-pressed', 'true'));
        });
        $('#userList').append(userBlock);
    }
}

/**
 * Configures the login page for discreet login.
 */
function configureDiscreetLogin() {
    $('#handleEntryBlock').show();
    $('#normalLoginPrompt').hide();
    $('#discreetLoginPrompt').show();
    $('#userList').hide();
    $('#passwordRecoveryBlock').hide();
    $('#passwordEntryBlock').show();
    $('#loginForm').off('submit').on('submit', async (event) => {
        event.preventDefault();
        const handle = String($('#userHandle').val());
        const password = String($('#userPassword').val());
        await performLogin(handle, password);
    });

    $('#recoverPassword').off('click').on('click', async () => {
        const handle = String($('#userHandle').val());
        await sendRecoveryPart1(handle);
    });

    $('#passwordRecoveryBlock').off('submit').on('submit', async (event) => {
        event.preventDefault();
        const handle = String($('#userHandle').val());
        const code = String($('#recoveryCode').val());
        const newPassword = String($('#newPassword').val());
        await sendRecoveryPart2(handle, code, newPassword);
    });
}

function handleOAuthErrorParam() {
    const params = new URLSearchParams(window.location.search);
    const error = String(params.get('error') || '');
    if (!error) {
        return;
    }

    const messages = {
        unsupported_provider: 'Unsupported OAuth provider.',
        provider_not_configured: 'OAuth provider is not configured by admin.',
        oauth_start_failed: 'Failed to start OAuth login.',
        oauth_invalid_callback: 'OAuth callback is invalid.',
        oauth_state_mismatch: 'OAuth state verification failed.',
        oauth_token_failed: 'Failed to obtain OAuth access token.',
        oauth_token_empty: 'OAuth provider returned an empty token.',
        oauth_profile_failed: 'Failed to fetch OAuth profile.',
        oauth_user_not_linked: 'No local account is linked to this OAuth identity.',
        oauth_user_disabled: 'This account is currently disabled.',
        discord_guild_check_failed: 'Discord account did not pass server membership checks.',
        oauth_callback_failed: 'OAuth login failed. Please try again.',
    };

    displayError(messages[error] || 'OAuth login failed.');
}

initAccessibility();
installAtriaAppearance();
createAtriaShellEnvironment(document.documentElement);
$('#cancelRecovery').on('click', onCancelRecoveryClick);
$('#retryLogin').on('click', initializeLogin);

async function initializeLogin() {
    $('#retryLogin').prop('hidden', true);
    $('#loginStatus').text('Connecting to Atria…').prop('hidden', false);
    displayError('');
    try {
        csrfToken = await getCsrfToken();
        const [userList, oauthPayload, registrationPayload] = await Promise.all([
            getUserList(), getOAuthProviders(), getRegistrationInfo(),
        ]);
        $('#userList').empty();
        if (discreetLogin) configureDiscreetLogin();
        else configureNormalLogin(userList);
        $('#emptyAccounts').prop('hidden', discreetLogin || userList.length > 0);
        configureOAuthButtons(oauthPayload);
        configureRegistration(registrationPayload);
        $('#userSelectBlock').prop('hidden', false);
        handleOAuthErrorParam();
    } catch (error) {
        displayError(error.message || 'Cannot reach Atria. Check your connection and try again.');
        $('#retryLogin').prop('hidden', false);
    } finally {
        $('#loginStatus').prop('hidden', true);
    }
}
void initializeLogin();
