import { translateShellText as t } from '../atria-shell/localization.js';

// A local projection of the existing resource value. Only onReview may stage it.
export function mountStudioValueEditor({ document: doc, root, value, label, onReview }) {
    let draft = JSON.parse(JSON.stringify(value));
    let advanced = false;
    let sourceText = JSON.stringify(draft, null, 2);
    const shell = doc.createElement('section'); shell.className = 'atri-studio-value-editor';
    root.append(shell);
    const toolbar = doc.createElement('div'); toolbar.className = 'atria-studio-actions';
    const toggle = doc.createElement('button'); toggle.type = 'button';
    const content = doc.createElement('div'); content.className = 'atri-studio-value-fields';
    const feedback = doc.createElement('p'); feedback.hidden = true; feedback.tabIndex = -1;
    const review = doc.createElement('button'); review.type = 'button'; review.textContent = t('Review Changes'); review.dataset.variant = 'primary';
    toolbar.append(toggle); shell.append(toolbar, content, feedback, review);
    function fail(error) {
        feedback.hidden = false; feedback.setAttribute('role', 'alert');
        feedback.textContent = t('Check the value and try again. Your draft is still here.') + ' ' + error.message;
        feedback.focus();
    }
    function renderValue(parent, current, path, set, depth = 0) {
        if (current !== null && typeof current === 'object') {
            for (const [key, child] of Object.entries(current)) {
                const name = Array.isArray(current) ? `${Number(key) + 1}` : key.replace(/([a-z])([A-Z])/g, '$1 $2');
                const nextPath = path ? path + '.' + key : key;
                if (child !== null && typeof child === 'object') {
                    const section = doc.createElement('details'); section.open = depth === 0;
                    const title = doc.createElement('summary'); title.textContent = name;
                    section.append(title); parent.append(section);
                    renderValue(section, child, nextPath, next => { current[key] = next; }, depth + 1);
                } else {
                    const row = doc.createElement('label'); row.className = 'atria-studio-field';
                    const caption = doc.createElement('span'); caption.textContent = name;
                    const input = doc.createElement(typeof child === 'string' && (child.includes('\n') || child.length > 120) ? 'textarea' : 'input');
                    input.setAttribute('aria-label', nextPath); input.name = nextPath; input.autocomplete = 'off';
                    if (typeof child === 'boolean') { input.type = 'checkbox'; input.checked = child; } else { input.value = child === null ? 'null' : String(child); if (typeof child === 'number') { input.type = 'number'; input.step = 'any'; input.required = true; } }
                    if (child === null) input.readOnly = true;
                    input.addEventListener('input', () => {
                        if (typeof child === 'boolean') current[key] = input.checked;
                        else if (typeof child === 'number') { if (input.value !== '' && Number.isFinite(Number(input.value))) current[key] = Number(input.value); } else if (child !== null) current[key] = input.value;
                    });
                    row.append(caption, input); parent.append(row);
                }
            }
            if (!Object.keys(current).length) {
                const note = doc.createElement('p'); note.textContent = t('No fields yet. Use Source to add structured data.'); parent.append(note);
            }
        } else {
            const input = doc.createElement('textarea'); input.value = JSON.stringify(current); input.setAttribute('aria-label', label);
            input.addEventListener('input', () => { try { set(JSON.parse(input.value)); input.setCustomValidity(''); } catch { input.setCustomValidity(t('Enter valid JSON.')); } });
            parent.append(input);
        }
    }
    function render() {
        content.replaceChildren(); feedback.hidden = true;
        toggle.textContent = t(advanced ? 'Fields' : 'Source'); toggle.setAttribute('aria-pressed', String(advanced));
        if (advanced) {
            const editor = doc.createElement('textarea'); editor.className = 'atria-studio-editor__textarea';
            editor.value = sourceText; editor.setAttribute('aria-label', label); editor.spellcheck = false;
            editor.addEventListener('input', () => { sourceText = editor.value; }); content.append(editor);
        } else renderValue(content, draft, '', next => { draft = next; });
    }
    toggle.addEventListener('click', () => {
        try {
            const invalid = [...content.querySelectorAll('input,textarea')].find(input => !input.checkValidity());
            if (invalid) { invalid.reportValidity(); return; }
            if (advanced) draft = JSON.parse(sourceText); else sourceText = JSON.stringify(draft, null, 2);
            advanced = !advanced; render(); toggle.focus();
        } catch (error) { fail(error); }
    });
    review.addEventListener('click', async () => {
        if (review.disabled) return;
        try {
            if (advanced) draft = JSON.parse(sourceText);
            const invalid = [...content.querySelectorAll('input,textarea')].find(input => !input.checkValidity());
            if (invalid) { invalid.reportValidity(); return; }
            feedback.hidden = true;
            review.disabled = true; review.setAttribute('aria-busy', 'true');
            await onReview(JSON.parse(JSON.stringify(draft)));
        } catch (error) { fail(error); } finally { review.disabled = false; review.removeAttribute('aria-busy'); }
    });
    render();
}
