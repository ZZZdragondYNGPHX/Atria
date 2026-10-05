import { serialize, deserialize } from 'node:v8';
// Initialize before native modules evaluate in jsdom, which omits Node's API.
globalThis.structuredClone ??= value => deserialize(serialize(value));
