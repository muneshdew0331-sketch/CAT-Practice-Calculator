const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  collapseCalculator: () => ipcRenderer.send('collapse-calculator'),
  restoreCalculator: () => ipcRenderer.send('restore-calculator'),
  closeCalculator: () => ipcRenderer.send('close-calculator'),
  moveWindow: (x, y) => ipcRenderer.send('move-window', x, y),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  onWindowState: (callback) => ipcRenderer.on('window-state', (_, state) => callback(state)),
  onCollapse: (callback) => ipcRenderer.on('collapse', callback),
  onRestore: (callback) => ipcRenderer.on('restore', callback)
});