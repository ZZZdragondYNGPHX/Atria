/**
 * Releases the static startup cover. The cover finishes its own exit
 * animation, but #preloader is gone for every caller from this point.
 */
export function dismissStartupCover() {
    if (globalThis.AtriaStartup?.dismiss) globalThis.AtriaStartup.dismiss();
    else document.getElementById('preloader')?.remove();
}
