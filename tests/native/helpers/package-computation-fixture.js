import { authorityCandidateFixture } from './authority-candidate-fixture.js';
import { closed } from './authority-fixture.js';

export const tradeSource = `import { total } from './price.ts';
export default {
    precondition({args, reads}) { return reads.wallet.value >= total(args.quantity) && reads.shop.value >= args.quantity; },
    compute({args, reads}) {
        const prices = Array.from({length: args.quantity}, (_, i) => ({index:i, price:3}));
        prices.sort((a,b) => b.price-a.price || a.index-b.index);
        const price = prices.reduce((sum,item) => sum+item.price,0);
        return {balance:reads.wallet.value-price, stock:reads.shop.value-args.quantity, items:reads.bag.value+args.quantity};
    },
    invariant({reads, beforeReads, args}) { return reads.wallet.value >= 0 && reads.shop.value >= 0 && reads.bag.value === beforeReads.bag.value+args.quantity; }
};`;

export function computationFixture(source = tradeSource) {
    const f = authorityCandidateFixture();
    const valueSchema = closed({ value: { type: 'integer', minimum: 0, maximum: 1000 } });
    for (const [id, initial] of [['wallet', 20], ['shop', 5], ['bag', 0]]) {
        const domain = structuredClone(f.contract.lifecycleRuntime.domains[0]);
        Object.assign(domain, { id, recordSchema: valueSchema, initial: { value: initial }, commands: [
            { id: 'set', argsSchema: valueSchema, event: id + '.changed', assign: { value: { formula: 'args.value' } } },
        ] });
        f.contract.lifecycleRuntime.domains.push(domain);
        f.base.states.atri_lifecycle.domains[id] = { records: [{ id: 'main', scopeId: 'session', status: 'active', pinned: false, createdLogicalTime: 0, value: { value: initial } }] };
    }
    f.logic.transactions = [{ id: 'trade.buy', verb: 'buy', inputSchema: closed({ quantity: { type: 'integer', minimum: 1, maximum: 8 } }),
        intent: { expose: true, description: 'Buy items' }, validators: [],
        reads: ['wallet','shop','bag'].map(id => ({ id, domainId: id, recordId: 'main', fields: ['value'] })),
        computation: { source: 'rules/trade.ts', outputSchema: closed(Object.fromEntries(['balance','stock','items'].map(id => [id, { type: 'integer', minimum: 0, maximum: 1000 }]))) },
        resolution: { kind: 'deterministic', cases: [], fallback: 'success' },
        effects: [['wallet','balance'], ['shop','stock'], ['bag','items']].map(([domainId, field]) => ({ kind: 'app.command', domainId, commandId: 'set', recordId: 'main', args: { value: { formula: 'computed.' + field } } })),
        derivedPublications: [], receipt: { schema: closed({ outcome: { type: 'string', maxLength: 64 } }), projection: { outcome: { formula: 'resolution.outcome' } }, maxBytes: 32768 },
    }];
    f.installed.sourceFiles.set('rules/trade.ts', Buffer.from(source));
    f.installed.sourceFiles.set('rules/price.ts', Buffer.from('export const total = (quantity:number) => quantity*3;'));
    f.request.transactionId = 'trade.buy'; f.request.input = { quantity: 2 }; f.sync();
    return f;
}
