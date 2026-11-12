// PDFacil - main process
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let isDirty = false;
let forceClose = false;
let pendingOpenPath = null;
let rendererAskedStartup = false;
const isMac = process.platform === 'darwin';

const recentFile = () => path.join(app.getPath('userData'), 'recent.json');

const RECENT_MAX = 100;

// Recent files: [{ path, time }] newest first. Older versions stored plain path strings.
function readRecentRaw() {
  try {
    const list = JSON.parse(fs.readFileSync(recentFile(), 'utf8'));
    return list.map((x) => (typeof x === 'string' ? { path: x, time: null } : x)).filter((x) => x && x.path);
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    fs.mkdirSync(path.dirname(recentFile()), { recursive: true });
    fs.writeFileSync(recentFile(), JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {}
}

function readRecent() {
  const seen = new Set();
  return readRecentRaw()
    .filter((x) => {
      const k = x.path.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return fs.existsSync(x.path);
    })
    .slice(0, RECENT_MAX);
}

function addRecent(p) {
  const key = p.toLowerCase();
  writeRecent([{ path: p, time: Date.now() }, ...readRecentRaw().filter((x) => x.path.toLowerCase() !== key)]);
}

function removeRecent(p) {
  writeRecent(readRecentRaw().filter((x) => x.path !== p));
}

function pdfArg(argv) {
  return argv.slice(1).find((a) => /\.pdf$/i.test(a) && fs.existsSync(a)) || null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1300,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'PDFacil',
    ...(isMac ? {} : { icon: path.join(__dirname, 'build', 'icon.png') }),
    backgroundColor: '#f3f3f3',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  // Windows/Linux: no menu bar (the ribbon has everything). macOS always shows a menu bar,
  // and Cmd+C / Cmd+V / Cmd+Q only work through it, so give it a small standard one.
  if (isMac) {
    const send = (ch) => () => win && win.webContents.send(ch);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: app.name, submenu: [
        { label: 'About PDFacil', click: send('menu-about') },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ] },
      { label: 'Edit', submenu: [
        // Undo/redo go to the app (comments, highlights, pages), or to the text field being typed in.
        { label: 'Undo', accelerator: 'Cmd+Z', click: send('menu-undo') },
        { label: 'Redo', accelerator: 'Shift+Cmd+Z', click: send('menu-redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'togglefullscreen' }] },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // Links inside PDFs open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('close', (e) => {
    if (forceClose || !isDirty) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Save', "Don't save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'PDFacil',
      message: 'Do you want to save your changes?',
    });
    if (choice === 0) win.webContents.send('save-and-close');
    else if (choice === 1) {
      forceClose = true;
      win.close();
    }
  });
}

// Single instance: opening a second PDF from Explorer reuses this window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const p = pdfArg(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (p) win.webContents.send('open-path', p);
    }
  });
  pendingOpenPath = pdfArg(process.argv);
  // macOS: files opened from Finder (double-click, "Open With", drop on the Dock icon) arrive here.
  app.on('open-file', (e, p) => {
    e.preventDefault();
    if (win && rendererAskedStartup) {
      if (win.isMinimized()) win.restore();
      win.focus();
      win.webContents.send('open-path', p);
    } else {
      pendingOpenPath = p;
    }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}

// ---------- IPC ----------
ipcMain.handle('startup-path', () => {
  rendererAskedStartup = true;
  const p = pendingOpenPath;
  pendingOpenPath = null;
  return p;
});

ipcMain.handle('get-recent', () => readRecent());
ipcMain.handle('remove-recent', (_e, p) => removeRecent(p));
ipcMain.handle('app-version', () => app.getVersion());

ipcMain.handle('open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open PDF',
    filters: [{ name: 'PDF files', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections'],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('read-file', async (_e, p) => {
  const buf = await fs.promises.readFile(p);
  addRecent(p);
  return new Uint8Array(buf);
});

ipcMain.handle('save-dialog', async (_e, suggested) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save PDF as',
    defaultPath: suggested,
    filters: [{ name: 'PDF files', extensions: ['pdf'] }],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('write-file', async (_e, p, bytes) => {
  // Write to a temp file first, then replace, so a failure never corrupts the original.
  const tmp = p + '.pdfacil-tmp';
  await fs.promises.writeFile(tmp, Buffer.from(bytes));
  await fs.promises.rename(tmp, p);
  addRecent(p);
  return true;
});

ipcMain.handle('confirm', async (_e, message, buttons) => {
  const r = await dialog.showMessageBox(win, {
    type: 'question',
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    title: 'PDFacil',
    message,
  });
  return r.response;
});

ipcMain.handle('error', async (_e, message) => {
  await dialog.showMessageBox(win, { type: 'error', title: 'PDFacil', message });
});

ipcMain.on('set-dirty', (_e, v) => {
  isDirty = !!v;
});
ipcMain.on('set-title', (_e, t) => {
  if (win) win.setTitle(t);
});
ipcMain.on('force-close', () => {
  forceClose = true;
  if (win) win.close();
});

// Print: renderer sends one PNG per page; we lay them out and open the system print dialog.
ipcMain.handle('print-pages', async (_e, pages) => {
  const dir = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'pdfacil-print-'));
  const imgs = [];
  for (let i = 0; i < pages.length; i++) {
    const f = path.join(dir, `p${i}.png`);
    await fs.promises.writeFile(f, Buffer.from(pages[i].png));
    imgs.push({ f, landscape: pages[i].w > pages[i].h });
  }
  const html = `<!DOCTYPE html><html><head><style>
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; }
    .pg { page-break-after: always; break-after: page; width: 100vw; height: 100vh;
          display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .pg:last-child { page-break-after: auto; break-after: auto; }
    img { max-width: 100%; max-height: 100%; object-fit: contain; }
  </style></head><body>${imgs
    .map((x) => `<div class="pg"><img src="file:///${x.f.replace(/\\/g, '/')}"></div>`)
    .join('')}</body></html>`;
  const htmlPath = path.join(dir, 'print.html');
  await fs.promises.writeFile(htmlPath, html);
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await pw.loadFile(htmlPath);
  return new Promise((resolve) => {
    pw.webContents.print({ silent: false, printBackground: true }, (ok, reason) => {
      pw.destroy();
      fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      resolve({ ok, reason });
    });
  });
});
