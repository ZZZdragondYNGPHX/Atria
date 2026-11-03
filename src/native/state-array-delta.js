const identity = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    for (const key of ['id', 'invocationId', 'receiptId']) if (typeof value[key] === 'string') return key + '\0' + value[key];
    return value;
};

// Retention queues drop a prefix, not mutate every retained receipt. Match an
// exact identity sequence; the ordinary recursive diff still checks its values.
export function arrayShift(before, after) {
    if (Math.min(before.length, after.length) < 4 || Math.max(before.length, after.length) > 4096) return 0;
    const first = identity(after[0]);
    if (identity(before[0]) === first) return 0;
    let compared = 0;
    for (let drop = 1; drop < Math.min(before.length - 3, 129); drop++) {
        if (identity(before[drop]) !== first) continue;
        const overlap = Math.min(before.length - drop, after.length);
        if (overlap * 2 < after.length) continue;
        let index = 1;
        for (; index < overlap; index++) {
            if (++compared > 16384) return 0;
            if (identity(before[drop + index]) !== identity(after[index])) break;
        }
        if (index === overlap) return drop;
    }
    return 0;
}

export function spliceStateArray(before, value, copy) {
    if (!Array.isArray(before) || !value || !Number.isSafeInteger(value.start) || value.start < 0 || value.start > before.length
        || !Number.isSafeInteger(value.deleteCount) || value.deleteCount < 0 || value.deleteCount > before.length - value.start
        || !Array.isArray(value.items) || before.length - value.deleteCount + value.items.length > 1000000) throw new TypeError('Invalid array Delta splice');
    return before.slice(0, value.start).concat(copy(value.items), before.slice(value.start + value.deleteCount));
}
