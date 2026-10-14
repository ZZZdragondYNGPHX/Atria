import { translateShellText } from '../atria-shell/localization.js';
import { illustrationNode as node, illustrationButton as button } from './illustration-ui.js';
import { visualApproval } from './visual-approval-ui.js';

export async function mountVisualDirector({ document: doc, parent, sdk, report }) {
    const root = node(doc, parent, 'section'); node(doc, root, 'h3', translateShellText('Image candidates'));
    const status = node(doc, root, 'p', translateShellText('Loading saved story…')); status.setAttribute('role', 'status');
    const list = node(doc, root, 'div');
    const render = async () => {
        const shots = await sdk.illustrations.visual('director', 'scan'); list.replaceChildren();
        status.textContent = shots.length ? translateShellText('Rules filter candidates first. Model analysis runs only when requested. Image tasks run independently from the story.') : translateShellText('No saved passages are available for illustration yet.');
        for (const shot of shots.slice(-50)) {
            const row = node(doc, list, 'article'); node(doc, row, 'blockquote', shot.source.anchor.quote);
            node(doc, row, 'p', Math.round(shot.score.score) + translateShellText(' points · ') + shot.source.timeKind + ' · ' + shot.status + ' · ' + shot.reason);
            const factors = node(doc, row, 'details'); node(doc, factors, 'summary', translateShellText('Scoring details')); node(doc, factors, 'pre', JSON.stringify(shot.score, null, 2));
            button(doc, row, translateShellText('Review and generate'), async () => {
                try {
                    const preview = await sdk.illustrations.visual('director', 'prepare', { shotId: shot.shotId });
                    visualApproval({ document: doc, parent: row, preview, report,
                        submit: async approval => { await sdk.illustrations.visual('director', 'submit', { shotId: shot.shotId, approval }); await render(); } });
                } catch (error) { report(error); }
            });
            button(doc, row, translateShellText('Analyze candidate with a model'), async () => { try { await sdk.illustrations.visual('director', 'analyze', { shotId: shot.shotId }); await render(); } catch (error) { report(error); } });
        }
    };
    try { await render(); } catch (error) { status.textContent = translateShellText('Could not load candidates.'); report(error); }
    return root;
}
