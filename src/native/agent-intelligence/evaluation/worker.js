import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../../../util.js';
import { parseEvaluationJson } from './json.js';

// This fixed executable accepts data, never model-generated code. Browser
// globals used by the original consumers exist only in this separate process.
setConfigFilePath(fileURLToPath(new URL('../../../../default/config.yaml', import.meta.url)));
const emptySkills = { list: async () => [], invocationSettings: async () => ({ skills: {} }) };
// The original resolver captures its Skill port at module load. Keep that port
// stable while routing each isolated trial to its private repository.
const skillPort = new Proxy({}, { get(_target, name) {
    const current = globalThis.Atria?.getContext?.()?.skills;
    const api = !current || current === skillPort ? emptySkills : current;
    return typeof api[name] === 'function' ? api[name].bind(api) : api[name];
} });
const emptyContext = () => ({ constants: { promptRoles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 }, wiPosition: { before: 0, after: 1 } }, skills: skillPort });
globalThis.Atria = { getContext: emptyContext };
globalThis.fetch = async () => { throw new Error('evaluation_network_denied'); };
// Load the original captured Skill port before selecting a private trial store.
await import('../../../../public/scripts/agents/orchestrator/skill-resolution.js');
const pending = new Map(); let serial = 0;
function rpc(payload) {
    const id = ++serial;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); process.send({ type: 'send', id, payload }); });
}
process.on('message', async message => {
    if (message.type === 'response') {
        const item = pending.get(message.id); pending.delete(message.id);
        if (item) message.error ? item.reject(Object.assign(new Error(message.error), { code: message.error })) : item.resolve(message.raw);
        return;
    }
    if (message.type !== 'run') return;
    try {
        const { runRp, runProject } = await import('./adapters.js');
        const { selectCases, loadFixture, publicCaseScenario, hash, canonical } = await import('./cases.js');
        const { createFrozenEvaluationBridge } = await import('./worker-bridge.js');
        const selection = message.selection || { split: 'promotion', repetitions: 3 };
        if (!['development', 'promotion'].includes(selection.split) || selection.repetitions !== (selection.split === 'promotion' ? 3 : 1)) throw new Error('invalid_evaluation_selection');
        const entries = selectCases({ purpose: 'evaluation', split: selection.split }).filter(c => c.entrance === message.domain);
        const pairs = [];
        for (const entry of entries) for (let repetition = 1; repetition <= selection.repetitions; repetition++) {
            const pair = { case: entry, scenario: publicCaseScenario(entry), repetition, baseline: null, candidate: null, judge: null, human: null };
            for (const arm of ['baseline', 'candidate']) {
                const config = message.configs[arm], bridge = await createFrozenEvaluationBridge(config, payload => rpc({ ...payload, arm }));
                const capture = { trialId: `${message.jobId}:${entry.caseId}:${repetition}:${arm}`, refs: { runIds: [], requestIds: [], effectIds: [], taskIds: [], messageVariants: [] },
                    prompts: [], evidence: [], checks: {}, completeness: [], toolCalls: 0, repairCount: 0,
                    observe(name, observed, expected) { this.checks[name] = canonical(observed) === canonical(expected); this.evidence.push({ name, observed, expected }); } };
                const settings = { rpPrompt: 'Express only the NPC response. Preserve the player choice and use the revised visible promise.',
                    projectSkill: 'Preserve the original Project authority and human Review gate.', roundLimit: 6, ...message.settings[arm] };
                let error = null;
                try { await (message.domain === 'rp' ? runRp : runProject)(entry, loadFixture(entry, { purpose: 'evaluation' }), capture, { bridge, settings, beforeSend: () => {} }); } catch (e) { error = /^[a-z_]{1,100}$/.test(e.code || '') ? e.code : 'evaluation_runtime_failed'; } finally { bridge.cleanup(); globalThis.Atria = { getContext: emptyContext }; }
                pair[arm] = { trialId: capture.trialId, configurationHash: hash(config), settingsHash: hash(message.settings[arm]), output: capture.artifact?.output || '',
                    checks: { ...capture.checks, target_consumed: capture.artifact?.targetConsumed === true }, refs: capture.refs, evidence: capture.evidence, error, repairCount: capture.repairCount, requestHashes: capture.prompts.map(hash) };
                process.send({ type: 'trial', caseId: entry.caseId, repetition, arm, trial: pair[arm] });
                if (error) throw Object.assign(new Error(error), { code: error });
            }
            const flipped = parseInt(hash([entry.caseRevision, repetition]).slice(0, 2), 16) % 2 === 1;
            const judgeBridge = await createFrozenEvaluationBridge(message.configs.baseline, payload => rpc({ ...payload, arm: 'judge' }));
            try {
                const result = await judgeBridge.rp({ requestId: 'judge:' + pairs.length, trialId: message.jobId + ':judge:' + pairs.length, fixtureHash: entry.fixtureHash,
                    messages: [{ role: 'system', content: 'Compare the two public outputs against the task and all behavior dimensions. Output JSON only: {"preference":"left|right|tie|uncertain","deltas": {dimension: integer from -4 to 4},"rationale":"public concise explanation"}. Delta is right minus left; uncertainty must remain uncertain.' },
                        { role: 'user', content: canonical({ ...publicCaseScenario(entry), dimensions: entry.behaviorDimensions,
                            left: pair[flipped ? 'candidate' : 'baseline'].output, right: pair[flipped ? 'baseline' : 'candidate'].output }) }], tools: [], kind: 'grader' });
                const grade = parseEvaluationJson(result.response.assistantText || result.response.text);
                if (!['left', 'right', 'tie', 'uncertain'].includes(grade.preference) || typeof grade.rationale !== 'string' || grade.rationale.length > 512
                    || !grade.deltas || canonical(Object.keys(grade.deltas).sort()) !== canonical([...entry.behaviorDimensions].sort())
                    || Object.values(grade.deltas).some(v => !Number.isInteger(v) || v < -4 || v > 4)) throw new Error('invalid_grade');
                pair.judge = { preference: grade.preference === 'tie' || grade.preference === 'uncertain' ? grade.preference : (grade.preference === 'left') === flipped ? 'candidate' : 'baseline',
                    deltas: Object.fromEntries(Object.entries(grade.deltas).map(([k, v]) => [k, flipped ? -v : v])), rationale: grade.rationale };
            } catch { pair.judge = { preference: 'uncertain', deltas: {}, rationale: 'Grader response unavailable or invalid' }; } finally { judgeBridge.cleanup(); }
            pair.pairHash = hash({ ...pair, human: null }); pairs.push(pair);
            process.send({ type: 'pair', pair });
        }
        process.send({ type: 'complete', pairs });
    } catch (error) { process.send({ type: 'failed', code: error.code || 'evaluation_failed' }); }
});
// Parent owns cancellation / finite lifetime; no restart loop or detached work.
process.on('disconnect', () => process.exit(0));
if (process.argv.includes('--check')) {
    await import('./adapters.js');
    console.log('Evaluation consumer modules load');
}
