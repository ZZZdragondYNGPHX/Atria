// Trusted Review document. Served only by the Host's isolated loopback Review
// Origin: no main-app cookies, scripts or plugins run here. It shows the exact
// Host description and sends one explicit decision; the Host re-verifies it.

const zh = /^zh\b/i.test(navigator.language || '');
const TEXT = {
    title: ['Trusted review', '可信审阅'],
    lead: ['A Run is waiting for your decision. Only this window can approve it, and only once.', '一个 Run 正在等待你的决定。只有此窗口可以批准，且仅可批准一次。'],
    loading: ['Checking this review link with the Host…', '正在向 Host 核对审阅链接……'],
    expired: ['This review link is no longer valid. It may have expired, been used, or the Run changed. Close this window and open review again from the Run.', '此审阅链接已失效：可能已过期、已使用，或 Run 已变化。请关闭此窗口，从 Run 重新打开审阅。'],
    password: ['Account password', '账户密码'],
    passwordHint: ['Confirm it is you. The password is checked by the Host and is not stored here.', '确认是你本人。密码由 Host 校验，不在此处保存。'],
    unlock: ['Show what will happen', '查看将要发生的事'],
    denied: ['The Host did not accept this. Check the password, or open review again if the Run changed.', 'Host 未接受。请检查密码；如果 Run 已变化，请重新打开审阅。'],
    limited: ['Too many attempts. Wait a minute, then try again.', '尝试次数过多。请等待一分钟后再试。'],
    what: ['What will happen', '将要发生什么'],
    input: ['Exact input', '精确输入'],
    impact: ['Consequences', '后果'],
    risk: ['Risk', '风险'],
    expires: ['Review expires', '审阅过期时间'],
    identity: ['Exact identity', '精确身份'],
    consent: ['I reviewed the exact action above and approve this one effect.', '我已审阅上述精确操作，批准这一次效果。'],
    approve: ['Approve this effect', '批准此效果'],
    reject: ['Reject', '拒绝'],
    deciding: ['Sending your decision to the Host…', '正在把你的决定发送给 Host……'],
    approved: ['Approved. The Host recorded your decision. You can close this window; the Run shows what happens next.', '已批准。Host 已记录你的决定。可以关闭此窗口，Run 会显示后续情况。'],
    rejected: ['Rejected. The Host recorded your decision. Nothing was sent for this effect.', '已拒绝。Host 已记录你的决定，此效果未被发送。'],
    unknown: ['The Host may or may not have recorded your decision. Do not decide again here; check the Run.', 'Host 可能已记录、也可能未记录你的决定。请勿在此重复决定，请查看 Run。'],
    notes: ['Approving does not approve anything else, does not extend budgets and cannot be reused if the input changes.', '批准不覆盖其他操作，不增加预算，输入变化后不可复用。'],
};
const t = key => TEXT[key][zh ? 1 : 0];
document.documentElement.lang = zh ? 'zh-CN' : 'en';
document.title = t('title') + ' · Atria';

const params = new URLSearchParams(location.search);
const launchRef = params.get('launchRef') ?? '';
const app = document.getElementById('review');
const live = document.getElementById('review-live');
let csrf = null, details = null, busy = false;

const el = (tag, className = '', text = null, parent = null) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== null) node.textContent = text;
    parent?.append(node);
    return node;
};
const say = text => { live.textContent = ''; live.textContent = text; };

function frame() {
    app.replaceChildren();
    const head = el('header', 'review-head', null, app);
    el('p', 'review-eyebrow', 'Atria', head);
    el('h1', 'review-title', t('title'), head);
    el('p', 'review-lead', t('lead'), head);
    return el('main', 'review-body', null, app);
}

function fail(message) {
    const body = frame();
    const box = el('div', 'review-notice', message, body);
    box.dataset.tone = 'danger';
    box.setAttribute('role', 'alert');
    say(message);
}

async function call(path, body) {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Atria-Review-CSRF': csrf }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error ?? 'review_failed'), { status: response.status, code: payload.error });
    return payload.outcome;
}

async function start() {
    const body = frame();
    el('p', 'review-muted', t('loading'), body).setAttribute('role', 'status');
    try {
        const response = await fetch('/review?launchRef=' + encodeURIComponent(launchRef), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!response.ok) return fail(t('expired'));
        csrf = (await response.json()).csrfToken;
        renderLogin();
    } catch { fail(t('expired')); }
}

function renderLogin(error = '') {
    const body = frame();
    const form = el('form', 'review-card', null, body);
    const label = el('label', 'review-label', t('password'), form);
    const input = el('input', 'review-input', null, form);
    input.type = 'password'; input.autocomplete = 'current-password'; input.id = 'review-password'; input.required = true;
    label.htmlFor = input.id;
    const hint = el('p', 'review-muted', t('passwordHint'), form);
    hint.id = 'review-password-hint';
    input.setAttribute('aria-describedby', hint.id);
    if (error) {
        const message = el('p', 'review-error', error, form);
        message.id = 'review-password-error'; message.setAttribute('role', 'alert');
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', hint.id + ' ' + message.id);
    }
    const submit = el('button', 'review-button', t('unlock'), form);
    submit.type = 'submit';
    submit.dataset.variant = 'primary';
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        busy = true; submit.disabled = true; submit.setAttribute('aria-busy', 'true');
        try {
            await call('/review/reauthenticate', { password: input.value });
            input.value = '';
            details = await call('/review/details', {});
            renderDetails();
        } catch (failure) {
            renderLogin(failure.status === 429 ? t('limited') : t('denied'));
        } finally { busy = false; }
    });
    input.focus();
}

function row(list, term, value, mono = false) {
    el('dt', '', term, list);
    const dd = el('dd', mono ? 'review-mono' : '', null, list);
    let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (mono && typeof value === 'string') { try { text = JSON.stringify(JSON.parse(value), null, 2); } catch { /* plain text input */ } }
    dd.textContent = text;
}

function renderDetails() {
    const body = frame();
    const card = el('section', 'review-card', null, body);
    const top = el('div', 'review-row', null, card);
    el('h2', 'review-subtitle', details.description.title, top);
    const risk = el('span', 'review-risk', t('risk') + ' ' + details.risk, top);
    risk.dataset.risk = details.risk;
    const facts = el('dl', 'review-facts', null, card);
    row(facts, t('what'), details.description.impact);
    row(facts, t('input'), details.description.input, true);
    row(facts, t('expires'), new Date(details.expiresAt).toLocaleString());
    const exact = el('details', 'review-details', null, card);
    el('summary', '', t('identity'), exact);
    const ids = el('dl', 'review-facts', null, exact);
    for (const [key, value] of Object.entries({ runId: details.runId, approvalId: details.approvalId, sourceRef: details.sourceRef, actionRef: details.actionRef,
        targetRef: details.targetRef, inputHash: details.inputHash, endpointBindingDigest: details.endpointBindingDigest, egressDigest: details.egressDigest,
        budgetEnvelopeDigest: details.budgetEnvelopeDigest, bindingHash: details.bindingHash })) row(ids, key, value ?? '—', true);
    el('p', 'review-muted', t('notes'), card);
    const consentLabel = el('label', 'review-consent', null, card);
    const consent = el('input', '', null, consentLabel);
    consent.type = 'checkbox';
    el('span', '', t('consent'), consentLabel);
    const actions = el('div', 'review-actions', null, card);
    const approve = el('button', 'review-button', t('approve'), actions);
    approve.type = 'button'; approve.dataset.variant = 'primary'; approve.disabled = true;
    const reject = el('button', 'review-button', t('reject'), actions);
    reject.type = 'button';
    consent.addEventListener('change', () => { approve.disabled = !consent.checked || busy; });
    const decide = async decision => {
        if (busy) return;
        busy = true; approve.disabled = true; reject.disabled = true;
        (decision === 'approve' ? approve : reject).setAttribute('aria-busy', 'true');
        say(t('deciding'));
        try {
            await call('/review/decide', { bindingHash: details.bindingHash, nonce: details.nonce, decision });
            done(decision === 'approve' ? t('approved') : t('rejected'), 'committed');
        } catch (failure) {
            done(failure.code === 'storage_commit_unknown' ? t('unknown') : t('denied'), failure.code === 'storage_commit_unknown' ? 'warning' : 'danger');
        }
    };
    approve.addEventListener('click', () => decide('approve'));
    reject.addEventListener('click', () => decide('reject'));
    say(details.description.title);
}

function done(message, tone) {
    details = null;
    const body = frame();
    const box = el('div', 'review-notice', message, body);
    box.dataset.tone = tone;
    box.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    say(message);
}

if (!/^[\w-]{43}$/.test(launchRef)) fail(t('expired'));
else void start();
