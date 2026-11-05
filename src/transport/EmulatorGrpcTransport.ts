import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import type { EmulatorTarget } from '../discovery/running';
import type { DeviceTransport, Frame, TouchPoint } from './DeviceTransport';
import { requestSize, clampCoordinate } from './geometry';

interface Image {
  image: Buffer;
  format: { width: number; height: number; rotation?: { rotation: string; xAxis: number; yAxis: number; zAxis: number }; displayMode?: string; foldedDisplay?: { width: number; height: number } };
}
type RpcClient = grpc.Client & Record<string, (...args: any[]) => any>;

export function readableGrpcError(error: unknown): Error {
  const e = error as grpc.ServiceError;
  if (e.code === grpc.status.UNAUTHENTICATED || e.code === grpc.status.PERMISSION_DENIED)
    return new Error('Emulator authentication failed. Refresh to discover its current token, or restart the emulator.');
  if (e.code === grpc.status.UNAVAILABLE) return new Error('Emulator connection lost. Waiting for it to return…');
  if (e.code === grpc.status.UNIMPLEMENTED) return new Error('This emulator does not support the required gRPC API. Update Android Emulator in Android Studio.');
  return new Error(`Emulator request failed (${e.code ?? 'unknown'}). Refresh or restart the emulator.`);
}

export class EmulatorGrpcTransport implements DeviceTransport {
  private client?: RpcClient;
  private metadata = new grpc.Metadata();
  private stream?: grpc.ClientReadableStream<Image>;
  private poll?: ReturnType<typeof setInterval>;
  private generation = 0;
  private streamGeneration = 0;
  private native = { width: 0, height: 0 };
  private viewport = { width: 350, height: 900, dpr: 2, low: false };
  private signature = '';
  private displaySignature = '';
  private syncing = false;
  private failed = false;
  private checking = false;
  private mode: 'smooth' | 'png' = 'smooth';
  private activeTouches = new Map<number, TouchPoint>();
  private frameCallback: (frame: Frame) => void = () => {};
  private sizeCallback: (w: number, h: number) => void = () => {};
  private errorCallback: (error: Error) => void = () => {};
  constructor(private readonly protoPath: string) {}
  onFrame(cb: (frame: Frame) => void): void { this.frameCallback = cb; }
  onSizeChange(cb: (w: number, h: number) => void): void { this.sizeCallback = cb; }
  onError(cb: (error: Error) => void): void { this.errorCallback = cb; }

  async start(target: EmulatorTarget): Promise<void> {
    this.stop();
    if (!target.grpcPort) throw new Error('This emulator does not advertise gRPC. Start it from Android Studio using a recent Android Emulator.');
    const generation = this.generation;
    const definition = protoLoader.loadSync(this.protoPath, { longs: String, enums: String, defaults: true, oneofs: true });
    const pkg = grpc.loadPackageDefinition(definition) as any;
    this.client = new pkg.android.emulation.control.EmulatorController(`127.0.0.1:${target.grpcPort}`, grpc.credentials.createInsecure(), {
      'grpc.max_receive_message_length': 64 * 1024 * 1024,
      'grpc.max_send_message_length': 1024 * 1024,
    });
    this.metadata = new grpc.Metadata();
    if (target.token) this.metadata.set('authorization', `Bearer ${target.token}`);
    await this.call('getStatus', {});
    if (generation !== this.generation) return;
    await this.syncNative(generation);
    if (generation !== this.generation) return;
    if (!this.native.width) throw new Error('Emulator display is not ready.');
    this.openStream();
    this.poll = setInterval(() => { void this.checkDisplay(generation); }, 1500);
  }

  private call<T = any>(method: string, request: unknown): Promise<T> {
    const client = this.client;
    if (!client) return Promise.reject(new Error('Emulator is disconnected.'));
    return new Promise((resolve, reject) => client[method](request, this.metadata, { deadline: Date.now() + 4000 },
      (error: grpc.ServiceError | null, reply: T) => error ? reject(error) : resolve(reply)));
  }

  private imageSignature(image: Image): string {
    const f = image.format;
    return `${f.rotation?.rotation}:${f.displayMode}:${f.foldedDisplay?.width}:${f.foldedDisplay?.height}`;
  }

  private async syncNative(generation: number): Promise<void> {
    if (this.syncing || !this.client) return;
    this.syncing = true;
    try {
      // Only request a full frame at attachment or when display geometry changes.
      const image = await this.call<Image>('getScreenshot', { format: 'RGBA8888' });
      if (generation !== this.generation) return;
      const { width, height } = image.format;
      // Resizable AVDs briefly return empty frames while switching modes.
      // Keep the old signature so the next real frame retries synchronization.
      if (!width || !height || !image.image.length) return;
      this.signature = this.imageSignature(image);
      const changed = width !== this.native.width || height !== this.native.height;
      this.native = { width, height };
      if (changed) this.sizeCallback(width, height);
    } finally { if (generation === this.generation) this.syncing = false; }
  }

  private async checkDisplay(generation: number): Promise<void> {
    if (this.syncing || this.checking || generation !== this.generation) return;
    this.checking = true;
    try {
      const response = await this.call('getDisplayConfigurations', {});
      if (generation !== this.generation) return;
      const primary = response.displays?.find((d: any) => d.display === 0);
      const signature = JSON.stringify(primary);
      if (this.displaySignature && signature !== this.displaySignature) {
        await this.syncNative(generation);
        if (generation === this.generation) this.openStream();
      }
      this.displaySignature = signature;
    } catch (error) {
      if (generation !== this.generation) return;
      // Older AVDs may lack multi-display APIs. A lightweight status RPC also
      // detects a closed emulator while its screenshot stream is idle.
      if ((error as grpc.ServiceError).code === grpc.status.FAILED_PRECONDITION || (error as grpc.ServiceError).code === grpc.status.UNIMPLEMENTED) {
        try { await this.call('getStatus', {}); } catch (e) { if (generation === this.generation) this.fail(e); }
      } else this.fail(error);
    } finally { if (generation === this.generation) this.checking = false; }
  }

  setViewport(width: number, height: number, dpr: number, lowBandwidth: boolean): void {
    const previous = this.requestedSize();
    const previousFormat = this.format;
    this.viewport = { width, height, dpr, low: lowBandwidth };
    const next = this.requestedSize();
    if (this.stream && (previous.width !== next.width || previous.height !== next.height || previousFormat !== this.format)) this.openStream();
  }
  setMode(mode: 'smooth' | 'png'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.stream) this.openStream();
  }
  private get format(): 'RGBA8888' | 'PNG' { return this.mode === 'smooth' && !this.viewport.low ? 'RGBA8888' : 'PNG'; }
  private requestedSize() {
    return requestSize(this.native.width || 1080, this.native.height || 2400, this.viewport.width, this.viewport.height, this.viewport.dpr, this.viewport.low,
      this.format === 'RGBA8888' ? 600000 : 400000);
  }
  private openStream(): void {
    if (!this.client || !this.native.width || this.failed) return;
    const streamGeneration = ++this.streamGeneration;
    this.stream?.cancel();
    const generation = this.generation;
    const format = this.format;
    const stream = this.client.streamScreenshot({ format, ...this.requestedSize() }, this.metadata) as grpc.ClientReadableStream<Image>;
    this.stream = stream;
    stream.on('data', (image: Image) => {
      if (generation !== this.generation || streamGeneration !== this.streamGeneration || this.syncing) return;
      const { width, height } = image.format;
      if (!image.image.length || !width || !height) return;
      if (format === 'RGBA8888' && image.image.length !== width * height * 4) { this.fail({ code: grpc.status.DATA_LOSS }); return; }
      const ratioChanged = Math.abs(width / height - this.native.width / this.native.height) > 0.01;
      if (this.imageSignature(image) !== this.signature || ratioChanged) {
        void this.syncNative(generation).then(() => { if (generation === this.generation) this.openStream(); })
          .catch(error => { if (generation === this.generation) this.fail(error); });
        return;
      }
      this.frameCallback({ width, height, nativeWidth: this.native.width, nativeHeight: this.native.height,
        data: image.image, format: format === 'RGBA8888' ? 'rgba' : 'png', arrivedAt: Date.now() });
    });
    stream.on('error', (error: grpc.ServiceError) => {
      if (generation === this.generation && streamGeneration === this.streamGeneration && error.code !== grpc.status.CANCELLED) this.fail(error);
    });
    stream.on('end', () => {
      if (generation === this.generation && streamGeneration === this.streamGeneration) this.fail({ code: grpc.status.UNAVAILABLE });
    });
  }
  private fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    this.errorCallback(readableGrpcError(error));
  }
  async touch(points: TouchPoint[]): Promise<void> {
    if (!this.native.width || this.syncing) return;
    for (const point of points) {
      if (point.down) this.activeTouches.set(point.id, point);
      else this.activeTouches.delete(point.id);
    }
    await this.call('sendTouch', { touches: points.map(p => ({
      x: clampCoordinate(p.x, this.native.width), y: clampCoordinate(p.y, this.native.height),
      identifier: p.id, pressure: p.down ? 1024 : 0,
    })) });
  }
  async rotate(): Promise<void> {
    const state = await this.call('getPhysicalModel', { target: 'ROTATION' });
    const current = state.value?.data || [0, 0, 0];
    await this.call('setPhysicalModel', { target: 'ROTATION', value: { data: [current[0], current[1], (current[2] + 90) % 360] } });
  }
  async releaseTouches(): Promise<void> {
    const points = [...this.activeTouches.values()].map(point => ({ ...point, down: false }));
    if (points.length) await this.touch(points);
  }
  stop(): void {
    ++this.generation;
    ++this.streamGeneration;
    clearInterval(this.poll);
    this.poll = undefined;
    this.stream?.cancel(); this.stream = undefined;
    const client = this.client;
    this.client = undefined;
    if (client && this.activeTouches.size) {
      // Release pressed fingers even if the sidebar is hidden mid-drag.
      const timer = setTimeout(() => client.close(), 300);
      client.sendTouch({ touches: [...this.activeTouches.values()].map(p => ({ x: Math.round(p.x), y: Math.round(p.y), identifier: p.id, pressure: 0 })) }, this.metadata,
        { deadline: Date.now() + 250 }, () => { clearTimeout(timer); client.close(); });
    } else client?.close();
    this.activeTouches.clear();
    this.native = { width: 0, height: 0 };
    this.signature = ''; this.displaySignature = ''; this.syncing = false; this.failed = false; this.checking = false;
  }
}
