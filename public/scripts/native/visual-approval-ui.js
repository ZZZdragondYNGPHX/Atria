import { illustrationNode as node, illustrationField as field, illustrationButton as button } from './illustration-ui.js';

export function visualApproval({ document: doc, parent, preview, submit, report, externalAssetIds = [] }) {
    const box = node(doc, parent, 'fieldset'); node(doc, box, 'legend', '确认图片任务');
    node(doc, box, 'p', preview.target.name + ' · ' + preview.target.model);
    node(doc, box, 'p', preview.cost.kind === 'unknown' ? '费用未知：填写预留额度不保证供应商最终账单。' : preview.cost.kind === 'free' ? '无 API 金额；本地计算资源仍受并发限制。' : '预计最高 ' + preview.cost.upperBound + ' ' + preview.cost.currency);
    let amount = String(preview.cost.upperBound ?? 0), currency = preview.cost.currency || 'USD', unknown = false, transfer = !externalAssetIds.length;
    field(doc, box, '本次金额上限', amount, value => amount = value, { type: 'number' }); field(doc, box, '币种', currency, value => currency = value);
    if (preview.cost.kind === 'unknown') field(doc, box, '我接受费用未知并允许这一次提交', false, value => unknown = value, { type: 'checkbox' });
    if (externalAssetIds.length) field(doc, box, '允许本次素材与 Mask 发送给此目标连接', false, value => transfer = value, { type: 'checkbox' });
    if (preview.constraints.omitted.length) node(doc, box, 'p', '本次省略：' + preview.constraints.omitted.map(c => c.capability + ' (' + c.reason + ')').join('、'));
    const preferred = preview.constraints.omitted.filter(c => c.tier === 'preferred').map(c => c.capability);
    let degradation = !preferred.length;
    if (preferred.length) field(doc, box, '允许上列具体偏好省略，仅用于此任务', false, value => degradation = value, { type: 'checkbox' });
    button(doc, box, '批准生成', async () => {
        try {
            if (!transfer || !degradation) throw new Error('请明确确认本次素材外发与偏好变化。');
            await submit({ targetFingerprint: preview.targetFingerprint, requestHash: preview.requestHash, maxCost: Number(amount), currency,
                allowUnknownCost: unknown, externalAssetIds: transfer ? externalAssetIds : [], omittedPreferred: preferred }); box.remove();
        } catch (error) { report(error); }
    });
    button(doc, box, '取消', () => box.remove()); box.querySelector('input')?.focus(); return box;
}
