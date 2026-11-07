import { existsSync } from 'node:fs';

// Use the developer's Chrome on macOS, or Playwright's installed Chromium on CI.
// An explicit path also lets other local setups use an existing browser.
export function browserLaunchOptions() {
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.INSET_BROWSER_PATH ||
    (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined);
  return { headless: true, ...(executablePath ? { executablePath } : {}) };
}
