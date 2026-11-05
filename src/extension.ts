import * as vscode from 'vscode';
import { EmulatorView } from './panel/EmulatorView';
export function activate(context: vscode.ExtensionContext): void {
  const provider = new EmulatorView(context);
  const output = vscode.window.createOutputChannel('Portal');
  context.subscriptions.push(provider, output,
    vscode.window.registerWebviewViewProvider('portal.emulator', provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('portal.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('portal.open', () => vscode.commands.executeCommand('portal.emulator.focus')),
    vscode.commands.registerCommand('portal.diagnostics', () => {
      const diagnostics = provider.diagnostics();
      output.appendLine(JSON.stringify(diagnostics, null, 2));
      return diagnostics;
    }),
  );
}
