import path from 'node:path';
import process from 'node:process';

import { initConfig } from '../src/config-init.js';
import { getConfigValue } from '../src/util.js';
import getWebpackServeMiddleware from '../src/middleware/webpack-serve.js';

const args = process.argv.slice(2);
let configPath = './config.yaml';
let dataRootOverride = '';
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--configPath' && args[i + 1]) {
        configPath = args[++i];
        continue;
    }
    if (args[i] === '--dataRoot' && args[i + 1]) {
        dataRootOverride = args[++i];
    }
}

configPath = path.resolve(configPath);
initConfig(configPath);

const configuredDataRoot = String(dataRootOverride || getConfigValue('dataRoot', './data') || './data');
globalThis.DATA_ROOT = path.isAbsolute(configuredDataRoot)
    ? configuredDataRoot
    : path.resolve(process.cwd(), configuredDataRoot);

const middleware = getWebpackServeMiddleware();
const result = await middleware.runWebpackCompiler({ pruneCache: true });

console.log(`Frontend bundle cache verified source=${result.source} output=${result.outputPath}`);
