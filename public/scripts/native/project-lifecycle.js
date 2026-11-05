import { nativeStudioClient } from './studio-client.js';
import { el, action } from './library-ui.js';

export function mountProjectDeletion({ document: doc, root, project, onDeleted, client = nativeStudioClient }) {
    const shell = el(doc, 'section', 'atri-project-lifecycle', undefined, root);
    shell.dataset.atriaProjectDeletion = project.projectId;
    action(doc, shell, 'Delete Project', async () => {
        try {
            const detail = await client.getProject(project.projectId);
            await client.deleteProject(project.projectId, detail.revision.revision);
        } catch (error) { if (error.status !== 404) throw error; }
        await onDeleted();
    }, { danger: true });
    return { element: shell };
}
