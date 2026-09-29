import { parseArgs } from 'node:util';
import { resolve } from 'node:path';

export function loadConfig(argv = process.argv.slice(2), env = process.env) {
    const { values } = parseArgs({ args: argv, options: {
        url: { type: 'string' }, repo: { type: 'string' }, 'data-root': { type: 'string' },
        headed: { type: 'boolean' }, 'browser-channel': { type: 'string' },
        'allow-remote': { type: 'boolean' },
        'storage-state': { type: 'string' }, help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
    } });
    if (values.help || values.version) return values;
    if (env.ATRIA_ALLOW_WRITES !== undefined) throw new Error('ATRIA_ALLOW_WRITES has been removed; Phase 1 is read-only.');
    const url = new URL(values.url ?? env.ATRIA_URL ?? 'http://127.0.0.1:8000');
    const allowRemote = values['allow-remote'] ?? env.ATRIA_ALLOW_REMOTE === '1';
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('ATRIA_URL must be an http(s) origin without credentials, path, query or fragment.');
    }
    if (!allowRemote && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        throw new Error('Remote Atria requires --allow-remote (or ATRIA_ALLOW_REMOTE=1).');
    }
    if (allowRemote && url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        throw new Error('Remote Atria must use HTTPS.');
    }
    const repo = values.repo ?? env.ATRIA_REPO;
    if (!repo) throw new Error('Set --repo or ATRIA_REPO to the Atria product source worktree (not the plugin worktree).');
    const channel = values['browser-channel'] ?? env.ATRIA_BROWSER_CHANNEL;
    if (channel && !['chrome', 'msedge'].includes(channel)) throw new Error('Browser channel must be chrome or msedge; omit for bundled Chromium.');
    const storageState = values['storage-state'] ?? env.ATRIA_STORAGE_STATE;
    return {
        url: url.origin, repo: resolve(repo),
        headed: values.headed ?? env.ATRIA_HEADED === '1', channel,
        dataRoots: values['data-root'] ? [resolve(values['data-root'])] : [],
        allowRemote, storageState: storageState ? resolve(storageState) : undefined,
        timeout: 15000, maxResponseBytes: 1024 * 1024,
    };
}

export const HELP = `Atria MCP 0.2.0 — local stdio server (Node.js >=22)

  node src/cli.js --repo <Atria product worktree> [options]

  --url <origin>             Running Atria (default http://127.0.0.1:8000)
  --headed                   Show the isolated browser, including manual login
  --browser-channel <name>   chrome or msedge; default installed Playwright Chromium
  --data-root <path>         Additional runtime-owned directory to exclude from evidence
  --allow-remote             Permit an explicitly configured remote HTTPS origin
  --storage-state <file>     Explicit Playwright authentication state (never committed)
  --help / --version

Equivalent environment: ATRIA_REPO, ATRIA_URL, ATRIA_HEADED=1,
ATRIA_BROWSER_CHANNEL, ATRIA_ALLOW_REMOTE=1,
ATRIA_STORAGE_STATE. No Atria process is started and no personal browser is attached.
Install a browser once: npx playwright install chromium
MCP protocol uses stdout exclusively; errors go to stderr.
`;
