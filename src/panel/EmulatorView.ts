import * as vscode from 'vscode';
import { Adb } from '../adb/adb';
import { EmulatorTarget, findEmulators } from '../discovery/running';
import { EmulatorGrpcTransport, readableGrpcError } from '../transport/EmulatorGrpcTransport';
import type { Frame, TouchPoint } from '../transport/DeviceTransport';
import { LatestFrameQueue } from './LatestFrameQueue';
import { FrameChannel } from './FrameChannel';
import { webviewHtml } from './html';
import { keyboardMessage } from '../transport/keyboard';

type Presentation = 'sidebar' | 'editor';
interface Surface {
  kind: Presentation; host: vscode.WebviewView | vscode.WebviewPanel; ready: boolean; dead: boolean;
  channel?: FrameChannel; listeners: vscode.Disposable[];
  viewport: { width: number; height: number; dpr: number };
}

export class EmulatorView implements vscode.WebviewViewProvider, vscode.Disposable {
  private current?: Surface;
  private sidebar?: Surface;
  private editor?: Surface;
  private preferred: Presentation = 'sidebar';
  private inputGeneration = 0;
  private keyboardInputGeneration = 0;
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
  private received: number[] = [];
  private sent: number[] = [];
  private measurement?: { started: number; stress: boolean; samples: unknown[]; resolve: (report: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
  private readonly listeners: vscode.Disposable[] = [];
  private readonly adb = new Adb(() => ({ adbPath: this.config.get('adbPath'), sdkPath: this.config.get('sdkPath') }));
  private readonly queue = new LatestFrameQueue<Frame>((frame, id) => {
    this.sentId = id;
    this.sent.push(Date.now()); this.sent = this.sent.slice(-240);
    const generation = this.generation;
    if (this.channel?.connected) {
      if (!this.channel.send(frame, id)) this.queue.acknowledge(id);
    } else {
      const surface = this.current;
      // ArrayBuffer is supported by VS Code's binary webview message transport.
      const bytes = Uint8Array.from(frame.data).buffer;
      void this.view?.webview.postMessage({ type: 'frame', id, ...frame, data: undefined, bytes }).then(sent => {
        if (!sent && generation === this.generation && surface === this.current) this.queue.reset();
      });
    }
    clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(() => {
      if (generation === this.generation) { this.disconnect(); void this.scan(); }
    }, 5000);
  }, 3);
  private readonly poll: ReturnType<typeof setInterval>;

  private inspectorPicking = false;
  constructor(private readonly context: vscode.ExtensionContext, private readonly openInspector?: () => Promise<void>) {
    this.selected = context.workspaceState.get('inset.selectedDevice');
    this.poll = setInterval(() => { if (this.active) void this.scan(); }, 2000);
    this.listeners.push(vscode.workspace.onDidChangeConfiguration(event => {
      if (['adbPath', 'sdkPath', 'discoveryPath', 'lowBandwidth', 'showPerformance', 'streamMode'].some(key => event.affectsConfiguration(`inset.${key}`))) {
        this.disconnect(); this.adb.stop();
        if (this.active) { this.adb.track(() => { void this.scan(); }); void this.scan(); }
        this.sendConfig();
      }
    }));
  }
  private get config() { return vscode.workspace.getConfiguration('inset'); }
  private get view() { return this.current?.host; }
  private get channel() { return this.current?.channel; }
  private get ready() { return this.current?.ready; }
  private get active() { return !this.disposed && !!this.view?.visible && !!this.ready; }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.sidebar = this.createSurface(view, 'sidebar');
    this.reconcile();
  }
  async openEditor(): Promise<void> {
    this.preferred = 'editor';
    if (this.editor) {
      (this.editor.host as vscode.WebviewPanel).reveal(undefined, false);
    } else {
      const panel = vscode.window.createWebviewPanel('inset.editor', 'Emulator',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false }, { enableScripts: true, retainContextWhenHidden: true });
      panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media/inset.svg');
      this.editor = this.createSurface(panel, 'editor');
    }
    this.reconcile();
  }
  async openSidebar(): Promise<void> {
    this.preferred = 'sidebar';
    await vscode.commands.executeCommand('inset.emulator.focus');
    (this.editor?.host as vscode.WebviewPanel | undefined)?.dispose();
    this.reconcile();
  }
  private createSurface(host: vscode.WebviewView | vscode.WebviewPanel, kind: Presentation): Surface {
    const surface: Surface = { host, kind, ready: false, dead: false, listeners: [], viewport: { width: 350, height: 900, dpr: 2 } };
    host.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] };
    const channel = new FrameChannel(message => {
      if (surface === this.current && ['ack', 'pointer', 'performance', 'benchmarkDone', 'keyboard', 'text', 'paste', 'releaseKeys'].includes((message as any)?.type))
        void this.receive(message).catch(error => this.report(error));
    }, () => {
      if (surface !== this.current) return;
      this.queue.reset();
      if (this.lastFrame && this.active) this.queue.offer(this.lastFrame);
    });
    surface.channel = channel;
    surface.listeners.push(host.webview.onDidReceiveMessage(message => {
      if (message?.type === 'ready') {
        if (typeof message.origin === 'string' && message.origin.length < 512) surface.channel?.setOrigin(message.origin);
        surface.ready = true;
        this.sendSurfaceState(surface);
        if (surface === this.current) { void this.receive(message).catch(error => this.report(error)); }
      } else if (message?.type === 'button' && message.name === 'openSidebar') {
        void this.openSidebar().catch(error => this.report(error));
      } else if (message?.type === 'button' && message.name === 'openEditor') {
        void this.openEditor().catch(error => this.report(error));
      } else if (surface === this.current) {
        void this.receive(message).catch(error => this.report(error));
      }
    }));
    const visibility = () => this.reconcile();
    surface.listeners.push(kind === 'sidebar' ? (host as vscode.WebviewView).onDidChangeVisibility(visibility) :
      (host as vscode.WebviewPanel).onDidChangeViewState(visibility));
    surface.listeners.push(host.onDidDispose(() => {
      surface.dead = true; surface.listeners.forEach(listener => listener.dispose()); surface.channel?.dispose();
      if (this.sidebar === surface) this.sidebar = undefined;
      if (this.editor === surface) { this.editor = undefined; this.preferred = 'sidebar'; }
      if (this.current === surface) { this.current = undefined; this.queue.reset(); clearTimeout(this.ackTimer); }
      this.reconcile();
    }));
    void channel.start('').then(() => {
      if (surface.dead || this.disposed) { channel.dispose(); return; }
      host.webview.html = this.html(surface);
    }).catch(() => {
      channel.dispose(); surface.channel = undefined;
      if (!surface.dead && !this.disposed) host.webview.html = this.html(surface);
    });
    return surface;
  }
  private reconcile(): void {
    if (this.disposed) return;
    const surfaces = [this.sidebar, this.editor].filter((s): s is Surface => !!s && !s.dead);
    const next = surfaces.find(s => s.kind === this.preferred && s.host.visible) ||
      surfaces.find(s => s === this.current && s.host.visible) || surfaces.find(s => s.host.visible);
    if (!next) { this.disconnect(); this.adb.stop(); return; }
    if (next !== this.current) {
      ++this.inputGeneration;
      ++this.keyboardInputGeneration;
      if (this.measurement) {
        clearTimeout(this.measurement.timer); this.measurement.reject(new Error('Performance measurement interrupted by moving the view.')); this.measurement = undefined;
      }
      void this.transport?.releaseTouches().catch(() => {});
      void this.transport?.releaseKeys().catch(() => {});
      this.queue.reset(); clearTimeout(this.ackTimer); this.performance = undefined;
      this.current = next; this.viewport = next.viewport;
    }
    for (const surface of surfaces) this.sendSurfaceState(surface);
    this.updateViewport();
    if (this.active) {
      if (this.lastFrame) this.queue.offer(this.lastFrame);
      this.adb.track(() => { void this.scan(); }); void this.scan();
    }
  }
  private sendSurfaceState(surface: Surface): void {
    if (!surface.ready || surface.dead) return;
    const active = surface === this.current && surface.host.visible;
    void surface.host.webview.postMessage({ type: 'config', showStats: this.config.get('showPerformance', false),
      mode: surface.kind, active, inspectorPicking: this.inspectorPicking, frameChannel: active ? surface.channel?.endpoint : undefined });
    void surface.host.webview.postMessage({ type: 'status', ...this.status });
    void surface.host.webview.postMessage({ type: 'devices', devices: this.targets.map(({ serial, name }) => ({ serial, name })), selected: this.selected });
  }
  async refresh(): Promise<void> { this.disconnect(); await this.scan(); }
  setInspectorPicking(value: boolean): void { this.inspectorPicking = value; this.sendConfig(); }
  private post(message: unknown): void { void this.view?.webview.postMessage(message); }
  private setStatus(state: string, message: string): void {
    this.status = { state, message }; this.post({ type: 'status', ...this.status });
  }
  private report(error: unknown): void {
    this.post({ type: 'notice', message: error instanceof Error ? error.message : 'Operation failed. Refresh and try again.' });
  }
  private sendConfig(): void {
    for (const surface of [this.sidebar, this.editor]) if (surface) this.sendSurfaceState(surface);
  }

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
      this.received.push(Date.now()); this.received = this.received.slice(-240);
      if (this.status.state !== 'connected') this.setStatus('connected', target.name);
      if (this.editor && this.editor.host.title !== `${target.name} — Emulator`) this.editor.host.title = `${target.name} — Emulator`;
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
    if (this.measurement) {
      clearTimeout(this.measurement.timer); this.measurement.reject(new Error('Performance measurement interrupted by a connection change.')); this.measurement = undefined;
    }
    ++this.generation; ++this.inputGeneration; ++this.keyboardInputGeneration;
    clearTimeout(this.ackTimer);
    this.queue.reset(); this.lastFrame = undefined;
    this.performance = undefined;
    this.received = []; this.sent = [];
    this.transport?.stop(); this.transport = undefined; this.connectionKey = undefined;
    this.post({ type: 'reset' });
  }
  private updateViewport(): void {
    this.transport?.setMode(this.config.get<'smooth' | 'png'>('streamMode', 'smooth'));
    const viewport = this.measurement?.stress ? { width: 10000, height: 10000, dpr: 1 } : this.viewport;
    this.transport?.setViewport(viewport.width, viewport.height, viewport.dpr, this.config.get('lowBandwidth', false));
  }

  private async receive(message: any): Promise<void> {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      if (typeof message.origin === 'string' && message.origin.length < 512) this.channel?.setOrigin(message.origin);
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
        for (const key of ['rafFps', 'rafMaxGapMs', 'frameMaxGapMs', 'inputFps', 'documentHidden']) if (Number.isFinite(message[key])) this.performance[key] = message[key];
        const aligned = Number.isFinite(message.windowStart) && Number.isFinite(message.windowEnd) &&
          message.windowEnd > message.windowStart && message.windowEnd - message.windowStart <= 10000 &&
          Math.abs(Date.now() - message.windowEnd) <= 1000;
        const sourceFps = aligned ? this.received.filter(t => t >= message.windowStart && t < message.windowEnd).length *
          1000 / (message.windowEnd - message.windowStart) : this.received.filter(t => t >= Date.now() - 1000).length;
        this.post({ type: 'pipeline', reportId: message.reportId, sourceFps,
          channel: this.channel?.connected ? 'local' : 'bridge', format: this.lastFrame?.format || 'rgba' });
        if (this.measurement && Date.now() - this.measurement.started >= 2000) this.measurement.samples.push(this.diagnostics());
      }
    } else if (message.type === 'benchmarkDone' && this.measurement) {
      const measurement = this.measurement; this.measurement = undefined; clearTimeout(measurement.timer);
      this.updateViewport();
      measurement.resolve({ samples: measurement.samples, elapsedMs: Date.now() - measurement.started });
    } else if (message.type === 'ack' && Number.isSafeInteger(message.id)) {
      if (message.id === this.sentId) clearTimeout(this.ackTimer);
      this.queue.acknowledge(message.id);
    } else if (message.type === 'viewport') {
      if (![message.width, message.height, message.dpr].every(v => Number.isFinite(v) && v > 0)) return;
      this.viewport = { width: Math.min(message.width, 10000), height: Math.min(message.height, 10000), dpr: Math.min(message.dpr, 4) };
      if (this.current) this.current.viewport = this.viewport;
      this.updateViewport();
    } else if (message.type === 'selectDevice' && this.targets.some(t => t.serial === message.serial)) {
      this.selected = message.serial;
      await this.context.workspaceState.update('inset.selectedDevice', this.selected);
      this.disconnect(); await this.scan();
    } else if (message.type === 'pointer' && ['down', 'move', 'up'].includes(message.action)) {
      if (!Number.isFinite(message.x) || !Number.isFinite(message.y) || !Number.isInteger(message.id) || message.id < 0 || message.id > 9) return;
      const transport = this.transport;
      const generation = this.inputGeneration;
      if (!transport || (this.inputCount > 20 && message.action === 'move')) return;
      const point: TouchPoint = { x: message.x, y: message.y, id: message.id, down: message.action !== 'up' };
      ++this.inputCount;
      this.inputTail = this.inputTail.then(async () => {
        if (generation === this.inputGeneration) await transport.touch([point]);
      }).catch(error => { if (generation === this.inputGeneration) this.report(error); }).finally(() => { --this.inputCount; });
    } else if (['keyboard', 'text', 'paste', 'releaseKeys'].includes(message.type)) {
      const input = keyboardMessage(message), transport = this.transport, generation = this.inputGeneration;
      if (!input || !transport) return;
      if (input.type === 'releaseKeys') {
        ++this.keyboardInputGeneration;
        await transport.releaseKeys(); return;
      }
      const keyboardGeneration = this.keyboardInputGeneration;
      if (this.inputCount > 128 && !(input.type === 'keyboard' && input.action === 'up')) {
        this.report(new Error('Keyboard input is arriving too quickly. Try pasting a smaller block.')); return;
      }
      ++this.inputCount;
      this.inputTail = this.inputTail.then(async () => {
        if (generation !== this.inputGeneration || keyboardGeneration !== this.keyboardInputGeneration) return;
        if (input.type === 'keyboard') await transport.key(input);
        else if (input.type === 'paste') await transport.paste(input.text);
        else await transport.text(input.text);
      }).catch(error => { if (generation === this.inputGeneration) this.report(error); }).finally(() => { --this.inputCount; });
    } else if (message.type === 'button') {
      if (message.name === 'inspect') { await this.openInspector?.(); return; }
      if (message.name === 'openEditor') { await this.openEditor(); return; }
      if (message.name === 'openSidebar') { await this.openSidebar(); return; }
      if (message.name === 'refresh') { await this.refresh(); return; }
      if (message.name === 'settings') { await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:local.inset'); return; }
      if (!this.selected || !this.transport) return;
      if (message.name === 'rotate') await this.transport.rotate();
      else if (message.name === 'back' || message.name === 'home' || message.name === 'recents') await this.adb.key(this.selected, message.name);
    }
  }
  private sentId = 0;
  benchmark(stress = false): Promise<unknown> {
    if (!this.active || !this.lastFrame || this.measurement) return Promise.reject(new Error('Open a connected emulator with a long scrollable list before measuring performance.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.measurement = undefined; this.updateViewport(); reject(new Error(`Performance measurement timed out: ${JSON.stringify(this.diagnostics())}`)); }, 20000);
      this.measurement = { started: Date.now(), stress, samples: [], resolve, reject, timer };
      this.updateViewport();
      this.post({ type: 'benchmark', durationMs: 10000 });
    });
  }
  diagnostics() {
    return { presentation: this.current?.kind, sessionId: this.generation, editorOpen: !!this.editor,
      version: this.context.extension.packageJSON.version, status: this.status, visible: this.active, selected: this.selected,
      devices: this.targets.map(({ serial, name, grpcPort }) => ({ serial, name, grpcAvailable: !!grpcPort })),
      native: this.lastFrame ? { width: this.lastFrame.nativeWidth, height: this.lastFrame.nativeHeight } : undefined,
      performance: this.performance, pipeline: { channel: this.channel?.connected ? 'local' : 'bridge', format: this.lastFrame?.format,
        sourceFps: this.received.filter(t => t >= Date.now() - 1000).length, sentFps: this.sent.filter(t => t >= Date.now() - 1000).length } };
  }
  private html(surface: Surface): string {
    const webview = surface.host.webview;
    const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', name)).toString();
    return webviewHtml({ cspSource: webview.cspSource, connectOrigin: surface.channel?.cspOrigin,
      styleUri: asset('webview.css'), scriptUri: asset('webview.js'), mode: surface.kind });
  }
  dispose(): void {
    this.disposed = true; clearInterval(this.poll); this.disconnect(); this.adb.stop();
    for (const surface of [this.sidebar, this.editor]) { surface?.channel?.dispose(); surface?.listeners.forEach(listener => listener.dispose()); }
    (this.editor?.host as vscode.WebviewPanel | undefined)?.dispose(); this.listeners.forEach(s => s.dispose());
  }
}
