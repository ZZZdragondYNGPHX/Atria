const ATRIA_MARKERS = Object.freeze([
    '/scripts/logging/',
    '/scripts/agents/orchestrator/',
    '/scripts/agents/memory/',
    '/scripts/world-info/',
    '/scripts/iteration-library/',
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

export function classifyFrontendStackFrame(frameText) {
    const raw = String(frameText || '').trim();
    const path = normalizePath(raw);
    let ownerType = 'unknown';
    let ownerName = '';

    if (/chrome-extension:|moz-extension:|<anonymous>|native code/i.test(path)) {
        ownerType = 'runtime';
    } else if (path.includes('/scripts/extensions/third-party/')) {
        ownerType = 'third-party-extension';
        ownerName = extractName(path, '/scripts/extensions/third-party/');
    } else if (path.includes('/public/scripts/extensions/third-party/')) {
        ownerType = 'third-party-extension';
        ownerName = extractName(path, '/public/scripts/extensions/third-party/');
    } else if (ATRIA_MARKERS.some(marker => path.includes(marker))) {
        ownerType = 'atria';
        ownerName = 'Atria';
    } else if (path.includes('/scripts/') || path.includes('/public/')) {
        ownerType = 'sillytavern-upstream';
        ownerName = 'SillyTavern upstream';
    }

    return { raw, path, ownerType, ownerName };
}

export function analyzeFrontendStackOwnership(stack) {
    const lines = String(stack || '').split('\n').map(line => line.trim()).filter(Boolean);
    const frames = lines.slice(1).map(classifyFrontendStackFrame);
    const applicationFrames = frames.filter(frame => !['runtime', 'unknown'].includes(frame.ownerType));
    return {
        frames,
        throwFrame: frames[0] || null,
        firstApplicationFrame: applicationFrames[0] || null,
        firstAtriaFrame: frames.find(frame => frame.ownerType === 'atria') || null,
        firstThirdPartyFrame: frames.find(frame => frame.ownerType === 'third-party-extension') || null,
    };
}

export function attributeFrontendOwnership({ stack = '', probableOwner, ownerName, confidence, evidence = [] } = {}) {
    const analysis = analyzeFrontendStackOwnership(stack);
    if (probableOwner) {
        return {
            probableOwner,
            ownerName: String(ownerName || ''),
            confidence: Math.max(0, Math.min(1, Number(confidence) || 0.8)),
            evidence: [...evidence],
            stack: analysis,
        };
    }

    const first = analysis.firstApplicationFrame || analysis.throwFrame;
    const frameEvidence = [
        analysis.throwFrame ? `throw frame: ${analysis.throwFrame.raw}` : null,
        analysis.firstApplicationFrame ? `first application frame: ${analysis.firstApplicationFrame.raw}` : null,
        analysis.firstAtriaFrame ? `first Atria frame: ${analysis.firstAtriaFrame.raw}` : null,
        analysis.firstThirdPartyFrame ? `first third-party frame: ${analysis.firstThirdPartyFrame.raw}` : null,
    ].filter(Boolean);

    if (first?.ownerType === 'third-party-extension') {
        return { probableOwner: 'third-party-extension', ownerName: first.ownerName, confidence: 0.95, evidence: frameEvidence, stack: analysis };
    }
    if (first?.ownerType === 'atria') {
        return { probableOwner: 'atria', ownerName: 'Atria', confidence: 0.92, evidence: frameEvidence, stack: analysis };
    }
    if (first?.ownerType === 'sillytavern-upstream') {
        return { probableOwner: 'sillytavern-upstream', ownerName: 'SillyTavern upstream', confidence: 0.82, evidence: frameEvidence, stack: analysis };
    }
    return { probableOwner: 'unknown', ownerName: '', confidence: 0, evidence: frameEvidence, stack: analysis };
}
