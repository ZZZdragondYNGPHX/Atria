import { nativeProductClient as client, arrayBufferToBase64 } from './product-client.js';
import { permissionRow } from './package-permissions.js';
import { el, action, disclosure, field, feedback } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function matchesSavePackage(required, candidate) {
    return Boolean(required && candidate && required.packageId === candidate.packageId && required.packageVersionId === candidate.packageVersionId
        && required.packageVersion === candidate.version && required.packageContentHash === candidate.packageContentHash);
}

export function mountSaveDependencyRecovery({ document: doc, root, preflight, saveData, host, onReady }) {
    const required = preflight.dependency?.required || preflight.package;
    const section = el(doc, 'section', 'atri-library-section', undefined, root); section.dataset.atriaSaveRecovery = 'true';
    el(doc, 'h4', '', tl('Recover matching Work'), section);
    el(doc, 'p', '', tl('Choose the exact Work file required by this save. Its identity, version and content hash must all match.'), section);
    disclosure(doc, section, 'Required Work details', required);
    const check = async () => {
        const next = await client.preflightSave(saveData);
        if (next.dependency?.status !== 'ready') { feedback(doc, section, tl('The exact Work is still unavailable. Install the matching file or inspect the installed Work.'), true); return; }
        if (section.isConnected) await onReady();
    };
    action(doc, section, 'Check installed dependency again', check);
    action(doc, section, 'Inspect installed Work', async () => {
        await client.getWork(required.packageId); host?.openLibraryWork(required.packageId);
    });
    const picker = field(doc, section, 'Matching Work file', '', 'file'); picker.accept = '.atria,application/octet-stream';
    const choose = action(doc, section, 'Choose matching Work', () => picker.click());
    const review = el(doc, 'div', 'atri-library-section', undefined, section); let sequence = 0;
    picker.addEventListener('change', async () => {
        const token = ++sequence, file = picker.files?.[0]; review.replaceChildren(); if (!file) return;
        try {
            if (file.size > 128 * 1024 * 1024) throw new Error(tl('The Work file exceeds the supported size.'));
            const data = arrayBufferToBase64(await file.arrayBuffer()), candidate = await client.preflightPackage(data);
            if (token !== sequence) return;
            if (!matchesSavePackage(required, candidate)) {
                feedback(doc, review, tl('This file is not the exact Work required by the save. Nothing was installed.'), true); return;
            }
            el(doc, 'h4', '', candidate.name + ' · ' + candidate.version, review);
            el(doc, 'p', '', tl('Installing this dependency preserves any existing default Work version. Your save remains ready for the next import step.'), review);
            const permissions = el(doc, 'fieldset', 'atri-library-permissions', undefined, review); el(doc, 'legend', '', tl('Requested permissions'), permissions);
            const grants = new Map();
            for (const permission of candidate.permissions) {
                const checkbox = permissionRow(doc, permissions, permission, { checkbox: permission.required });
                if (checkbox) grants.set(permission.permission, checkbox);
            }
            action(doc, review, 'Install matching Work', async () => {
                const missing = candidate.requiredPermissions.filter(permission => !grants.get(permission)?.checked);
                if (missing.length) { feedback(doc, review, tl('Grant required permissions before installation:'), true); return; }
                picker.disabled = true; choose.disabled = true;
                try {
                    await client.installPackage(data, candidate.requiredPermissions, candidate.update?.previous?.packageVersionId || null, required);
                    void host?.refreshSearch?.(); await check();
                } finally { picker.disabled = false; choose.disabled = false; }
            }, { primary: true });
        } catch (error) { if (token === sequence) feedback(doc, review, error.message, true); }
    });
    return section;
}
