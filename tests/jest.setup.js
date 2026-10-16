import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './util/config.js';

// Test runs must not inherit a developer's config or write into product data.
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-jest-data-'));
globalThis.DATA_ROOT = dataRoot;
afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
