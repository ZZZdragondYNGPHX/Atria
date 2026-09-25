import { translateShellText as tl } from '../atria-shell/localization.js';
import { sanitizeProductDetails } from './product-error-details.js';

const messages = {
    native_product_invalid_request: 'Check the required fields and file format, then try again.',
    native_product_not_found: 'This item is no longer available. Refresh the list and select an existing item.',
    native_product_conflict: 'This item conflicts with existing data. Refresh and review the current revision before retrying.',
    native_product_failed: 'The operation could not finish. Refresh its current state before trying again.',
    native_session_title_conflict: 'This Session name changed elsewhere. Reload the current name before saving again. Your draft is still here.',
    native_package_update_conflict: 'The installed default changed after review. Select the file again to review the current update impact.',
    native_package_permission_required: 'Review the Package permissions and explicitly grant the required permissions before installing.',
    native_save_package_missing: 'Install the exact Package version required by this save, then import again.',
    native_save_package_mismatch: 'This save requires a different exact Package version. Install that version before importing.',
    native_save_library_revision_conflict: 'An existing Library revision has different content. Keep the original and resolve the conflicting import.',
    native_save_password_required: 'Enter the password for this encrypted save, then try importing again.',
    native_save_authentication_failed: 'The save could not be unlocked. Check its password and file integrity, then retry.',
    native_immutable_conflict: 'An immutable revision already exists with different content. Create a new revision instead.',
    native_write_conflict: 'The item changed while you were editing. Refresh and review its current revision before retrying.',
    storage_read_only: 'Storage is read-only. Restore write access before trying to save changes.',
};

export function createNativeProductError(code, status, details) {
    code = typeof code === 'string' && /^[a-z][a-z0-9_]{0,119}$/.test(code) ? code : 'native_product_request_failed';
    let message = messages[code];
    if (!message && code.includes('referenced')) message = 'This item is still referenced by Native content or progress. Review the listed references before deleting it.';
    if (!message && /_(missing|incomplete)$/.test(code)) message = 'Required Native content is missing. Restore the listed exact dependencies before retrying.';
    if (!message && /_(mismatch|corrupt|invalid)$/.test(code)) message = 'The content failed validation. Check the listed fields or exact resource versions before retrying.';
    if (!message && code.includes('conflict')) message = messages.native_product_conflict;
    message ||= status === 401 ? 'Your session expired. Sign in again to continue.'
        : status === 403 ? 'This operation needs additional permission. Check your account access.'
            : status === 404 ? messages.native_product_not_found
                : status === 409 ? messages.native_product_conflict
                    : status === 400 ? messages.native_product_invalid_request : messages.native_product_failed;
    const safe = sanitizeProductDetails(details);
    const context = safe ? JSON.stringify(safe) : '';
    const error = new Error(tl(message) + (context ? ' ' + tl('Details') + ': ' + context : ''));
    error.code = code; error.status = status; error.details = safe; error.isNativeProductError = true;
    return error;
}
