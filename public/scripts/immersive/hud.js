import { createFocusTrap } from './accessibility.js';

function textNode(documentRef, tag, className, text = '') {
    const element = documentRef.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
}

function renderItems(documentRef, container, items, tier) {
    container.replaceChildren();
    for (const item of items || []) {
        const row = documentRef.createElement('div');
        row.className = `atria-immersive-hud-item atria-immersive-hud-${tier}`;
        if (item.label) row.append(textNode(documentRef, 'span', 'atria-immersive-hud-label', item.label));
        row.append(textNode(documentRef, 'span', 'atria-immersive-hud-value', item.value));
        container.append(row);
    }
}

export function createImmersiveHud({
    document: documentRef = globalThis.document,
    translate = value => value,
    invokeAction = async () => false,
    onWake = () => {},
} = {}) {
    const root = documentRef.createElement('section');
    root.id = 'atriaImmersiveHud';
    root.className = 'atria-immersive-hud';
    root.setAttribute('aria-label', translate('Immersive status'));
    root.hidden = true;

    const summary = documentRef.createElement('div');
    summary.className = 'atria-immersive-hud-summary';
    const primary = documentRef.createElement('div');
    const secondary = documentRef.createElement('div');
    const ambient = documentRef.createElement('div');
    primary.className = 'atria-immersive-hud-primary-list';
    secondary.className = 'atria-immersive-hud-secondary-list';
    ambient.className = 'atria-immersive-hud-ambient-list';
    summary.append(primary, secondary, ambient);

    const transient = textNode(documentRef, 'div', 'atria-immersive-hud-transient');
    transient.setAttribute('role', 'status');
    transient.setAttribute('aria-live', 'polite');
    transient.hidden = true;

    const actionList = documentRef.createElement('div');
    actionList.className = 'atria-immersive-provider-actions';

    const detailsButton = documentRef.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'atria-immersive-hud-details-button';
    detailsButton.textContent = translate('Details');
    detailsButton.setAttribute('aria-expanded', 'false');
    detailsButton.hidden = true;

    root.append(summary, transient, actionList, detailsButton);
    documentRef.body.append(root);

    const dialog = documentRef.createElement('dialog');
    dialog.id = 'atriaImmersiveHudDetails';
    dialog.className = 'atria-immersive-hud-details';
    dialog.setAttribute('aria-label', translate('Immersive details'));
    const dialogHeader = documentRef.createElement('header');
    const dialogTitle = textNode(documentRef, 'h2', '', translate('Story details'));
    const closeButton = documentRef.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'atria-immersive-hud-close';
    closeButton.setAttribute('aria-label', translate('Close details'));
    closeButton.textContent = '×';
    dialogHeader.append(dialogTitle, closeButton);
    const detailsBody = documentRef.createElement('div');
    detailsBody.className = 'atria-immersive-hud-details-body';
    dialog.append(dialogHeader, detailsBody);
    documentRef.body.append(dialog);

    const trap = createFocusTrap(dialog, { onEscape: () => closeDetails() });
    let enabled = false;
    let snapshot = null;
    let transientTimer = null;

    const closeDetails = () => {
        if (!dialog.open) return false;
        trap.deactivate();
        dialog.close();
        detailsButton.setAttribute('aria-expanded', 'false');
        return true;
    };

    const openDetails = () => {
        if (!enabled || !snapshot) return;
        onWake();
        detailsBody.replaceChildren();
        for (const item of snapshot.hud?.details || []) {
            const row = textNode(documentRef, 'div', 'atria-immersive-hud-detail-row');
            if (item.label) row.append(textNode(documentRef, 'strong', '', item.label));
            row.append(textNode(documentRef, 'span', '', item.value));
            detailsBody.append(row);
        }
        if (!dialog.open) {
            dialog.showModal();
            detailsButton.setAttribute('aria-expanded', 'true');
            trap.activate(detailsButton);
        }
    };

    const renderActions = actions => {
        actionList.replaceChildren();
        for (const action of actions || []) {
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.className = 'atria-immersive-provider-action';
            button.textContent = action.label;
            button.addEventListener('click', async () => {
                onWake();
                await invokeAction(action.id);
            });
            actionList.append(button);
        }
    };

    const showTransient = items => {
        clearTimeout(transientTimer);
        const first = items?.[0];
        if (!enabled || !first) {
            transient.hidden = true;
            transient.textContent = '';
            return;
        }
        transient.textContent = first.label ? `${first.label}: ${first.value}` : first.value;
        transient.hidden = false;
        transientTimer = setTimeout(() => {
            transient.hidden = true;
            transient.textContent = '';
        }, 4200);
    };

    const render = nextSnapshot => {
        snapshot = nextSnapshot || null;
        const hud = snapshot?.hud || { summary: {}, transient: [], details: [] };
        renderItems(documentRef, primary, hud.summary?.primary, 'primary');
        renderItems(documentRef, secondary, hud.summary?.secondary, 'secondary');
        renderItems(documentRef, ambient, hud.summary?.ambient, 'ambient');
        renderActions(snapshot?.actions || []);
        detailsButton.hidden = !(hud.details?.length);
        if (detailsButton.hidden) closeDetails();
        showTransient(hud.transient || []);
    };

    detailsButton.addEventListener('click', openDetails);
    closeButton.addEventListener('click', closeDetails);
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeDetails();
    });

    return {
        setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
            root.hidden = !enabled;
            if (!enabled) closeDetails();
        },
        setMode(mode) {
            root.dataset.mode = mode || 'auto';
        },
        render,
        closeDetails,
        hasOpen: () => dialog.open,
        dispose() {
            clearTimeout(transientTimer);
            closeDetails();
            root.remove();
            dialog.remove();
        },
    };
}
