import { translateShellText as tl } from '../atria-shell/localization.js';

/** Resource-owned list using the existing Regex editor and portable file format. */
export function mountNativeRegexRules({ parent, scripts = [], save }) {
    const doc = parent.ownerDocument;
    const selected = new Set();
    const node = (tag, text, root = parent) => { const el = doc.createElement(tag); if (text) el.textContent = tl(text); root.append(el); return el; };
    const status = node('p'); status.setAttribute('role', 'status');
    const button = (root, text, run) => {
        const el = node('button', text, root); el.type = 'button'; el.className = 'atri-library-button';
        el.addEventListener('click', async () => {
            el.disabled = true;
            try { await run(); } catch (error) { status.textContent = error.message; } finally { el.disabled = false; }
        }); return el;
    };
    const edit = async script => {
        const { editNativeRegexRule } = await import('../extensions/regex/index.js');
        await editNativeRegexRule(script, async rule => {
            if (!rule.id) rule.id = crypto.randomUUID();
            await save(script ? scripts.map(item => item.id === script.id ? rule : item) : [...scripts, rule]);
        });
    };
    const tools = node('div'); tools.className = 'atri-prompt-actions';
    button(tools, 'New Regex rule', () => edit(null));
    const inputLabel = node('label', 'Import Regex rules'); inputLabel.className = 'atri-library-field';
    const input = node('input', null, inputLabel); input.type = 'file'; input.accept = '.json,application/json';
    button(tools, 'Import selected rules', async () => {
        if (!input.files.length) { input.focus(); return; }
        const value = JSON.parse(await input.files[0].text());
        const imported = (Array.isArray(value) ? value : [value]).map(rule => ({ ...rule, id: crypto.randomUUID() }));
        await save([...scripts, ...imported]);
    });
    button(tools, 'Export Regex rules', () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(scripts, null, 2)], { type: 'application/json' }));
        const link = node('a'); link.href = url; link.download = 'regex.json'; link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    for (const [label, disabled] of [['Enable selected rules', false], ['Disable selected rules', true]]) {
        button(tools, label, async () => { if (selected.size) await save(scripts.map(rule => selected.has(rule.id) ? { ...rule, disabled } : rule)); });
    }
    if (!scripts.length) node('p', 'No Regex rules yet.');
    scripts.forEach((rule, index) => {
        const row = node('article'); row.className = 'atri-prompt-resource atri-regex-resource';
        const label = node('label', null, row); const check = node('input', null, label); check.type = 'checkbox';
        label.append(doc.createTextNode(rule.scriptName)); check.addEventListener('change', () => check.checked ? selected.add(rule.id) : selected.delete(rule.id));
        node('span', rule.disabled ? 'Disabled' : 'Enabled', row).className = 'atri-regex-rule-state';
        button(row, 'Edit rule', () => edit(rule));
        button(row, 'Delete rule', async () => {
            const { Popup, POPUP_TYPE } = await import('../popup.js');
            if (await new Popup(tl('Delete this Regex rule?'), POPUP_TYPE.CONFIRM).show()) await save(scripts.filter(item => item.id !== rule.id));
        });
        for (const [label, delta] of [['Move rule up', -1], ['Move rule down', 1]]) {
            button(row, label, async () => { const next = [...scripts]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; await save(next); }).disabled = index + delta < 0 || index + delta >= scripts.length;
        }
    });
}
