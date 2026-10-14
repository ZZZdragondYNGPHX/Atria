import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visual configuration fixture</title><style>body{margin:0;padding:16px;box-sizing:border-box}*{box-sizing:border-box}#app{max-width:460px}</style><div id="app"></div><script type="module">
import { mountVisualConfiguration } from '/scripts/native/visual-configuration-ui.js';
import { ILLUSTRATION_CSS } from '/scripts/native/illustration-ui.js';
const style=document.createElement('style');style.textContent=ILLUSTRATION_CSS;document.head.append(style);
window.requests=[];window.errors=[];
mountVisualConfiguration({document,parent:document.querySelector('#app'),connections:[{connectionProfileId:'conn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',providerAdapter:'provider.comfyui-image',displayName:'Local Comfy'}],
data:{targets:[],renderings:[],budget:{revision:null,value:{imageHour:2,imageDay:8,autoConcurrency:1,moneyDay:0,autoMoneyDay:0,plannerHour:8,plannerDay:24,plannerTokensDay:30000,currency:'USD'}}},
request:async(path,options)=>{window.requests.push({path,options});return{}},refresh:async()=>{},report:error=>window.errors.push(error.message)});
</script></html>`;
const server = http.createServer(async (req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return; }
    const target = path.resolve(root, '.' + decodeURIComponent(req.url));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { const content = await fs.readFile(target); res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(content); }
    catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
    for (const width of [1280, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: width === 390, hasTouch: width === 390 });
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        await page.getByText('图片目标、画风与预算').click();
        await page.getByLabel('服务连接').selectOption('conn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
        await page.getByLabel('目标名称').fill('Fixture workflow');
        await page.getByText('后端参数与工作流').click();
        await page.getByLabel('导入 ComfyUI API 工作流 JSON').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
            '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } }, '2': { class_type: 'SaveImage', inputs: { images: ['1', 0] } },
        })) });
        await page.getByText('添加输入绑定').click();
        await page.getByLabel('输出节点').selectOption('2');
        await page.getByText('保存图片目标').click();
        const result = await page.evaluate(() => ({ requests: window.requests, errors: window.errors, overflow: document.documentElement.scrollWidth > innerWidth }));
        if (result.errors.length || result.requests.length !== 1 || result.requests[0].options.body.value.workflow.bindings.length !== 1 || result.overflow) throw new Error(JSON.stringify({ width, result }));
        await page.screenshot({ path: path.join(os.tmpdir(), 'atria-s6-config-' + width + '.png'), fullPage: true });
        console.log(JSON.stringify({ width, workflowBindings: result.requests[0].options.body.value.workflow.bindings.length, overflow: result.overflow }));
        await page.close();
    }
} finally { await browser.close(); server.close(); }
