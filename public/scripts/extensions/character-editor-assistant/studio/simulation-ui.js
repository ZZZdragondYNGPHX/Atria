/**
 * R6 Game Studio Simulation / Diagnostics drawer.
 *
 * The drawer always rebuilds an isolated source-project harness. It never
 * calls commit paths or live-save mutation APIs.
 */

import { GAME_RUNTIME_ROLES } from '../../game-runtime/llm/roles.js';
import { createStudioSimulationHarness } from './simulation-runtime.js';

function parseJson(text, label) {
    try {
        return JSON.parse(String(text));
    } catch (error) {
        throw new Error(label + ' is not valid JSON: ' + (error?.message || String(error)));
    }
}

function pretty(value) {
    return JSON.stringify(value, null, 2);
}

export function createStudioSimulationHost(options = {}) {
    const documentRef = options.documentRef || document;
    const translate = typeof options.translate === 'function'
        ? options.translate
        : value => String(value || '');
    const getProjectNavigator = options.getProjectNavigator;
    const fetchFileContent = options.fetchFileContent;
    const notifyError = typeof options.notifyError === 'function'
        ? options.notifyError
        : () => {};

    if (typeof getProjectNavigator !== 'function' || typeof fetchFileContent !== 'function') {
        throw new Error('Studio Simulation Host requires project access');
    }

    let root = null;
    let visible = false;
    let harness = null;

    function t(value) {
        return translate(String(value || ''));
    }

    async function loadProject() {
        const navigator = getProjectNavigator();
        const manifest = navigator?.manifest;
        if (!manifest?.world?.schema || !manifest?.world?.initial || !manifest?.logic?.entry) {
            throw new Error('Simulation requires World Schema, Initial State and Game Logic');
        }

        const [schemaText, initialText, logicText, selectorText, observationText] = await Promise.all([
            fetchFileContent(manifest.world.schema),
            fetchFileContent(manifest.world.initial),
            fetchFileContent(manifest.logic.entry),
            manifest.ui?.selectors ? fetchFileContent(manifest.ui.selectors) : Promise.resolve('[]'),
            manifest.llm?.observations ? fetchFileContent(manifest.llm.observations) : Promise.resolve('[]'),
        ]);

        return {
            packageId: manifest.id,
            packageVersion: manifest.version,
            schema: parseJson(schemaText, 'World Schema'),
            initialState: parseJson(initialText, 'Initial State'),
            logic: parseJson(logicText, 'Game Logic'),
            selectors: parseJson(selectorText, 'Selectors'),
            observations: parseJson(observationText, 'Observations'),
        };
    }

    function createLabel(text, control) {
        const label = documentRef.createElement('label');
        label.className = 'card-app-studio-sim-field';
        const span = documentRef.createElement('span');
        span.textContent = text;
        label.append(span, control);
        return label;
    }

    function createJsonPanel(title, key) {
        const section = documentRef.createElement('section');
        section.className = 'card-app-studio-sim-panel';
        const header = documentRef.createElement('div');
        header.className = 'card-app-studio-sim-panel-title';
        header.textContent = title;
        const pre = documentRef.createElement('pre');
        pre.dataset.simOutput = key;
        pre.textContent = '—';
        section.append(header, pre);
        return section;
    }

    function renderShell() {
        if (root) return root;
        const rightPanel = documentRef.getElementById('card-app-studio-right');
        if (!rightPanel) return null;

        root = documentRef.createElement('div');
        root.className = 'card-app-studio-simulation-drawer';
        root.hidden = true;

        const header = documentRef.createElement('div');
        header.className = 'card-app-studio-simulation-header';
        const titleWrap = documentRef.createElement('div');
        const title = documentRef.createElement('strong');
        title.textContent = '🧪 ' + t('Simulation / Diagnostics');
        const subtitle = documentRef.createElement('span');
        subtitle.textContent = t('Source Project only · no persistent World mutation');
        titleWrap.append(title, subtitle);
        const close = documentRef.createElement('button');
        close.type = 'button';
        close.className = 'card-app-studio-btn small';
        close.dataset.simAction = 'close';
        close.textContent = '✕';
        header.append(titleWrap, close);

        const controls = documentRef.createElement('div');
        controls.className = 'card-app-studio-simulation-controls';

        const command = documentRef.createElement('select');
        command.dataset.simCommand = '';
        controls.appendChild(createLabel(t('Typed Command'), command));

        const args = documentRef.createElement('textarea');
        args.rows = 5;
        args.dataset.simArgs = '';
        args.value = '{}';
        controls.appendChild(createLabel(t('Arguments JSON'), args));

        const role = documentRef.createElement('select');
        role.dataset.simRole = '';
        for (const roleId of GAME_RUNTIME_ROLES) {
            const option = documentRef.createElement('option');
            option.value = roleId;
            option.textContent = roleId;
            option.selected = roleId === 'intent_resolver';
            role.appendChild(option);
        }
        controls.appendChild(createLabel(t('Runtime Role'), role));

        const actions = documentRef.createElement('div');
        actions.className = 'card-app-studio-simulation-actions';
        const reload = documentRef.createElement('button');
        reload.type = 'button';
        reload.className = 'card-app-studio-btn small';
        reload.dataset.simAction = 'reload';
        reload.textContent = '↻ ' + t('Reload Source');
        const run = documentRef.createElement('button');
        run.type = 'button';
        run.className = 'card-app-studio-btn primary';
        run.dataset.simAction = 'run';
        run.textContent = '▶ ' + t('Run Simulation');
        actions.append(reload, run);
        controls.appendChild(actions);

        const status = documentRef.createElement('div');
        status.className = 'card-app-studio-simulation-status';
        status.dataset.simStatus = '';
        status.textContent = t('Load the Source Project to begin.');

        const results = documentRef.createElement('div');
        results.className = 'card-app-studio-simulation-results';
        const panels = [
            [t('Command Validation'), 'validation'],
            [t('World State Inspector · Before'), 'beforeState'],
            [t('World State Inspector · Projected'), 'projectedState'],
            [t('Event Timeline'), 'events'],
            [t('RNG Trace'), 'rngTrace'],
            [t('Rule Trace'), 'ruleTrace'],
            [t('LLM Tool Preview'), 'commandTools'],
            [t('Observation Preview'), 'observation'],
            [t('Selector Preview'), 'selectors'],
            [t('Mutation Guard'), 'mutation'],
        ];
        for (const [panelTitle, key] of panels) {
            results.appendChild(createJsonPanel(panelTitle, key));
        }

        root.append(header, controls, status, results);
        rightPanel.appendChild(root);

        root.addEventListener('click', event => {
            const button = event.target.closest('[data-sim-action]');
            if (!button) return;
            const action = button.dataset.simAction;
            if (action === 'close') closeDrawer();
            else if (action === 'reload') void reloadSource();
            else if (action === 'run') void runSimulation();
        });

        return root;
    }

    function setStatus(message, kind = '') {
        const element = root?.querySelector('[data-sim-status]');
        if (!element) return;
        element.textContent = message;
        element.dataset.status = kind;
    }

    function setOutput(key, value) {
        const element = root?.querySelector('[data-sim-output="' + key + '"]');
        if (!element) return;
        element.textContent = pretty(value);
    }

    function clearOutputs() {
        root?.querySelectorAll('[data-sim-output]').forEach(element => {
            element.textContent = '—';
        });
    }

    async function rebuildHarness() {
        setStatus(t('Loading Source Project…'), 'pending');
        const project = await loadProject();
        harness = await createStudioSimulationHarness(project);

        const commandSelect = root?.querySelector('[data-sim-command]');
        if (commandSelect) {
            commandSelect.replaceChildren();
            for (const item of harness.listCommands()) {
                const option = documentRef.createElement('option');
                option.value = item.id;
                option.textContent = item.description
                    ? item.id + ' — ' + item.description
                    : item.id;
                commandSelect.appendChild(option);
            }
        }
        clearOutputs();
        setOutput('beforeState', harness.getInitialState());
        setOutput('events', harness.getInitialJournal().events || []);
        setStatus(t('Source Project loaded. Simulation is isolated from live Save.'), 'ready');
        return harness;
    }

    async function reloadSource() {
        try {
            await rebuildHarness();
        } catch (error) {
            harness = null;
            setStatus(t('Source load failed') + ': ' + (error?.message || String(error)), 'error');
            notifyError(error?.message || String(error));
        }
    }

    async function runSimulation() {
        try {
            if (!harness) await rebuildHarness();
            const commandId = root?.querySelector('[data-sim-command]')?.value || '';
            const argsText = root?.querySelector('[data-sim-args]')?.value || '{}';
            const role = root?.querySelector('[data-sim-role]')?.value || 'intent_resolver';
            const args = parseJson(argsText, 'Command arguments');
            if (!args || typeof args !== 'object' || Array.isArray(args)) {
                throw new Error('Command arguments must be a JSON object');
            }

            setStatus(t('Running deterministic simulation…'), 'pending');
            const result = await harness.simulate(commandId, args, { role });

            setOutput('validation', result.validation);
            setOutput('beforeState', result.beforeState);
            setOutput('projectedState', result.projectedState);
            setOutput('events', result.events);
            setOutput('rngTrace', result.rngTrace);
            setOutput('ruleTrace', result.ruleTrace);
            setOutput('commandTools', result.commandTools);
            setOutput('observation', result.observation);
            setOutput('selectors', result.selectors);
            setOutput('mutation', result.mutation);

            setStatus(
                result.ok
                    ? t('Simulation complete · no persistent mutation')
                    : t('Command validation rejected the simulation'),
                result.ok ? 'ready' : 'warning',
            );
        } catch (error) {
            setStatus(t('Simulation failed') + ': ' + (error?.message || String(error)), 'error');
            notifyError(error?.message || String(error));
        }
    }

    async function openDrawer() {
        const element = renderShell();
        if (!element) return;
        visible = true;
        element.hidden = false;
        await reloadSource();
    }

    function closeDrawer() {
        visible = false;
        if (root) root.hidden = true;
    }

    return Object.freeze({
        async toggle() {
            if (visible) closeDrawer();
            else await openDrawer();
        },
        async refresh() {
            if (visible) await reloadSource();
        },
        close: closeDrawer,
        destroy() {
            root?.remove();
            root = null;
            harness = null;
            visible = false;
        },
    });
}
