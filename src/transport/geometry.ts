export function requestSize(nativeWidth: number, nativeHeight: number, width: number, height: number, dpr: number, low: boolean) {
  const scale = low ? Math.min(1 / 3, width * dpr / nativeWidth, height * dpr / nativeHeight) :
    Math.min(1, width * dpr / nativeWidth, height * dpr / nativeHeight);
  return { width: Math.max(1, Math.round(nativeWidth * scale)), height: Math.max(1, Math.round(nativeHeight * scale)) };
}
export function clampCoordinate(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, Math.round(value)));
}
