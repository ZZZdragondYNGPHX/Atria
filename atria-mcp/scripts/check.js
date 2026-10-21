import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
for (const directory of ['src', 'scripts']) for (const file of await readdir(join(root, directory))) {
    if (!file.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', join(root, directory, file)], { stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) process.exit(result.status ?? 1);
    count++;
}
console.log(`Checked ${count} JavaScript files`);
