import { getRequestHeaders } from '../script.js';
import { callGenericPopup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { renderTemplateAsync } from './templates.js';
import { humanFileSize } from './utils.js';
import { t, translate } from './i18n.js';

/**
 * 10 类 category 图标映射(fa-solid <X>)· CSS var 映射(--storage-cat-<X>).
 * 与 src/storage/inspector.js 的 CATEGORIES 保持一致.
 */
const CATEGORY_META = {
    // V1 · 服务端 10 类
    chats: { icon: 'comment',            colorVar: '--storage-cat-chats'      },
    characters: { icon: 'user',                colorVar: '--storage-cat-characters' },
    worlds: { icon: 'book',                colorVar: '--storage-cat-worlds'     },
    images: { icon: 'image',               colorVar: '--storage-cat-images'     },
    attachments: { icon: 'paperclip',           colorVar: '--storage-cat-attach'     },
    presets: { icon: 'sliders',             colorVar: '--storage-cat-presets'    },
    extensions: { icon: 'puzzle-piece',        colorVar: '--storage-cat-ext'        },
    vectors: { icon: 'brain',               colorVar: '--storage-cat-vectors'    },
    backups: { icon: 'clock-rotate-left',   colorVar: '--storage-cat-backups'    },
    other: { icon: 'box',                 colorVar: '--storage-cat-other'      },
    // V2 · 浏览器侧 5 类
    localStorage: { icon: 'hard-drive',  colorVar: '--storage-cat-localstorage'   },
    sessionStorage: { icon: 'clock',       colorVar: '--storage-cat-sessionstorage' },
    indexeddb: { icon: 'database',    colorVar: '--storage-cat-indexeddb'      },
    cachestorage: { icon: 'layer-group', colorVar: '--storage-cat-cachestorage'   },
    quota: { icon: 'chart-pie',   colorVar: '--storage-cat-quota'          },
};

/**
 * Fetch InspectorResponse for given dataSource + path.
 */
async function fetchInspector(dataSource, pathArr) {
    const endpoint = dataSource.kind === 'self'
        ? '/api/users/storage/inspect'
        : '/api/users/storage/inspect-any';
    const body = dataSource.kind === 'self'
        ? { path: pathArr }
        : { target: dataSource.target, path: pathArr };
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const msg = errBody?.error?.message ?? res.statusText;
        const code = errBody?.error?.code ?? 'E_UNKNOWN';
        const err = new Error(msg);
        err.code = code;
        err.status = res.status;
        throw err;
    }
    return await res.json();
}

async function postStorageJson(endpoint, body = {}) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        const err = new Error(payload?.error?.message || payload?.error || res.statusText || `HTTP ${res.status}`);
        err.code = payload?.error?.code || 'E_UNKNOWN';
        err.status = res.status;
        throw err;
    }
    return payload;
}

/**
 * V1 provider · 通过 REST endpoint 拿 InspectorResponse.
 * 只读(canMutate=false).
 */
export class RestProvider {
    constructor(dataSource) {
        this.id = 'rest';
        this.canMutate = dataSource?.kind === 'self';
        this.dataSource = dataSource;
    }

    async fetch(pathArr) {
        const resp = await fetchInspector(this.dataSource, pathArr);
        for (const e of resp.entries ?? []) {
            e.capabilities ??= {
                view: false,
                viewContent: false,
                edit: false,
                delete: Boolean(e.canDelete),
                download: false,
                restore: false,
            };
            e.canDelete = Boolean(e.capabilities.delete);
        }
        return resp;
    }

    async readAtPath(pathArr, entry) {
        if (this.dataSource?.kind !== 'self') {
            const err = new Error(t`This inspector is read-only.`);
            err.code = 'E_READ_ONLY';
            throw err;
        }
        return postStorageJson('/api/users/storage/resource/read', {
            path: pathArr,
            kind: entry?.kind || '',
        });
    }

    canCreateAtPath() {
        return false;
    }
}

export class RestMutator {
    async writeAtPath(pathArr, entry, content, expectedModifiedMs = null) {
        return postStorageJson('/api/users/storage/resource/write', {
            path: pathArr,
            kind: entry?.kind || '',
            content,
            expectedModifiedMs,
        });
    }

    async deleteAtPath(pathArr, entry) {
        return postStorageJson('/api/users/storage/resource/delete', {
            path: pathArr,
            kind: entry?.kind || '',
        });
    }
}

/**
 * Read-only mutator used for non-self/admin aggregate views.
 */
export class ThrowingMutator {
    async writeAtPath() {
        const err = new Error(t`This inspector is read-only.`);
        err.code = 'E_READ_ONLY';
        throw err;
    }

    async deleteAtPath() {
        const err = new Error(t`This inspector is read-only.`);
        err.code = 'E_READ_ONLY';
        throw err;
    }
}

class StorageInspector {
    /**
     * @param {{provider: StorageProvider, mutator: StorageMutator, container: HTMLElement}} opts
     */
    constructor({ provider, mutator, container }) {
        this.provider = provider;
        this.mutator = mutator;
        this.container = container;
        this.pathStack = [];
        this.failedPath = null;
        this.cache = new Map();  // key = _cacheKey(path) → InspectorResponse
    }

    async init() {
        await this._renderShell();
        await this.navigateTo([]);
    }

    async _renderShell() {
        const tpl = await renderTemplateAsync('storageInspector');
        this.container.innerHTML = tpl;

        this.container.querySelector('.storageInspectorRefreshButton')
            .addEventListener('click', () => this.refresh());
        this.container.querySelector('.storageInspectorRetryButton')
            .addEventListener('click', () => this.navigateTo(this.failedPath ?? this.pathStack));
        this.container.querySelector('.storageInspectorCreateButton')
            .addEventListener('click', () => this._createResource());
    }

    _cacheKey(pathArr) {
        return JSON.stringify({
            pid: this.provider.id,
            ds: this.provider.dataSource ?? null,
            p: pathArr,
        });
    }

    async navigateTo(pathArr) {
        const key = this._cacheKey(pathArr);
        this._showLoading();
        try {
            let resp = this.cache.get(key);
            if (!resp) {
                resp = await this.provider.fetch(pathArr);
                this.cache.set(key, resp);
            }
            // aggregate depth-3 redirect(仅 V1 REST provider 会产生;V2 provider 不发 redirect,undefined 时自然 skip)
            if (resp.redirect) {
                this.provider.dataSource = { kind: 'any', target: resp.redirect.target };
                this.cache.clear();  // 换 target,cache 失效
                return this.navigateTo(resp.redirect.path);
            }
            this.pathStack = pathArr;
            this.failedPath = null;
            this._renderResponse(resp);
        } catch (err) {
            this.failedPath = pathArr;
            this._showError(err);
        }
    }

    async refresh() {
        this.cache.clear();
        return this.navigateTo(this.pathStack);
    }

    _renderResponse(resp) {
        this._hideLoading();
        this._renderQuota(resp.quota);
        this._renderStackedBar(resp);
        this._renderLegend(resp);
        this._renderBreadcrumbs(resp);
        this._renderCreateAction();
        this._renderList(resp);
    }

    _renderQuota(quota) {
        const used = this.container.querySelector('.storageInspectorQuotaUsed');
        const total = this.container.querySelector('.storageInspectorQuotaTotal');
        used.textContent = humanFileSize(quota?.usedBytes ?? 0);
        if (quota?.quotaBytes === null || quota?.quotaBytes === undefined) {
            total.textContent = t`Unlimited`;
        } else {
            total.textContent = humanFileSize(quota.quotaBytes);
        }
        used.classList.toggle('storageInspectorQuotaOver', !!quota?.over);
    }

    _renderStackedBar(resp) {
        const bar = this.container.querySelector('.storageInspectorStackedBar');
        bar.innerHTML = '';
        const showSummary = resp.entries.some(e => e.canDrill);
        bar.classList.toggle('displayNone', !showSummary);
        if (!showSummary) return;

        const total = resp.entries.reduce((s, e) => s + (e.sizeBytes ?? 0), 0) || 1;
        for (const e of resp.entries) {
            if (!e.sizeBytes) continue;
            const seg = document.createElement('div');
            seg.className = 'storageInspectorBarSegment';
            seg.style.width = `${(e.sizeBytes / total * 100).toFixed(2)}%`;
            seg.style.background = this._colorFor(e);
            seg.title = `${translate(e.label)}: ${humanFileSize(e.sizeBytes)}`;
            seg.addEventListener('click', () => {
                if (!resp.isLeaf && e.canDrill) this.navigateTo([...this.pathStack, e.key]);
            });
            bar.appendChild(seg);
        }
    }

    _renderLegend(resp) {
        const legend = this.container.querySelector('.storageInspectorLegend');
        legend.innerHTML = '';
        const showSummary = resp.entries.some(e => e.canDrill);
        legend.classList.toggle('displayNone', !showSummary);
        if (!showSummary) return;

        for (const e of resp.entries) {
            if (!e.sizeBytes) continue;
            const item = document.createElement('span');
            item.className = 'storageInspectorLegendItem';
            const swatch = document.createElement('span');
            swatch.className = 'storageInspectorLegendSwatch';
            swatch.style.background = this._colorFor(e);
            const label = document.createElement('span');
            label.textContent = `${translate(e.label)} · ${humanFileSize(e.sizeBytes)}`;
            item.append(swatch, label);
            legend.appendChild(item);
        }
    }

    _renderBreadcrumbs(resp) {
        const nav = this.container.querySelector('.storageInspectorBreadcrumbs');
        nav.innerHTML = '';
        const crumbs = resp.breadcrumbs ?? [];
        crumbs.forEach((c, i) => {
            const isLast = i === crumbs.length - 1;
            const el = document.createElement(isLast ? 'span' : 'a');
            el.textContent = translate(c.label);
            el.className = isLast
                ? 'storageInspectorBreadcrumbCurrent'
                : 'storageInspectorBreadcrumbCrumb';
            if (!isLast) {
                el.href = '#';
                el.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this.navigateTo(c.path);
                });
            }
            nav.appendChild(el);
            if (!isLast) {
                const sep = document.createElement('span');
                sep.className = 'storageInspectorBreadcrumbSep';
                sep.textContent = '›';
                nav.appendChild(sep);
            }
        });
    }

    _renderList(resp) {
        const list = this.container.querySelector('.storageInspectorList');
        list.innerHTML = '';
        if (resp.entries.length === 0) {
            this.container.querySelector('.storageInspectorEmpty').classList.remove('displayNone');
            return;
        }
        this.container.querySelector('.storageInspectorEmpty').classList.add('displayNone');

        // 计算最大 size 用于 dots 相对填充
        const maxSize = Math.max(...resp.entries.map(e => e.sizeBytes ?? 0), 1);

        for (const e of resp.entries) {
            list.appendChild(this._renderEntry(e, maxSize, !resp.isLeaf));
        }
    }

    _renderEntry(entry, maxSize, allowDrill = true) {
        const row = document.createElement('div');
        const canDrill = allowDrill && entry.canDrill;
        row.className = 'storageInspectorEntry';
        if (canDrill) row.classList.add('storageInspectorEntryDrillable');
        if (entry.kind === 'sensitive-blob') row.classList.add('storageInspectorSensitiveBlob');
        row.dataset.kind = entry.kind;
        row.dataset.key = entry.key;

        const icon = document.createElement('span');
        icon.className = 'storageInspectorEntryIcon';
        const iconName = /^[a-z0-9-]+$/.test(entry.icon ?? '') ? entry.icon : 'file';
        const iconEl = document.createElement('i');
        iconEl.classList.add('fa-fw', 'fa-solid', `fa-${iconName}`);
        icon.replaceChildren(iconEl);
        icon.style.color = this._colorFor(entry);

        const label = document.createElement('span');
        label.className = 'storageInspectorEntryLabel';
        label.textContent = translate(entry.label) + (entry.labelSuffix ?? '');
        if (entry.note) label.title = translate(entry.note);

        const dots = document.createElement('span');
        dots.className = 'storageInspectorEntryDots';
        dots.style.color = this._colorFor(entry);
        const filled = Math.round(((entry.sizeBytes ?? 0) / maxSize) * 8);
        for (let i = 0; i < 8; i++) {
            const dot = document.createElement('span');
            dot.className = 'storageInspectorEntryDot';
            if (i < filled) dot.classList.add('storageInspectorEntryDotFilled');
            dots.appendChild(dot);
        }

        const size = document.createElement('span');
        size.className = 'storageInspectorEntrySize';
        size.textContent = entry.sizeBytes == null ? '?' : humanFileSize(entry.sizeBytes);

        row.append(icon, label, dots, size);

        const capabilities = entry.capabilities || {};
        const actions = document.createElement('span');
        actions.className = 'storageInspectorEntryActions';

        const addAction = (iconNameValue, title, handler, warning = false) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `storageInspectorEntryActionButton menu_button menu_button_icon${warning ? ' warning' : ''}`;
            button.title = title;
            const actionIcon = document.createElement('i');
            actionIcon.classList.add('fa-fw', 'fa-solid', `fa-${iconNameValue}`);
            button.appendChild(actionIcon);
            button.addEventListener('click', async (event) => {
                event.stopPropagation();
                if (button.disabled) return;
                button.disabled = true;
                try {
                    await handler();
                } catch (error) {
                    this._showError(error);
                } finally {
                    if (button.isConnected) button.disabled = false;
                }
            });
            actions.appendChild(button);
        };

        if (capabilities.view && typeof this.provider.readAtPath === 'function') {
            addAction('eye', translate('View'), () => this._viewResource(entry));
        }
        if (capabilities.edit && typeof this.mutator.writeAtPath === 'function') {
            addAction('pen', translate('Edit'), () => this._editResource(entry));
        }
        if (this.provider.canMutate && capabilities.delete && typeof this.mutator.deleteAtPath === 'function') {
            addAction('trash', translate('Delete'), () => this._confirmAndDelete(entry), true);
        }
        if (actions.childElementCount > 0) row.appendChild(actions);

        if (canDrill) {
            const chev = document.createElement('span');
            chev.className = 'storageInspectorEntryChevron';
            const chevIcon = document.createElement('i');
            chevIcon.classList.add('fa-fw', 'fa-solid', 'fa-chevron-right');
            chev.replaceChildren(chevIcon);
            row.appendChild(chev);
            row.addEventListener('click', () => this.navigateTo([...this.pathStack, entry.key]));
        }

        return row;
    }

    _renderCreateAction() {
        const button = this.container.querySelector('.storageInspectorCreateButton');
        const canCreate = Boolean(
            this.provider.canMutate
            && typeof this.provider.canCreateAtPath === 'function'
            && this.provider.canCreateAtPath(this.pathStack)
            && typeof this.mutator.createAtPath === 'function',
        );
        button.classList.toggle('displayNone', !canCreate);
    }

    async _viewResource(entry) {
        const payload = await this.provider.readAtPath([...this.pathStack, entry.key], entry);
        const textarea = document.createElement('textarea');
        textarea.className = 'text_pole monospace';
        textarea.rows = 22;
        textarea.readOnly = true;
        textarea.value = payload?.content != null
            ? String(payload.content)
            : JSON.stringify({
                path: payload?.relativePath || [...this.pathStack, entry.key].join('/'),
                kind: payload?.kind || entry.kind,
                sizeBytes: payload?.sizeBytes ?? entry.sizeBytes,
                modifiedMs: payload?.modifiedMs ?? entry.mtimeMs,
                protected: Boolean(payload?.protected),
                capabilities: payload?.capabilities || entry.capabilities || {},
            }, null, 2);
        if (payload?.truncated) textarea.value += '\n\n… preview truncated …';
        await callGenericPopup(textarea, POPUP_TYPE.TEXT, '', {
            okButton: t`Close`,
            wide: true,
            large: true,
            allowVerticalScrolling: true,
        });
    }

    async _editResource(entry) {
        const path = [...this.pathStack, entry.key];
        const payload = await this.provider.readAtPath(path, entry);
        if (payload?.content == null) {
            const err = new Error(t`This resource has no editable text representation.`);
            err.code = 'E_READ_ONLY';
            throw err;
        }
        if (payload.truncated) {
            const err = new Error(t`This resource is too large to edit safely in the storage manager.`);
            err.code = 'E_TOO_LARGE';
            throw err;
        }

        const textarea = document.createElement('textarea');
        textarea.className = 'text_pole monospace';
        textarea.rows = 24;
        textarea.value = String(payload.content);
        const confirmed = await callGenericPopup(textarea, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Save`,
            cancelButton: t`Cancel`,
            wide: true,
            large: true,
            allowVerticalScrolling: true,
        });
        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

        const result = await this.mutator.writeAtPath(path, entry, textarea.value, payload.modifiedMs ?? null);
        if (result?.recovery?.id) {
            toastr.success(t`Saved. Recovery point: ${result.recovery.id}`);
        } else {
            toastr.success(t`Saved.`);
        }
        await this.refresh();
    }

    async _createResource() {
        const result = await callGenericPopup(
            t`Enter a key name for the new storage entry.`,
            POPUP_TYPE.INPUT,
            '',
            { okButton: t`Next`, cancelButton: t`Cancel`, rows: 1 },
        );
        const key = String(result || '').trim();
        if (!key) return;

        const textarea = document.createElement('textarea');
        textarea.className = 'text_pole monospace';
        textarea.rows = 12;
        const confirmed = await callGenericPopup(textarea, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Create`,
            cancelButton: t`Cancel`,
            wide: true,
        });
        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
        await this.mutator.createAtPath(this.pathStack, key, textarea.value);
        await this.refresh();
    }

    /**
     * Confirm a destructive resource removal and refresh the current view.
     */
    async _confirmAndDelete(entry) {
        const label = translate(entry.label) + (entry.labelSuffix ?? '');
        const body = translate('Delete %s? A recovery point will be created when the provider supports it.').replace('%s', label);
        const confirmed = await callGenericPopup(body, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Delete`,
            cancelButton: t`Cancel`,
            wide: false,
        });
        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
        const result = await this.mutator.deleteAtPath([...this.pathStack, entry.key], entry);
        if (result?.recovery?.id) {
            toastr.success(t`Deleted. Recovery point: ${result.recovery.id}`);
        }
        await this.refresh();
    }

    _colorFor(entry) {
        // 优先 category color · 叶子 entry 用父类别 color(pathStack 的第 0 层)
        const catKey = entry.kind === 'category'
            ? entry.key
            : (this.pathStack[0] ?? 'other');
        const meta = CATEGORY_META[catKey] ?? CATEGORY_META.other;
        return `var(${meta.colorVar})`;
    }

    _showLoading() {
        this.container.querySelector('.storageInspectorLoading').classList.remove('displayNone');
        this.container.querySelector('.storageInspectorError').classList.add('displayNone');
    }

    _hideLoading() {
        this.container.querySelector('.storageInspectorLoading').classList.add('displayNone');
    }

    _showError(err) {
        this._hideLoading();
        const box = this.container.querySelector('.storageInspectorError');
        const msg = this.container.querySelector('.storageInspectorErrorMessage');
        msg.textContent = `${err.code ?? 'ERROR'}: ${err.message}`;
        box.classList.remove('displayNone');
    }
}

/**
 * Public entry point · 供 User Profile 按钮和 Admin panel tab 调.
 * @param {{kind:'self'} | {kind:'any', target:string}} dataSource
 */
export async function openStorageInspector(dataSource) {
    const container = document.createElement('div');
    container.classList.add('storageInspectorContainerWrapper');
    const inspector = new StorageInspector({
        provider: new RestProvider(dataSource),
        mutator: dataSource.kind === 'self' ? new RestMutator() : new ThrowingMutator(),
        container,
    });
    await inspector.init();
    return callGenericPopup(container, POPUP_TYPE.DISPLAY, '', {
        wide: true, wider: true, large: true,
        allowVerticalScrolling: true,
        okButton: t`Close`,
    });
}

/**
 * Mount Inspector 到已有 container(用于 Admin panel tab 内直接 embed).
 * @param {{kind:'self'} | {kind:'any', target:string}} dataSource
 * @param {HTMLElement} container
 */
export async function mountStorageInspector(dataSource, container) {
    const inspector = new StorageInspector({
        provider: new RestProvider(dataSource),
        mutator: dataSource.kind === 'self' ? new RestMutator() : new ThrowingMutator(),
        container,
    });
    await inspector.init();
    return inspector;
}

/**
 * V2 使用 · 传入自定义 provider + mutator 构造 Inspector.
 * @param {{provider, mutator, container: HTMLElement}} opts
 */
export function createStorageInspector(opts) {
    return new StorageInspector(opts);
}
