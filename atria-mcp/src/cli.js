#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig, HELP } from './config.js';
import { createServer } from './server.js';

let runtime;
let transport;
let stopping = false;
const closing = new WeakMap();
function closeInstance(instance) {
    if (!instance) return;
    if (!closing.has(instance)) closing.set(instance, Promise.resolve().then(() => instance.close()));
    return closing.get(instance);
}
async function stop() {
    if (stopping) return;
    stopping = true;
    await transport?.close();
    await closeInstance(runtime);
}
try {
    const config = loadConfig();
    if (config.help) process.stdout.write(HELP);
    else if (config.version) process.stdout.write('0.4.0\n');
    else {
        process.once('SIGINT', () => { void stop().finally(() => process.exit(0)); });
        process.once('SIGTERM', () => { void stop().finally(() => process.exit(0)); });
        process.stdin.once('end', () => { void stop(); });
        transport = serveStdio(async () => {
            const instance = await createServer(config);
            runtime = instance;
            const onclose = instance.server.server.onclose;
            instance.server.server.onclose = () => {
                onclose?.();
                void closeInstance(instance).catch(error => process.stderr.write(`atria-mcp: ${error.message}\n`));
            };
            return instance.server;
        }, { onerror: error => process.stderr.write(`atria-mcp: ${error.message}\n`) });
    }
} catch (error) {
    process.stderr.write(`atria-mcp: ${error.message}\n`);
    await stop();
    process.exitCode = 1;
}
