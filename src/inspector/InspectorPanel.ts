import * as vscode from 'vscode';
import { InspectorSession } from './InspectorSession';
import { discoverTargets, InspectorTarget } from './discovery';
import { inspectorHtml } from './html';
import { resolveSourceFile } from './source';

export class InspectorPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private session?: InspectorSession;
  private targets: InspectorTarget[] = [];
  private lastTarget?: InspectorTarget;
  private retry?: NodeJS.Timeout;
  private connecting = false;
  private generation = 0;
  private stopped = true;
  private disposed = false;
  private picking = false;
  private model: Record<string, any> = { tree: [], selection: null, connected: false, status: 'Start Metro and open a development build to inspect components.' };
  private readonly pickingEmitter = new vscode.EventEmitter<boolean>();
  readonly onPickingChanged = this.pickingEmitter.event;
  constructor(private readonly context: vscode.ExtensionContext) {}
  private get metro(): string { return vscode.workspace.getConfiguration('inset').get('metroUrl', 'http://127.0.0.1:8081'); }
  async open(pick = false): Promise<void> {
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before connecting the React Native inspector.');
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const emulatorEditor = tab instanceof vscode.TabInputWebview && tab.viewType.includes('inset.editor');
    if (this.panel) this.panel.reveal(emulatorEditor && this.panel.viewColumn === vscode.window.tabGroups.activeTabGroup.viewColumn ? vscode.ViewColumn.Beside : undefined, true);
    else {
      const panel = this.panel = vscode.window.createWebviewPanel('inset.inspector', 'Inset: React Native Inspector', { viewColumn: emulatorEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active, preserveFocus: true }, {
        enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
      });
      const asset = (name: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', name)).toString();
      panel.webview.html = inspectorHtml({ cspSource: panel.webview.cspSource, styleUri: asset('inspector.css'), scriptUri: asset('inspector.js') });
      panel.webview.onDidReceiveMessage(message => { void this.receive(message).catch(error => this.problem(error)); });
      panel.onDidDispose(() => { this.panel = undefined; void this.disconnect(); });
    }
    if (!this.session && !this.connecting) {
      await this.refreshTargets();
      if (this.targets.length === 1) await this.connect(this.targets[0]);
      else if (this.targets.length > 1) {
        const choice = await vscode.window.showQuickPick(this.targets.map(target => ({ label: target.title, description: target.deviceName, detail: target.description, target })), { placeHolder: 'Choose the React Native app to inspect' });
        if (choice) await this.connect(choice.target);
      }
    }
    if (pick && this.session) await this.togglePick();
  }
  async togglePick(): Promise<void> {
    if (!this.session) { await this.open(true); return; }
    await this.session.pick(!this.picking);
  }
  private patch(update: Record<string, any>): void {
    Object.assign(this.model, update); void this.panel?.webview.postMessage({ type: 'update', ...update });
  }
  private setPicking(value: boolean): void { this.picking = value; this.patch({ picking: value }); this.pickingEmitter.fire(value); }
  private problem(error: unknown): void { this.patch({ error: error instanceof Error ? error.message : 'Inspector request failed.' }); }
  private async refreshTargets(): Promise<void> {
    try {
      this.targets = await discoverTargets(this.metro);
      this.patch({ targets: this.targets.map(({ id, title, deviceName }) => ({ id, title, deviceName })),
        ...(!this.session ? { status: this.targets.length ? 'Choose an app and connect.' : 'No React Native development app found. Start Metro and open the app in the emulator.' } : {}), error: '' });
    } catch (error) {
      this.targets = []; this.patch({ targets: [], status: 'Cannot reach Metro. Start your app’s development server, or set Inset: Metro URL.' }); this.problem(error);
    }
  }
  private async connect(target: InspectorTarget): Promise<void> {
    if (this.connecting || this.disposed || !this.panel) return;
    this.connecting = true; this.stopped = false; clearTimeout(this.retry);
    const generation = ++this.generation;
    const previous = this.session; this.session = undefined;
    await previous?.disconnect();
    if (generation !== this.generation || this.disposed || !this.panel) { this.connecting = false; return; }
    const session = new InspectorSession(target, this.metro); this.session = session; this.lastTarget = target;
    const current = () => generation === this.generation && this.session === session;
    this.patch({ connected: false, connecting: true, tree: [], selection: null, layout: null, version: '', capabilities: {}, targetId: target.id, error: '', status: `Connecting to ${target.title}…` });
    this.setPicking(false);
    session.on('tree', tree => { if (current()) this.patch({ tree }); });
    session.on('selection', selection => { if (current()) this.patch({ selection, layout: null }); });
    session.on('layout', layout => { if (current()) this.patch({ layout }); });
    session.on('hydrated', hydrated => { if (current()) void this.panel?.webview.postMessage({ ...hydrated, type: 'hydrated' }); });
    session.on('capabilities', capabilities => { if (current()) this.patch({ capabilities }); });
    session.on('version', version => { if (current()) this.patch({ version: `DevTools ${version}` }); });
    session.on('picking', value => { if (current()) this.setPicking(value); });
    session.on('connected', () => { if (current()) this.patch({ connected: true, connecting: false, error: '', status: `Connected · ${target.title}` }); });
    session.on('loading', () => { if (current()) { this.setPicking(false); this.patch({ connected: false, connecting: true, status: 'App is reloading…', capabilities: {} }); } });
    session.on('problem', error => { if (current()) this.problem(error); });
    session.on('disconnected', reason => {
      if (!current()) return;
      session.dispose(); this.session = undefined; this.setPicking(false);
      const takenOver = /NEW_DEBUGGER|another debugger/i.test(reason);
      if (takenOver) this.stopped = true;
      this.patch({ connected: false, connecting: false, tree: [], selection: null, layout: null, status: takenOver ? 'Another debugger took over. Click Connect to reconnect Inset.' : 'App disconnected. Waiting to reconnect…' });
      this.scheduleReconnect();
    });
    try { await session.connect(); }
    catch (error) {
      if (current()) { session.dispose(); this.session = undefined; this.patch({ connected: false, connecting: false, status: 'Inspector connection failed.' }); this.problem(error); this.scheduleReconnect(); }
    } finally { this.connecting = false; }
  }
  private scheduleReconnect(): void {
    clearTimeout(this.retry);
    if (this.stopped || this.disposed || !this.panel) return;
    this.retry = setTimeout(() => {
      void (async () => {
        try {
          const targets = await discoverTargets(this.metro);
          if (this.stopped || this.disposed || !this.panel) return;
          // Do not attach to a different app merely because it is the only one.
          const target = targets.find(item => item.id === this.lastTarget?.id) || targets.find(item => item.appId === this.lastTarget?.appId && item.deviceName === this.lastTarget?.deviceName && item.title === this.lastTarget?.title);
          if (target) { await this.connect(target); return; }
        } catch { /* Metro can be down during an app/server restart. */ }
        this.scheduleReconnect();
      })();
    }, 1500);
  }
  private async receive(message: any): Promise<void> {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') { void this.panel?.webview.postMessage({ type: 'update', ...this.model }); return; }
    if (message.type === 'refresh') { await this.refreshTargets(); return; }
    if (message.type === 'settings') { await vscode.commands.executeCommand('workbench.action.openSettings', 'inset.metroUrl'); return; }
    if (message.type === 'disconnect') { await this.disconnect(); return; }
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before using the inspector.');
    if (message.type === 'connect') {
      const target = this.targets.find(item => item.id === message.id);
      if (target) await this.connect(target);
      return;
    }
    if (!this.session) throw new Error('Connect to a React Native development app first.');
    if (message.type === 'pick') await this.togglePick();
    else if (message.type === 'reloadApp') await this.session.reloadApp();
    else if (message.type === 'select' && Number.isSafeInteger(message.id)) await this.session.select(message.id);
    else if (message.type === 'refreshSelection') await this.session.refreshSelection();
    else if (message.type === 'hydrate' && message.id === this.model.selection?.node.id && Array.isArray(message.path) && message.path.length <= 50 && message.path.every((part: unknown) => (typeof part === 'string' && !['__proto__', 'prototype', 'constructor'].includes(part)) || Number.isSafeInteger(part))) await this.session.refreshSelection(message.path);
    else if (message.type === 'edit' && typeof message.json === 'string' && message.json.length < 65536 && Array.isArray(message.path)) {
      await this.session.edit(message.id, message.section, message.path, JSON.parse(message.json), message.hookID);
    } else if (message.type === 'source' && Number.isSafeInteger(message.id)) await this.openSource(message.id);
  }
  private async openSource(id: number): Promise<void> {
    const node = this.session?.tree.nodes.get(id);
    if (!node) return;
    const source = await this.session?.source(id);
    const roots = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
    const file = source && await resolveSourceFile(source.file, roots);
    if (file && source) {
      const doc = await vscode.workspace.openTextDocument(file);
      const position = new vscode.Position(Math.max(0, Math.min(doc.lineCount - 1, source.line - 1)), Math.max(0, source.column - 1));
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, selection: new vscode.Range(position, position), preview: true });
      return;
    }
    // React 19 and host nodes sometimes have no source function. Offer a source
    // search instead of inventing a location from a component display name.
    this.patch({ error: 'Exact source is unavailable for this component. Search its name or select a parent component.' });
    await vscode.commands.executeCommand('workbench.action.findInFiles', { query: node.name.replace(/^(Memo|ForwardRef)\((.*)\)$/, '$2'), isRegex: false, triggerSearch: true });
  }
  private async disconnect(): Promise<void> {
    this.stopped = true; clearTimeout(this.retry); ++this.generation;
    const session = this.session; this.session = undefined; this.setPicking(false);
    this.patch({ connected: false, connecting: false, tree: [], selection: null, layout: null, capabilities: {}, status: 'Inspector disconnected.', version: '' });
    await session?.disconnect();
  }
  diagnostics() { return { connected: this.model.connected, status: this.model.status, components: this.session?.tree.nodes.size || 0, selected: this.model.selection?.node, picking: this.picking, version: this.model.version, error: this.model.error }; }
  dispose(): void { this.disposed = true; void this.disconnect(); this.panel?.dispose(); this.pickingEmitter.dispose(); }
}
