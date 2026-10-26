import { compileDataSchema } from './native-data-schema.js';
import { WORLD_CAPACITY } from './native-world-data.js';

// Computations compose several independently bounded Domain records and receipts.
// Keep the ordinary 256-node schema limit on each output, and bound the aggregate
// separately. This does not widen Domain, task, message, or input schemas.
export function compileComputationSchema(raw) {
    if (raw?.type !== 'object') throw new TypeError('Computation output must be a bounded closed object');
    try {
        return compileDataSchema(raw, 0, { nodes: 0, maxArrayItems: WORLD_CAPACITY.arrayItems });
    } catch (error) {
        if (error.message !== 'Message dataSchema complexity exceeded') throw error;
    }
    if (raw?.type !== 'object' || !raw.properties || typeof raw.properties !== 'object'
        || Array.isArray(raw.properties) || Object.keys(raw.properties).length > 32) {
        throw new TypeError('Computation output must be a bounded closed object');
    }
    const shell = compileDataSchema({ ...raw, properties: Object.fromEntries(
        Object.keys(raw.properties).map(key => [key, { type: 'boolean' }]),
    ) });
    let nodes = 1;
    const properties = Object.fromEntries(Object.entries(raw.properties).map(([key, value]) => {
        const budget = { nodes: 0, maxArrayItems: WORLD_CAPACITY.arrayItems };
        const schema = compileDataSchema(value, 0, budget);
        nodes += budget.nodes;
        if (nodes > 1024) throw new TypeError('Computation output schema composition limit');
        return [key, schema];
    }));
    return { ...shell, properties };
}
