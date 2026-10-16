import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../../src/util.js';

setConfigFilePath(fileURLToPath(new URL('../../default/config.yaml', import.meta.url)));
