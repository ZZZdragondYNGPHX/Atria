import { nativeStudioClient } from './studio-client.js';
import { el, action, feedback, libraryError } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountProjectDeletion({ document: doc, root, project, revision, onDeleted, client = nativeStudioClient }) {
    const shell = el(doc, 'section', 'atri-project-lifecycle', undefined, root);
    shell.dataset.atriaProjectDeletion = project.projectId;
    const review = el(doc, 'div', 'atri-knowledge-fields', undefined, shell); review.hidden = true;
    let baseRevision = revision; let current = project; let busy = false;
    const open = action(doc, shell, 'Delete Project', async () => {
        if (!baseRevision) {
            const detail = await client.getProject(project.projectId);
            baseRevision = detail.revision.revision; current = detail.source.project;
        }
        showReview();
    }, { danger: true });
    function showReview() {
        review.replaceChildren(); review.hidden = false; open.hidden = true;
        const heading = el(doc, 'h4', '', tl('Delete Project') + ': ' + current.displayName, review);
        heading.tabIndex = -1; heading.focus();
        el(doc, 'p', '', tl('This permanently deletes project source files and edit history. Unsaved edits will be lost.'), review);
        el(doc, 'p', '', tl('Installed Works, Sessions, Saves, exported build files and separately installed Skills are kept.'), review);
        const controls = el(doc, 'div', 'atri-library-actions', undefined, review);
        const status = el(doc, 'div', '', undefined, review);
        const confirm = action(doc, controls, 'Delete project permanently', async () => {
            if (busy) return;
            busy = true; controls.inert = true; status.replaceChildren();
            let stale = false;
            try {
                await client.deleteProject(project.projectId, baseRevision);
                await onDeleted();
            } catch (error) {
                if (error.status === 404) { await onDeleted(); return; }
                stale = error.status === 409;
                feedback(doc, status, stale
                    ? tl('This project changed. Reload its revision and review deletion again.') : libraryError(error), true);
                if (stale) action(doc, status, 'Reload project revision', async () => {
                    const detail = await client.getProject(project.projectId);
                    baseRevision = detail.revision.revision; current = detail.source.project; showReview();
                });
            } finally {
                busy = false; controls.inert = false;
                if (stale) confirm.remove();
            }
        }, { danger: true });
        action(doc, controls, 'Cancel', () => {
            if (busy) return; review.hidden = true; open.hidden = false; open.focus();
        });
    }
    return { element: shell };
}
