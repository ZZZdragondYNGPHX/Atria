import { translateShellText as t } from '../atria-shell/localization.js';

/** One transient Source view over an existing resource form and its save handler. */
export function mountResourceSource({ document: doc, form, label, readFields, onFields, identity, isCurrent = () => true }) {
    let advanced = false;
    const toolbar = doc.createElement('div'); toolbar.className = 'atri-runtime-toolbar';
    const toggle = doc.createElement('button'); toggle.type = 'button'; toggle.textContent = t('Source'); toolbar.append(toggle);
    const wrap = doc.createElement('label'); wrap.className = 'atri-library-field atri-resource-source'; wrap.hidden = true;
    const caption = doc.createElement('span'); caption.textContent = t(label);
    const source = doc.createElement('textarea'); source.rows = 18; source.setAttribute('aria-label', t(label)); wrap.append(caption, source);
    const status = doc.createElement('p'); status.setAttribute('role', 'alert');
    form.prepend(toolbar, wrap, status);
    function read() {
        if (!advanced) return readFields();
        const value = JSON.parse(source.value);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(t('Use a JSON object.'));
        for (const [key, expected] of Object.entries(identity)) if (value[key] !== expected) throw new TypeError(t('Source must retain this resource identity and scope.') + ' ' + key);
        return value;
    }
    toggle.addEventListener('click', async () => {
        if (!isCurrent() || toggle.disabled) return;
        status.textContent = '';
        try {
            if (advanced) {
                const value = read(); toggle.disabled = true; await onFields(value);
            } else {
                source.value = JSON.stringify(readFields(), null, 2); advanced = true;
                for (const field of form.querySelectorAll('fieldset')) { field.disabled = true; field.hidden = true; }
                wrap.hidden = false; form.noValidate = true; toggle.textContent = t('Fields'); toggle.setAttribute('aria-pressed', 'true'); source.focus();
            }
        } catch (error) { if (isCurrent()) { status.textContent = error.message; if (advanced) source.focus(); } } finally { toggle.disabled = false; }
    });
    return { read, getSource: () => advanced ? source.value : JSON.stringify(readFields(), null, 2) };
}
