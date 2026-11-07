import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

// CDP stays in the extension host. Webviews receive component data, never a
// debugger socket or an arbitrary JavaScript evaluation capability.
export class CdpClient extends EventEmitter {
  private socket?: WebSocket;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  async connect(url: string): Promise<void> {
    const socket = this.socket = new WebSocket(url, { handshakeTimeout: 5000, maxPayload: 16 * 1024 * 1024, perMessageDeflate: false });
    socket.on('message', bytes => {
      try {
        const message = JSON.parse(bytes.toString());
        if (typeof message.id === 'number') {
          const request = this.pending.get(message.id);
          if (!request) return;
          this.pending.delete(message.id); clearTimeout(request.timer);
          if (message.error) request.reject(new Error(message.error.message || 'Debugger request failed.'));
          else request.resolve(message.result);
        } else if (typeof message.method === 'string') this.emit('notification', message.method, message.params || {});
      } catch { /* Ignore invalid debugger frames. */ }
    });
    socket.on('error', () => { /* The open promise and close listener handle failure. */ });
    socket.on('close', (_code, reason) => {
      this.rejectPending();
      this.emit('closed', reason.toString());
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve); socket.once('error', reject);
      socket.once('close', () => reject(new Error('Debugger connection closed.')));
    });
  }
  request(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Inspector is disconnected.'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Debugger timed out: ${method}`)); }, 7000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify({ id, method, params }), error => {
        if (!error) return;
        clearTimeout(timer); this.pending.delete(id); reject(error);
      });
    });
  }
  async evaluate(expression: string, returnByValue = true): Promise<any> {
    const response = await this.request('Runtime.evaluate', { expression, returnByValue, objectGroup: 'inset-inspector', silent: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Runtime evaluation failed.');
    return returnByValue ? response.result?.value : response.result;
  }
  private rejectPending(): void {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Inspector is disconnected.')); }
    this.pending.clear();
  }
  dispose(): void { this.removeAllListeners(); this.rejectPending(); this.socket?.terminate(); this.socket = undefined; }
}
