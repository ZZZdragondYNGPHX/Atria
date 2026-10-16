import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import storage from 'node-persist';
import { getAccountVersion, getPasswordHash, toKey } from '../../users.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { ReviewAuthority } from './review-authority.js';

const unavailable = () => { throw Object.assign(new Error('Review authentication unavailable'), { code: 'native_orchestration_review_unavailable' }); };
const token = () => randomBytes(32).toString('base64url');
export const originalReviewAccounts = {
    async inspect(handle) {
        const user = await storage.getItem(toKey(handle));
        if (!user || user.handle !== handle || !user.enabled || !user.password || !user.salt) unavailable();
        return { accountVersion: hash({ version: getAccountVersion(user), enabled: user.enabled, admin: !!user.admin }) };
    },
    async authenticate(handle, password) {
        if (typeof password !== 'string' || !password.length || password.length > 1024) unavailable();
        const before = await this.inspect(handle), user = await storage.getItem(toKey(handle));
        if (!user?.password || !user.salt) unavailable();
        const candidate = Buffer.from(getPasswordHash(password, user.salt)), actual = Buffer.from(user.password);
        if (candidate.length !== actual.length || !timingSafeEqual(candidate, actual)) unavailable();
        const after = await this.inspect(handle);
        if (before.accountVersion !== after.accountVersion) unavailable();
        return after;
    },
};

/** Separate loopback listener in the same Host. No main-app cookies or middleware. */
export class ReviewOrigin {
    #sessions = new Map();
    #loginAttempts = [];
    #cookie = 'atria_review_' + randomBytes(8).toString('hex');
    #server = null;
    #starting = null;

    constructor({ authority, now = Date.now }) { this.authority = authority; this.now = now; this.origin = null; }

    async start() {
        if (this.#starting) return this.#starting;
        this.#starting = (async () => {
            const app = express();
            app.disable('x-powered-by');
            app.use((req, res, next) => {
                res.set({ 'Cache-Control': 'private, no-store', 'Cross-Origin-Opener-Policy': 'same-origin',
                    'Content-Security-Policy': 'default-src \'none\'; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'self\'',
                    'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
                    'Cross-Origin-Resource-Policy': 'same-origin' });
                if (req.get('host') !== new URL(this.origin).host || req.get('x-forwarded-host') || req.get('x-forwarded-proto')
                    || (req.get('origin') && req.get('origin') !== this.origin)
                    || (req.method !== 'GET' && req.get('origin') !== this.origin)) return res.sendStatus(403);
                next();
            });
            app.use(express.json({ limit: '48kb', strict: true }));
            const prune = () => {
                for (const [key, session] of this.#sessions) if (session.expiresAt <= this.now()) this.#sessions.delete(key);
            };
            // Frontend will render the built-in Review document at this path.
            // Until then this is the page's JSON bootstrap, with no approval nonce.
            app.get('/review', (req, res) => {
                prune();
                if (Object.keys(req.query).length !== 1 || typeof req.query.launchRef !== 'string' || !/^[\w-]{43}$/.test(req.query.launchRef)) return res.sendStatus(400);
                if (this.#sessions.size >= 256) return res.sendStatus(503);
                const sessionId = token(), csrfToken = token();
                this.#sessions.set(sessionId, { launchRef: req.query.launchRef, csrfToken, expiresAt: this.now() + 300000, identity: null, busy: false });
                res.cookie(this.#cookie, sessionId, { httpOnly: true, sameSite: 'strict', path: '/review', maxAge: 300000 });
                res.json({ schemaVersion: 1, csrfToken, authenticationRequired: true });
            });
            const route = operation => async (req, res) => {
                prune();
                const cookies = String(req.get('cookie') ?? '').split(';').map(value => value.trim());
                const values = cookies.filter(value => value.startsWith(this.#cookie + '='));
                const session = values.length === 1 ? this.#sessions.get(values[0].slice(this.#cookie.length + 1)) : null;
                if (!session || req.get('X-Atria-Review-CSRF') !== session.csrfToken || session.busy || !req.is('application/json')) return res.sendStatus(403);
                session.busy = true;
                try { res.json({ schemaVersion: 1, outcome: await operation(session, req.body) }); } catch (error) {
                    const status = error.status === 429 ? 429 : error instanceof TypeError ? 400 : error.code === 'storage_commit_unknown' ? 409 : 403;
                    res.status(status).json({ schemaVersion: 1, error: status === 409 ? 'storage_commit_unknown' : 'native_orchestration_review_denied' });
                } finally { session.busy = false; }
            };
            app.post('/review/reauthenticate', route(async (session, body) => {
                assertObject(body, ['password'], 'review reauthentication');
                session.identity = null;
                this.#loginAttempts = this.#loginAttempts.filter(at => at > this.now() - 60000);
                if (this.#loginAttempts.length >= 5) throw Object.assign(new Error('Review login rate limited'), { status: 429 });
                this.#loginAttempts.push(this.now());
                session.identity = await this.authority.authenticate(session.launchRef, body.password);
                return { authenticated: true, expiresAt: session.identity.expiresAt };
            }));
            app.post('/review/details', route((session, body) => {
                assertObject(body, [], 'review details');
                return this.authority.details(session.launchRef, session.identity);
            }));
            app.post('/review/decide', route(async (session, body) => {
                const result = await this.authority.decide(session.launchRef, session.identity, body);
                session.identity = null;
                return result;
            }));
            app.use((_req, res) => res.sendStatus(404));
            app.use((_error, _req, res, _next) => res.status(400).json({ schemaVersion: 1, error: 'native_orchestration_review_invalid_request' }));
            this.#server = http.createServer(app);
            this.#server.requestTimeout = 15000; this.#server.headersTimeout = 10000;
            await new Promise((resolve, reject) => {
                this.#server.once('error', reject);
                this.#server.listen(0, '127.0.0.1', () => { this.#server.off('error', reject); resolve(); });
            });
            this.origin = 'http://127.0.0.1:' + this.#server.address().port;
            return this.origin;
        })();
        try { return await this.#starting; } catch (error) { this.#starting = null; throw error; }
    }

    async launch(handle, input) {
        const launch = await this.authority.launch(handle, input);
        await this.start();
        return { url: this.origin + '/review?launchRef=' + launch.launchRef, expiresAt: launch.expiresAt };
    }

    async close() {
        this.#sessions.clear(); this.authority.close();
        if (this.#starting) await this.#starting.catch(() => {});
        if (this.#server?.listening) await new Promise((resolve, reject) => this.#server.close(error => error ? reject(error) : resolve()));
        this.#server = null; this.#starting = null; this.origin = null;
    }
}

const services = new WeakMap();
export function getNativeReviewOrigin(engine) {
    let service = services.get(engine);
    if (!service) {
        service = new ReviewOrigin({ authority: new ReviewAuthority({ accounts: originalReviewAccounts }) });
        services.set(engine, service);
    }
    return service;
}
