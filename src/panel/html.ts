import { randomBytes } from 'node:crypto';
const paths = {
  back: '<path d="m14 6-6 6 6 6"/>', home: '<circle cx="12" cy="12" r="7"/>',
  recents: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  rotate: '<rect x="8" y="5" width="8" height="14" rx="1.5" transform="rotate(25 12 12)"/><path d="M4 8a9 9 0 0 1 15-3M19 2v3h-3M20 16a9 9 0 0 1-15 3M5 22v-3h3"/>',
  refresh: '<path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5"/>',
  editor: '<path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m8-11-3 3 3 3"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  inspect: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m5-9 7 3-4 2-2 4-3-7z"/>',
};
function icon(name: keyof typeof paths): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
function button(name: string, label: string, glyph: keyof typeof paths, device = false): string {
  return `<button class="icon-button" data-button="${name}" ${device ? 'data-device-action' : ''} title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
}
export interface HtmlOptions { cspSource: string; connectOrigin?: string; styleUri: string; scriptUri: string; mode: 'sidebar' | 'editor' }
export function webviewHtml(options: HtmlOptions): string {
  const nonce = randomBytes(18).toString('base64');
  const editor = options.mode === 'editor';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; connect-src ${options.connectOrigin || "'none'"}; style-src ${options.cspSource}; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${options.styleUri}"><title>Inset</title></head>
    <body data-mode="${options.mode}"><header class="toolbar" aria-label="Emulator toolbar">
      <span id="connection" class="connection" role="img" aria-label="Disconnected" title="Disconnected"></span>
      <select id="devices" aria-label="Running emulator"><option>No running emulators</option></select>
      ${button('rotate', 'Rotate device', 'rotate', true)}${button('refresh', 'Refresh connection', 'refresh')}
      ${button(editor ? 'openSidebar' : 'openEditor', editor ? 'Move to Sidebar' : 'Open in Editor', editor ? 'sidebar' : 'editor')}
      ${button('inspect', 'Inspect React Native component', 'inspect')}
      <div class="overflow"><button id="more" class="icon-button" title="More actions" aria-label="More actions" aria-haspopup="true" aria-expanded="false">${icon('more')}</button>
        <div id="menu" class="menu" hidden><button id="toggle-details" aria-pressed="false">Performance details</button><button data-button="settings">Settings</button></div>
      </div></header>
    <div id="status" role="status">Start an emulator in Android Studio.</div><div id="notice" role="alert" hidden></div>
    <main id="stage" aria-label="Emulator display"><div id="surface"><canvas id="screen" tabindex="0" aria-label="Android emulator screen. Click to focus, then type. Use pointer to tap or drag, wheel to scroll."></canvas>
      <div id="empty"><p id="empty-message">Start an emulator in Android Studio to connect.</p><button id="move-here" data-button="${editor ? 'openEditor' : 'openSidebar'}" hidden>${editor ? 'Open in Editor' : 'Move to Sidebar'}</button></div>
    </div></main><textarea id="keyboard-input" class="keyboard-input" tabindex="-1" aria-label="Android hardware keyboard input" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
    <div class="bottom-bar"><div class="scale-controls" ${editor ? '' : 'hidden'}><select id="zoom" aria-label="Zoom" title="Display scale"><option value="fit">Fit</option><option value="0.5">50%</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></div>
      <nav aria-label="Emulator controls">${button('back', 'Back', 'back', true)}${button('home', 'Home', 'home', true)}${button('recents', 'Recent apps', 'recents', true)}</nav>
      <button id="fps" class="fps" aria-label="Show performance details" aria-expanded="false" aria-controls="stats" title="Performance details">Idle</button>
    </div><footer id="stats" aria-label="Rendering performance" hidden>Waiting for frames…</footer>
    <script nonce="${nonce}" src="${options.scriptUri}"></script></body></html>`;
}
