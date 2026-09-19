let inspectorModulePromise;
let inspectorOpening = false;

function loadInspectorModule() {
    return inspectorModulePromise ??= import('./request-inspector.js');
}

jQuery(() => {
    const $btn = $(`
 <div id="request_inspector_button" class="margin0 menu_button_icon menu_button">
 <i class="fa-fw fa-solid fa-satellite-dish"></i>
 <span data-i18n="Inspector">Inspector</span>
 </div>
 `);

    $btn.on('click', async () => {
        if (inspectorOpening) return;
        inspectorOpening = true;
        try {
            const { openInspectorPanel } = await loadInspectorModule();
            await openInspectorPanel();
        } catch (error) {
            console.error('[request-inspector] failed to load panel', error);
            globalThis.toastr?.error('Failed to load Request Inspector.');
        } finally {
            inspectorOpening = false;
        }
    });

    const $logsBtn = $('#server_logs_button');
    if ($logsBtn.length) {
        $logsBtn.after($btn);
    } else {
        $('#account_controls').append($btn);
    }
});
