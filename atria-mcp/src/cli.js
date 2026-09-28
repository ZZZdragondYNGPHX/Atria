#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, HELP } from './config.js';
import { createServer } from './server.js';

let runtime;
let stopping = false;
async function stop() {
    if (stopping) return;
    stopping = true;
    await runtime?.close();
}
try {
    const config = loadConfig();
    if (config.help) process.stdout.write(HELP);
    else if (config.version) process.stdout.write('0.1.0\n');
    else {
        runtime = await createServer(config);
        process.once('SIGINT', () => { void stop().finally(() => process.exit(0)); });
        process.once('SIGTERM', () => { void stop().finally(() => process.exit(0)); });
        process.stdin.once('end', () => { void stop(); });
        await runtime.server.connect(new StdioServerTransport());
    }
} catch (error) {
    process.stderr.write(`atria-mcp: ${error.message}\n`);
    await stop();
    process.exitCode = 1;
}
