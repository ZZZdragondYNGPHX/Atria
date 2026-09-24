import { el, action } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { KNOWLEDGE_TARGET_KINDS } from './knowledge-contracts.js';
const captionText = value => { const match = /^(.*) (\d+)$/.exec(value); return match ? tl(match[1]) + ' ' + match[2] : tl(value); };

export function knowledgeFormControls(doc, rerender) {
    function input(parent, caption, value, change, type = 'text', options) {
        const wrap = el(doc, 'label', 'atri-library-field', undefined, parent); el(doc, 'span', '', captionText(caption), wrap);
        const node = el(doc, options ? 'select' : type === 'textarea' ? 'textarea' : 'input', '', undefined, wrap);
        node.setAttribute('aria-label', captionText(caption));
        if (options) for (const [id, text] of options.map(item => Array.isArray(item) ? item : [item, item])) { const option = el(doc, 'option', '', tl(text), node); option.value = id; }
        else if (type !== 'textarea') node.type = type;
        if (type === 'textarea') node.rows = caption === 'Entry content' ? 8 : 3;
        node.value = value ?? ''; node.addEventListener(options ? 'change' : 'input', () => change(node.value, node)); return node;
    }
    function checkbox(parent, caption, checked, change) {
        const wrap = el(doc, 'div', 'atri-library-permissions', undefined, parent);
        const label = el(doc, 'label', '', undefined, wrap); const node = el(doc, 'input', '', undefined, label); node.type = 'checkbox'; node.checked = checked; label.append(doc.createTextNode(captionText(caption)));
        node.addEventListener('change', () => change(node.checked)); return node;
    }
    function numeric(parent, caption, value, change, max = Number.MAX_SAFE_INTEGER, step = 1) {
        const node = input(parent, caption, value, raw => change(raw === '' ? null : Number(raw)), 'number');
        node.min = '0'; node.max = String(max); node.step = String(step); node.required = true; return node;
    }
    function renderTargets(parent, delivery) {
        const targets = delivery.target === undefined ? [] : Array.isArray(delivery.target) ? delivery.target : [delivery.target];
        const write = values => { if (!values.length) delete delivery.target; else delivery.target = values.length === 1 ? values[0] : values; };
        el(doc, 'p', 'atri-library-meta', tl('No target rules means all targets. Multiple rules match any listed target.'), parent);
        targets.forEach((target, index) => {
            const row = el(doc, 'div', 'atri-knowledge-rule', undefined, parent);
            const kind = typeof target === 'string' ? target : target.kind; const id = typeof target === 'object' ? target.id || '' : '';
            input(row, 'Target kind ' + (index + 1), kind, next => { const currentId = typeof targets[index] === 'object' ? targets[index].id : undefined; targets[index] = { kind: next, ...(currentId ? { id: currentId } : {}) }; write(targets); }, 'text', KNOWLEDGE_TARGET_KINDS);
            input(row, 'Exact target identity ' + (index + 1), id, next => { const current = targets[index]; targets[index] = { kind: typeof current === 'string' ? current : current.kind, ...(next ? { id: next } : {}) }; write(targets); });
            action(doc, row, 'Remove target rule', () => { targets.splice(index, 1); write(targets); rerender(); });
        });
        action(doc, parent, 'Add target rule', () => { targets.push('narrator'); write(targets); rerender(); }, { disabled: targets.length >= 32 });
        for (const kind of KNOWLEDGE_TARGET_KINDS) checkbox(parent, 'Visible to ' + kind, delivery.visibility?.includes(kind) || false, checked => {
            const values = new Set(delivery.visibility || []); if (checked) values.add(kind); else values.delete(kind); delivery.visibility = [...values];
        });
        el(doc, 'p', 'atri-library-meta', tl('No visibility restrictions means visible to every target kind.'), parent);
    }
    return { input, checkbox, numeric, renderTargets };
}
