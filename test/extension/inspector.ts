import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { Adb } from '../../src/adb/adb';
import fs from 'node:fs/promises';
import path from 'node:path';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate: (value: any) => boolean, timeout = 20000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await vscode.commands.executeCommand('portal.inspectorDiagnostics');
    if (predicate(value)) return value;
    await sleep(150);
  }
  throw new Error(`Inspector timed out: ${JSON.stringify(await vscode.commands.executeCommand('portal.inspectorDiagnostics'))}`);
}
export async function verifyInspector(): Promise<void> {
  const before: any = await vscode.commands.executeCommand('portal.diagnostics');
  await vscode.commands.executeCommand('portal.inspect');
  const connected = await waitFor(value => value.connected && value.components > 50);
  await vscode.commands.executeCommand('portal.inspect');
  const tabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('portal.inspector'));
  assert.equal(tabs().length, 1, 'The VS Code inspector must reuse one editor tab');
  await vscode.commands.executeCommand('portal.pickComponent');
  await waitFor(value => value.picking);
  await sleep(250);
  const adb = new Adb(() => ({}));
  await adb.run(['-s', before.selected, 'shell', 'input', 'tap', '540', '600']);
  const selected = await waitFor(value => !value.picking && value.selected?.id);
  assert.ok(selected.selected.name);
  const after: any = await vscode.commands.executeCommand('portal.diagnostics');
  assert.equal(after.sessionId, before.sessionId, 'Component inspection must not reconnect emulator streaming');
  assert.equal(after.status.state, 'connected');
  assert.equal(selected.error, '');
  await vscode.window.tabGroups.close(tabs());
  await waitFor(value => !value.connected && !value.picking);
  // RN 0.81 captures its overlay agent at mount. Reopening must reuse that
  // backend rather than leave the picker attached to an obsolete agent.
  await vscode.commands.executeCommand('portal.pickComponent');
  await waitFor(value => value.connected && value.components > 50 && value.picking);
  await sleep(250);
  await adb.run(['-s', before.selected, 'shell', 'input', 'tap', '540', '600']);
  await waitFor(value => !value.picking && value.selected?.id);
  if (process.env.PORTAL_INSPECTOR_PERFORMANCE === '1') {
    try {
      // Keep the inspector connected while the emulator renders a reproducible
      // list workload. This measures overhead with Tally in the background;
      // it does not claim to profile Tally's own React render performance.
      await adb.run(['-s', before.selected, 'shell', 'am', 'start', '-a', 'android.settings.SETTINGS']);
      await sleep(1000);
      const report: any = await vscode.commands.executeCommand('portal.benchmark', true);
      await fs.writeFile(path.join(__dirname, '../../../artifacts/inspector-drag.json'), JSON.stringify(report, null, 2));
      assert.ok(report.samples.length >= 6);
      const mean = report.samples.reduce((sum: number, sample: any) => sum + sample.performance.fps, 0) / report.samples.length;
      assert.ok(mean >= 55, `Inspector-connected drag benchmark averaged ${mean.toFixed(2)} FPS`);
      assert.ok(report.samples.every((sample: any) => sample.sessionId === before.sessionId && sample.pipeline.channel === 'local' && sample.pipeline.format === 'rgba'));
      console.log(`Inspector-connected Settings drag benchmark: ${mean.toFixed(2)} FPS across ${report.samples.length} unfiltered post-warmup samples.`);
    } finally { await adb.key(before.selected, 'back'); }
  }
  await vscode.window.tabGroups.close(tabs());
  await waitFor(value => !value.connected && !value.picking);
  console.log(`VS Code inspector passed: ${connected.components} real components, editor reuse, native selection, shared emulator session, close/reopen selection, cleanup.`);
}
