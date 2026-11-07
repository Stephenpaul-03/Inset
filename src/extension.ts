import * as vscode from 'vscode';
import { EmulatorView } from './panel/EmulatorView';
import { InspectorPanel } from './inspector/InspectorPanel';
export function activate(context: vscode.ExtensionContext): void {
  const inspector = new InspectorPanel(context);
  const provider = new EmulatorView(context, () => inspector.open(true));
  const output = vscode.window.createOutputChannel('Inset');
  context.subscriptions.push(provider, output, inspector,
    inspector.onPickingChanged(value => provider.setInspectorPicking(value)),
    vscode.commands.registerCommand('inset.inspect', () => inspector.open()),
    vscode.commands.registerCommand('inset.pickComponent', () => inspector.open(true)),
    vscode.commands.registerCommand('inset.inspectorDiagnostics', () => inspector.diagnostics()),
    vscode.window.registerWebviewViewProvider('inset.emulator', provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('inset.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('inset.open', () => provider.openSidebar()),
    vscode.commands.registerCommand('inset.openEditor', () => provider.openEditor()),
    vscode.commands.registerCommand('inset.openSidebar', () => provider.openSidebar()),
    vscode.commands.registerCommand('inset.benchmark', async (stress = false) => {
      const report = await provider.benchmark(stress === true); output.appendLine(JSON.stringify(report, null, 2)); return report;
    }),
    vscode.commands.registerCommand('inset.diagnostics', () => {
      const diagnostics = provider.diagnostics();
      output.appendLine(JSON.stringify(diagnostics, null, 2));
      return diagnostics;
    }),
  );
}
