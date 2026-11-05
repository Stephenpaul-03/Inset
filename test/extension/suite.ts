import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Adb } from '../../src/adb/adb';
import { EmulatorGrpcTransport } from '../../src/transport/EmulatorGrpcTransport';
import { findEmulators } from '../../src/discovery/running';
import { verifyReconnect } from './reconnect';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function diagnostics(): Promise<any> { return vscode.commands.executeCommand('portal.diagnostics'); }
async function waitFor(predicate: (d: any) => boolean, timeout = 15000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeout) { const d = await diagnostics(); if (predicate(d)) return d; await sleep(200); }
  throw new Error(`Timed out: ${JSON.stringify(await diagnostics())}`);
}
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('local.portal-emulator');
  assert.ok(extension); await extension.activate();
  await vscode.commands.executeCommand('portal.open');
  const initial = await waitFor(d => d.status.state === 'connected' && d.performance?.width > 0);
  if (process.env.PORTAL_PACKAGED_SMOKE === '1') {
    assert.ok(initial.native.width > 0 && initial.native.height > 0);
    console.log('Packaged VSIX smoke check passed: activation, protocol loading, real frame rendering.');
    return;
  }
  const target = (await findEmulators()).find(t => t.serial === initial.selected)!;
  const adb = new Adb(() => ({}));
  const transport = new EmulatorGrpcTransport(path.join(extension.extensionPath, 'proto/emulator_controller.proto'));
  const samples: any[] = [];
  try {
    await transport.start(target);
    // Settings provides a reproducible scroll workload. It does not change app data.
    await adb.run(['-s', target.serial, 'shell', 'am', 'start', '-a', 'android.settings.SETTINGS']);
    await sleep(1500);
    const { width: w, height: h } = initial.native;
    let direction = 1;
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const y1 = h * (direction > 0 ? .8 : .2), y2 = h * (direction > 0 ? .2 : .8);
      await transport.touch([{ id: 0, x: w / 2, y: y1, down: true }]);
      for (let i = 1; i <= 30; i++) {
        await transport.touch([{ id: 0, x: w / 2, y: y1 + (y2 - y1) * i / 30, down: true }]);
        await sleep(16);
      }
      await transport.touch([{ id: 0, x: w / 2, y: y2, down: false }]);
      samples.push(await diagnostics()); direction *= -1;
    }
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await waitFor(d => !d.visible);
    await vscode.commands.executeCommand('portal.open');
    await waitFor(d => d.status.state === 'connected' && d.visible);
    await vscode.commands.executeCommand('portal.refresh');
    await waitFor(d => d.status.state === 'connected' && d.native);
    const activeSamples = samples.filter(d => d.performance?.fps >= 50);
    assert.ok(activeSamples.length >= 3, 'Need sustained active-scrolling samples');
    assert.ok(activeSamples.reduce((sum, d) => sum + d.performance.fps, 0) / activeSamples.length >= 55, 'Active scrolling must draw at least 55 FPS');
    const recoveryChecks = await verifyReconnect(extension.extensionPath, waitFor);
    await waitFor(d => d.status.state === 'connected' && d.status.message === target.name && d.native);
    const report = { initial, samples, final: await diagnostics(), passed: ['activation', 'sidebar rendering', 'scrolling workload', 'hide/resume', 'refresh', ...recoveryChecks] };
    await fs.mkdir(path.join(extension.extensionPath, 'artifacts'), { recursive: true });
    await fs.writeFile(path.join(extension.extensionPath, 'artifacts/extension-validation.json'), JSON.stringify(report, null, 2));
    console.log('Portal extension validation:', JSON.stringify(report));
  } finally {
    transport.stop();
    await adb.key(target.serial, 'back').catch(() => {});
  }
}
