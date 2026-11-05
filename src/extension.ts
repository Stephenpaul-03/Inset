import * as vscode from 'vscode';
import { EmulatorView } from './panel/EmulatorView';
import { InspectorPanel } from './inspector/InspectorPanel';
export function activate(context: vscode.ExtensionContext): void {
  const inspector = new InspectorPanel(context);
  const provider = new EmulatorView(context, () => inspector.open(true));
  const output = vscode.window.createOutputChannel('Portal');
  context.subscriptions.push(provider, output, inspector,
    inspector.onPickingChanged(value => provider.setInspectorPicking(value)),
    vscode.commands.registerCommand('portal.inspect', () => inspector.open()),
    vscode.commands.registerCommand('portal.pickComponent', () => inspector.open(true)),
    vscode.commands.registerCommand('portal.inspectorDiagnostics', () => inspector.diagnostics()),
    vscode.window.registerWebviewViewProvider('portal.emulator', provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('portal.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('portal.open', () => provider.openSidebar()),
    vscode.commands.registerCommand('portal.openEditor', () => provider.openEditor()),
    vscode.commands.registerCommand('portal.openSidebar', () => provider.openSidebar()),
    vscode.commands.registerCommand('portal.benchmark', async (stress = false) => {
      const report = await provider.benchmark(stress === true); output.appendLine(JSON.stringify(report, null, 2)); return report;
    }),
    vscode.commands.registerCommand('portal.diagnostics', () => {
      const diagnostics = provider.diagnostics();
      output.appendLine(JSON.stringify(diagnostics, null, 2));
      return diagnostics;
    }),
  );
}
