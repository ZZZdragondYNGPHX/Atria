import { assertSourceSelector, assertSessionTaskRef } from '../../../public/shared/native-orchestration-contracts.js';
import { NotFoundError } from '../../storage/errors.js';

const unavailable = () => { throw Object.assign(new Error('Original binding source authority is required'), { code: 'native_orchestration_source_unavailable' }); };
const missing = () => { throw new NotFoundError('orchestration_binding_source'); };

export function assertSessionTaskSource(snapshot, taskRef) {
    assertSessionTaskRef(taskRef);
    const task = snapshot.manifest?.runtime?.experienceContract?.taskRuntime?.tasks?.find(item => item.id === taskRef.taskId);
    const variant = task?.variants?.find(item => item.id === taskRef.variantId);
    if (!task || !variant) missing();
    return { task, variant };
}

/** Validate a saved user selection, never grant model/Actor/Tool execution. */
export function createBindingSourceAuthority({ sessionCore, projectAgent, studio, rpControl } = {}) {
    return async ({ handle, body, tx }) => {
        const selector = assertSourceSelector(body.sourceSelector);
        if (selector.domain === 'native_session') {
            if (typeof sessionCore?.observe !== 'function') unavailable();
            const snapshot = await sessionCore.observe(handle, selector.sessionId);
            if (!snapshot || snapshot.session.sessionId !== selector.sessionId
                || (selector.entryPointId !== null && snapshot.session.entryPointId !== selector.entryPointId)) missing();
            if (selector.taskRef) assertSessionTaskSource(snapshot, selector.taskRef);
        } else if (selector.domain === 'project') {
            if (selector.taskId === null) {
                if (typeof studio?.observeRevision !== 'function') unavailable();
                const revision = await studio.observeRevision(handle, selector.projectId);
                if (revision.projectId !== selector.projectId) missing();
            } else {
                if (typeof projectAgent?.observeComputeSource !== 'function') unavailable();
                const { task, project } = await projectAgent.observeComputeSource(handle, selector.projectId, selector.taskId);
                if (task.taskId !== selector.taskId || task.projectId !== selector.projectId || project.revision.projectId !== selector.projectId) missing();
            }
        } else {
            if (typeof rpControl?.status !== 'function') unavailable();
            const control = await rpControl.status(handle, selector.controlId);
            if (!control || control.controlId !== selector.controlId) missing();
            const chat = await tx.getResource({ kind: 'chat', handle, ...control.locator });
            if (!chat || chat.header?.chat_metadata?.nativeControlId !== selector.controlId) missing();
        }
    };
}
