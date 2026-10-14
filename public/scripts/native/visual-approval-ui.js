import { translateShellText, formatShellText } from '../atria-shell/localization.js';
import { illustrationNode as node, illustrationField as field, illustrationButton as button } from './illustration-ui.js';

export function visualApproval({ document: doc, parent, preview, submit, report, externalAssetIds = [] }) {
    const box = node(doc, parent, 'fieldset'); node(doc, box, 'legend', translateShellText('Confirm image task'));
    node(doc, box, 'p', preview.target.name + ' · ' + preview.target.model);
    node(doc, box, 'p', preview.cost.kind === 'unknown' ? translateShellText('Cost is unknown. A reserved amount does not guarantee the final provider bill.') : preview.cost.kind === 'free' ? translateShellText('No API charge. Local computing is still subject to concurrency limits.') : formatShellText('Estimated maximum: ${0} ${1}', [preview.cost.upperBound, preview.cost.currency]));
    let amount = String(preview.cost.upperBound ?? 0), currency = preview.cost.currency || 'USD', unknown = false, transfer = !externalAssetIds.length;
    field(doc, box, translateShellText('Cost limit for this task'), amount, value => amount = value, { type: 'number' }); field(doc, box, translateShellText('Currency'), currency, value => currency = value);
    if (preview.cost.kind === 'unknown') field(doc, box, translateShellText('I accept unknown costs and approve this submission'), false, value => unknown = value, { type: 'checkbox' });
    if (externalAssetIds.length) field(doc, box, translateShellText('Allow these assets and the mask to be sent to this target'), false, value => transfer = value, { type: 'checkbox' });
    if (preview.constraints.omitted.length) node(doc, box, 'p', formatShellText('Omitted for this task: ${0}', [preview.constraints.omitted.map(c => c.capability + ' (' + c.reason + ')').join(', ')]));
    const preferred = preview.constraints.omitted.filter(c => c.tier === 'preferred').map(c => c.capability);
    let degradation = !preferred.length;
    if (preferred.length) field(doc, box, translateShellText('Allow the listed preferences to be omitted for this task'), false, value => degradation = value, { type: 'checkbox' });
    const approve = button(doc, box, translateShellText('Approve generation'), async () => {
        try {
            if (!transfer || !degradation) throw new Error(translateShellText('Confirm asset transfer and preference changes for this task.'));
            await submit({ targetFingerprint: preview.targetFingerprint, requestHash: preview.requestHash, maxCost: Number(amount), currency,
                allowUnknownCost: unknown, externalAssetIds: transfer ? externalAssetIds : [], omittedPreferred: preferred }); box.remove();
        } catch (error) { report(error); }
    });
    approve.classList.add('atri-illustration-primary');
    button(doc, box, translateShellText('Cancel'), () => box.remove()); box.querySelector('input')?.focus(); return box;
}
