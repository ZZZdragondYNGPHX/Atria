import { nativeProductClient as client } from './product-client.js';
import { el, action, disclosure, feedback } from './library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';

const explanations = {
    'custom-ui': ['Custom interface', 'The Work declares its own interface components.'],
    generation: ['Model generation', 'The Work requests generation through your configured Runtime routes.'],
    'runtime-tools': ['Runtime tools', 'The Work declares tools that can participate in its runtime.'],
    'world-write': ['World changes', 'The Work declares changes to its Native world state.'],
    network: ['Network access', 'The Work declares network capability. Review its origin before accepting.'],
    clipboard: ['Clipboard access', 'The Work declares clipboard capability.'],
    'asset-access': ['Asset access', 'The Work declares access to its runtime assets.'],
};
export function permissionRow(doc, root, permission, { checkbox = false, installed = false } = {}) {
    const row = el(doc, 'div', 'atri-library-version', undefined, root);
    const [name, description] = explanations[permission.permission] || [permission.permission, 'Declared Work permission'];
    let input;
    if (checkbox) {
        const label = el(doc, 'label', '', undefined, row); input = el(doc, 'input', '', undefined, label); input.type = 'checkbox'; input.value = permission.permission;
        label.append(doc.createTextNode(' ' + tl(name))); input.setAttribute('aria-label', tl(name));
    } else el(doc, 'h4', '', tl(name), row);
    el(doc, 'p', '', tl(description), row);
    el(doc, 'p', 'atri-library-meta', tl(installed ? permission.required ? 'Required · Accepted at installation' : 'Optional declaration · No separate grant recorded' : permission.required ? 'Required permission' : 'Optional permission'), row);
    if (permission.reason) el(doc, 'p', '', permission.reason, row);
    disclosure(doc, row, 'Details', { permission: permission.permission }); return input;
}

export function renderPackageUpdateReview(doc, root, preflight) {
    const update = preflight.update; if (!update) return;
    const section = el(doc, 'section', 'atri-library-section', undefined, root); section.dataset.atriaPackageUpdateImpact = 'true';
    el(doc, 'h4', '', tl(update.previous ? 'Update impact' : 'New Work installation'), section);
    if (update.previous) el(doc, 'p', '', `${update.previous.version || '—'} → ${preflight.version}`, section);
    if (update.comparisonAvailable === false) el(doc, 'p', '', tl('The installed content is unavailable for comparison. Review every requested permission before repairing this Work.'), section);
    for (const [key, label] of [['addedPermissions', 'New permissions'], ['removedPermissions', 'Removed permissions'], ['changedPermissions', 'Changed permission requirements']]) {
        if (!update[key]?.length) continue;
        const group = disclosure(doc, section, label); group.open = true;
        for (const permission of update[key]) permissionRow(doc, group, permission);
    }
    if (update.addedCapabilities?.length || update.removedCapabilities?.length) disclosure(doc, section, 'Capability changes', { added: update.addedCapabilities, removed: update.removedCapabilities });
    el(doc, 'p', '', fmt('${0} existing Sessions stay pinned to their exact installed versions.', [update.pinnedSessions.length]), section);
    el(doc, 'p', '', tl('Installing this file changes the default for new Sessions. It does not upgrade existing Sessions or revoke permissions of earlier versions.'), section);
    if (update.pinnedSessions.length) disclosure(doc, section, 'Pinned Sessions', update.pinnedSessions);
}

export function mountWorkPermissions({ document: doc, root, work, onManage }) {
    const section = disclosure(doc, root, 'Work permissions'); section.dataset.atriaWorkPermissions = 'true';
    el(doc, 'p', '', tl('Permissions use installation-time consent. Required declarations are accepted when installing; optional declarations have no separate stored grant.'), section);
    el(doc, 'p', '', tl('Individual permissions cannot be switched off for an immutable installed version. To revoke installation consent, uninstall the Work after exporting and removing its dependent Sessions. A new version does not change older Sessions.'), section);
    const label = el(doc, 'label', 'atri-library-field', tl('Installed version'), section), picker = el(doc, 'select', '', undefined, label);
    picker.setAttribute('aria-label', tl('Installed version'));
    for (const version of work.versions || []) { const option = el(doc, 'option', '', version.version + (version.packageVersionId === work.package.currentVersionId ? ' · ' + tl('Current') : ''), picker); option.value = version.packageVersionId; }
    picker.value = work.package.currentVersionId;
    const body = el(doc, 'div', 'atri-library-section', undefined, section); let sequence = 0;
    const load = async () => {
        const token = ++sequence; body.replaceChildren();
        try {
            const exact = await client.getWorkVersion(work.package.packageId, picker.value); if (token !== sequence) return;
            for (const permission of exact.manifest.permissions) permissionRow(doc, body, permission, { installed: true });
            if (!exact.manifest.permissions.length) el(doc, 'p', '', tl('This version declares no permissions.'), body);
            disclosure(doc, body, 'Exact version details', exact.packageVersion);
        } catch { if (token === sequence) { feedback(doc, body, tl('Permissions could not be loaded.'), true); action(doc, body, 'Try again', load); } }
    };
    picker.addEventListener('change', load);
    action(doc, section, 'Review permissions', load);
    action(doc, section, 'Manage uninstall and dependent Sessions', onManage);
    return section;
}
