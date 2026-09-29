/** @jest-environment jsdom */
import { TextEncoder } from 'node:util';
import { serialize, deserialize } from 'node:v8';
globalThis.TextEncoder ??= TextEncoder;
globalThis.structuredClone ??= value => deserialize(serialize(value));
import { informationSnapshot } from '../native/helpers/information-fixture.js';
import { createNativeLifecycleClient } from '../../public/scripts/native/lifecycle-client.js';

test('Host projection facade reads historical snapshots but disposal rejects further reads', () => {
    const runtime = { active: true, history: true, snapshot: informationSnapshot() };
    const client = createNativeLifecycleClient({ runtime }); client.beginLoad();
    expect(client.getInformationProjection('pov').items).toHaveLength(4);
    expect(client.queryInformationGraph('relations', 'a').nodes).toHaveLength(2);
    client.cancel(); expect(() => client.getInformationProjection('pov')).toThrow(/stale/);
});
