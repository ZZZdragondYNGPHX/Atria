import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const checks = {
    'better-sqlite3': () => {
        const Database = require('better-sqlite3');
        const database = new Database(':memory:');
        try { database.prepare('SELECT 1').get(); } finally { database.close(); }
    },
    'isolated-vm': () => {
        const { Isolate } = require('isolated-vm');
        const isolate = new Isolate({ memoryLimit: 8 });
        isolate.dispose();
    },
};

try {
    if (process.argv.includes('--verify')) {
        for (const check of Object.values(checks)) check();
    } else {
        const missing = Object.keys(checks).filter(name => {
            try { checks[name](); return false; } catch { return true; }
        });
        if (missing.length) {
            console.log(`Repairing native dependencies: ${missing.join(', ')}`);
            // Keep general install scripts disabled; only rebuild these runtime dependencies.
            const result = spawnSync('npm', ['rebuild', ...missing, '--ignore-scripts=false', '--foreground-scripts'], {
                stdio: 'inherit', shell: process.platform === 'win32',
            });
            if (result.error || result.status !== 0) {
                throw result.error || new Error(`Native dependency rebuild failed (${result.status}).`);
            }
            // Recheck in a fresh process so failed native module loads cannot remain cached.
            const verified = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--verify'],
                { stdio: 'inherit' });
            if (verified.error || verified.status !== 0) throw new Error('Native dependencies still cannot load after rebuilding.');
        }
    }
} catch (error) {
    console.error('Atria cannot start:', error.message);
    process.exitCode = 1;
}
