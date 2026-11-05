import { createServer, Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { Frame } from '../transport/DeviceTransport';

// Local-only binary transport. A per-view random capability and exact Origin
// check keep unrelated websites and other webviews out of the channel.
export class FrameChannel {
  private readonly server: Server = createServer((_req, res) => { res.writeHead(404); res.end(); });
  private readonly ws = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
  private readonly capability = `/${randomBytes(32).toString('hex')}`;
  private socket?: WebSocket;
  private origin = '';
  private port = 0;
  constructor(private readonly onMessage: (message: unknown) => void, private readonly onOpen: () => void) {
    this.server.on('upgrade', (request, socket, head) => {
      if (!this.origin || request.url !== this.capability || request.headers.origin !== this.origin || this.connected) {
        socket.destroy(); return;
      }
      this.ws.handleUpgrade(request, socket, head, ws => this.ws.emit('connection', ws));
    });
    this.ws.on('connection', (socket: WebSocket) => {
      this.socket = socket;
      socket.on('error', () => socket.terminate());
      socket.on('message', (bytes, binary) => {
        if (binary) return;
        try { this.onMessage(JSON.parse(bytes.toString())); } catch { /* Ignore malformed control messages. */ }
      });
      this.onOpen();
    });
  }
  async start(origin: string): Promise<void> {
    this.origin = origin;
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => { this.server.off('error', reject); resolve(); });
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Could not open the local frame channel.');
    this.port = address.port;
  }
  get endpoint(): string { return `ws://127.0.0.1:${this.port}${this.capability}`; }
  // Set from the webview's ready message over VS Code's trusted message bridge.
  // cspSource describes resource hosts; it is not the webview document Origin.
  setOrigin(origin: string): void { this.origin = origin; }
  get cspOrigin(): string { return `ws://127.0.0.1:${this.port}`; }
  get connected(): boolean { return this.socket?.readyState === WebSocket.OPEN; }
  send(frame: Frame, id: number): boolean {
    if (!this.connected || this.socket!.bufferedAmount > 12 * 1024 * 1024) return false;
    const header = Buffer.alloc(40);
    header.writeUInt32LE(0x5052544c, 0); // PRTL
    header.writeUInt32LE(id >>> 0, 4);
    header.writeUInt32LE(frame.width, 8); header.writeUInt32LE(frame.height, 12);
    header.writeUInt32LE(frame.nativeWidth, 16); header.writeUInt32LE(frame.nativeHeight, 20);
    header.writeDoubleLE(frame.arrivedAt, 24);
    header.writeUInt32LE(frame.format === 'rgba' ? 1 : 0, 32);
    const data = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    this.socket!.send(Buffer.concat([header, data]), { binary: true, compress: false }, () => {});
    return true;
  }
  dispose(): void {
    this.ws.clients.forEach(client => client.terminate());
    this.ws.close(); this.server.close();
  }
}
