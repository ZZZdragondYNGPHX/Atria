import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [command, rootArgument, ...args] = process.argv.slice(2);
const root = path.resolve(rootArgument || '.');
const configPath = path.join(root, 'config.yaml');

async function configDocument(file = configPath) {
    const { parseDocument } = await import('yaml');
    const doc = parseDocument(fs.readFileSync(file, 'utf8'));
    if (doc.errors.length) throw doc.errors[0];
    return doc;
}

function writeConfig(doc, file = configPath) {
    const temporary = file + '.tmp-' + crypto.randomUUID();
    try {
        fs.writeFileSync(temporary, String(doc), { mode: 0o600, flag: 'wx' });
        fs.renameSync(temporary, file);
    } finally { fs.rmSync(temporary, { force: true }); }
}

function resolveDirectory(value, fallback) {
    const directory = path.resolve(root, String(value || fallback));
    if (/[\r\n\0]/.test(directory)) throw new Error('目录不能包含换行或 NUL');
    return fs.existsSync(directory) ? fs.realpathSync(directory) : directory;
}

async function snapshot() {
    const config = (await configDocument()).toJS();
    const port = Number(process.env.ATRIA_TERMUX_PORT || config.port || 8000);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('端口必须在 1–65535 之间');
    const mode = config.storage?.mode || 'fs';
    if (!['fs', 'sqlite', 'mysql', 'postgres'].includes(mode)) throw new Error('未知存储模式：' + mode);
    return {
        root, config: configPath, port, mode,
        data: resolveDirectory(config.dataRoot, './data'),
        plugins: resolveDirectory(config.serverPluginsPath, './plugins'),
        extensions: resolveDirectory(config.globalExtensionsPath, './public/scripts/extensions/third-party'),
    };
}

async function probe(url) {
    const health = await fetch(url + '/api/storage/health', { signal: AbortSignal.timeout(5000) });
    if ([401, 403].includes(health.status)) return 'login-required';
    if (!health.ok || !(await health.json()).ok) throw new Error('HTTP 已响应，但存储健康检查失败');
    const csrf = await fetch(url + '/csrf-token', { signal: AbortSignal.timeout(5000) });
    if ([401, 403].includes(csrf.status)) return 'login-required';
    if (!csrf.ok) throw new Error('CSRF 初始化失败：HTTP ' + csrf.status);
    const { token } = await csrf.json();
    const cookie = csrf.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const response = await fetch(url + '/api/bootstrap', {
        method: 'POST', headers: { cookie, 'x-csrf-token': token, 'Content-Type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(30000),
    });
    if ([401, 403].includes(response.status)) return 'login-required';
    if (!response.ok) throw new Error('页面初始化失败：HTTP ' + response.status + '；请查看启动日志');
    if (!(await response.json()).settings) throw new Error('页面初始化没有返回设置');
    return 'ready';
}

async function main() {
    switch (command) {
        case 'node': {
            const expected = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).engines.node;
            const match = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(expected);
            if (!match) throw new Error('工具箱无法解析当前 Node 要求：' + expected);
            const minimum = match.slice(1).map(Number), current = process.versions.node.split('.').map(Number);
            const difference = current.map((value, i) => value - minimum[i]).find(value => value !== 0) || 0;
            if (difference < 0) throw new Error(`当前 Node ${process.version}，主程序要求 ${expected}；请升级当前 Node 软件包`);
            console.log(`Node ${process.version}，符合主程序要求 ${expected}`);
            return;
        }
        case 'init': {
            if (fs.existsSync(configPath)) return;
            const doc = await configDocument(path.join(root, 'default/config.yaml'));
            doc.set('dataRoot', path.resolve(args[0]));
            doc.set('listen', false);
            doc.setIn(['browserLaunch', 'enabled'], false);
            writeConfig(doc);
            return;
        }
        case 'paths': {
            const value = await snapshot();
            console.log([value.data, value.port, value.mode, value.plugins, value.extensions].join('\n'));
            return;
        }
        case 'snapshot': console.log(JSON.stringify(await snapshot())); return;
        case 'port': {
            const port = Number(args[0]);
            if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须在 1–65535 之间');
            const doc = await configDocument(); doc.set('port', port); writeConfig(doc); return;
        }
        case 'restore-config': {
            const current = JSON.parse(fs.readFileSync(args[1], 'utf8'));
            const doc = await configDocument(args[0]);
            if (!['fs', 'sqlite'].includes(doc.getIn(['storage', 'mode']) || 'fs')) throw new Error('不能用本地归档恢复外部数据库配置');
            doc.set('dataRoot', current.data); doc.set('port', current.port);
            doc.set('serverPluginsPath', current.plugins); doc.set('globalExtensionsPath', current.extensions);
            writeConfig(doc, args[0]); return;
        }
        case 'fingerprint': {
            const digest = crypto.createHash('sha256');
            digest.update([root, process.version, process.versions.modules, process.platform, process.arch].join('\0'));
            for (const file of ['package.json', 'package-lock.json']) digest.update(fs.readFileSync(path.join(root, file)));
            console.log(digest.digest('hex')); return;
        }
        case 'probe': console.log(await probe(args[0])); return;
        case 'timings': {
            const log = fs.readFileSync(args[0], 'utf8');
            const lines = log.split('\n').filter(line => /\[startup\].*(?:server-main\.module-evaluated|frontend-cache source=|phase pre-setup\.frontend-cache|server\.listening|phase http\.bootstrap)/.test(line));
            console.log(lines.slice(-15).join('\n') || '当前日志没有启动计时'); return;
        }
        default: throw new Error('Unknown runtime-tools command: ' + command);
    }
}

main().catch(error => { console.error('[atria-termux] ' + error.message); process.exitCode = 1; });
