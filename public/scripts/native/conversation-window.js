// One View owns a bounded page, measured heights and cancellable Range reads.
export class ConversationWindow {
    constructor({ scroll, read, changed, failed, size = 64, estimate = 240, byteBudget = 4 * 1024 * 1024 }) {
        Object.assign(this, { scroll, read, changed, failed, size, estimate });
        this.entries = []; this.variants = []; this.heights = new Map(); this.from = 0; this.total = 0; this.epoch = 0; this.disposed = false;
        if (!Number.isSafeInteger(byteBudget) || byteBudget < 1) throw new RangeError('Invalid window byte budget');
        this.byteBudget = byteBudget;
        this.onScroll = () => {
            if (this.frame || this.disposed) return;
            const schedule = globalThis.requestAnimationFrame ?? (callback => setTimeout(callback, 0));
            this.frame = schedule(() => { this.frame = null; this.atPixel(this.scroll.scrollTop); });
        };
        scroll.addEventListener('scroll', this.onScroll, { passive: true });
    }
    offset(index) {
        let height = index * this.estimate;
        for (const [position, measured] of this.heights) if (position < index) height += measured - this.estimate;
        return height;
    }
    indexAtPixel(pixel) {
        let lo = 0, hi = this.total;
        while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (this.offset(mid + 1) <= pixel) lo = mid + 1; else hi = mid; }
        return lo;
    }
    atPixel(pixel) {
        const lo = this.indexAtPixel(pixel);
        if (lo < this.from + 8 || lo > this.from + this.entries.length - Math.min(16, this.entries.length / 2)) this.load(Math.max(0, Math.min(this.total - this.size, lo - 8)));
    }
    update(snapshot, following) {
        const identity = [snapshot.session.sessionId, snapshot.revision.branchId, snapshot.revision.revisionId].join(':');
        if (identity === this.identity) return;
        const newScope = this.scope !== snapshot.session.sessionId + ':' + snapshot.revision.branchId;
        this.scope = snapshot.session.sessionId + ':' + snapshot.revision.branchId;
        this.identity = identity; this.snapshot = snapshot;
        this.total = snapshot.timelineRoot?.length ?? snapshot.timeline.length;
        if (newScope) this.heights.clear();
        this.load(following || newScope ? Math.max(0, this.total - this.size) : Math.min(this.from, Math.max(0, this.total - this.size)), true);
    }
    load(from, refresh = false) {
        if (this.disposed || !this.snapshot || (!refresh && from === this.from)) return;
        if (!refresh && this.canShift && !this.canShift()) return;
        this.controller?.abort(); const controller = this.controller = new AbortController(), epoch = ++this.epoch;
        this.keepLatest = from + this.size >= this.total;
        this.anchor = this.keepLatest ? this.total - 1 : Math.max(from, Math.min(from + this.size - 1, this.indexAtPixel(this.scroll.scrollTop)));
        this.from = from;
        this.entries = this.snapshot.timeline.slice(from, from + this.size);
        const ids = new Set(this.entries.map(item => item.activeVariantId));
        this.variants = (this.snapshot.variants ?? []).filter(item => ids.has(item.variantId));
        this.trim();
        if (!refresh) this.changed();
        if (!this.read) return;
        const snapshot = this.snapshot;
        Promise.resolve(this.read(snapshot, from, this.size, controller.signal)).then(page => {
            if (this.disposed || epoch !== this.epoch || controller.signal.aborted) return;
            if (page.revisionId !== snapshot.revision.revisionId || page.branchId !== snapshot.revision.branchId) throw new Error('Native Timeline Range identity mismatch');
            this.from = from;
            this.entries = page.entries; this.variants = page.variants ?? this.variants;
            this.trim(); this.loadedIdentity = this.identity; this.changed();
        }).catch(error => { if (!this.disposed && epoch === this.epoch && !controller.signal.aborted) this.failed?.(error); });
    }
    measure(position, height) {
        if (!Number.isFinite(height) || height <= 0 || this.heights.get(position) === height) return 0;
        const before = this.offset(this.from);
        this.heights.delete(position); this.heights.set(position, height);
        while (this.heights.size > 512) this.heights.delete(this.heights.keys().next().value);
        return this.offset(this.from) - before;
    }
    latest() { this.load(Math.max(0, this.total - this.size)); }
    trim() {
        let bytes = JSON.stringify([this.entries, this.variants]).length * 2;
        while (bytes > this.byteBudget && this.entries.length > 1) {
            // Keep a contiguous range containing the reading/latest anchor.
            if (this.canShift && !this.canShift()) break;
            if (this.anchor - this.from >= this.entries.length / 2) { this.entries.shift(); this.from++; } else this.entries.pop();
            const ids = new Set(this.entries.map(item => item.activeVariantId));
            this.variants = this.variants.filter(item => ids.has(item.variantId));
            bytes = JSON.stringify([this.entries, this.variants]).length * 2;
        }
        this.retainedBytes = bytes;
    }
    pressure() { if (this.canShift && !this.canShift()) return; this.byteBudget = Math.max(1, Math.floor(this.byteBudget / 2)); this.size = Math.max(8, Math.floor(this.size / 2)); this.load(this.keepLatest ? Math.max(0, this.total - this.size) : Math.max(0, this.anchor - 4), true); }
    clear() {
        this.controller?.abort(); this.epoch++; this.snapshot = null; this.identity = null; this.loadedIdentity = null; this.scope = null;
        this.entries = []; this.variants = []; this.heights.clear(); this.retainedBytes = 0; this.total = 0; this.from = 0;
        (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame); this.frame = null;
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.epoch++; this.controller?.abort();
        this.scroll.removeEventListener('scroll', this.onScroll);
        (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
        this.clear();
    }
}
