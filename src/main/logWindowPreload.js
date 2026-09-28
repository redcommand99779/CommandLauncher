const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('logAPI', {
  onLine: (cb) => ipcRenderer.on('log:line', (_, data) => cb(data)),
  onTitle: (cb) => ipcRenderer.on('log:title', (_, title) => cb(title)),
  onClear: (cb) => ipcRenderer.on('log:clear', () => cb()),
});
