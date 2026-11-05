import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/media/webview.css"></head><body>
<header><label for="devices">Running emulator</label><div class="picker"><select id="devices"></select><button data-button="refresh">↻</button></div></header>
<div id="status"></div><div id="notice" hidden></div><main id="stage"><canvas id="screen"></canvas><p id="empty">Your running Android emulator will appear here.</p></main>
<nav><button data-button="back">Back</button><button data-button="home">Home</button><button data-button="recents">Recents</button><button data-button="rotate">Rotate</button></nav><footer id="stats"></footer>
<script>window.messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>messages.push(m)});</script><script src="/media/webview.js"></script></body></html>`;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    const files = { '/media/webview.js': ['media/webview.js', 'text/javascript'], '/media/webview.css': ['media/webview.css', 'text/css'], '/fixture.png': ['test/fixtures/screen.png', 'image/png'] };
    const file = files[req.url]; if (!file) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file[1]); res.end(await fs.readFile(path.join(root, file[0])));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 380, height: 900 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async () => {
    const image = await createImageBitmap(await (await fetch('/fixture.png')).blob());
    const c = document.createElement('canvas'); c.width = 540; c.height = 1200; c.getContext('2d').drawImage(image, 0, 0, 540, 1200); image.close();
    window.fixture = await (await new Promise(resolve => c.toBlob(resolve, 'image/png'))).arrayBuffer();
    window.postMessage({ type: 'devices', devices: [{ serial: 'emulator-5554', name: 'Resizable' }], selected: 'emulator-5554' });
    window.postMessage({ type: 'status', state: 'connected', message: 'Resizable' });
    window.postMessage({ type: 'frame', id: 1, bytes: fixture, nativeWidth: 1080, nativeHeight: 2400, arrivedAt: Date.now() });
  });
  await page.waitForSelector('canvas.live');
  const rect = await page.locator('canvas').boundingBox();
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  const points = await page.evaluate(() => messages.filter(m => m.type === 'pointer'));
  assert.equal(points[0].action, 'down'); assert.ok(Math.abs(points[0].x - 540) <= 1); assert.ok(Math.abs(points[0].y - 1200) <= 1);
  assert.equal(points.at(-1).action, 'up');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.wheel(0, 120); await page.waitForTimeout(250);
  assert.ok((await page.evaluate(() => messages.filter(m => m.type === 'pointer' && m.action === 'move').length)) >= 8);
  await page.mouse.down(); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up();
  assert.equal((await page.evaluate(() => messages.filter(m => m.type === 'pointer').at(-1))).action, 'up');
  await page.evaluate(() => window.postMessage({ type: 'frame', id: 2, bytes: new ArrayBuffer(1), nativeWidth: 1080, nativeHeight: 2400, arrivedAt: Date.now() }));
  await page.waitForFunction(() => messages.some(m => m.type === 'ack' && m.id === 2));
  await page.evaluate(() => window.postMessage({ type: 'frame', id: 3, bytes: fixture, nativeWidth: 1080, nativeHeight: 2400, arrivedAt: Date.now() }));
  await page.waitForFunction(() => messages.some(m => m.type === 'ack' && m.id === 3));
  await page.evaluate(() => window.postMessage({ type: 'notice', message: '' }));
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'artifacts/sidebar-preview.png') });
  await page.setViewportSize({ width: 240, height: 480 }); await page.waitForTimeout(250);
  const narrow = await page.locator('canvas').boundingBox();
  assert.ok(narrow.width <= 216 && narrow.height < 480);
  await page.evaluate(() => window.postMessage({ type: 'reset' })); await page.waitForSelector('canvas.live', { state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: PNG decode/recovery, native input mapping, wheel, release on blur, resize, reset.');
} finally { await browser.close(); server.close(); }
