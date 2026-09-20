import { redactText } from './redact.js';

function errorCode(error) {
    return String(error?.code || error?.cause?.code || error?.errno || '').trim().toUpperCase();
}

function errorMessage(error) {
    return String(error?.message || error || '').trim();
}

export function sanitizeDiagnosticUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        parsed.username = '';
        parsed.password = '';
        parsed.search = '';
        parsed.hash = '';
        return redactText(parsed.toString()).slice(0, 1200);
    } catch {
        return redactText(raw).slice(0, 1200);
    }
}

export function classifyOperationalFailure(error, { stage = '' } = {}) {
    const code = errorCode(error);
    const message = errorMessage(error);
    const lower = message.toLowerCase();
    let detailStage = '';
    let probableOwner = 'unknown';
    let ownerName = '';
    let confidence = 0.45;

    if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA'].includes(code) || lower.includes('getaddrinfo')) {
        detailStage = 'dns';
        probableOwner = 'network-environment';
        ownerName = 'DNS / network environment';
        confidence = 0.96;
    } else if (['ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code)
        || lower.includes('connection refused') || lower.includes('network is unreachable') || lower.includes('timed out')) {
        detailStage = code.includes('TIME') || lower.includes('timed out') ? 'timeout' : 'connect';
        probableOwner = 'network-environment';
        ownerName = 'Network environment';
        confidence = 0.93;
    } else if (/CERT_|TLS|SSL|UNABLE_TO_VERIFY|SELF_SIGNED|ERR_TLS/i.test(code)
        || /certificate|tls|ssl|secure connection/.test(lower)) {
        detailStage = 'tls';
        probableOwner = 'network-environment';
        ownerName = 'TLS / certificate environment';
        confidence = 0.94;
    } else if (['EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'EMFILE', 'ENFILE'].includes(code)
        || /permission denied|read-only file system|no space left/.test(lower)) {
        detailStage = 'filesystem';
        probableOwner = 'local-environment';
        ownerName = 'Local filesystem';
        confidence = 0.95;
    } else if (code === 'ENOENT' || /no such file or directory/.test(lower)) {
        detailStage = 'filesystem-missing';
        probableOwner = 'local-environment';
        ownerName = 'Local filesystem';
        confidence = 0.88;
    } else if (/conflict|non-fast-forward|diverged|local changes|merge not supported/.test(lower)) {
        detailStage = 'git-conflict';
        probableOwner = 'user-configuration';
        ownerName = 'Local repository state';
        confidence = 0.9;
    } else if (/not a git repository|git is not installed|spawn git/.test(lower)) {
        detailStage = 'git';
        probableOwner = 'local-environment';
        ownerName = 'Git environment';
        confidence = 0.88;
    } else if (/manifest/.test(lower)) {
        detailStage = 'manifest';
        probableOwner = 'third-party-extension';
        ownerName = 'Extension package';
        confidence = 0.82;
    } else if (/\b40[134]\b|unauthorized|forbidden|authentication failed/.test(lower)) {
        detailStage = 'http-auth';
        probableOwner = 'external-service';
        ownerName = 'Remote service';
        confidence = 0.82;
    } else if (/\b4\d\d\b|\b5\d\d\b|http error|bad gateway|service unavailable/.test(lower)) {
        detailStage = 'http';
        probableOwner = 'external-service';
        ownerName = 'Remote service';
        confidence = 0.78;
    }

    const baseStage = String(stage || '').trim();
    const resolvedStage = detailStage && !baseStage.endsWith(detailStage)
        ? [baseStage, detailStage].filter(Boolean).join('.')
        : baseStage || detailStage || 'unknown';

    return {
        stage: resolvedStage,
        detailStage,
        code,
        message: redactText(message).slice(0, 4000),
        probableOwner,
        ownerName,
        confidence,
        evidence: [
            ...(code ? [`error code: ${code}`] : []),
            ...(detailStage ? [`classified failure stage: ${detailStage}`] : []),
        ],
    };
}
