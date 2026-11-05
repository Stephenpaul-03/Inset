export function requestSize(nativeWidth: number, nativeHeight: number, width: number, height: number, dpr: number, low: boolean, maxPixels = Infinity) {
  const scale = low ? Math.min(1 / 3, width * dpr / nativeWidth, height * dpr / nativeHeight) :
    Math.min(1, width * dpr / nativeWidth, height * dpr / nativeHeight);
  const boundedScale = Math.min(scale, Math.sqrt(maxPixels / (nativeWidth * nativeHeight)));
  const round = Number.isFinite(maxPixels) ? Math.floor : Math.round;
  return { width: Math.max(1, round(nativeWidth * boundedScale)), height: Math.max(1, round(nativeHeight * boundedScale)) };
}
export function clampCoordinate(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, Math.round(value)));
}
