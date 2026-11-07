import { randomBytes } from 'node:crypto';
export function inspectorHtml(options: { cspSource: string; styleUri: string; scriptUri: string }): string {
  const nonce = randomBytes(18).toString('base64');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${options.styleUri}"><title>Inset React Native Inspector</title></head><body>
  <header><span class="brand">React Native</span><select id="targets" aria-label="React Native app"><option value="">Choose an app…</option></select>
    <button id="connect">Connect</button><button id="refresh" title="Refresh running apps">Refresh</button>
    <button id="reload-app" disabled>Reload app</button><button id="disconnect" disabled>Disconnect</button><button id="settings" title="Configure Metro address">Settings</button></header>
  <div class="status-line"><span id="connection" class="dot"></span><span id="status" role="status">Start Metro and open a development build to inspect components.</span><span id="version"></span></div>
  <div id="error" role="alert" hidden></div>
  <main><section class="tree-pane" aria-label="Component hierarchy"><div class="tree-toolbar"><input id="search" type="search" placeholder="Find components…" aria-label="Find components">
    <button id="pick" aria-pressed="false" disabled title="Select a component by clicking it in Inset’s emulator">Pick</button></div>
    <div id="tree" role="tree" aria-label="React component tree" tabindex="0"></div><div id="empty-tree">Connect to your app to see its React components.</div>
    <footer><span id="count">0 components</span><button id="collapse">Collapse all</button></footer></section>
  <section class="details-pane" aria-label="Selected component"><div class="selection-header"><div><span class="eyebrow">SELECTED COMPONENT</span><h1 id="name">Select a component</h1></div>
    <button id="source" disabled>Open source</button><button id="reload-selection" disabled title="Refresh selected component">↻</button></div>
    <div id="ancestors" aria-label="Component ancestors"></div><p id="selection-hint">Choose a component in the tree, or use Pick and click the emulator.</p>
    <div id="details" hidden><p class="edit-note">Live edits affect this running development session. Edit the source file to keep changes.</p>
      <details open><summary>Props</summary><div id="props"></div></details>
      <details open><summary>Layout &amp; styles</summary><div id="layout"></div><div id="style"></div><form id="add-style" hidden><input id="style-name" placeholder="Style attribute" aria-label="Style attribute"><input id="style-value" placeholder="JSON value" aria-label="Style value"><button>Apply style</button></form></details>
      <details><summary>Hooks</summary><div id="hooks"></div></details>
      <details><summary>State</summary><div id="state"></div></details>
      <details><summary>Context</summary><div id="context"></div></details>
    </div></section></main>
  <script nonce="${nonce}" src="${options.scriptUri}"></script></body></html>`;
}
