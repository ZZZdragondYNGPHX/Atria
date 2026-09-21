export const ATRIA_BACK_RESULT = Object.freeze({
    CONSUMED: 'consumed',
    UNHANDLED: 'unhandled',
});

const BACK_STEPS = Object.freeze([
    ['keyboard', 'dismissKeyboard'],
    ['modal-popover', 'dismissModalPopover'],
    ['context-sheet', 'dismissContextSheet'],
    ['command-surface', 'dismissCommandSurface'],
    ['generation', 'dismissGeneration'],
    ['detail-route', 'dismissDetailRoute'],
    ['full-game', 'escapeFullGame'],
    ['immersive', 'exitImmersive'],
    ['workspace-child', 'dismissWorkspaceChild'],
    ['atria-history', 'navigateAtriaBack'],
    ['legacy-fallback', 'dismissLegacyFallback'],
]);

export function createAtriaBackResolver(handlers = {}) {
    let lastStep = null;

    function runHandler(name, step) {
        const handler = handlers?.[name];
        if (typeof handler !== 'function') return false;
        try {
            if (handler() !== true) return false;
            lastStep = step;
            return true;
        } catch (error) {
            console.warn('[atria-shell] Back resolver step failed', { step, error });
            return false;
        }
    }

    function resolve() {
        lastStep = null;
        for (const [step, handlerName] of BACK_STEPS) {
            if (runHandler(handlerName, step)) {
                return ATRIA_BACK_RESULT.CONSUMED;
            }
        }
        return ATRIA_BACK_RESULT.UNHANDLED;
    }

    return Object.freeze({
        resolve,
        getLastStep: () => lastStep,
        steps: BACK_STEPS.map(([step]) => step),
    });
}
