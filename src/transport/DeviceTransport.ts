import type { EmulatorTarget } from '../discovery/running';
import type { KeyInput } from './keyboard';
export interface Frame {
  width: number; height: number;
  nativeWidth: number; nativeHeight: number;
  data: Uint8Array; format: 'png' | 'rgba'; arrivedAt: number;
}
export interface TouchPoint { x: number; y: number; id: number; down: boolean }
export interface StreamSize { width: number; height: number }
export interface DeviceTransport {
  start(target: EmulatorTarget): Promise<void>;
  onFrame(cb: (frame: Frame) => void): void;
  onSizeChange(cb: (w: number, h: number) => void): void;
  onError(cb: (error: Error) => void): void;
  setViewport(width: number, height: number, dpr: number, lowBandwidth: boolean): void;
  setMode(mode: 'smooth' | 'png'): void;
  touch(points: TouchPoint[]): Promise<void>;
  releaseTouches(): Promise<void>;
  key(input: KeyInput): Promise<void>;
  text(text: string): Promise<void>;
  paste(text: string): Promise<void>;
  releaseKeys(): Promise<void>;
  stop(): void;
}
