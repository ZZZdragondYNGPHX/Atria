// Advisory, source-addressable diagnostics. Never weaken the semantic validator.
export function frontendDiagnostics(components, localization, styles = []) {
    const result = [], used = new Set();
    const add = (component, node, reasonCode) => result.push({ category: 'accessibility', reasonCode, sourceId: component + ':' + node.id });
    for (const component of components) {
        const labels = new Set(); let heading = 0, landmark = false;
        const collect = node => { if (typeof node === 'string') return; if (node.tag === 'label' && node.attributes.for) labels.add(node.attributes.for); node.children.forEach(collect); }; collect(component.root);
        const walk = (node, labelled = false) => {
            if (typeof node === 'string') return;
            const attrs = node.attributes, text = node.children.filter(child => typeof child === 'string').join('').trim();
            const named = attrs['aria-label'] || attrs['aria-labelledby'] || node.bindings?.['aria-label'] || node.message || text || labelled || labels.has(attrs.id);
            if (['button', 'input', 'textarea', 'select'].includes(node.tag) && !named) add(component.id, node, 'a11y_accessible_name');
            if (node.tag === 'img' && attrs.alt === undefined) add(component.id, node, 'a11y_image_alt');
            if (node.events?.click && !['button', 'a', 'input', 'select', 'textarea'].includes(node.tag) && !node.events.keydown) add(component.id, node, 'a11y_keyboard_access');
            if (attrs.hidden === 'true' && Number(attrs.tabindex) >= 0) add(component.id, node, 'a11y_hidden_focus');
            if (/^h[1-6]$/.test(node.tag) && Number(node.tag[1]) > heading + 1) add(component.id, node, 'a11y_heading_order');
            if (/^h[1-6]$/.test(node.tag)) heading = Number(node.tag[1]);
            if (['main', 'nav', 'header', 'aside'].includes(node.tag) || ['main', 'navigation', 'region'].includes(attrs.role)) landmark = true;
            if (attrs['aria-hidden'] === 'true' && (['button', 'input', 'textarea', 'select'].includes(node.tag) || Number(attrs.tabindex) >= 0)) add(component.id, node, 'a11y_hidden_focus');
            if (attrs.role && !['button', 'link', 'img', 'heading', 'list', 'listitem', 'region', 'navigation', 'main', 'status', 'alert', 'dialog', 'group', 'none', 'presentation', 'tab', 'tablist', 'tabpanel', 'checkbox', 'switch', 'textbox', 'log'].includes(attrs.role)) add(component.id, node, 'a11y_review_role');
            for (const [attribute, value] of Object.entries(attrs)) if (['aria-hidden', 'aria-expanded', 'aria-disabled', 'aria-required', 'aria-busy', 'aria-modal'].includes(attribute) && !['true', 'false'].includes(value)) add(component.id, node, 'a11y_aria_value');
            if (node.message) used.add(node.message);
            node.children.forEach(child => walk(child, labelled || node.tag === 'label'));
        };
        walk(component.root);
        if (!landmark) add(component.id, component.root, 'a11y_review_landmark');
    }
    for (const style of styles) {
        if (/outline\s*:\s*(?:none|0)\b/i.test(style.css) && !/:focus-visible/.test(style.css)) result.push({ category: 'accessibility', reasonCode: 'a11y_focus_style', sourceId: style.id });
        if (/(?:animation|transition)\s*:/i.test(style.css) && !/prefers-reduced-motion/.test(style.css)) result.push({ category: 'accessibility', reasonCode: 'a11y_reduced_motion', sourceId: style.id });
    }
    if (localization) for (const [locale, catalog] of Object.entries(localization.catalogs)) {
        for (const key of used) if (!Object.hasOwn(catalog.messages, key)) result.push({ category: 'localization', reasonCode: 'localization_missing_key', sourceId: locale + ':' + key });
        for (const key of Object.keys(catalog.messages)) if (!used.has(key)) result.push({ category: 'localization', reasonCode: 'localization_unused_key', sourceId: locale + ':' + key });
    }
    return result.slice(0, 4096);
}
