const { contextBridge, ipcRenderer, webUtils } = require('electron');
const os = require('os');

let username = 'PDFacil';
try {
  username = os.userInfo().username || username;
} catch {}

contextBridge.exposeInMainWorld('api', {
  username,
  startupPath: () => ipcRenderer.invoke('startup-path'),
  version: () => ipcRenderer.invoke('app-version'),
  getRecent: () => ipcRenderer.invoke('get-recent'),
  removeRecent: (p) => ipcRenderer.invoke('remove-recent', p),
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  saveDialog: (suggested) => ipcRenderer.invoke('save-dialog', suggested),
  writeFile: (p, bytes) => ipcRenderer.invoke('write-file', p, bytes),
  confirm: (msg, buttons) => ipcRenderer.invoke('confirm', msg, buttons),
  error: (msg) => ipcRenderer.invoke('error', msg),
  printPages: (pages) => ipcRenderer.invoke('print-pages', pages),
  setDirty: (v) => ipcRenderer.send('set-dirty', v),
  setTitle: (t) => ipcRenderer.send('set-title', t),
  forceClose: () => ipcRenderer.send('force-close'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onOpenPath: (cb) => ipcRenderer.on('open-path', (_e, p) => cb(p)),
  onSaveAndClose: (cb) => ipcRenderer.on('save-and-close', () => cb()),
  isMac: process.platform === 'darwin',
  onMenu: (cb) => {
    for (const ch of ['menu-undo', 'menu-redo', 'menu-about']) ipcRenderer.on(ch, () => cb(ch));
  },
});
