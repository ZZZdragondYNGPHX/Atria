// Incremental JSON tokenizer/parser. No content repairs, tag fallback or evaluation; one surrounding code fence is accepted.
// Values are retained once; streaming prose is released only after kind is known.
export class NativeContentStream {
    constructor({ maxCharacters = 4 * 1024 * 1024, maxDepth = 20, maxNodes = 8192 } = {}) {
        Object.assign(this, { maxCharacters, maxDepth, maxNodes, raw: '', stack: [], token: null,
            root: undefined, done: false, error: null, nodes: 0, narrative: '', released: new Map(), fence: null });
    }

    fail(code) { throw new TypeError('content_json_' + code); }
    path() {
        const parent = this.stack.at(-1);
        return parent ? [...parent.path, parent.array ? parent.value.length : parent.key] : [];
    }
    value(value) {
        const parent = this.stack.at(-1);
        if (!parent) { if (this.root !== undefined) this.fail('trailing'); this.root = value; return; }
        if (!['value', 'first'].includes(parent.state)) this.fail('value');
        if (parent.array) parent.value.push(value);
        else Object.defineProperty(parent.value, parent.key, { value, enumerable: true, writable: true, configurable: true });
        parent.state = 'comma';
        this.release(parent);
    }
    release(frame) {
        if (frame?.path.length !== 2 || frame.path[0] !== 'flow' || frame.value.kind !== 'prose') return;
        const text = frame.value.text;
        if (typeof text !== 'string') return;
        const count = this.released.get(frame.path[1]) ?? 0;
        const end = /[\uD800-\uDBFF]$/.test(text) && this.token?.string ? text.length - 1 : text.length;
        this.narrative += text.slice(count, end);
        this.released.set(frame.path[1], end);
    }
    finishToken() {
        const token = this.token;
        if (token.string) {
            const parent = this.stack.at(-1);
            if (token.key) {
                if (parent.keys.has(token.value)) this.fail('duplicate_key');
                parent.keys.add(token.value); parent.key = token.value; parent.state = 'colon';
            } else this.value(token.value);
        } else {
            if (!/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(token.value)) this.fail('scalar');
            const value = JSON.parse(token.value);
            if (typeof value === 'number' && !Number.isFinite(value)) this.fail('number');
            this.value(value);
        }
        this.token = null;
    }
    append(character) {
        const token = this.token;
        token.value += character;
        const parent = this.stack.at(-1);
        if (!token.key && parent && parent.key === 'text' && parent.path.length === 2 && parent.path[0] === 'flow') {
            // Keep the current string in its node for type-after-text ordering.
            Object.defineProperty(parent.value, 'text', { value: token.value, enumerable: true, writable: true, configurable: true });
            this.release(parent);
        }
    }
    push(chunk) {
        if (typeof chunk !== 'string') throw new TypeError('Content chunk must be text');
        if (this.raw.length + chunk.length > this.maxCharacters) { this.error ??= 'content_json_capacity'; return this.snapshot(); }
        this.raw += chunk;
        if (this.error) return this.snapshot();
        try {
            for (let i = 0; i < chunk.length; i++) {
                const c = chunk[i], token = this.token;
                if (token?.string) {
                    if (token.unicode !== null) {
                        if (!/[0-9a-f]/i.test(c)) this.fail('escape');
                        token.unicode += c;
                        if (token.unicode.length === 4) { this.append(String.fromCharCode(parseInt(token.unicode, 16))); token.unicode = null; }
                    } else if (token.escape) {
                        token.escape = false;
                        if (c === 'u') token.unicode = '';
                        else {
                            const escapes = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
                            if (!Object.hasOwn(escapes, c)) this.fail('escape');
                            this.append(escapes[c]);
                        }
                    } else if (c === '\\') token.escape = true;
                    else if (c === '"') this.finishToken();
                    else { if (c.charCodeAt(0) < 32) this.fail('control'); this.append(c); }
                    continue;
                }
                if (token) {
                    if (!/[ \t\r\n,\]}]/.test(c)) { token.value += c; continue; }
                    this.finishToken(); i--; continue;
                }
                // One surrounding Markdown code fence (```json … ```) is an envelope, not content.
                if (this.fence === 'opening') { if (c === '\n') this.fence = 'open'; else if (c === '{') { this.fence = 'open'; i--; } continue; }
                if (!this.stack.length && c === '`') {
                    if (this.root === undefined && !this.fence) { this.fence = 'opening'; continue; }
                    if (this.done && ['open', 'closing'].includes(this.fence)) { this.fence = 'closing'; continue; }
                }
                if (/[ \t\r\n]/.test(c)) continue;
                const parent = this.stack.at(-1);
                if (c === '}' || c === ']') {
                    if (!parent || (c === ']') !== parent.array || !['first', 'comma'].includes(parent.state)) this.fail('close');
                    this.stack.pop(); this.release(parent);
                    if (!this.stack.length) this.done = true;
                    continue;
                }
                if (parent?.state === 'comma') {
                    if (c !== ',') this.fail('comma');
                    parent.state = parent.array ? 'value' : 'key'; continue;
                }
                if (parent?.state === 'colon') {
                    if (c !== ':') this.fail('colon'); parent.state = 'value'; continue;
                }
                const key = parent && !parent.array && ['key', 'first'].includes(parent.state);
                if (key && c !== '"') this.fail('key');
                if (this.done) this.fail('trailing');
                if (++this.nodes > this.maxNodes) this.fail('nodes');
                if (c === '"') { this.token = { string: true, key, value: '', escape: false, unicode: null }; continue; }
                if (c === '{' || c === '[') {
                    if (this.stack.length >= this.maxDepth) this.fail('depth');
                    const path = this.path(), value = c === '[' ? [] : {};
                    this.value(value);
                    this.stack.push({ value, path, array: c === '[', state: 'first', keys: new Set(), key: null });
                } else {
                    if (!/[-0-9tfn]/.test(c)) this.fail('token');
                    this.token = { string: false, value: c };
                }
            }
        } catch (error) { this.error = error.message; }
        return this.snapshot();
    }
    finish() {
        if (!this.error) {
            try { if (this.token && !this.token.string) this.finishToken(); } catch (error) { this.error = error.message; }
            if (this.stack.length || this.token || this.root === undefined) this.error = 'content_json_truncated';
        }
        return this.snapshot();
    }
    snapshot() { return { narrative: this.narrative, raw: this.raw, value: this.root, complete: this.done && !this.error, error: this.error }; }
}
