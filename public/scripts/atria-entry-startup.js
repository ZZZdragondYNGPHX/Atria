/* First-paint feedback must also work if the module graph fails to load. */
(() => {
    const preloader = document.getElementById('preloader');
    if (!preloader) {
        document.documentElement.removeAttribute('data-atria-starting');
        return;
    }
    const status = preloader.querySelector('.atri-startup-status');
    const retry = preloader.querySelector('.atri-startup-retry');
    retry.addEventListener('click', () => window.location.reload());
    const timer = window.setTimeout(() => {
        if (!preloader.isConnected) return;
        status.textContent = 'Still preparing your workspace. You can reload if startup does not finish.';
        retry.hidden = false;
    }, 20000);
    const observer = new MutationObserver(() => {
        if (preloader.isConnected) return;
        document.documentElement.removeAttribute('data-atria-starting');
        clearTimeout(timer);
        observer.disconnect();
    });
    observer.observe(preloader.parentNode, { childList: true });
})();
