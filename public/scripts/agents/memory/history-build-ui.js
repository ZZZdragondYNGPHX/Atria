// SPDX-License-Identifier: AGPL-3.0-or-later
import { historyFloors } from './history-build.js';
import { translateShellText as t, formatShellText } from '../../atria-shell/localization.js';

export async function openHistoryBuildPopup(context, builder) {
    const root = document.createElement('section'); root.className = 'memory-os-history';
    // All dynamic data below is rendered with textContent, never HTML.
    const html = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]);
    root.innerHTML = `<h3>${html(t('Memory OS · History extraction'))}</h3>
        <p>${html(t('Facts and relations are extracted in batches and saved only when every batch succeeds. Closing cancels the task. Rebuilding replaces automatic memory and preserves user corrections and their dependencies. Story messages and external state are preserved.'))}</p>
        <form>
            <label>${html(t('Range'))} <select name="range" aria-label="${html(t('History range'))}"><option value="50">${html(t('Last 50 messages'))}</option><option value="100">${html(t('Last 100 messages'))}</option><option value="500">${html(t('Last 500 messages'))}</option><option value="all">${html(t('All'))}</option><option value="custom">${html(t('Custom'))}</option></select></label>
            <div><label>${html(t('First message index, starting at 0'))} <input name="from" type="number" min="0" value="0"></label>
            <label>${html(t('Last message index, inclusive'))} <input name="to" type="number" min="0"></label></div>
            <label>${html(t('Method'))} <select name="mode" aria-label="${html(t('Extraction method'))}"><option value="append">${html(t('Add missing sources'))}</option><option value="rebuild">${html(t('Rebuild automatic memory, preserving user corrections'))}</option></select></label>
            <p>${html(t('Uses the current extraction connection and preset. This may send several model requests. If any batch fails, none of this task’s extracted results are published.'))}</p>
            <button class="menu_button" type="submit">${html(t('Start extraction'))}</button>
            <button class="menu_button" type="button" data-cancel disabled>${html(t('Cancel extraction'))}</button>
            <button class="menu_button" type="button" data-rollback>${html(t('Roll back latest extraction'))}</button>
        </form>
        <progress max="1" value="0" aria-label="${html(t('History extraction progress'))}"></progress><p role="status">${html(t('Not started'))}</p><pre></pre>
        <p>${html(t('Rollback preserves assigned source IDs and episodes. It refuses to overwrite facts, graph changes or user corrections made after extraction.'))}</p>`;
    const form = root.querySelector('form'); const status = root.querySelector('[role="status"]'); const details = root.querySelector('pre');
    root.style.textAlign = 'left'; form.style.display = 'grid'; form.style.gap = '10px'; details.style.whiteSpace = 'pre-wrap'; details.style.overflowWrap = 'anywhere';
    for (const label of root.querySelectorAll('label')) { label.style.display = 'flex'; label.style.flexDirection = 'column'; label.style.gap = '4px'; }
    for (const control of root.querySelectorAll('input, select')) { control.classList.add('text_pole'); control.style.width = '100%'; control.style.maxWidth = '100%'; }
    const progress = root.querySelector('progress'); const cancel = root.querySelector('[data-cancel]');
    form.elements.to.value = String(Math.max(0, context.chat.length - 1));
    const syncRange = () => { form.elements.from.closest('div').hidden = form.elements.range.value !== 'custom'; };
    form.elements.range.addEventListener('change', syncRange); syncRange();
    let controller = null; let disposed = false; let busy = false;
    const setBusy = value => {
        busy = value;
        for (const element of form.elements) element.disabled = value;
        cancel.disabled = !value;
    };
    const onProgress = report => {
        if (disposed) return;
        const labels = { capturing: t('Preparing sources'), extracting: t('Extracting'), committing: t('Saving'), completed: t('Completed'), unchanged: t('No new sources'), cancelled: t('Cancelled'), failed: t('Failed. Extracted results were not published.') };
        status.textContent = formatShellText('${0} · ${1}/${2} batches · ${3} skipped · ${4} errors', [labels[report.status] || report.status, report.completed, report.total, report.skipped, report.errors.length]);
        progress.max = Math.max(1, report.total); progress.value = report.completed;
        details.textContent = [...report.errors.map(error => `${error.batch ? formatShellText('Batch ${0}: ', [error.batch]) : ''}${error.message}`), report.reason || ''].filter(Boolean).join('\n');
    };
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy) return;
        try {
            const floors = historyFloors(context.chat, { range: form.elements.range.value, from: Number(form.elements.from.value), to: Number(form.elements.to.value) });
            const mode = form.elements.mode.value;
            controller = new AbortController(); setBusy(true);
            await builder.run(context, { floors, mode, signal: controller.signal, onProgress });
        } catch (error) { if (!disposed) status.textContent = error.message; } finally { if (!disposed) setBusy(false); }
    });
    cancel.addEventListener('click', () => { controller?.abort(); cancel.disabled = true; status.textContent = t('Cancelling…'); });
    root.querySelector('[data-rollback]').addEventListener('click', async () => {
        if (busy) return;
        setBusy(true);
        try { await builder.rollback(context); if (!disposed) status.textContent = t('Latest extraction rolled back'); } catch (error) { if (!disposed) status.textContent = error.message; } finally { if (!disposed) setBusy(false); }
    });
    try { await context.callGenericPopup(root, context.POPUP_TYPE.TEXT, '', { wide: true, allowVerticalScrolling: true }); } finally { disposed = true; controller?.abort(); }
}
