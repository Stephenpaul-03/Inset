import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Adb } from '../../src/adb/adb';
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
    assert.equal(initial.pipeline.channel, 'local'); assert.equal(initial.pipeline.format, 'rgba');
    console.log('Packaged VSIX smoke check passed: activation, protocol loading, real frame rendering.');
    return;
  }
  const target = (await findEmulators()).find(t => t.serial === initial.selected)!;
  const adb = new Adb(() => ({}));
  try {
    // Settings provides a reproducible scroll workload. It does not change app data.
    await adb.run(['-s', target.serial, 'shell', 'am', 'start', '-a', 'android.settings.SETTINGS']);
    await sleep(1500);
    // Moves originate in the webview and traverse the production input channel.
    // Explicit warmup is handled by the benchmark; never filter low FPS samples.
    const measurement: any = await vscode.commands.executeCommand('portal.benchmark', true);
    const samples: any[] = measurement.samples;
    await fs.mkdir(path.join(extension.extensionPath, 'artifacts'), { recursive: true });
    await fs.writeFile(path.join(extension.extensionPath, 'artifacts/performance-0.1.1.json'), JSON.stringify(measurement, null, 2));
    assert.ok(samples.length >= 6, 'Need at least six post-warmup seconds');
    assert.ok(samples.every(d => d.pipeline.channel === 'local' && d.pipeline.format === 'rgba'), 'Use the production raw binary path');
    assert.ok(samples.every(d => d.performance.width * d.performance.height >= 580000), 'Stress the raw resolution cap, independently of the test window size');
    const meanFps = samples.reduce((sum, d) => sum + d.performance.fps, 0) / samples.length;
    assert.ok(meanFps >= 55, `All post-warmup samples must average >=55 FPS; measured ${meanFps.toFixed(1)}`);
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await waitFor(d => !d.visible);
    await vscode.commands.executeCommand('portal.open');
    await waitFor(d => d.status.state === 'connected' && d.visible);
    await vscode.commands.executeCommand('portal.refresh');
    await waitFor(d => d.status.state === 'connected' && d.native);
    const recoveryChecks = await verifyReconnect(extension.extensionPath, waitFor);
    await waitFor(d => d.status.state === 'connected' && d.status.message === target.name && d.native);
    const report = { initial, samples, meanFps, final: await diagnostics(), passed: ['activation', 'sidebar rendering', 'webview-originated drag workload (all samples after 2s warmup)', 'hide/resume', 'refresh', ...recoveryChecks] };
    await fs.mkdir(path.join(extension.extensionPath, 'artifacts'), { recursive: true });
    await fs.writeFile(path.join(extension.extensionPath, 'artifacts/extension-validation.json'), JSON.stringify(report, null, 2));
    console.log('Portal extension validation:', JSON.stringify(report));
  } finally {
    await adb.key(target.serial, 'back').catch(() => {});
  }
}
