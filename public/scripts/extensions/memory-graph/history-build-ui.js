// SPDX-License-Identifier: AGPL-3.0-or-later
import { historyFloors } from './history-build.js';

export async function openHistoryBuildPopup(context, builder) {
    const root = document.createElement('section'); root.className = 'memory-os-history';
    // All dynamic data below is rendered with textContent, never HTML.
    root.innerHTML = `<h3>Memory OS · 历史构建</h3>
        <p>分批抽取事实与关系，全部成功后一次保存。关闭窗口会取消运行。重建替换自动记忆，保留用户修正及其依赖；原聊天与外部状态不改写。</p>
        <form>
            <label>范围 <select name="range" aria-label="历史范围"><option value="50">最近 50 条</option><option value="100">最近 100 条</option><option value="500">最近 500 条</option><option value="all">全部</option><option value="custom">自定义</option></select></label>
            <div><label>起始楼层（从 0 开始） <input name="from" type="number" min="0" value="0"></label>
            <label>结束楼层（包含） <input name="to" type="number" min="0"></label></div>
            <label>方式 <select name="mode" aria-label="构建方式"><option value="append">补建（跳过已处理来源）</option><option value="rebuild">重建自动记忆（保留用户修正）</option></select></label>
            <p>使用当前记忆抽取连接与预设；可能发起多次模型请求。任一批失败则不发布本轮抽取结果。</p>
            <button class="menu_button" type="submit">开始构建</button>
            <button class="menu_button" type="button" data-cancel disabled>取消构建</button>
            <button class="menu_button" type="button" data-rollback>回滚最近一次构建</button>
        </form>
        <progress max="1" value="0" aria-label="历史构建进度"></progress><p role="status">尚未开始</p><pre></pre>
        <p>回滚保留已分配的来源 ID 和 Episode。若构建后新增或修改了事实／图谱／用户修正，回滚会拒绝覆盖这些修改。</p>`;
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
        const labels = { capturing: '准备来源', extracting: '抽取中', committing: '保存中', completed: '已完成', unchanged: '无新增来源', cancelled: '已取消', failed: '失败，未发布抽取结果' };
        status.textContent = `${labels[report.status] || report.status} · ${report.completed}/${report.total} 批 · 跳过 ${report.skipped} 条 · 错误 ${report.errors.length}`;
        progress.max = Math.max(1, report.total); progress.value = report.completed;
        details.textContent = [...report.errors.map(error => `${error.batch ? `批次 ${error.batch}: ` : ''}${error.message}`), report.reason || ''].filter(Boolean).join('\n');
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
    cancel.addEventListener('click', () => { controller?.abort(); cancel.disabled = true; status.textContent = '正在取消…'; });
    root.querySelector('[data-rollback]').addEventListener('click', async () => {
        if (busy) return;
        setBusy(true);
        try { await builder.rollback(context); if (!disposed) status.textContent = '最近一次构建已回滚'; } catch (error) { if (!disposed) status.textContent = error.message; } finally { if (!disposed) setBusy(false); }
    });
    try { await context.callGenericPopup(root, context.POPUP_TYPE.TEXT, '', { wide: true, allowVerticalScrolling: true }); } finally { disposed = true; controller?.abort(); }
}
