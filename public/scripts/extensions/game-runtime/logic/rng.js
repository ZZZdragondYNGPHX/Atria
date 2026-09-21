const STREAM_NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function hashSeed(value) {
    const text = String(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function normalizeStreamName(name) {
    const value = String(name || '').trim();
    if (!STREAM_NAME_PATTERN.test(value)) {
        throw new Error('RNG stream name must match /^[A-Za-z0-9._-]{1,64}$/');
    }
    return value;
}

function requireInteger(value, label) {
    if (!Number.isSafeInteger(value)) {
        throw new Error(label + ' must be a safe integer');
    }
    return value;
}

function requirePositiveInteger(value, label) {
    requireInteger(value, label);
    if (value < 1) throw new Error(label + ' must be >= 1');
    return value;
}

export function createDeterministicRng(seed, options = {}) {
    const rootSeed = String(seed ?? '');
    const rootNamespace = normalizeStreamName(options.namespace || 'default');
    const trace = [];
    const streams = new Map();

    function getStream(namespace) {
        if (streams.has(namespace)) return streams.get(namespace);

        let state = hashSeed(rootSeed + '|' + namespace);

        function nextUnit() {
            state = (state + 0x6D2B79F5) >>> 0;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        }

        function record(entry) {
            trace.push({
                stream: namespace,
                ...clone(entry),
            });
        }

        const api = Object.freeze({
            float() {
                const value = nextUnit();
                record({ operation: 'float', value });
                return value;
            },

            int(minimum, maximum) {
                const min = requireInteger(minimum, 'RNG minimum');
                const max = requireInteger(maximum, 'RNG maximum');
                if (max < min) throw new Error('RNG maximum must be >= minimum');
                const span = max - min + 1;
                if (!Number.isSafeInteger(span) || span > 0x100000000) {
                    throw new Error('RNG integer range exceeds deterministic precision');
                }
                const value = min + Math.floor(nextUnit() * span);
                record({ operation: 'int', minimum: min, maximum: max, value });
                return value;
            },

            dice(count, sides, modifier = 0) {
                const diceCount = requirePositiveInteger(count, 'RNG dice count');
                const sideCount = requirePositiveInteger(sides, 'RNG dice sides');
                const bonus = requireInteger(modifier, 'RNG dice modifier');
                if (diceCount > 1000 || sideCount > 1000000) {
                    throw new Error('RNG dice request exceeds runtime limits');
                }

                const rolls = [];
                for (let index = 0; index < diceCount; index += 1) {
                    rolls.push(1 + Math.floor(nextUnit() * sideCount));
                }
                const total = rolls.reduce((sum, roll) => sum + roll, bonus);
                const result = { rolls, modifier: bonus, total };
                record({
                    operation: 'dice',
                    count: diceCount,
                    sides: sideCount,
                    modifier: bonus,
                    rolls,
                    total,
                });
                return clone(result);
            },

            weighted(entries) {
                if (!Array.isArray(entries) || entries.length === 0) {
                    throw new Error('RNG weighted choice requires a non-empty array');
                }
                if (entries.length > 10000) {
                    throw new Error('RNG weighted choice exceeds runtime limits');
                }

                let totalWeight = 0;
                const weights = entries.map((entry, index) => {
                    const weight = Number(entry?.weight);
                    if (!Number.isFinite(weight) || weight <= 0) {
                        throw new Error('RNG weighted choice entry ' + index + ' requires weight > 0');
                    }
                    totalWeight += weight;
                    if (!Number.isFinite(totalWeight)) {
                        throw new Error('RNG weighted choice total weight must be finite');
                    }
                    return weight;
                });

                let cursor = nextUnit() * totalWeight;
                let selectedIndex = entries.length - 1;
                for (let index = 0; index < entries.length; index += 1) {
                    cursor -= weights[index];
                    if (cursor < 0) {
                        selectedIndex = index;
                        break;
                    }
                }

                record({
                    operation: 'weighted',
                    selectedIndex,
                    totalWeight,
                });
                return clone(entries[selectedIndex]?.value);
            },

            stream(name) {
                const child = normalizeStreamName(name);
                const nestedNamespace = namespace + '.' + child;
                if (nestedNamespace.length > 256) {
                    throw new Error('RNG stream namespace exceeds 256 characters');
                }
                return getStream(nestedNamespace);
            },
        });

        streams.set(namespace, api);
        return api;
    }

    const root = getStream(rootNamespace);
    return Object.freeze({
        float: root.float,
        int: root.int,
        dice: root.dice,
        weighted: root.weighted,
        stream: root.stream,
        trace() {
            return clone(trace);
        },
    });
}
