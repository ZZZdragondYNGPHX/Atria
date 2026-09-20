// Run against a disposable Luker server. Restore changed JS to the integration
// baseline in browser responses only; never mutate the checkout or user data.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const base = process.env.WORKSPACE_BASELINE || 'be3a2f573d54a63182cf47ca8c2f145e2accc973';
const files = execFileSync('git', ['diff', base, '--name-only', '--diff-filter=MD', '--', 'public'], {encoding:'utf8'}).trim().split('\n').filter(path => path.endsWith('.js'));
const baseline = new Map(files.map(path => [path, execFileSync('git', ['show', `${base}:${path}`], {encoding:'utf8',maxBuffer:5000000})]));
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*.js*', route => {
        const path = 'public' + new URL(route.request().url()).pathname;
        const content = baseline.get(path);
        return content ? route.fulfill({contentType:'text/javascript',body:content}) : route.continue();
    });
    await page.goto(process.env.WORKSPACE_BASE_URL || 'http://127.0.0.1:8127/');
    await page.waitForTimeout(8000);
    console.log(JSON.stringify({baseline:base,errors,...await page.evaluate(() => ({ready:!!window.Luker?.getContext,text:document.body.innerText.slice(0,150)}))}));
} finally { await browser.close(); }
