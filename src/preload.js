const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('open-file'),
  checkClipboard: () => ipcRenderer.invoke('check-clipboard'),
  processClipboard: () => ipcRenderer.invoke('process-clipboard'),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  openExternal: (url) => shell.openExternal(url),
  onDisplayResults: (callback) => {
    ipcRenderer.on('display-results', (event, data) => callback(data));
  },
  closeWindow: () => {
    window.close();
  },
});
