const { app, BrowserWindow, ipcMain, session, screen, globalShortcut, dialog, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

let mainWindow, overlayWindow, local, preferences = {}, busy = false, quitting = false, lastCaption = {}, uiLocale = 'en';
const preferencePath = () => path.join(app.getPath('userData'), 'preferences.json');
const keyPath = () => path.join(app.getPath('userData'), 'service-key.bin');
const allowedService = input => {
  if (!input) return '';
  try {
    const url = new URL(input);
    if (url.username || url.password || url.search || url.hash) throw new Error();
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error();
    if (url.pathname !== '/') throw new Error();
    return url.origin;
  } catch { throw new Error('INVALID_SERVICE_URL'); }
};
function trusted(event) {
  return mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame &&
    event.senderFrame.url.startsWith(`${local.origin}/app/`);
}
function handle(channel, handler) {
  ipcMain.handle(channel, async (event, data) => {
    if (!trusted(event)) return { ok: false, error: 'FORBIDDEN' };
    try { return { ok: true, value: await handler(data) }; }
    catch (e) { return { ok: false, error: e.message || 'SERVICE_ERROR' }; }
  });
}
function confirmQuit() {
  const messages = {
    en: ['A session is active or has unsaved changes.', 'Save or export your text before closing.', 'Keep working', 'Close anyway'],
    fr: ['Une session est active ou non enregistrée.', 'Enregistrez ou exportez votre texte avant de fermer.', 'Continuer', 'Fermer quand même'],
    zh: ['课堂正在进行，或有未保存的修改。', '关闭前，请保存或导出需要保留的文字。', '继续使用', '仍然关闭'],
  };
  const [message, detail, keep, close] = messages[uiLocale] || messages.en;
  return dialog.showMessageBoxSync(mainWindow, { type: 'question', title: 'ClearCaption', message, detail,
    buttons: [keep, close], defaultId: 0, cancelId: 0 }) === 1;
}
async function showOverlay(data) {
  if (!data.visible) { overlayWindow?.hide(); return; }
  const size = Math.max(24, Math.min(54, Number(data.size) || 32));
  lastCaption = { text: String(data.text || '').slice(-1200), translation: String(data.translation || '').slice(-1800), size };
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = Math.min(1000, area.width - 80), height = Math.min(350, Math.round(size * 6 + 50));
    overlayWindow = new BrowserWindow({ width, height, x: Math.round(area.x + (area.width-width)/2), y: area.y + area.height-height-45,
      transparent: true, backgroundColor: '#00000000', frame: false, hasShadow: false,
      alwaysOnTop: true, skipTaskbar: true, resizable: false, focusable: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'overlay-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    overlayWindow.webContents.on('will-navigate', event => event.preventDefault());
    await overlayWindow.loadURL(`${local.origin}/app/overlay.html`);
  }
  const [width] = overlayWindow.getSize();
  const bounds = overlayWindow.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
  const height = Math.min(area.height - 80, Math.round(size * 6 + 50));
  overlayWindow.setBounds({ width, height, x: Math.max(area.x, Math.min(bounds.x, area.x+area.width-width)), y: Math.max(area.y, Math.min(bounds.y, area.y+area.height-height-15)) });
  overlayWindow.webContents.send('cc:caption', lastCaption);
  overlayWindow.showInactive();
}
app.whenReady().then(async () => {
  try { preferences = JSON.parse(fs.readFileSync(preferencePath(), 'utf8')); } catch {}
  try { preferences.serviceURL = allowedService(preferences.serviceURL || ''); } catch { preferences.serviceURL = ''; }
  let key;
  if (safeStorage.isEncryptionAvailable()) {
    try { key = safeStorage.decryptString(fs.readFileSync(keyPath())); } catch {}
  }
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '../server/dev.mjs')).href);
  local = await startServer({ port: 0, host: '127.0.0.1', dbPath: path.join(app.getPath('userData'), 'clearcaption.db'), apiKey: key });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const valid = contents === mainWindow?.webContents && contents.getURL().startsWith(`${local.origin}/app/`);
    callback(valid && permission === 'media' && !details.mediaTypes?.includes('video'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin) => {
    let normalized;
    try { normalized = new URL(origin).origin; } catch { return false; }
    return contents === mainWindow?.webContents && normalized === local.origin && permission === 'media';
  });
  mainWindow = new BrowserWindow({ title: 'ClearCaption', width: 1280, height: 860, minWidth: 840, minHeight: 630,
    backgroundColor: '#faf9fc', icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${local.origin}/`)) event.preventDefault();
  });
  mainWindow.webContents.on('will-prevent-unload', event => { if (quitting) event.preventDefault(); });
  mainWindow.on('close', event => {
    if (busy && !quitting) {
      event.preventDefault();
      if (confirmQuit()) { quitting = true; app.quit(); }
    }
  });
  handle('cc:api', async ({ path: requestPath, method = 'GET', headers = {}, body }) => {
    if (!/^\/api\/[a-z0-9/_-]+$/.test(requestPath) || !['GET','POST','DELETE'].includes(method)) throw new Error('FORBIDDEN');
    const text = body === undefined ? undefined : JSON.stringify(body);
    if (text && text.length > 500000) throw new Error('PAYLOAD_TOO_LARGE');
    const safeHeaders = { 'Content-Type': 'application/json' };
    for (const key of ['Authorization', 'X-Room-Token']) if (typeof headers[key] === 'string' && headers[key].length < 100) safeHeaders[key] = headers[key];
    const response = await fetch(`${preferences.serviceURL || local.origin}${requestPath}`, {
      method, headers: safeHeaders, body: method === 'GET' ? undefined : text, signal: AbortSignal.timeout(50000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('SERVICE_ERROR'); }
    return { ok: response.ok, data };
  });
  handle('cc:preferences', () => ({ serviceURL: preferences.serviceURL || '' }));
  handle('cc:service', value => {
    if (busy) throw new Error('SESSION_ACTIVE');
    preferences.serviceURL = allowedService(value);
    fs.writeFileSync(preferencePath(), JSON.stringify(preferences), { mode: 0o600 });
  });
  handle('cc:key', value => {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text')) throw new Error('ENCRYPTION_UNAVAILABLE');
    if (typeof value !== 'string' || value.length < 20 || value.length > 500) throw new Error('INVALID_INPUT');
    fs.writeFileSync(keyPath(), safeStorage.encryptString(value), { mode: 0o600 });
    local.setAPIKey(value);
  });
  handle('cc:overlay', showOverlay);
  handle('cc:busy', value => { busy = !!value.busy; uiLocale = ['en', 'fr', 'zh'].includes(value.locale) ? value.locale : 'en'; });
  globalShortcut.register('CommandOrControl+Shift+C', () => mainWindow?.webContents.send('cc:shortcut', 'overlay'));
  globalShortcut.register('CommandOrControl+Shift+P', () => mainWindow?.webContents.send('cc:shortcut', 'pause'));
  await mainWindow.loadURL(`${local.origin}/app/`);
}).catch(error => { dialog.showErrorBox('ClearCaption', `Could not start: ${error.message}`); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (busy && !quitting && mainWindow && !mainWindow.isDestroyed() && !confirmQuit()) { event.preventDefault(); return; }
  quitting = true;
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
  globalShortcut.unregisterAll();
});
app.on('will-quit', () => { local?.server.close(); try { local?.DB.close(); } catch {} });
