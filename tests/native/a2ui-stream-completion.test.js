import { A2uiProjection, consumeA2uiJsonLines } from '../../public/shared/native-a2ui.js';
import { a2uiFixture } from './helpers/a2ui-s32-fixture.js';

const modelUpdate = (path, value) => ({ version: 'v0.9.1', updateDataModel: { surfaceId: 'notes', path, value } });
function projection() {
    const f = a2uiFixture({ streaming: true });
    const index = JSON.parse(f.sourceFiles.get('frontend.json'));
    return { f, p: new A2uiProjection(f.messages, index.components[1].a2ui) };
}
test('stream-enabled card installs exact author policy and supports incremental public data', () => {
    const { f, p } = projection();
    expect([...f.compiled.files.values()].some(bytes => bytes.toString().includes('"a2ui"'))).toBe(true);
    const next = p.push(modelUpdate('/title', '实时任务卡'));
    expect(JSON.stringify(next.ast.root)).toContain('实时任务卡');
    expect(next.ast.uses).toEqual(['save']);
});
test('invalid streamed component/event/path cannot replace the previous valid projection', () => {
    const { p } = projection(), before = structuredClone(p.messages);
    expect(() => p.push(modelUpdate('/__proto__/polluted', true))).toThrow();
    expect(() => p.push({ version: 'v0.9.1', updateComponents: { surfaceId: 'notes', components: [{ id: 'confirm', component: 'Button', child: 'label', action: { event: { name: 'admin' } } }] } })).toThrow();
    expect(p.messages).toEqual(before);
});
test('real JSONL byte stream delivers ordered changes and rejects malformed trailing input', async () => {
    const { p } = projection(); const changes = [modelUpdate('/title', '在线更新'), modelUpdate('/note', '真实公开备注')];
    const results = [];
    const result = await consumeA2uiJsonLines(new Response(changes.map(value => JSON.stringify(value)).join('\n')).body, value => { results.push(p.push(value)); });
    expect(result.messages).toBe(2); expect(JSON.stringify(results[1].ast)).toContain('真实公开备注');
    await expect(consumeA2uiJsonLines(new Response('{bad json}').body, () => {})).rejects.toThrow();
});
test('stream close/cancel prevents late delivery and preserves surface identity', async () => {
    const { p } = projection(), controller = new AbortController(); let delivered = 0;
    const body = new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode(JSON.stringify(modelUpdate('/title', 'first')) + '\n')); } });
    await expect(consumeA2uiJsonLines(body, () => { delivered++; controller.abort(); }, { signal: controller.signal })).rejects.toThrow();
    expect(delivered).toBe(1);
    expect(() => p.push({ version: 'v0.9.1', createSurface: { surfaceId: 'other', catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json' } })).toThrow();
});
