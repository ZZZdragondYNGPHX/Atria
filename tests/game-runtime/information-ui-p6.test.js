/** @jest-environment jsdom */
import { TextEncoder } from 'node:util';
import { serialize, deserialize } from 'node:v8';
globalThis.TextEncoder ??= TextEncoder;
globalThis.structuredClone ??= value => deserialize(serialize(value));
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { mountUiDocument } from '../../public/scripts/native/experience/ui/v2-runtime.js';
import { createSurfaceHost } from '../../public/scripts/native/experience/ui/surfaces.js';
import { informationSnapshot } from '../native/helpers/information-fixture.js';
import { createNativeLifecycleClient } from '../../public/scripts/native/lifecycle-client.js';

test('existing v2 renderer renders projected text and refreshes on scope/availability changes', () => {
    const snapshot = informationSnapshot(); const root = document.createElement('section'); document.body.append(root);
    const raw = { schemaVersion: 2, stateVersion: 1, localState: {}, preferences: {}, actions: {},
        views: [{ id: 'main', surface: 'chat.footer', mount: 'always', root: { id: 'info', type: 'text',
            bindings: { text: { expr: 'length(projection.pov.items)' } } } }] };
    const runtime = mountUiDocument(compileUiDocument(raw, { mode: 'component' }), { document, window,
        getSnapshot: () => snapshot, surfaceHost: createSurfaceHost({ resolveSurface: () => root }) });
    expect(root.textContent).toBe('4');
    snapshot.states.atri_lifecycle.domains.availability.records[0].value.available = false;
    runtime.refresh(); expect(root.textContent).toBe('0');
    runtime.dispose(); expect(root.textContent).toBe(''); root.remove();
});

test('Host projection facade reads historical snapshots but disposal rejects further reads', () => {
    const runtime = { active: true, history: true, snapshot: informationSnapshot() };
    const client = createNativeLifecycleClient({ runtime }); client.beginLoad();
    expect(client.getInformationProjection('pov').items).toHaveLength(4);
    expect(client.queryInformationGraph('relations', 'a').nodes).toHaveLength(2);
    client.cancel(); expect(() => client.getInformationProjection('pov')).toThrow(/stale/);
});
