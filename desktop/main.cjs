'use strict';

const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  parseGoogleAuthorizationUrl,
  parseOAuthCallback,
  rendererUrlForOAuthCode,
  stateMatches,
} = require('./oauth-security.cjs');

const APP_URL = 'https://abdullahbinfahad.github.io/life-os/';
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_PATH = '/life-os';
const SUPABASE_AUTH_ORIGIN = 'https://qzbcanzmgetdrnlijujh.supabase.co';
const AUTH_PROTOCOL = 'lifeos';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

let mainWindow = null;
let pendingCallback = null;
let queuedProtocolUrl = null;
let pendingOAuthState = null;
let callbackInFlight = false;

function isAppUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.origin === APP_ORIGIN && (url.pathname === APP_PATH || url.pathname.startsWith(`${APP_PATH}/`));
  } catch {
    return false;
  }
}

function openSafeExternal(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) {
      void shell.openExternal(url.href).catch(() => {});
      return true;
    }
    if (url.protocol === 'mailto:' && !/[\r\n]/.test(rawUrl)) {
      void shell.openExternal(url.href).catch(() => {});
      return true;
    }
  } catch {
    // Ignore malformed or non-web navigation targets.
  }
  return false;
}

function oauthStateFilePath() {
  return path.join(app.getPath('userData'), 'lifeos-pending-oauth-state.json');
}

async function savePendingOAuthState(state) {
  const record = { state, createdAt: Date.now() };
  const filePath = oauthStateFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 });
  pendingOAuthState = record;
}

async function readPendingOAuthState() {
  if (pendingOAuthState) return pendingOAuthState;
  try {
    const record = JSON.parse(await fs.readFile(oauthStateFilePath(), 'utf8'));
    if (
      !record ||
      typeof record.state !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(record.state) ||
      !Number.isFinite(record.createdAt)
    ) return null;
    pendingOAuthState = record;
    return record;
  } catch {
    return null;
  }
}

async function clearPendingOAuthState() {
  pendingOAuthState = null;
  try {
    await fs.rm(oauthStateFilePath(), { force: true });
  } catch {
    // A missing/corrupt state file must never make callback validation permissive.
  }
}

async function callbackPage(rawUrl) {
  const callback = parseOAuthCallback(rawUrl);
  if (!callback) return null;

  const expected = await readPendingOAuthState();
  if (!expected) return null;
  const age = Date.now() - expected.createdAt;
  if (!Number.isFinite(age) || age < 0 || age > OAUTH_STATE_TTL_MS) {
    await clearPendingOAuthState();
    return null;
  }
  if (!stateMatches(expected.state, callback.appState)) return null;

  // Consume a valid state exactly once. Access/refresh tokens and all callback
  // fragments are rejected by parseOAuthCallback and are never passed to the renderer.
  await clearPendingOAuthState();
  if (callback.kind === 'error') return { url: APP_URL, failed: true };

  const target = rendererUrlForOAuthCode(APP_URL, callback.code);
  return target ? { url: target, failed: false } : null;
}

async function handleAuthCallback(rawUrl) {
  if (callbackInFlight) return false;
  callbackInFlight = true;
  try {
    const result = await callbackPage(rawUrl);
    if (!result) return false;

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(result.url);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (result.failed) {
        void dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Life OS sign-in',
          message: 'Sign-in did not complete',
          detail: 'The provider cancelled the request or returned an authentication error. You can safely retry from Life OS.',
          buttons: ['OK'],
        }).catch(() => {});
      }
    } else {
      pendingCallback = result.url;
    }
    return true;
  } catch {
    return false;
  } finally {
    callbackInFlight = false;
  }
}

function receiveProtocolUrl(rawUrl) {
  if (!app.isReady()) {
    queuedProtocolUrl = rawUrl;
    return;
  }
  void handleAuthCallback(rawUrl);
}

// macOS delivers protocol links through open-url; register before ready.
app.on('open-url', (event, rawUrl) => {
  event.preventDefault();
  receiveProtocolUrl(rawUrl);
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
  }

  app.on('second-instance', (_event, commandLine) => {
    const link = commandLine.find((arg) => arg.startsWith(`${AUTH_PROTOCOL}://`));
    if (link) void handleAuthCallback(link);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle('lifeos:open-google-oauth', async (event, rawUrl) => {
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    if (!isAppUrl(senderUrl)) throw new Error('Untrusted Life OS renderer.');

    const authorization = parseGoogleAuthorizationUrl(rawUrl, SUPABASE_AUTH_ORIGIN);
    if (!authorization) {
      throw new Error('Only the configured Google sign-in flow with S256 PKCE can open externally.');
    }

    await savePendingOAuthState(authorization.appState);
    try {
      await shell.openExternal(authorization.authorizationUrl);
      return true;
    } catch {
      await clearPendingOAuthState();
      throw new Error('Could not open Google sign-in in the system browser.');
    }
  });

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1320,
      height: 900,
      minWidth: 390,
      minHeight: 620,
      show: false,
      backgroundColor: '#0b0d12',
      icon: path.join(__dirname, 'assets', 'lifeos.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      openSafeExternal(url);
      return { action: 'deny' };
    });

    const guardNavigation = (event, rawUrl) => {
      if (isAppUrl(rawUrl)) return;
      event.preventDefault();
      openSafeExternal(rawUrl);
    };
    mainWindow.webContents.on('will-navigate', guardNavigation);
    mainWindow.webContents.on('will-redirect', guardNavigation);
    mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
    mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });

    const initialUrl = pendingCallback || APP_URL;
    pendingCallback = null;
    void mainWindow.loadURL(initialUrl);
  }

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      let origin = '';
      try { origin = new URL(details.requestingUrl || webContents.getURL()).origin; } catch { /* deny */ }
      callback(permission === 'notifications' && origin === APP_ORIGIN);
    });
    session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
      permission === 'notifications' && requestingOrigin === APP_ORIGIN,
    );

    createWindow();
    const startupLink = queuedProtocolUrl || process.argv.find((arg) => arg.startsWith(`${AUTH_PROTOCOL}://`));
    queuedProtocolUrl = null;
    if (startupLink) void handleAuthCallback(startupLink);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
