export const NOTES_PANEL_TEMPLATE = `
<div class="atria-notes-panel" id="atria-notes-panel">
    <div class="atria-notes-panel__header">
        <h3 data-i18n="Notes">Notes</h3>
        <div class="atria-notes-panel__tabs">
            <button class="atria-notes-tab is-active" data-tab="open" data-i18n="Open notes">Open notes</button>
            <button class="atria-notes-tab" data-tab="closed" data-i18n="Closed notes">Closed notes</button>
        </div>
    </div>
    <ul class="atria-notes-list" id="atria-notes-list">
        <li class="atria-notes-empty" data-i18n="No open notes yet">No open notes yet</li>
    </ul>
</div>
<template id="atria-notes-row-template">
    <li class="atria-notes-row" data-id="">
        <div class="atria-notes-row__text" contenteditable="false"></div>
        <div class="atria-notes-row__reason" hidden></div>
        <div class="atria-notes-row__actions">
            <button class="atria-notes-action atria-notes-action--close" data-action="close" data-i18n="Close this note">Close this note</button>
            <button class="atria-notes-action atria-notes-action--edit" data-action="edit" data-i18n="Edit note">Edit note</button>
            <button class="atria-notes-action atria-notes-action--danger" data-action="delete" data-i18n="Delete note (permanent)">Delete note (permanent)</button>
        </div>
    </li>
</template>
<template id="atria-notes-close-dialog-template">
    <div class="atria-notes-close-dialog">
        <label data-i18n="Closure reason (optional)">Closure reason (optional)</label>
        <textarea class="atria-notes-close-reason"></textarea>
        <button class="atria-notes-close-confirm" data-i18n="Close this note">Close this note</button>
    </div>
</template>
`;
