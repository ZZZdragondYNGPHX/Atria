export const INCIDENT_OWNER_TYPES = Object.freeze([
    'atria',
    'sillytavern-upstream',
    'third-party-extension',
    'server-plugin',
    'external-service',
    'network-environment',
    'local-environment',
    'user-configuration',
    'unknown',
]);

const ATRIA_PATH_MARKERS = Object.freeze([
    '/src/atria-',
    '/src/logging/',
    '/src/ws-delivery',
    '/public/scripts/logging/',
    '/scripts/logging/',
    '/public/scripts/agents/orchestrator/',
    '/scripts/agents/orchestrator/',
    '/public/scripts/agents/memory/',
    '/scripts/agents/memory/',
    '/public/scripts/world-info/',
    '/scripts/world-info/',
    '/public/scripts/iteration-library/',
    '/scripts/iteration-library/',
    '/public/scripts/variable-op-log/',
    '/scripts/variable-op-log/',
]);

function normalizePath(value) {
    return String(value || '').replaceAll('\\', '/');
}

function extractName(path, marker) {
    const normalized = normalizePath(path);
    const start = normalized.indexOf(marker);
    if (start < 0) return '';
    return normalized.slice(start + marker.length).split('/')[0] || '';
}

export function classifyStackFrame(frameText) {
    const raw = String(frameText || '').trim();
    const path = normalizePath(raw);
    let ownerType = 'unknown';
    let ownerName = '';

    if (/\bnode:|<anonymous>|native code|chrome-extension:|moz-extension:/i.test(path)) {
        ownerType = 'runtime';
    } else if (path.includes('/node_modules/')) {
        ownerType = 'external-library';
        ownerName = extractName(path, '/node_modules/');
    } else if (path.includes('/public/scripts/extensions/third-party/')) {
        ownerType = 'third-party-extension';
        ownerName = extractName(path, '/public/scripts/extensions/third-party/');
    } else if (path.includes('/scripts/extensions/third-party/')) {
        ownerType = 'third-party-extension';
        ownerName = extractName(path, '/scripts/extensions/third-party/');
    } else if (path.includes('/plugins/')) {
        ownerType = 'server-plugin';
        ownerName = extractName(path, '/plugins/');
    } else if (ATRIA_PATH_MARKERS.some(marker => path.includes(marker))) {
        ownerType = 'atria';
        ownerName = 'Atria';
    } else if (/\/(?:src|public)\//.test(path) || path.includes('/scripts/')) {
        ownerType = 'sillytavern-upstream';
        ownerName = 'SillyTavern upstream';
    }

    return { raw, path, ownerType, ownerName };
}

export function analyzeStackOwnership(stack) {
    const lines = String(stack || '').split('\n').map(line => line.trim()).filter(Boolean);
    const frames = lines.slice(1).map(classifyStackFrame);
    const applicationFrames = frames.filter(frame => !['runtime', 'external-library', 'unknown'].includes(frame.ownerType));
    return {
        frames,
        throwFrame: frames[0] || null,
        firstApplicationFrame: applicationFrames[0] || null,
        firstAtriaFrame: frames.find(frame => frame.ownerType === 'atria') || null,
        firstThirdPartyFrame: frames.find(frame => frame.ownerType === 'third-party-extension') || null,
        firstServerPluginFrame: frames.find(frame => frame.ownerType === 'server-plugin') || null,
    };
}

function frameEvidence(label, frame) {
    return frame ? label + ': ' + frame.raw : null;
}

export function attributeOwnership(input = {}) {
    const analysis = analyzeStackOwnership(input.stack || input.error?.stack || '');
    if (INCIDENT_OWNER_TYPES.includes(input.probableOwner)) {
        return {
            probableOwner: input.probableOwner,
            ownerName: String(input.ownerName || ''),
            confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0.8)),
            evidence: Array.isArray(input.evidence) ? [...input.evidence] : [],
            stack: analysis,
        };
    }

    const first = analysis.firstApplicationFrame || analysis.throwFrame;
    const evidence = [
        frameEvidence('throw frame', analysis.throwFrame),
        frameEvidence('first application frame', analysis.firstApplicationFrame),
        frameEvidence('first Atria frame', analysis.firstAtriaFrame),
        frameEvidence('first third-party frame', analysis.firstThirdPartyFrame),
    ].filter(Boolean);

    if (first?.ownerType === 'third-party-extension') {
        return { probableOwner: 'third-party-extension', ownerName: first.ownerName, confidence: 0.95, evidence, stack: analysis };
    }
    if (first?.ownerType === 'server-plugin') {
        return { probableOwner: 'server-plugin', ownerName: first.ownerName, confidence: 0.95, evidence, stack: analysis };
    }
    if (first?.ownerType === 'atria') {
        return { probableOwner: 'atria', ownerName: 'Atria', confidence: 0.92, evidence, stack: analysis };
    }
    if (first?.ownerType === 'sillytavern-upstream') {
        return { probableOwner: 'sillytavern-upstream', ownerName: 'SillyTavern upstream', confidence: 0.82, evidence, stack: analysis };
    }
    return { probableOwner: 'unknown', ownerName: '', confidence: 0, evidence, stack: analysis };
}
