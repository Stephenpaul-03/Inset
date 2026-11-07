import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Adb } from '../../src/adb/adb';
import { findEmulators } from '../../src/discovery/running';
import { verifyReconnect } from './reconnect';
import { verifyInspector } from './inspector';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function diagnostics(): Promise<any> { return vscode.commands.executeCommand('inset.diagnostics'); }
async function waitFor(predicate: (d: any) => boolean, timeout = 15000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeout) { const d = await diagnostics(); if (predicate(d)) return d; await sleep(200); }
  throw new Error(`Timed out: ${JSON.stringify(await diagnostics())}`);
}
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('local.inset');
  assert.ok(extension); await extension.activate();
  await vscode.commands.executeCommand('inset.open');
  const initial = await waitFor(d => d.status.state === 'connected' && d.performance?.width > 0);
  if (process.env.INSET_PERFORMANCE_ONLY === '1') {
    const adb = new Adb(() => ({}));
    const reports: any[] = [];
    try {
      await adb.run(['-s', initial.selected, 'shell', 'am', 'start', '-a', 'android.settings.SETTINGS']);
      await sleep(1000);
      for (const mode of ['sidebar', 'editor']) {
        await vscode.commands.executeCommand(mode === 'editor' ? 'inset.openEditor' : 'inset.openSidebar');
        await waitFor(d => d.presentation === mode && d.performance?.width > 0 && d.pipeline.channel === 'local');
        const report: any = await vscode.commands.executeCommand('inset.benchmark', true);
        reports.push({ mode, ...report });
        console.log(mode, JSON.stringify(report.samples.map((d: any) => ({ fps: Math.round(d.performance.fps), source: d.pipeline.sourceFps, input: Math.round(d.performance.inputFps), raf: Math.round(d.performance.rafFps), gap: Math.round(d.performance.rafMaxGapMs), draw: d.performance.decodeMs, hidden: d.performance.documentHidden }))));
      }
    } finally {
      await fs.writeFile(path.join(__dirname, '../../../artifacts/drag-investigation.json'), JSON.stringify(reports, null, 2));
      await adb.key(initial.selected, 'back');
    }
    return;
  }
  if (process.env.INSET_INSPECTOR_SMOKE === '1') { await verifyInspector(); return; }
  const emulatorTabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs)
    .filter(tab => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('inset.editor'));
  await vscode.commands.executeCommand('inset.openEditor');
  const editor = await waitFor(d => d.presentation === 'editor' && d.performance?.width > 0 && d.pipeline.channel === 'local');
  assert.equal(editor.sessionId, initial.sessionId, 'Moving to editor must reuse the session');
  assert.equal(editor.selected, initial.selected);
  await vscode.commands.executeCommand('inset.openEditor');
  assert.equal(emulatorTabs().length, 1, 'Repeated open must reuse one editor tab');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const afterClose = await waitFor(d => d.presentation === 'sidebar' && !d.editorOpen && d.pipeline.channel === 'local' && d.performance?.width > 0);
  assert.equal(afterClose.sessionId, initial.sessionId, 'Closing editor returns to the visible sidebar without reconnecting');
  await vscode.commands.executeCommand('inset.openEditor');
  await waitFor(d => d.presentation === 'editor' && d.performance?.width > 0);
  await vscode.commands.executeCommand('inset.openSidebar');
  const returned = await waitFor(d => d.presentation === 'sidebar' && !d.editorOpen && d.pipeline.channel === 'local' && d.performance?.width > 0);
  assert.equal(returned.sessionId, initial.sessionId, 'Move to Sidebar must reuse the session');
  assert.equal(emulatorTabs().length, 0);
  if (process.env.INSET_PACKAGED_SMOKE === '1') {
    assert.ok(initial.native.width > 0 && initial.native.height > 0);
    assert.equal(initial.pipeline.channel, 'local'); assert.equal(initial.pipeline.format, 'rgba');
    console.log('Packaged VSIX smoke check passed: activation, raw rendering, editor reuse, and session-preserving sidebar/editor transitions.');
    return;
  }
  const target = (await findEmulators()).find(t => t.serial === initial.selected)!;
  const adb = new Adb(() => ({}));
  try {
    // Settings provides a reproducible scroll workload. It does not change app data.
    await adb.run(['-s', target.serial, 'shell', 'am', 'start', '-a', 'android.settings.SETTINGS']);
    await sleep(1500);
    await vscode.commands.executeCommand('inset.openEditor');
    await waitFor(d => d.presentation === 'editor' && d.performance?.width > 0 && d.pipeline.channel === 'local');
    const editorMeasurement: any = await vscode.commands.executeCommand('inset.benchmark', true);
    assert.ok(editorMeasurement.samples.length >= 6);
    const editorMeanFps = editorMeasurement.samples.reduce((sum: number, d: any) => sum + d.performance.fps, 0) / editorMeasurement.samples.length;
    assert.ok(editorMeanFps >= 55, `Editor drag benchmark averaged ${editorMeanFps.toFixed(1)} FPS`);
    assert.ok(editorMeasurement.samples.every((d: any) => d.presentation === 'editor' && d.sessionId === initial.sessionId));
    await vscode.commands.executeCommand('inset.openSidebar');
    await waitFor(d => d.presentation === 'sidebar' && d.performance?.width > 0 && d.pipeline.channel === 'local');
    // Moves originate in the webview and traverse the production input channel.
    // Explicit warmup is handled by the benchmark; never filter low FPS samples.
    const measurement: any = await vscode.commands.executeCommand('inset.benchmark', true);
    const samples: any[] = measurement.samples;
    await fs.mkdir(path.join(extension.extensionPath, 'artifacts'), { recursive: true });
    await fs.writeFile(path.join(extension.extensionPath, `artifacts/performance-${extension.packageJSON.version}.json`), JSON.stringify(measurement, null, 2));
    assert.ok(samples.length >= 6, 'Need at least six post-warmup seconds');
    assert.ok(samples.every(d => d.pipeline.channel === 'local' && d.pipeline.format === 'rgba'), 'Use the production raw binary path');
    assert.ok(samples.every(d => d.performance.width * d.performance.height >= 580000), 'Stress the raw resolution cap, independently of the test window size');
    const meanFps = samples.reduce((sum, d) => sum + d.performance.fps, 0) / samples.length;
    assert.ok(meanFps >= 55, `All post-warmup samples must average >=55 FPS; measured ${meanFps.toFixed(1)}`);
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await waitFor(d => !d.visible);
    await vscode.commands.executeCommand('inset.open');
    await waitFor(d => d.status.state === 'connected' && d.visible);
    await vscode.commands.executeCommand('inset.refresh');
    await waitFor(d => d.status.state === 'connected' && d.native);
    const recoveryChecks = await verifyReconnect(extension.extensionPath, waitFor);
    await waitFor(d => d.status.state === 'connected' && d.status.message === target.name && d.native);
    const report = { initial, editor, returned, editorMeasurement, editorMeanFps, samples, meanFps, final: await diagnostics(), passed: ['activation', 'compact sidebar rendering', 'single editor-tab reuse', 'session-preserving move and close', 'editor and sidebar drag workloads (all samples after 2s warmup)', 'hide/resume', 'refresh', ...recoveryChecks] };
    await fs.mkdir(path.join(extension.extensionPath, 'artifacts'), { recursive: true });
    await fs.writeFile(path.join(extension.extensionPath, 'artifacts/extension-validation.json'), JSON.stringify(report, null, 2));
    console.log('Inset extension validation:', JSON.stringify(report));
  } finally {
    await adb.key(target.serial, 'back').catch(() => {});
  }
}
