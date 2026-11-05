import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { Adb } from '../adb/adb';
import { EmulatorTarget, findEmulators } from '../discovery/running';
import { EmulatorGrpcTransport, readableGrpcError } from '../transport/EmulatorGrpcTransport';
import type { Frame, TouchPoint } from '../transport/DeviceTransport';
import { LatestFrameQueue } from './LatestFrameQueue';

export class EmulatorView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private ready = false;
  private disposed = false;
  private scanning = false;
  private rescan = false;
  private selected?: string;
  private targets: EmulatorTarget[] = [];
  private transport?: EmulatorGrpcTransport;
  private connectionKey?: string;
  private generation = 0;
  private status = { state: 'idle', message: 'Start an Android emulator in Android Studio.' };
  private viewport = { width: 350, height: 900, dpr: 2 };
  private ackTimer?: ReturnType<typeof setTimeout>;
  private lastFrame?: Frame;
  private inputTail = Promise.resolve();
  private inputCount = 0;
  private performance?: Record<string, number>;
  private readonly listeners: vscode.Disposable[] = [];
  private readonly adb = new Adb(() => ({ adbPath: this.config.get('adbPath'), sdkPath: this.config.get('sdkPath') }));
  private readonly queue = new LatestFrameQueue<Frame>((frame, id) => {
    this.sentId = id;
    const generation = this.generation;
    // ArrayBuffer is supported by VS Code's binary webview message transport.
    const bytes = Uint8Array.from(frame.data).buffer;
    void this.view?.webview.postMessage({ type: 'frame', id, ...frame, data: undefined, bytes }).then(sent => {
      if (!sent && generation === this.generation) this.queue.reset();
    });
    clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(() => {
      if (generation === this.generation) { this.disconnect(); void this.scan(); }
    }, 5000);
  });
  private readonly poll: ReturnType<typeof setInterval>;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.selected = context.workspaceState.get('portal.selectedDevice');
    this.poll = setInterval(() => { if (this.active) void this.scan(); }, 2000);
    this.listeners.push(vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('portal')) {
        this.disconnect(); this.adb.stop();
        if (this.active) { this.adb.track(() => { void this.scan(); }); void this.scan(); }
        this.sendConfig();
      }
    }));
  }
  private get config() { return vscode.workspace.getConfiguration('portal'); }
  private get active() { return !this.disposed && !!this.view?.visible && this.ready; }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view; this.ready = false;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] };
    view.webview.html = this.html(view.webview);
    const subscriptions = [
      view.webview.onDidReceiveMessage(message => { void this.receive(message).catch(error => this.report(error)); }),
      view.onDidChangeVisibility(() => {
        if (this.active) { this.adb.track(() => { void this.scan(); }); void this.scan(); }
        else { this.disconnect(); this.adb.stop(); }
      }),
    ];
    view.onDidDispose(() => {
      subscriptions.forEach(s => s.dispose());
      if (this.view === view) { this.disconnect(); this.adb.stop(); this.view = undefined; this.ready = false; }
    });
  }
  async refresh(): Promise<void> { this.disconnect(); await this.scan(); }
  private post(message: unknown): void { void this.view?.webview.postMessage(message); }
  private setStatus(state: string, message: string): void {
    this.status = { state, message }; this.post({ type: 'status', ...this.status });
  }
  private report(error: unknown): void {
    this.post({ type: 'notice', message: error instanceof Error ? error.message : 'Operation failed. Refresh and try again.' });
  }
  private sendConfig(): void { this.post({ type: 'config', showStats: this.config.get('showPerformance', true), lowBandwidth: this.config.get('lowBandwidth', false) }); }

  private async scan(): Promise<void> {
    if (!this.active) return;
    if (this.scanning) { this.rescan = true; return; }
    this.scanning = true;
    try {
      const discovered = await findEmulators(this.config.get('discoveryPath'));
      if (!this.active) return;
      let online: Map<string, string> | undefined;
      let adbError: unknown;
      try { online = await this.adb.devices(); } catch (error) { adbError = error; }
      if (!this.active) return;
      const bySerial = new Map(discovered.filter(t => !online || online.get(t.serial) === 'device').map(t => [t.serial, t]));
      for (const [serial, state] of online || []) if (state === 'device' && !bySerial.has(serial)) bySerial.set(serial, { serial, name: serial });
      this.targets = [...bySerial.values()];
      if (!this.selected) this.selected = this.targets.find(t => t.grpcPort)?.serial || this.targets[0]?.serial;
      this.post({ type: 'devices', devices: this.targets.map(t => ({ serial: t.serial, name: t.name })), selected: this.selected });
      const target = this.targets.find(t => t.serial === this.selected);
      if (!target) {
        this.disconnect();
        this.setStatus('waiting', this.selected ? 'Selected emulator is offline. Waiting for it to return, or choose another device.' : 'No running emulator. Start one in Android Studio.');
      } else if (!target.grpcPort) {
        this.disconnect(); this.setStatus('error', 'Emulator found, but it does not advertise gRPC. Check the discovery directory or update Android Emulator.');
      } else {
        const key = `${target.serial}:${target.grpcPort}:${target.token || ''}`;
        if (!this.transport || key !== this.connectionKey) await this.connect(target, key);
      }
      if (adbError) this.report(adbError);
    } catch (error) { this.report(error); }
    finally {
      this.scanning = false;
      if (this.rescan) { this.rescan = false; void this.scan(); }
    }
  }

  private async connect(target: EmulatorTarget, key: string): Promise<void> {
    this.disconnect();
    const generation = this.generation;
    const transport = new EmulatorGrpcTransport(vscode.Uri.joinPath(this.context.extensionUri, 'proto/emulator_controller.proto').fsPath);
    this.transport = transport; this.connectionKey = key;
    this.setStatus('connecting', `Connecting to ${target.name}…`);
    this.updateViewport();
    transport.onFrame(frame => {
      if (generation !== this.generation || !this.active) return;
      this.lastFrame = frame;
      if (this.status.state !== 'connected') this.setStatus('connected', target.name);
      this.queue.offer(frame);
    });
    transport.onSizeChange((width, height) => {
      if (generation === this.generation) this.post({ type: 'size', width, height });
    });
    transport.onError(error => {
      if (generation !== this.generation) return;
      this.disconnect(); this.setStatus('waiting', error.message);
    });
    try { await transport.start(target); }
    catch (error) {
      if (generation !== this.generation) return;
      this.disconnect();
      // Never expose gRPC details that could include credentials.
      this.setStatus('error', readableGrpcError(error).message);
    }
  }
  private disconnect(): void {
    ++this.generation;
    clearTimeout(this.ackTimer);
    this.queue.reset(); this.lastFrame = undefined;
    this.performance = undefined;
    this.transport?.stop(); this.transport = undefined; this.connectionKey = undefined;
    this.post({ type: 'reset' });
  }
  private updateViewport(): void {
    this.transport?.setViewport(this.viewport.width, this.viewport.height, this.viewport.dpr, this.config.get('lowBandwidth', false));
  }

  private async receive(message: any): Promise<void> {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      this.ready = true;
      this.queue.reset(); this.sendConfig();
      this.post({ type: 'status', ...this.status });
      if (this.lastFrame) this.queue.offer(this.lastFrame);
      if (this.active) { this.adb.track(() => { void this.scan(); }); await this.scan(); }
      return;
    }
    if (!this.active) return;
    if (message.type === 'performance') {
      if (['fps', 'decodeMs', 'ageMs', 'width', 'height'].every(k => Number.isFinite(message[k]) && message[k] >= 0)) {
        this.performance = Object.fromEntries(['fps', 'decodeMs', 'ageMs', 'width', 'height'].map(k => [k, message[k]]));
      }
    } else if (message.type === 'ack' && Number.isSafeInteger(message.id)) {
      if (message.id === this.sentId) clearTimeout(this.ackTimer);
      this.queue.acknowledge(message.id);
    } else if (message.type === 'viewport') {
      if (![message.width, message.height, message.dpr].every(v => Number.isFinite(v) && v > 0)) return;
      this.viewport = { width: Math.min(message.width, 10000), height: Math.min(message.height, 10000), dpr: Math.min(message.dpr, 4) };
      this.updateViewport();
    } else if (message.type === 'selectDevice' && this.targets.some(t => t.serial === message.serial)) {
      this.selected = message.serial;
      await this.context.workspaceState.update('portal.selectedDevice', this.selected);
      this.disconnect(); await this.scan();
    } else if (message.type === 'pointer' && ['down', 'move', 'up'].includes(message.action)) {
      if (!Number.isFinite(message.x) || !Number.isFinite(message.y) || !Number.isInteger(message.id) || message.id < 0 || message.id > 9) return;
      const transport = this.transport;
      const generation = this.generation;
      if (!transport || (this.inputCount > 20 && message.action === 'move')) return;
      const point: TouchPoint = { x: message.x, y: message.y, id: message.id, down: message.action !== 'up' };
      ++this.inputCount;
      this.inputTail = this.inputTail.then(async () => {
        if (generation === this.generation) await transport.touch([point]);
      }).catch(error => { if (generation === this.generation) this.report(error); }).finally(() => { --this.inputCount; });
    } else if (message.type === 'button') {
      if (message.name === 'refresh') { await this.refresh(); return; }
      if (message.name === 'settings') { await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:local.portal-emulator'); return; }
      if (!this.selected || !this.transport) return;
      if (message.name === 'rotate') await this.transport.rotate();
      else if (message.name === 'back' || message.name === 'home' || message.name === 'recents') await this.adb.key(this.selected, message.name);
    }
  }
  private sentId = 0;
  diagnostics() {
    return { status: this.status, visible: this.active, selected: this.selected,
      devices: this.targets.map(({ serial, name, grpcPort }) => ({ serial, name, grpcAvailable: !!grpcPort })),
      native: this.lastFrame ? { width: this.lastFrame.nativeWidth, height: this.lastFrame.nativeHeight } : undefined,
      performance: this.performance };
  }
  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(18).toString('base64');
    const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', name));
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <link rel="stylesheet" href="${asset('webview.css')}"><title>Portal Emulator</title></head>
      <body><header><label for="devices">Running emulator</label><div class="picker"><select id="devices" aria-label="Running emulator"></select><button data-button="refresh" title="Refresh connection" aria-label="Refresh connection">↻</button><button data-button="settings" title="Portal settings" aria-label="Portal settings">⚙</button></div></header>
      <div id="status" role="status">Start an Android emulator in Android Studio.</div><div id="notice" role="alert" hidden></div>
      <main id="stage"><canvas id="screen" tabindex="0" aria-label="Android emulator screen. Use pointer to tap or drag, wheel to scroll."></canvas><p id="empty">Your running Android emulator will appear here.</p></main>
      <nav aria-label="Emulator controls"><button data-button="back" title="Back">Back</button><button data-button="home" title="Home">Home</button><button data-button="recents" title="Recent apps">Recents</button><button data-button="rotate" title="Rotate device">Rotate</button></nav>
      <footer id="stats" aria-label="Rendering performance">Waiting for frames…</footer><script nonce="${nonce}" src="${asset('webview.js')}"></script></body></html>`;
  }
  dispose(): void {
    this.disposed = true; clearInterval(this.poll); this.disconnect(); this.adb.stop(); this.listeners.forEach(s => s.dispose());
  }
}
