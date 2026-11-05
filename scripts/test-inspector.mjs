import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { inspectorHtml } from '../out/src/inspector/html.js';
import { InspectorSession } from '../out/src/inspector/InspectorSession.js';
import { discoverTargets } from '../out/src/inspector/discovery.js';
import { Adb } from '../out/src/adb/adb.js';

const root = path.resolve(import.meta.dirname, '..');
const live = process.argv.includes('--live');
const metro = process.env.PORTAL_METRO_URL || 'http://127.0.0.1:8081';
const messages = [], errors = [], problems = [];
let session, page, restore, phase = 'startup', closing = false;
const model = { targets: [{ id: 'fixture', title: 'Inspector fixture' }], tree: [], selection: null, connected: false, capabilities: {} };
const update = async patch => { Object.assign(model, patch); if (!closing && page && !page.isClosed()) await page.evaluate(data => window.postMessage({ type: 'update', ...data }), patch); };
const fixtureNodes = [
  { id: 1, type: 11, name: 'Root', parentID: 0, rendererID: 1, children: [2] },
  { id: 2, type: 5, name: 'Account', parentID: 1, rendererID: 1, children: [3], key: null },
  { id: 3, type: 7, name: 'Text', parentID: 2, rendererID: 1, children: [], key: null },
];
const fixtureValue = { type: 5, canEditFunctionProps: true, canEditHooks: true,
  props: { data: { title: 'Account', unsafeText: '<img src=x onerror=alert(1)>', nested: { type: 'object', name: 'Object', preview_short: '{…}' } }, cleaned: [['nested']], unserializable: [] },
  hooks: { data: [{ id: 0, name: 'State', isStateEditable: true, value: 1, subHooks: [] }], cleaned: [], unserializable: [] },
};
async function receive(message) {
  messages.push(message);
  if (message.type === 'ready') { await update(model); return; }
  if (!session) {
    if (message.type === 'select') await update({ selection: { node: fixtureNodes.find(node => node.id === message.id), value: fixtureValue } });
    if (message.type === 'hydrate') await page.evaluate(data => window.postMessage(data), { type: 'hydrated', id: 2, path: message.path, value: { data: { width: 42 }, cleaned: [], unserializable: [] } });
    return;
  }
  try {
    if (message.type === 'select') await session.select(message.id);
    else if (message.type === 'pick') await session.pick(!model.picking);
    else if (message.type === 'reloadApp') await session.reloadApp();
    else if (message.type === 'refreshSelection') await session.refreshSelection();
    else if (message.type === 'hydrate') await session.refreshSelection(message.path);
    else if (message.type === 'edit') await session.edit(message.id, message.section, message.path, JSON.parse(message.json), message.hookID);
  } catch (error) { problems.push(error.message); await update({ error: error.message }); }
}
const server = http.createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(inspectorHtml({ cspSource: `http://127.0.0.1:${server.address().port}`, styleUri: '/inspector.css', scriptUri: '/inspector.js' })); return; }
  const file = { '/inspector.css': 'text/css', '/inspector.js': 'text/javascript' }[req.url];
  if (!file) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file); res.end(await fs.readFile(path.join(root, 'media', req.url.slice(1))));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  page = await browser.newPage({ viewport: { width: 1120, height: 760 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('portalMessage', receive);
  await page.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage: message => { void window.portalMessage(message); } }); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  if (live) {
    let target;
    for (let attempt = 0; attempt < 40 && !target; attempt++) {
      target = (await discoverTargets(metro)).find(target => target.appId === 'com.stephenpaul.tally');
      if (!target) await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(target, 'Open Tally’s development build against Metro first');
    session = new InspectorSession(target, metro);
    session.on('problem', error => problems.push(error.message));
    for (const [event, key] of [['tree', 'tree'], ['selection', 'selection'], ['layout', 'layout'], ['capabilities', 'capabilities'], ['picking', 'picking'], ['version', 'version']]) session.on(event, value => { void update({ [key]: value }); });
    session.on('hydrated', value => { void page.evaluate(data => window.postMessage(data), { ...value, type: 'hydrated' }); });
    session.on('connected', () => { void update({ connected: true, status: 'Connected · Tally' }); });
    session.on('loading', () => { void update({ tree: [], selection: null, status: 'Reloading…' }); });
    phase = 'connect'; await session.connect();
    // Start from a fresh development runtime; prior exploratory debugger
    // sessions may have shut down RN's mount-time overlay agent.
    await session.reloadApp();
    await page.waitForFunction(() => parseInt(document.querySelector('#count').textContent, 10) > 50, undefined, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('.tree-row').length > 2);
    assert.ok(session.tree.nodes.size > 50);
    const app = session.tree.snapshot().find(node => node.name === 'Forget(App)' || node.name === 'App');
    assert.ok(app);
    phase = 'component selection and source'; await page.locator('#search').fill(app.name);
    await page.locator(`[data-id="${app.id}"]`).click();
    await page.waitForFunction(id => document.querySelector('#name').textContent.includes('App') && !document.querySelector('#details').hidden, app.id);
    const source = await session.source(app.id);
    assert.ok(source?.file.endsWith('/Tally/App.tsx'), 'Component function must map back to Tally/App.tsx');
    assert.ok(source.line > 0);
    // Find an existing literal Text prop. Change only the ephemeral render value,
    // then restore it; never alter app storage or source files.
    phase = 'find editable Text'; let textNode, original;
    for (const node of session.tree.snapshot().filter(node => /Text/.test(node.name)).slice(0, 40)) {
      await session.select(node.id, false);
      for (let i = 0; i < 50 && !model.selection?.value; i++) await new Promise(resolve => setTimeout(resolve, 20));
      const value = model.selection?.node.id === node.id && model.selection.value?.props?.data?.children;
      if (typeof value === 'string' && value.length > 0 && value.length < 100) { textNode = node; original = value; break; }
    }
    assert.ok(textNode, 'Need a rendered Text component for live edit validation');
    restore = async () => { await session.select(textNode.id, false); await new Promise(resolve => setTimeout(resolve, 100)); await session.edit(textNode.id, 'props', ['children'], original); };
    phase = 'live Text edit'; await page.locator('#search').fill('Text');
    await page.locator(`[data-id="${textNode.id}"]`).click();
    await page.waitForFunction(id => document.querySelector(`[data-id="${id}"]`)?.getAttribute('aria-selected') === 'true' && !document.querySelector('#details').hidden, textNode.id);
    const row = page.locator('#props > .property').filter({ has: page.locator('.property-label', { hasText: /^children:$/ }) }).first();
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await row.locator('textarea').fill(JSON.stringify(`${original} [Portal check]`));
    await row.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#props').textContent.includes('[Portal check]'));
    await restore(); restore = undefined;
    await page.waitForFunction(() => !document.querySelector('#props').textContent.includes('[Portal check]'));
    phase = 'native picking'; await page.locator('#pick').click();
    await page.waitForFunction(() => document.querySelector('#pick').getAttribute('aria-pressed') === 'true');
    // Bridge acknowledgment precedes React's native overlay commit.
    await new Promise(resolve => setTimeout(resolve, 250));
    const adb = new Adb(() => ({}));
    await adb.run(['-s', 'emulator-5554', 'shell', 'input', 'tap', '540', '600']);
    await page.waitForFunction(() => document.querySelector('#pick').getAttribute('aria-pressed') === 'false');
    assert.ok(model.selection?.node.id, 'Native overlay must select a real React component');
    // A normal development reload must rebuild the tree without reconnecting the
    // emulator transport or requiring application instrumentation.
    phase = 'reload'; const before = session.tree.snapshot()[0]?.id;
    let reloadObserved = false;
    session.once('loading', () => { reloadObserved = true; });
    await page.locator('#reload-app').click();
    for (let i = 0; i < 100 && !reloadObserved; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(reloadObserved, 'Reload must clear the old runtime');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Connected') && parseInt(document.querySelector('#count').textContent, 10) > 50, undefined, { timeout: 20000 });
    assert.ok(session.tree.nodes.size > 50);
    await page.locator('#search').fill('App');
    await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts/inspector-live.png') });
    console.log(JSON.stringify({ passed: ['Metro discovery', 'real component tree', 'production webview selection', 'props and hooks', 'source maps to Tally/App.tsx', 'live Text edit and restoration', 'native overlay picking', 'app reload recovery'], components: session.tree.nodes.size, source, beforeRoot: before }));
  } else {
    await update({ connected: true, status: 'Connected · fixture', tree: fixtureNodes, capabilities: { nativeStyle: true } });
    await page.locator('[data-id="2"]').click();
    await page.waitForSelector('#details:not([hidden])');
    assert.equal(await page.locator('#props img').count(), 0, 'App values must render as text, never HTML');
    const title = page.locator('#props > .property').first();
    await title.getByRole('button', { name: 'Edit', exact: true }).click();
    await title.locator('textarea').fill('invalid-json'); await title.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.equal(messages.filter(message => message.type === 'edit').length, 0);
    await title.locator('textarea').fill('"Updated"'); await title.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.deepEqual(messages.find(message => message.type === 'edit'), { type: 'edit', id: 2, section: 'props', path: ['title'], json: '"Updated"', hookID: undefined });
    await page.locator('#props').getByRole('button', { name: 'Expand', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#props').textContent.includes('42'));
    await page.getByRole('button', { name: 'Open source', exact: true }).click();
    assert.ok(messages.some(message => message.type === 'source' && message.id === 2));
    await page.locator('#search').fill('Text'); assert.equal(await page.locator('.tree-row').count(), 2);
    await page.setViewportSize({ width: 420, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts/inspector-preview.png') });
    console.log('Inspector webview passed: tree/filter, safe app-value rendering, JSON validation, edits, nested hydration, source action and narrow layout.');
  }
  assert.deepEqual(errors, []); assert.deepEqual(problems, []);
} catch (error) {
  console.error('Inspector validation diagnostics:', JSON.stringify({ phase, components: session?.tree.nodes.size, selected: model.selection?.node?.name, picking: model.picking, problems, errors }));
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(root, 'artifacts/inspector-test-failure.png') }).catch(() => {});
  throw error;
} finally {
  closing = true;
  await restore?.().catch(error => console.error('Could not restore live Text prop:', error.message));
  await session?.disconnect(); await browser.close(); await new Promise(resolve => server.close(resolve));
}
