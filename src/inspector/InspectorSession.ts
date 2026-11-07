import { EventEmitter } from 'node:events';
import { CdpClient } from './CdpClient';
import { ComponentTree, ComponentNode } from './ComponentTree';
import { InspectorTarget, metroAddress } from './discovery';

const dispatcher = 'globalThis.__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__';
const binding = '__CHROME_DEVTOOLS_FRONTEND_BINDING__';
export interface SourceLocation { file: string; line: number; column: number }
export class InspectorSession extends EventEmitter {
  readonly tree = new ComponentTree();
  private cdp?: CdpClient;
  private requestID = 0;
  private selected?: ComponentNode;
  private scripts = new Map<string, string>();
  private initializing?: Promise<void>;
  private runtimeGeneration = 0;
  private disposed = false;
  private reloading = false;
  private treeTimer?: NodeJS.Timeout;
  private refreshTimer?: NodeJS.Timeout;
  private selectionTimer?: NodeJS.Timeout;
  private latestRequest = 0;
  private bridgeProtocol?: number;
  private inspected: any;
  private nativeStyleSupported = false;
  private validStyles: string[] | null = null;
  constructor(readonly target: InspectorTarget, private readonly metro: string) { super(); }
  async connect(): Promise<void> {
    const cdp = this.cdp = new CdpClient();
    cdp.on('closed', reason => { if (!this.disposed) this.emit('disconnected', reason); });
    cdp.on('notification', (method, params) => {
      if (method === 'Runtime.bindingCalled' && params.name === binding) {
        try { const data = JSON.parse(params.payload); if (data.domain === 'react-devtools') this.receive(data.message); }
        catch (error) { this.emit('problem', error); }
      } else if (method === 'Debugger.scriptParsed' && typeof params.url === 'string') this.scripts.set(params.scriptId, params.url);
      else if (method === 'Runtime.executionContextsCleared' || method === 'reload') {
        this.reset(); this.emit('loading');
      } else if (method === 'Runtime.executionContextCreated' && !this.initializing) {
        void this.initialize().catch(error => this.emit('problem', error));
      }
    });
    await cdp.connect(this.target.webSocketDebuggerUrl);
    // Suppress context-created initialization during Runtime.enable, which
    // synchronously replays existing contexts on Hermes.
    this.initializing = Promise.resolve();
    await cdp.request('Runtime.enable');
    await cdp.request('Debugger.enable');
    this.initializing = undefined;
    await this.initialize();
  }
  private initialize(): Promise<void> {
    if (this.initializing) return this.initializing;
    const generation = this.runtimeGeneration;
    const work = (async () => {
      const cdp = this.cdp!;
      await cdp.request('Runtime.addBinding', { name: binding });
      // A Hermes context can appear before the development bundle has installed
      // the dispatcher. Wait for setup on reload instead of declaring the app
      // unsupported merely because the first evaluation ran early.
      let supported = false;
      let reused = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (this.disposed || generation !== this.runtimeGeneration) return;
        const result = await cdp.evaluate(`(() => {
          const d = ${dispatcher}, h = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
          if (!d || !h) return null;
          if (h.reactDevtoolsAgent) {
            try { d.sendMessage('react-devtools', JSON.stringify({event:'getBridgeProtocol'})); return {reused:true}; } catch {}
          }
          d.initializeDomain('react-devtools'); return {reused:false};
        })()`);
        supported = !!result; reused = result?.reused === true;
        if (supported) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!supported) throw new Error('This app does not expose the React Native DevTools bridge. Use a development build with Hermes and React Native 0.76 or newer.');
      // RN reconnects its backend automatically when the CDP binding survives a
      // reload. Replacing that agent would strand AppContainer's native picker
      // on its old agent in RN 0.81. Reuse it and request a clean tree snapshot
      // through the supported filter-update operation (the Inset default).
      if (reused) {
        this.tree.clear();
        await this.send('updateComponentFilters', [{ type: 1, value: 7, isEnabled: true }]);
      }
      await this.send('getBridgeProtocol'); await this.send('getBackendVersion');
      this.reloading = false;
      this.emit('connected');
    })();
    this.initializing = work;
    void work.finally(() => { if (this.initializing === work) this.initializing = undefined; }).catch(() => {});
    return work;
  }
  private receive(message: any): void {
    if (!message || typeof message.event !== 'string') return;
    const { event, payload } = message;
    if (event === 'operations') {
      this.tree.apply(payload);
      if (!this.treeTimer) this.treeTimer = setTimeout(() => { this.treeTimer = undefined; this.emit('tree', this.tree.snapshot()); }, 100);
      if (this.selected && !this.tree.nodes.has(this.selected.id)) {
        this.selected = undefined; this.inspected = undefined; this.emit('selection', null);
      }
      if (this.selected && !this.selectionTimer) this.selectionTimer = setTimeout(() => {
        this.selectionTimer = undefined; void this.refreshSelection().catch(error => this.emit('problem', error));
      }, 500);
    } else if (event === 'bridgeProtocol') {
      this.bridgeProtocol = payload?.version;
      if (this.bridgeProtocol !== 2) this.emit('problem', new Error(`Unsupported React DevTools bridge version ${this.bridgeProtocol}. Inset currently supports bridge version 2.`));
    } else if (event === 'backendVersion') this.emit('version', payload);
    else if (event === 'selectElement' && Number.isSafeInteger(payload)) {
      void this.select(payload, false).catch(error => this.emit('problem', error));
    } else if (event === 'stopInspectingHost' || event === 'stopInspectingNative') this.emit('picking', false);
    else if (event === 'inspectedElement' && payload?.id === this.selected?.id && payload.responseID === this.latestRequest) {
      if (payload.type === 'full-data') { this.inspected = payload.value; this.emit('selection', { node: this.selected, value: payload.value }); }
      else if (payload.type === 'error') this.emit('problem', new Error(payload.message || 'React could not inspect this component.'));
      else if (payload.type === 'not-found') this.emit('selection', null);
      else if (payload.type === 'hydrated-path') this.emit('hydrated', payload);
    } else if (event === 'isNativeStyleEditorSupported') {
      this.nativeStyleSupported = payload?.isSupported === true;
      this.validStyles = Array.isArray(payload?.validAttributes) ? payload.validAttributes : null;
      this.emit('capabilities', { nativeStyle: this.nativeStyleSupported });
    } else if (event === 'NativeStyleEditor_styleAndLayout' && payload?.id === this.selected?.id) {
      if (!this.nativeStyleSupported) { this.nativeStyleSupported = true; this.emit('capabilities', { nativeStyle: true }); }
      this.emit('layout', payload);
    }
    else if (event === 'unsupportedRendererVersion') this.emit('problem', new Error('The app’s React renderer is unsupported by its DevTools backend.'));
  }
  private async send(event: string, payload?: unknown): Promise<void> {
    if (!this.cdp || this.disposed) throw new Error('Inspector is disconnected.');
    if (this.bridgeProtocol !== undefined && this.bridgeProtocol !== 2) throw new Error('Unsupported React DevTools bridge version.');
    const serialized = JSON.stringify({ event, payload });
    await this.cdp.evaluate(`${dispatcher}.sendMessage('react-devtools', ${JSON.stringify(serialized)})`);
  }
  async select(id: number, highlight = true): Promise<void> {
    const node = this.tree.nodes.get(id);
    if (!node) throw new Error('This component is no longer mounted.');
    if (!highlight && this.selected?.id === id) return;
    this.selected = node; this.inspected = undefined;
    this.emit('selection', { node, value: null });
    await this.refreshSelection();
    if (highlight) await this.send('highlightHostInstance', { id, rendererID: node.rendererID, displayName: node.name, hideAfterTimeout: true, openBuiltinElementsPanel: false, scrollIntoView: false });
  }
  async refreshSelection(path?: (string | number)[]): Promise<void> {
    if (!this.selected || this.reloading) return;
    const selected = this.selected, generation = this.runtimeGeneration;
    this.latestRequest = ++this.requestID;
    try {
      await this.send('inspectElement', { id: selected.id, rendererID: selected.rendererID, requestID: this.latestRequest, forceFullData: !path, path: path || null });
      if (generation === this.runtimeGeneration && !this.reloading) await this.send('NativeStyleEditor_measure', { id: selected.id, rendererID: selected.rendererID });
    } catch (error) { if (!this.disposed && !this.reloading && generation === this.runtimeGeneration) throw error; }
  }
  async pick(enabled: boolean): Promise<void> {
    await this.send(enabled ? 'startInspectingHost' : 'stopInspectingHost', false);
    this.emit('picking', enabled);
  }
  async reloadApp(): Promise<void> {
    if (!this.cdp) throw new Error('Inspector is disconnected.');
    this.reloading = true; clearTimeout(this.selectionTimer); this.selectionTimer = undefined;
    try { await this.cdp.request('Page.reload'); } catch (error) { this.reloading = false; throw error; }
  }
  async edit(id: number, type: string, path: (string | number)[], value: unknown, hookID?: number): Promise<void> {
    if (this.selected?.id !== id || !this.inspected) throw new Error('Select the component again before editing.');
    if (!['props', 'state', 'hooks', 'style'].includes(type) || (!path.length && type !== 'hooks') || path.length > 50 || path.some(key => typeof key !== 'string' && !Number.isSafeInteger(key)) || path.some(key => ['__proto__', 'constructor', 'prototype'].includes(String(key)))) throw new Error('Invalid property path.');
    if (type === 'hooks' && (!this.inspected.canEditHooks || !Number.isSafeInteger(hookID))) throw new Error('This hook cannot be edited.');
    if (type === 'props' && !this.inspected.canEditFunctionProps && this.inspected.type !== 1 && this.inspected.type !== 7) throw new Error('This component does not support editing props.');
    if (type === 'state' && this.inspected.type !== 1) throw new Error('Only class component state can be edited here.');
    if (type === 'style') {
      if (!this.nativeStyleSupported || path.length !== 1 || typeof path[0] !== 'string' || (this.validStyles && !this.validStyles.includes(path[0]))) throw new Error('This native style attribute cannot be edited.');
      await this.send('NativeStyleEditor_setValue', { id, rendererID: this.selected.rendererID, name: path[0], value });
    } else await this.send('overrideValueAtPath', { id, rendererID: this.selected.rendererID, type, path, value, hookID });
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => { void this.refreshSelection().catch(error => this.emit('problem', error)); }, 150);
  }
  async source(id: number): Promise<SourceLocation | undefined> {
    const node = this.tree.nodes.get(id);
    if (!node || !this.cdp) return;
    if (this.selected?.id === id && this.inspected?.source?.fileName) {
      const source = this.inspected.source;
      return { file: source.fileName, line: source.lineNumber || 1, column: source.columnNumber || 1 };
    }
    if (this.selected?.id === id && this.inspected?.source?.sourceURL) {
      const source = this.inspected.source;
      return this.symbolicate(source.sourceURL, source.line || 1, source.column || 0, node.name);
    }
    const hermes = await this.cdp.evaluate(`(() => { const fn = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__.rendererInterfaces.get(${node.rendererID})?.getElementSourceFunctionById(${id}); return typeof fn === 'function' && typeof globalThis.HermesInternal?.getFunctionLocation === 'function' ? globalThis.HermesInternal.getFunctionLocation(fn) : null; })()`);
    if (hermes?.fileName && Number.isFinite(hermes.lineNumber)) return this.symbolicate(hermes.fileName, hermes.lineNumber, Math.max(0, (hermes.columnNumber || 1) - 1), node.name);
    const fn = await this.cdp.evaluate(`globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__.rendererInterfaces.get(${node.rendererID})?.getElementSourceFunctionById(${id})`, false);
    if (!fn?.objectId) return;
    try {
      const properties = await this.cdp.request('Runtime.getProperties', { objectId: fn.objectId, ownProperties: true });
      const location = properties.internalProperties?.find((item: any) => item.name === '[[FunctionLocation]]')?.value?.value;
      const file = location && this.scripts.get(location.scriptId);
      if (!file) return;
      return this.symbolicate(file, location.lineNumber + 1, location.columnNumber, node.name);
    } finally { await this.cdp.request('Runtime.releaseObject', { objectId: fn.objectId }).catch(() => {}); }
  }
  private async symbolicate(file: string, lineNumber: number, column: number, name: string): Promise<SourceLocation | undefined> {
      const response = await fetch(new URL('/symbolicate', metroAddress(this.metro)), { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ stack: [{ file, methodName: name, lineNumber, column }] }) });
      if (!response.ok) return;
      const result = await response.json() as any;
      const frame = result.stack?.[0];
      if (typeof frame?.file === 'string') return { file: frame.file, line: frame.lineNumber || 1, column: (frame.column || 0) + 1 };
  }
  private reset(): void {
    ++this.runtimeGeneration; this.initializing = undefined;
    this.reloading = true;
    this.tree.clear(); this.scripts.clear(); this.selected = undefined; this.inspected = undefined;
    this.bridgeProtocol = undefined; this.nativeStyleSupported = false; this.validStyles = null;
    clearTimeout(this.treeTimer); this.treeTimer = undefined; clearTimeout(this.refreshTimer); clearTimeout(this.selectionTimer); this.selectionTimer = undefined;
    this.emit('tree', []); this.emit('selection', null); this.emit('picking', false);
  }
  async disconnect(): Promise<void> {
    if (!this.disposed) {
      await this.pick(false).catch(() => {});
      await this.send('clearHostInstanceHighlight').catch(() => {});
      // Leave the app's built-in agent available to AppContainer. Sending
      // shutdown breaks RN 0.81's picker after reconnect because its overlay
      // captures that agent at mount. Only the CDP connection belongs to Inset.
    }
    this.dispose();
  }
  dispose(): void {
    this.disposed = true; clearTimeout(this.treeTimer); clearTimeout(this.refreshTimer); clearTimeout(this.selectionTimer);
    this.cdp?.dispose(); this.cdp = undefined; this.tree.clear(); this.removeAllListeners();
  }
}
