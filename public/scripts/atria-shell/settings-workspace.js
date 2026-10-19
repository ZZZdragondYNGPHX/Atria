import { el, action } from '../native/library-ui.js';
import { translateShellText as tl } from './localization.js';
import { mountAtriaPreferenceControls } from './preference-controls.js';
import { mountThemeControls } from './theme-controls.js';

export const SETTINGS_CATEGORIES = Object.freeze([
    ['appearance', 'Appearance & themes', 'Colors, day and night themes, and theme CSS.'],
    ['reading', 'Reading & input', 'Interface size and keyboard input.'],
    ['general', 'General & language', 'Language and confirmation before leaving.'],
    ['notifications', 'Notifications & sound', 'Availability of completion alerts in Native sessions.'],
    ['accessibility', 'Accessibility & performance', 'Reduce motion and simplify materials.'],
    ['privacy', 'Privacy & media', 'Work permissions and external media access.'],
]);
const SETTINGS_INDEX = [
    ['theme-mode', 'appearance', 'Appearance mode', 'Light dark system 浅色 深色 跟随系统 明暗'],
    ['themes', 'appearance', 'Theme gallery', 'Theme day night Folio Nocturne Azure Cappuccino Celestial Macaron Dark Lite Dark V 1.0 Serene Canvas 主题 日间 夜间'],
    ['theme-accent', 'appearance', 'Accent color', '强调色 accent'],
    ['theme-colors', 'appearance', 'Edit colors and theme details', 'accent surface text 强调色 配色 文字 颜色'],
    ['theme-css', 'appearance', 'Advanced theme CSS', 'Custom CSS 自定义 样式'],
    ['theme-originals', 'appearance', 'Original files and upgrade data', 'import export legacy migration 导入 导出 迁移 原文'],
    ['font_scale', 'reading', 'Interface size', 'font scale reading size 全局 界面字号 缩放 阅读字号'],
    ['send_on_enter', 'reading', 'Send on Enter', 'keyboard input shift ctrl cmd 输入 发送 换行 回车'],
    ['language', 'general', 'Language', 'English 简体中文 语言'],
    ['before_unload_guard_mode', 'general', 'Confirm before leaving', 'unsaved changes 离页确认 退出 未保存'],
    ['reduced_motion', 'accessibility', 'Reduce motion', 'accessibility animation 减少动画 减动 辅助'],
    ['fast_ui_mode', 'accessibility', 'Reduce blur', 'performance material 减少模糊 性能 材料'],
    ['notification-availability', 'notifications', 'Native completion alerts', 'Notifications sound 通知 提示音 声音'],
    ['media-permissions', 'privacy', 'Work media permissions', 'privacy external remote media 隐私 外部 远程 媒体 权限'],
];

export function mountSettingsUtility({ document: doc = globalThis.document, slot, body = slot, host, navigation, route, authority = globalThis.Atria?.getContext?.() } = {}) {
    const root = el(doc, 'section', 'atria-utility-workspace atria-utility-workspace--settings'); root.dataset.atriaUtilityWorkspace = 'settings';
    const header = el(doc, 'header', 'atria-settings-header', undefined, root);
    const copy = el(doc, 'div', '', undefined, header);
    el(doc, 'h2', '', tl('Settings'), copy); el(doc, 'p', '', tl('Make Atria feel right for you.'), copy);
    const searchLabel = el(doc, 'label', 'atria-settings-search', undefined, header);
    el(doc, 'span', 'atria-visually-hidden', tl('Search settings'), searchLabel);
    const search = el(doc, 'input', '', undefined, searchLabel); search.type = 'search'; search.placeholder = tl('Search settings'); search.setAttribute('aria-label', tl('Search settings'));
    const layout = el(doc, 'div', 'atria-settings-paper', undefined, root); layout.dataset.atriaSettingsPrimary = 'true';
    const sidebar = el(doc, 'nav', 'atria-settings-sidebar', undefined, layout); sidebar.setAttribute('aria-label', tl('Settings categories'));
    const categoryButtons = new Map(), panels = new Map(), controllers = [];
    const main = el(doc, 'div', 'atria-settings-content', undefined, layout);
    const back = action(doc, main, 'Back to settings', () => navigate(query && category !== 'search' ? 'search' : ''));
    back.classList.add('atria-settings-back');
    const results = el(doc, 'section', 'atria-settings-results', undefined, main); results.hidden = true;
    let disposed = false, query = '', category = '', listScroll = 0, resultsScroll = 0;
    const panelScroll = new Map();
    for (const [id, title, description] of SETTINGS_CATEGORIES) {
        const button = action(doc, sidebar, title, () => navigate(id)); button.classList.add('atria-settings-category'); button.dataset.settingsCategory = id;
        const detail = el(doc, 'span', 'atria-settings-category-description', tl(description), button); detail.setAttribute('aria-hidden', 'true');
        categoryButtons.set(id, button);
        const panel = el(doc, 'section', 'atria-settings-panel', undefined, main); panel.dataset.atriaSettingsSection = id; panel.hidden = true; panel.inert = true;
        const heading = el(doc, 'h3', '', tl(title), panel); heading.tabIndex = -1;
        el(doc, 'p', 'atria-setting-description', tl(description), panel);
        panels.set(id, panel);
        if (id === 'appearance') controllers.push(mountThemeControls({ document: doc, root: panel, service: authority?.atriaThemes }));
        if (['reading', 'general', 'accessibility'].includes(id)) {
            const controls = el(doc, 'div', 'atria-preference-rows', undefined, panel);
            controllers.push(mountAtriaPreferenceControls({ document: doc, group: controls, section: id, authority }));
        }
        if (id === 'notifications') {
            const note = el(doc, 'section', 'atria-setting-notice', undefined, panel); note.dataset.settingId = 'notification-availability';
            el(doc, 'h4', '', tl('Native completion alerts'), note);
            el(doc, 'p', '', tl('View task progress, approvals and results in the activity summary or the current session.'), note);
            action(doc, note, 'Open Diagnostics', () => host?.openUtility('diagnostics'));
        }
        if (id === 'privacy') {
            const note = el(doc, 'section', 'atria-setting-notice', undefined, panel); note.dataset.settingId = 'media-permissions';
            el(doc, 'h4', '', tl('Work media permissions'), note);
            el(doc, 'p', '', tl('Choose which external media a Work can access in its Session permissions. Review installed Works in Library.'), note);
            action(doc, note, 'Open Library', () => host?.openLibrarySection('works'));
        }
    }
    const links = el(doc, 'div', 'atria-settings-related', undefined, sidebar);
    el(doc, 'p', '', tl('Related settings'), links);
    for (const [label, id] of [['Account & backups', 'account'], ['Extensions', 'plugins'], ['Diagnostics', 'diagnostics']]) action(doc, links, label, () => host?.openUtility(id));
    action(doc, links, 'Resource usage & safe cleanup', async () => (await import('../storage-management.js')).openStorageManagement());
    action(doc, links, 'Learning center', () => globalThis.Atria?.shell?.getLearningCenter()?.open());
    function navigate(id, setting = '', history = 'push') {
        const currentRoute = navigation?.getRoute?.() || route || { domain: 'play' };
        const destination = id === 'search' ? encodeURIComponent(query) : setting;
        const child = { id: 'utility.settings' + (id ? `:${id}` : '') + (destination ? `:${destination}` : ''), label: tl('Settings'), kind: 'workspace' };
        if (navigation?.navigateChild) navigation.navigateChild(child, { history, reason: 'settings-category', breadcrumb: [tl('Settings'), ...(id && id !== 'search' ? [tl(SETTINGS_CATEGORIES.find(item => item[0] === id)?.[1] || id)] : [])] });
        else updateRoute({ ...currentRoute, child });
    }
    function renderResults() {
        results.replaceChildren();
        const title = el(doc, 'h3', '', tl('Search results'), results); title.tabIndex = -1;
        const normalized = query.trim().toLocaleLowerCase();
        const tokens = normalized.split(/\s+/).filter(Boolean);
        const matches = normalized ? SETTINGS_INDEX.filter(([_id, group, name, aliases]) => tokens.every(token => `${tl(name)} ${name} ${aliases} ${tl(SETTINGS_CATEGORIES.find(item => item[0] === group)[1])}`.toLocaleLowerCase().includes(token))) : [];
        if (!matches.length) el(doc, 'p', '', tl(normalized ? 'No settings found. Try another name or description.' : 'Search by setting name, description or category.'), results);
        for (const [id, group, name] of matches) {
            const item = action(doc, results, name, () => navigate(group, id)); item.classList.add('atria-settings-search-result');
            el(doc, 'span', '', tl(SETTINGS_CATEGORIES.find(entry => entry[0] === group)[1]), item);
        }
    }
    search.addEventListener('input', () => {
        query = search.value;
        if (query && category !== 'search') navigate('search');
        else if (!query && category === 'search') navigate('');
        else if (category === 'search') navigate('search', '', 'replace');
        renderResults();
    });
    function updateRoute(nextRoute) {
        if (disposed) return;
        const parts = String(nextRoute?.child?.id || '').split(':');
        const next = parts[1] || '';
        if (category === 'search') resultsScroll = root.scrollTop;
        else if (!category) listScroll = root.scrollTop;
        else panelScroll.set(category, root.scrollTop);
        if (next !== category && (!category || category === 'appearance')) authority?.atriaThemes?.cancel();
        category = SETTINGS_CATEGORIES.some(item => item[0] === next) || next === 'search' ? next : '';
        if (category === 'search' && parts[2]) {
            try { query = decodeURIComponent(parts[2]); search.value = query; } catch { /* Retain a valid current query. */ }
        }
        root.dataset.settingsPage = category || 'categories';
        root.dataset.settingsSearchActive = String(Boolean(query));
        back.textContent = tl(query && category !== 'search' ? 'Back to search results' : 'Back to settings');
        results.hidden = category !== 'search'; results.inert = results.hidden;
        for (const [id, panel] of panels) {
            const show = category === id || !category && id === 'appearance';
            panel.hidden = !show; panel.inert = !show;
            categoryButtons.get(id).setAttribute('aria-current', show ? 'page' : 'false');
        }
        if (category === 'search') renderResults();
        root.scrollTop = category === 'search' ? resultsScroll : category ? panelScroll.get(category) || 0 : listScroll;
        const target = category !== 'search' && parts[2] && root.querySelector(`[data-setting-id="${parts[2].replace(/[^a-zA-Z0-9_-]/g, '')}"]`);
        if (target) {
            let ancestor = target.parentElement;
            if (target.tagName === 'DETAILS') target.open = true;
            while (ancestor && ancestor !== root) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
            const focus = target.querySelector('input,select,textarea,summary,button') || target;
            if (!focus.hasAttribute('tabindex')) focus.tabIndex = 0;
            focus.focus({ preventScroll: true }); target.scrollIntoView?.({ block: 'center' });
        } else if (category && doc.activeElement !== search) (category === 'search' ? results : panels.get(category))?.querySelector('h3')?.focus({ preventScroll: true });
        else if (!category && doc.activeElement !== search) categoryButtons.get(nextRoute?._previousCategory || 'appearance')?.focus({ preventScroll: true });
    }
    body.replaceChildren(root); updateRoute(route);
    return { root, updateRoute, dispose() { disposed = true; for (const controller of controllers) controller.dispose(); root.remove(); } };
}
