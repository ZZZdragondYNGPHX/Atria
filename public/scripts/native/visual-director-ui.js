import { illustrationNode as node, illustrationButton as button } from './illustration-ui.js';
import { visualApproval } from './visual-approval-ui.js';

export async function mountVisualDirector({ document: doc, parent, sdk, report }) {
    const root = node(doc, parent, 'section'); node(doc, root, 'h3', '视觉镜头候选');
    const status = node(doc, root, 'p', '读取已提交剧情…'); status.setAttribute('role', 'status');
    const list = node(doc, root, 'div');
    const render = async () => {
        const shots = await sdk.illustrations.visual('director', 'scan'); list.replaceChildren();
        status.textContent = shots.length ? '规则先筛选；模型分析只在明确操作后执行。图片任务与剧情继续独立运行。' : '暂无可绘制的已提交选段。';
        for (const shot of shots.slice(-50)) {
            const row = node(doc, list, 'article'); node(doc, row, 'blockquote', shot.source.anchor.quote);
            node(doc, row, 'p', Math.round(shot.score.score) + ' 分 · ' + shot.source.timeKind + ' · ' + shot.status + ' · ' + shot.reason);
            const factors = node(doc, row, 'details'); node(doc, factors, 'summary', '评分依据'); node(doc, factors, 'pre', JSON.stringify(shot.score, null, 2));
            button(doc, row, '审阅并生成', async () => {
                try {
                    const preview = await sdk.illustrations.visual('director', 'prepare', { shotId: shot.shotId });
                    visualApproval({ document: doc, parent: row, preview, report,
                        submit: async approval => { await sdk.illustrations.visual('director', 'submit', { shotId: shot.shotId, approval }); await render(); } });
                } catch (error) { report(error); }
            });
            button(doc, row, '模型分析候选', async () => { try { await sdk.illustrations.visual('director', 'analyze', { shotId: shot.shotId }); await render(); } catch (error) { report(error); } });
        }
    };
    try { await render(); } catch (error) { status.textContent = '候选读取失败'; report(error); }
    return root;
}
