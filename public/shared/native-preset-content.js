import { compileDataSchema } from './native-data-schema.js';
import { validateSchemaValue } from '../scripts/native/experience/world/schema.js';
import { NativeContentStream, proseSeparator } from './native-content-stream.js';
import { assertMessageProjection } from './native-message-contract.js';

export function assertPresetContent(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.types) || value.types.length > 64
        || Object.keys(value).some(key => !['schemaVersion', 'types', 'presentations'].includes(key))) throw new TypeError('Invalid preset content declaration');
    const seen = new Set();
    const presentations = value.presentations ?? [];
    if (!Array.isArray(presentations) || presentations.length > 128) throw new TypeError('Invalid preset presentations');
    const skins = new Set();
    for (const skin of presentations) {
        if (!skin || typeof skin.id !== 'string' || !skin.id || skin.id.length > 256 || skins.has(skin.id)
            || !value.types.some(type => type?.type === skin.type) || typeof skin.slot !== 'string' || !skin.slot || skin.slot.length > 64
            || Object.keys(skin).some(key => !['id', 'type', 'slot', 'enabled', 'source', 'files', 'componentOnly'].includes(key))
            || skin.componentOnly !== undefined && typeof skin.componentOnly !== 'boolean'
            || typeof skin.enabled !== 'boolean' || typeof skin.source !== 'string' || !skin.files || Array.isArray(skin.files)
            || Object.keys(skin.files).length > 256 || Object.values(skin.files).some(file => typeof file !== 'string')
            || JSON.stringify(skin.files).length > 2 * 1024 * 1024) throw new TypeError('Invalid preset presentation source');
        skins.add(skin.id);
    }
    return Object.freeze({ schemaVersion: 1, ...(presentations.length ? { presentations: structuredClone(presentations) } : {}), types: Object.freeze(value.types.map(item => {
        if (!item || typeof item.type !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(item.type) || seen.has(item.type)
            || Object.keys(item).some(key => !['type', 'displayName', 'schema', 'context'].includes(key))
            || typeof item.displayName !== 'string' || item.displayName.length > 256
            || !['candidate', 'excluded', 'latest'].includes(item.context)) throw new TypeError('Invalid preset content type');
        seen.add(item.type);
        const schema = compileDataSchema(item.schema);
        if (schema.type !== 'object') throw new TypeError('Block data must be an object');
        return Object.freeze({ type: item.type, displayName: item.displayName, schema, context: item.context });
    })) });
}

export function presetContentInstruction(declaration, { proseOnly = false } = {}) {
    return 'Return one JSON object with exactly one field "flow", an ordered array. '
        + 'Narrative nodes are {"kind":"prose","text":"story text"}. '
        + 'Supplemental nodes are {"kind":"block","type":"declared type","data":{...}}. '
        + 'Put kind first for streaming. Preserve prose/block order; never duplicate prose. '
        + 'No markdown fences, wrapper tags, HTML, host IDs, tools or World changes. '
        + (proseOnly ? 'This operation produces only a player draft: use prose nodes only. ' : 'Allowed supplemental data schemas: ' + JSON.stringify(declaration.types) + '. ')
        + (proseOnly || !declaration.types.length ? 'Minimal example: {"flow":[{"kind":"prose","text":"A quiet evening."}]}'
            // Replies most often broke JSON where prose turns into a block; show that transition.
            : 'Each prose node closes with exactly one } after its text; a block node closes its data and itself with }}. '
                + 'Syntax example (data abbreviated): {"flow":[{"kind":"block","type":"' + declaration.types[0].type + '","data":{…}},'
                + '{"kind":"prose","text":"A quiet evening."},{"kind":"block","type":"' + declaration.types.at(-1).type + '","data":{…}}]}');
}

export function presetContentJsonSchema(declaration, { proseOnly = false } = {}) {
    const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
    const prose = object({ kind: { type: 'string', enum: ['prose'] }, text: { type: 'string' } });
    return object({ flow: { type: 'array', maxItems: 128, items: { anyOf: [prose,
        ...(proseOnly ? [] : declaration.types.map(type => object({ kind: { type: 'string', enum: ['block'] }, type: { type: 'string', enum: [type.type] }, data: type.schema })))] } } });
}

export function decodePresetContent(raw, declaration, { stream, proseOnly = false } = {}) {
    const decoder = stream ?? new NativeContentStream();
    if (!stream) decoder.push(raw);
    const result = decoder.finish();
    const diagnostics = [], flow = [];
    if (result.error) return { status: 'invalid', narrative: '', preview: result.narrative, raw,
        diagnostics: [{ code: result.error, message: 'Invalid or incomplete JSON; original response retained.' }] };
    const root = result.value;
    if (!root || Array.isArray(root) || Object.keys(root).length !== 1 || !Array.isArray(root.flow) || root.flow.length > 128) {
        return { status: 'invalid', narrative: '', raw, diagnostics: [{ code: 'content_flow_invalid', message: 'Expected a bounded flow array.' }] };
    }
    const types = new Map(declaration.types.map(item => [item.type, item]));
    let narrative = '';
    for (const [index, node] of root.flow.entries()) {
        if (node?.kind === 'prose' && typeof node.text === 'string' && Object.keys(node).every(key => ['kind', 'text'].includes(key))) {
            const text = proseSeparator(narrative, node.text) + node.text;
            flow.push({ kind: 'prose', text }); narrative += text; continue;
        }
        const type = types.get(node?.type);
        let error = proseOnly ? 'content_draft_block' : !type ? 'content_type_unknown' : 'content_block_invalid';
        // Models sometimes write a block's fields beside kind/type instead of
        // inside data. The same declared schema still decides validity.
        const data = node && typeof node === 'object' && !Object.hasOwn(node, 'data')
            ? Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'kind' && key !== 'type')) : node?.data;
        if (!proseOnly && node?.kind === 'block' && type && Object.keys(node).every(key => ['kind', 'type', 'data'].includes(key) || !Object.hasOwn(node, 'data'))
            && validateSchemaValue(data, type.schema).ok) {
            const block = { kind: 'block', id: 'preset-' + index, type: 'preset.content', version: 1, data: { type: node.type, value: data } };
            try { assertMessageProjection({ schemaVersion: 1, flow: [block] }, ''); flow.push(block); continue; } catch { error = 'content_block_capacity'; }
        }
        diagnostics.push({ code: error, message: 'Flow item ' + index + ' retained in original response.' });
        flow.push({ kind: 'block', id: 'preset-' + index, type: 'preset.diagnostic', version: 1, data: { index, code: error } });
    }
    if (!narrative.trim()) return { status: 'invalid', narrative: '', raw,
        diagnostics: [...diagnostics, { code: 'content_prose_missing', message: 'No narrative text; original response retained.' }] };
    try {
        const projection = assertMessageProjection({ schemaVersion: 1, flow }, narrative);
        return { status: diagnostics.length ? 'partial' : 'complete', narrative, projection, raw, diagnostics };
    } catch {
        return { status: 'invalid', narrative: '', preview: narrative, raw,
            diagnostics: [{ code: 'content_projection_capacity', message: 'Message capacity exceeded; original response retained.' }] };
    }
}
