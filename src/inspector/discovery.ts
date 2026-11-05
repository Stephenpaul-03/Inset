export interface InspectorTarget { id: string; title: string; description?: string; deviceName?: string; appId?: string; webSocketDebuggerUrl: string }
export function metroAddress(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('Set Portal: Metro URL to a local HTTP address, for example http://127.0.0.1:8081.');
  }
  return new URL(url.origin);
}
export async function discoverTargets(address: string): Promise<InspectorTarget[]> {
  const metro = metroAddress(address);
  const response = await fetch(new URL('/json/list', metro), { signal: AbortSignal.timeout(4000), redirect: 'error' });
  if (!response.ok) throw new Error(`Metro target discovery returned HTTP ${response.status}.`);
  const data = await response.json() as unknown;
  if (!Array.isArray(data)) throw new Error('Metro returned an invalid target list.');
  return data.flatMap(target => {
    if (typeof target.id !== 'string' || typeof target.webSocketDebuggerUrl !== 'string' || target.reactNative?.capabilities?.prefersFuseboxFrontend === false || /^(UI|Reanimated)\b/.test(target.description || '')) return [];
    try {
      const ws = new URL(target.webSocketDebuggerUrl);
      if (ws.protocol !== 'ws:' || !['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(ws.hostname)) return [];
      // Metro may advertise the Android emulator's host alias. All debugger
      // traffic must still go to the configured local Metro server.
      ws.host = metro.host;
      if (ws.username || ws.password || ws.pathname !== '/inspector/debug') return [];
      return [{ id: target.id, title: String(target.title || 'React Native'), description: target.description,
        deviceName: target.deviceName, appId: target.appId, webSocketDebuggerUrl: ws.toString() }];
    } catch { return []; }
  });
}
